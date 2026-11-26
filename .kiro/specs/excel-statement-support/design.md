# Design Document

## Overview

This feature adds Excel (`.xlsx`/`.xls`) statement support to Vampire Hunter without
touching the existing `Pipeline` (parse → normalize → detect → score). The approach:

1. A new pure function, `Header_Locator` (`src/engine/headerLocator.ts`), finds the real
   header row in any grid of string rows — CSV or Excel-derived — and strips `Junk_Rows`
   above it. It runs for every upload, CSV or Excel, so both paths get the same
   resilience.
2. A new lazily-loaded module, `Excel_Reader` (`src/engine/excelReader.ts`), turns an
   Excel `Workbook`'s `Data_Sheet` into `CSV_Text` that the existing `csvUtils.parseCsvText`
   and `engine/parser.ts` already understand. SheetJS (`xlsx`) is dynamically imported only
   when an Excel file is uploaded, so CSV-only users never download it.
3. `Uploader.tsx` gains extension-based dispatch (`.csv` → existing path, `.xlsx`/`.xls` →
   Excel_Reader, `.pdf` → a dedicated rejection message, anything else → `errors.fileNotCsv`),
   and `csvUtils.ts` gains small helpers for file-type classification shared by both paths.
4. The Vite build already splits lazy `import()` targets into separate chunks
   automatically; we rely on that and verify the resulting `Excel_Chunk` is present in the
   `Precache_Manifest` that `build/vite.sw.config.ts` embeds into `dist/sw.js`, with a new
   build test file, `tests/build/excelChunk.build.test.ts` (`dist.build.test.ts` is left unmodified).
5. A fixture generator script (`scripts/generate-excel-fixtures.ts`) produces reproducible
   `.xlsx`/`.xls` fixtures (and matching CSV fixtures) for two bank layouts.
6. `SheetJS` is pinned to the tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`,
   never the npm-registry `xlsx` package, and is confirmed by inspection of its bundled
   source (`xlsx.mjs`) to contain no `fetch`, `XMLHttpRequest`, `sendBeacon` or `WebSocket`
   calls, consistent with Requirement 6 and the existing `tests/noNetworkScan.test.ts`.

No changes are made to `src/engine/parser.ts`, `normalizer.ts`, `grouper.ts`,
`cadenceDetector.ts`, `scorer.ts`, or `index.ts`. The Pipeline's input contract
(`headers: string[]`, `rows: string[][]`) is unchanged; Excel support is entirely a new
text-producing step ahead of it.

## Architecture

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                        Uploader.tsx                      │
                 │                                                         │
  file ──────────┼─▶ classifyFile(file)                                    │
                 │     │                                                   │
                 │     ├─ .csv            ─▶ decodeCsvBytes ──────────┐    │
                 │     ├─ .xlsx / .xls     ─▶ loadExcelReader()        │    │
                 │     │                      (dynamic import)         │    │
                 │     │                      → readWorkbook(bytes)    │    │
                 │     │                        (named export, Result)  │    │
                 │     │                      → CSV_Text ──────────────┤    │
                 │     ├─ .pdf             ─▶ errors.pdfNotSupported   │    │
                 │     └─ other            ─▶ errors.fileNotCsv       │    │
                 │                                                     │    │
                 └─────────────────────────────────────────────────────┼────┘
                                                                        ▼
                                                              onCsv(sourceName, csvText)
                                                                        │
                                                                        ▼
                                                  App.tsx handleCsv: raw = parseCsvText(csvText)
                                                                        │
                                                                        ▼
                                  { headers, rows } = locateHeader([raw.headers, ...raw.rows])
                                     grid: string[][]   (src/engine/headerLocator.ts)
                                                                        │
                                                                        ▼
                                                     parseStatement(headers, rows)  (unchanged)
                                                                        │
                                                                        ▼
                                                           runDetection(...)  (unchanged)
```

Two new engine modules, one Uploader-side lazy module, and small Uploader/App/csvUtils
wiring changes. Everything downstream of `parseCsvText` + `locateHeader` is untouched.

### Why the Excel_Reader is not in `src/engine`

`src/engine` must contain zero React imports and be fully unit tested as pure functions
(workspace rule), which `excelReader.ts` satisfies — it has no React import. It is *not*
bundled into the main entry chunk, however, because it statically imports `xlsx`. To keep
the dynamic-import boundary enforced by the bundler, the Excel_Reader module itself is kept
free of any top-level `import 'xlsx'`; instead, `xlsx` is imported inside the function body
via `await import('xlsx')`, and the Uploader calls that function only after confirming the
file extension is `.xlsx`/`.xls`. Vite's code-splitting places `excelReader.ts` + `xlsx`
together in a separate chunk because the only edge into that subgraph is the dynamic
`import()` call. The module still lives under `src/engine/` (per the project structure
rule: "Pure detection logic... No UI") since it contains no UI and is unit tested the same
way as the rest of the engine; its physical separation from the main bundle comes from the
dynamic import, not from its file-system location.

### Header_Locator

`src/engine/headerLocator.ts` — pure function, no React import, no I/O.

```ts
export interface HeaderLocation {
  headerRowIndex: number;
  headers: string[];
  rows: string[][];
}

/**
 * Scans the first 30 rows of a grid for the real header row: the first row
 * with >= 3 non-empty cells whose accent-folded cells include at least one
 * date keyword AND at least one amount-or-description keyword (reusing the
 * existing keyword sets from parser.ts: DATE_HEADER_RE and the description /
 * amount keyword alternations). Rows above it are dropped. If no row in the
 * first 30 qualifies, the first non-empty row becomes the header row.
 */
export function locateHeader(grid: string[][]): HeaderLocation;
```

`locateHeader` is called from exactly one place: `App.tsx`'s `handleCsv`, immediately after
`parseCsvText(csvText)` and before `parseStatement(headers, rows)`. `parseCsvText` returns
`{ headers, rows }`, so `handleCsv` joins them into a grid, `[raw.headers, ...raw.rows]`,
and passes that `string[][]` to `locateHeader`. The Uploader never calls the Header_Locator.
Both the CSV path and the Excel path reach `handleCsv` with CSV_Text, so a single call site
covers Requirements 9.6, 9.7 and 9.8. (`excelReader.ts` also imports `locateHeader`, but only
to find the header row for Date_Header_Column detection; its output is not used by the
Uploader or the App.) The header-keyword regexes
(`DATE_HEADER_RE`-equivalent, description/amount alternations) are factored out of
`parser.ts` into a small shared keyword module (`src/engine/headerKeywords.ts`) so both
`detectColumns` and `locateHeader` use the identical vocabulary — avoiding drift between
"what looks like a header for column mapping" and "what looks like a header row at all."

### Excel_Reader

`src/engine/excelReader.ts` has no React import. The only impure step is the dynamic
`import('xlsx')`, which the browser resolves from the precached Excel_Chunk when offline.
The module has a **named export only** (`readWorkbook`); there is no default export, and
every importer (Uploader, tests) uses `const { readWorkbook } = await import(...)` or a
named static import in tests.

```ts
export type ExcelReadResult =
  | { ok: true; csvText: string }
  | { ok: false; error: AppError };

/**
 * Reads an Excel Workbook from in-memory bytes and returns CSV_Text for the
 * Data_Sheet (the first sheet, in workbook order, with >= 1 non-empty cell).
 * Returns a Result for every input and never throws. The dynamic import sits
 * inside the try block, so a failed chunk load becomes { ok: false } too.
 */
export async function readWorkbook(bytes: ArrayBuffer): Promise<ExcelReadResult> {
  try {
    const XLSX = await import('xlsx'); // dynamic import -> separate Excel_Chunk
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return sheet && sheet['!ref'] !== undefined && hasNonEmptyCell(sheet);
    });
    if (sheetName === undefined) {
      return { ok: false, error: { code: 'PARSE_FAILED', message: 'Every sheet is empty.' } };
    }
    const csvText = sheetToCsvText(XLSX, workbook, workbook.Sheets[sheetName]);
    return { ok: true, csvText };
  } catch {
    return { ok: false, error: { code: 'PARSE_FAILED', message: 'Could not read the Excel file.' } };
  }
}
```

**Cell-to-CSV-text conversion (`sheetToCsvText`)** iterates the sheet's used range
(`sheet['!ref']`) row by row and cell by cell. It converts each cell by its SheetJS type:

| SheetJS cell type (`cell.t`) | Conversion |
|---|---|
| `'d'` (JS `Date`; SheetJS produces it because `cellDates: true` and the cell has a date number format) | `formatExcelDate(cell.v)`, which reads only the UTC fields of the `Date`. This covers both the Excel_Serial_Date form and the Excel_Date_Cell form (Requirements 3.3, 3.4, 3.5). |
| `'n'` in a Date_Header_Column, no date number format | Date-column rule below: a Plausible_Serial becomes an ISO date, anything else falls through to the numeric rule. |
| `'n'` (any other numeric cell, or a non-plausible value in a Date_Header_Column) | `formatAmount(cell.v)`: always exactly 2 decimals, dot separator, no thousands separator. `1500` is written as `"1500.00"` (Requirement 3.6). |
| `'s'`, `'b'`, `'e'`, empty or missing | The cell's display text (`XLSX.utils.format_cell`) or an empty string for a blank cell, CSV-quoted per RFC 4180: quote the field and double any embedded `"` when the text contains a comma, a double quote or a line break. Text is never reinterpreted, so a text amount such as `"1.299,00"` passes through unchanged (Requirement 3.7). |

**Date handling without timezone shift.** SheetJS builds dates with `Date.UTC(...)` anchored
at the 1899-12-30 epoch (confirmed by inspecting `xlsx.mjs`). The UTC fields of the
resulting `Date` therefore hold the calendar date that Excel displays, whatever the host
timezone. `formatExcelDate` reads only `getUTCFullYear()`, `getUTCMonth()` and
`getUTCDate()`, never the local getters, which shift the date by one day at offsets such as
UTC-12:00 or UTC+14:00. This is the correctness-critical detail for Requirement 3.5 and is
covered by Property 4. The same UTC-only rule applies to the `.xls` (BIFF) path, and
Property 4 runs on both `.xlsx` and `.xls` Workbooks.

```ts
function formatExcelDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

**Unformatted serials in a Date_Header_Column.** When a bank writes dates as plain numbers
(for example `45292`) with no date number format, SheetJS returns a number cell (`t: 'n'`),
not a `Date`. The reader cannot treat every number as a date, because amount cells are also
numbers. It converts a numeric cell only when both conditions hold:

1. The cell sits in a Date_Header_Column.
2. The value is a Plausible_Serial: an integer whose converted calendar year is from 1990
   to 2100 inclusive (serials 32874 to 73415 in the 1900 date system).

*How the reader knows the column header.* `sheetToCsvText` first builds a display-text grid
(`string[][]`) of the Data_Sheet's first 30 rows (`XLSX.utils.format_cell` per cell). It
passes that grid to the same `locateHeader` function the App uses (`headerLocator.ts`), which
returns `headerRowIndex` and the header cells. `headerRowIndex` is the row index within the
Data_Sheet, so Junk_Rows above the header are skipped the same way as in the App. A column
is a Date_Header_Column when its header cell matches the date keyword regex that
`headerKeywords.ts` exports after accent folding (date, fecha, data, datum, ...). Both the
reader and `detectColumns` therefore share one vocabulary. Only cells in rows below
`headerRowIndex` are candidates; Junk_Rows above the header are never converted.

*Conversion.* For a Plausible_Serial, the reader computes
`new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)` (plus 1462 days when the workbook
sets `date1904`) and formats it with `formatExcelDate`. All arithmetic is in UTC, so the
result does not depend on the process timezone.

*Non-plausible values.* An integer outside 1990-2100 (for example `5`, or `2500000`), or a
non-integer such as `45292.5`, is left as a number and written through `formatAmount`. The
existing `parseStatement` then fails to parse the date and the App shows the existing
column mapper or an error (Requirement 3.14). The reader never throws for such a cell, and
the App never crashes.

**Numeric amounts without float errors.** A numeric cell's raw `cell.v` is an IEEE-754
double (for example `19.99`, which is not exactly representable). `formatAmount` rounds to
the nearest hundredth and always writes exactly 2 decimals, so it avoids `String(cell.v)`
artifacts such as `19.990000000000002` or exponential notation:

```ts
function formatAmount(v: number): string {
  const cents = Math.round(v * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
```

`formatAmount(1500)` returns `"1500.00"`, `formatAmount(19.9)` returns `"19.90"`. The
existing `parseCents(s, 'dotDecimal')` converts the string back to exactly
`Math.round(v * 100)`, so no further floating-point rounding happens (Requirement 3.8). The
2-decimal formatting does not change the integer Cents the Pipeline derives (Requirement
3.11), because `"1500.00"` and `"1500"` both parse to `150000`.

### Uploader changes

`src/components/Uploader.tsx`:

- `accept` attribute becomes `.csv,.xlsx,.xls,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf` (the `.pdf` MIME/extension is included so the browser's native picker shows PDFs, which then get the dedicated rejection message rather than a generic "wrong file" error).
- `handleFiles` is rewritten to dispatch on `classifyFile(file)` (new helper in
  `csvUtils.ts`, see below) instead of the current binary `isCsvFile` check:
  - `'csv'` → existing `readFile` path (`decodeCsvBytes`).
  - `'excel'` → `handleExcelFile(file)`: reads the file as an `ArrayBuffer`, then runs
    `const { readWorkbook } = await import('../engine/excelReader')` inside a try/catch and
    calls `readWorkbook(bytes)` (named export; the module has no default export); on `{ ok: true }` calls
    `onCsv(file.name, csvText)`; on `{ ok: false }` or a rejected dynamic import, calls
    `onParseError('errors.parseFailed')` (a new prop, see below) without ever calling
    `onCsv('', '')` (which currently means "empty → parse error" — Excel failures get an
    explicit code instead of relying on that convention).
  - `'pdf'` → `onParseError('errors.pdfNotSupported')`, no dynamic import performed.
  - `'unknown'` → `onParseError('errors.fileNotCsv')`.
- A new `onParseError?: (key: TranslationKey) => void` prop lets the Uploader report a
  specific error key directly instead of the current indirect "empty CSV text" signal. App.tsx
  wires it to the same `setErrorKey` used today. The existing `onCsv(file.name, '')` empty-text
  convention is kept only for the CSV path's legacy behavior (e.g. an empty `.csv` file) — it
  resolves to `errors.fileNotCsv` same as before, unchanged.

### csvUtils changes

`src/components/csvUtils.ts` adds:

```ts
export type FileKind = 'csv' | 'excel' | 'pdf' | 'unknown';

/** Classifies a File by extension first, then MIME type, for upload dispatch. */
export function classifyFile(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
  if (name.endsWith('.pdf')) return 'pdf';
  if (file.type === 'application/pdf') return 'pdf';
  if (
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel' // some browsers report .csv this way too
  ) {
    return 'csv';
  }
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'excel';
  }
  return 'unknown';
}
```

`isCsvFile` is kept (delegating to `classifyFile(file) === 'csv'`) so existing call sites
and tests keep working; new code uses `classifyFile` directly. `decodeCsvBytes` and
`parseCsvText` are unchanged — Excel-derived `CSV_Text` is a `string` by the time it reaches
`parseCsvText`, identical in shape to decoded CSV file text.

### Build / lazy-loading / precache

No changes to `vite.config.ts` are required: Vite automatically emits a separate chunk for
any module reached only through a dynamic `import()`. `excelReader.ts`'s `await
import('xlsx')` combined with the Uploader's `await import('../engine/excelReader')` (itself
dynamic, so even `excelReader.ts`'s module graph is only pulled in on demand) ensures SheetJS
and the reader logic never appear in the main entry chunk, satisfying Requirement 7.1–7.3.

`build/precachePlugin.ts`'s `buildManifest` already walks every file under `dist/` (via
`listFiles`) and hashes it into the `Precache_Manifest`, with no special-casing by filename —
so the Excel_Chunk's hashed filename (e.g. `assets/excelReader-<hash>.js`) is included
automatically once it exists on disk, with no plugin change needed. What is added:

- `tests/build/excelChunk.build.test.ts` (new file; `dist.build.test.ts` is not edited):
  after a production build, assert that `dist/assets/` contains at least one `.js` file matching `/excel|xlsx/i` in its name (Vite
  derives chunk names from the dynamically-imported module's filename by default), and that
  this file's URL appears among the embedded `__PRECACHE__` entries in `dist/sw.js` — turning
  Requirement 7.5's "automated check that fails if the URL is absent" into a concrete
  assertion rather than a manual step.
- `noNetworkScan.test.ts`'s `src/**` scan already walks the whole `src/` tree with no
  exclusions, so `excelReader.ts` and `headerLocator.ts` are covered automatically; the
  `dist/assets/*.js` scan is similarly extension-agnostic, so the Excel_Chunk is scanned
  the same way the main chunk is today. `node_modules/xlsx`'s own source is inspected once
  (manually, as part of implementation/code review — see Dependency Safety below) to confirm
  it introduces no additional network-pattern hits beyond what `DIST_MAX_COUNTS` already
  allows; if it does, `DIST_MAX_COUNTS` is adjusted explicitly and the reason documented in
  a code comment, never silently loosened.

### Dependency safety (SheetJS)

`package.json` gets:

```json
"dependencies": {
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
}
```

`package-lock.json` will pin the resolved tarball URL and its integrity hash — `npm install`
from a URL spec never resolves to the npm registry's `xlsx` package, satisfying
Requirement 8.1–8.2. After installing, `npm audit` is run and its full output recorded in
the task/PR notes; any advisory naming `xlsx` or a package it brings in is reported to the
user before the feature is considered done (Requirement 8.3–8.4). This is a one-time
maintainer action, not an automated test (see Correctness Properties: not every acceptance
criterion maps to a property or even a test — see Design Decisions).

## Components and Interfaces

```
src/engine/
  headerKeywords.ts     Shared date/description/amount keyword regexes, extracted from
                         parser.ts, used by both detectColumns and locateHeader.
  headerLocator.ts       locateHeader(grid: string[][]): HeaderLocation
  excelReader.ts          export async function readWorkbook(bytes): Promise<ExcelReadResult>
                          (named export only; dynamically imports 'xlsx' inside its try)

src/components/
  Uploader.tsx            + classifyFile-based dispatch, onParseError prop, Excel branch
  csvUtils.ts             + classifyFile, FileKind; isCsvFile delegates to classifyFile
  App.tsx                 + the single locateHeader([raw.headers, ...raw.rows]) call in
                           handleCsv, between parseCsvText and parseStatement;
                           wires onParseError to setErrorKey

src/i18n/
  en.json / es.json       + errors.pdfNotSupported; upload.supportedFormats and
                           errors.parseFailed text updated to mention Excel

scripts/
  generate-excel-fixtures.ts   Fixture_Generator (see Fixtures below)

tests/fixtures/excel/
  <layout>-serial-dates.xlsx / .xls / .csv
  <layout>-junk-rows-date-cells.xlsx / .xls / .csv
```

### Types

```ts
// src/engine/types.ts additions (or a new src/engine/excelTypes.ts, kept alongside
// existing AppError/Result so no breaking change to the existing type module's shape):

export interface HeaderLocation {
  headerRowIndex: number;
  headers: string[];
  rows: string[][];
}

export type ExcelReadResult =
  | { ok: true; csvText: string }
  | { ok: false; error: AppError };
```

No changes to `Transaction`, `ColumnLayout`, `Vampire`, or any existing exported type —
Excel support is additive.

### i18n keys

`en.json` / `es.json` additions and edits (leaf keys only; existing structure preserved):

| Key | en | es |
|---|---|---|
| `errors.pdfNotSupported` (new) | "PDF files aren't supported yet. Please export your statement from your bank as Excel (.xlsx or .xls) and upload that instead." | "Los archivos PDF aún no son compatibles. Exporta tu estado de cuenta desde tu banco como Excel (.xlsx o .xls) y sube ese archivo." |
| `errors.fileNotCsv` (edited) | "That file doesn't look like a supported statement. Please upload a .csv, .xls or .xlsx file." | "Ese archivo no parece un estado de cuenta compatible. Por favor sube un archivo .csv, .xls o .xlsx." |
| `errors.parseFailed` (edited) | "We couldn't read your file. Make sure it's a valid CSV or Excel (.xlsx/.xls) file and try again." | "No pudimos leer tu archivo. Asegúrate de que sea un CSV o Excel (.xlsx/.xls) válido e inténtalo de nuevo." |
| `upload.supportedFormats` (edited) | "Supports CSV and Excel files (.xlsx, .xls) from most banks." | "Compatible con archivos CSV y Excel (.xlsx, .xls) de la mayoría de los bancos." |

`README.md` gains a sentence in the usage/features section stating CSV, `.xlsx` and `.xls`
are supported and PDF is not (Requirement 8.13).

### Fixture generator

`scripts/generate-excel-fixtures.ts` (exposed as the npm script
`"generate:excel-fixtures": "node scripts/generate-excel-fixtures.ts"`). No `tsx`
devDependency is added: `package.json` does not list `tsx` and the installed Node (v22.22)
strips TypeScript types natively. The script therefore uses only erasable TypeScript syntax
(no enums, namespaces or parameter properties) and explicit `.ts` extensions on relative
imports. If the script turns out not to run this way, add `tsx` as a devDependency at that
point, not before:

- Builds two bank layouts as plain row arrays (`string[][]` headers + value matrices), each
  with a deterministic, hard-coded synthetic data set (no `Math.random()`, no real bank
  data):
  1. **`layout-a`** — single-amount column, dates as numeric serials **with a real date
     number format** (`cell.z = 'yyyy-mm-dd'`, so SheetJS reads them as dates), 3 Junk_Rows
     above the header (a title row, a blank row, an account-number row).
  2. **`layout-b`** — split debit/credit columns, dates as native Excel date cells
     (`Excel_Date_Cell`, `t: 'd'`), no Junk_Rows, amounts as numeric cells.

  Fixtures never rely on unformatted serials. Unformatted-serial behavior is covered by
  in-memory workbooks in `excelReader.test.ts`, not by committed fixtures.
- For each layout, uses SheetJS (`XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new`,
  `XLSX.writeFile`) to write both a `.xlsx` and a `.xls` file into
  `tests/fixtures/excel/`.
- Also writes a matching `.csv` fixture per layout (same header + rows rendered as plain CSV
  text, dates as `YYYY-MM-DD` strings, amounts as `dotDecimal` strings) so tests can assert
  Excel-vs-CSV parity against a committed fixture pair, not just generated random data.
- Running the script twice overwrites the files with byte-for-byte-equivalent cell content
  (fixed input data, no timestamps/randomness embedded by the generator itself — note that
  `.xls`/`.xlsx` container bytes may still differ by metadata SheetJS itself embeds, so the
  determinism check in testing compares **decoded cell contents**, not raw file bytes — see
  Testing Strategy).

## Data Models

No existing data model changes. New types are additive, kept alongside `AppError`/`Result`
in `src/engine/types.ts`:

```ts
/** Result of locating the real header row in a CSV/Excel-derived grid. */
export interface HeaderLocation {
  /** 0-based index, within the input grid, of the row selected as the header. */
  headerRowIndex: number;
  headers: string[];
  rows: string[][];
}

/** Result of converting an Excel Workbook's Data_Sheet into CSV_Text. */
export type ExcelReadResult =
  | { ok: true; csvText: string }
  | { ok: false; error: AppError };

/** File-type classification used by the Uploader to dispatch to the right path. */
export type FileKind = 'csv' | 'excel' | 'pdf' | 'unknown';
```

`Transaction`, `ColumnLayout`, `Vampire`, `AppError`, and `Result` are unchanged — Excel
support produces `CSV_Text` ahead of the existing `parseStatement`/`runDetection` data flow,
so no existing model needs new fields. The `AppErrorCode` union does not need a new code:
every Excel/PDF failure path reuses the existing `PARSE_FAILED` code (Excel read failures) or
is handled purely through i18n key selection in the Uploader (`errors.pdfNotSupported`,
`errors.fileNotCsv`) without an `AppError` round trip.

## Error Handling

All new failure paths return a `Result`/`{ ok: false, error }` shape consistent with the
existing `AppError` model; nothing new throws across a module boundary:

| Scenario | Code | Surfaced via |
|---|---|---|
| Excel file cannot be parsed (corrupt bytes, password-protected) | `PARSE_FAILED` | `readWorkbook` catches any SheetJS throw and returns `{ ok: false, error }`; Uploader shows `errors.parseFailed`. |
| Every sheet in the workbook is empty | `PARSE_FAILED` | `readWorkbook` returns `{ ok: false, error }` explicitly (not via a caught exception) when no sheet has a non-empty cell; Uploader shows `errors.parseFailed`. |
| Dynamic `import('xlsx')` or `import('../engine/excelReader')` rejects (e.g. offline + chunk not yet cached) | n/a (caught) | Uploader wraps the dynamic import in try/catch; on rejection shows `errors.parseFailed`. |
| User uploads a `.pdf` | n/a | Uploader shows `errors.pdfNotSupported` without touching the Excel path at all — no dynamic import is attempted. |
| User uploads an unrecognized extension/MIME | n/a | Uploader shows `errors.fileNotCsv`. |
| `Header_Locator` finds no qualifying row in 30 rows | n/a (not an error) | Falls back to the first non-empty row as the header row; parsing continues normally (may still fail later at `detectColumns` with `COLUMN_MAPPING_NEEDED`, which is existing, unchanged behavior). |

After any Excel or PDF error, the Uploader's local state (`dragActive`, `showSamples`, the
hidden `<input>`'s value) is left exactly as the CSV error path leaves it today — the user
can immediately retry via drag-drop or the file picker (Requirement 5.4), since no new
non-resettable state is introduced.

## Testing Strategy

**Unit tests** (new, example-based):
- `headerLocator.test.ts`: CSV_Text with Junk_Rows (blank row, single-cell row, multi-cell
  title/account row), Excel-derived CSV_Text with Junk_Rows, no Junk_Rows (first row is
  already the header), and a grid with no recognizable header row in 30 rows (fallback to
  first non-empty row). Extends the existing `headerRules.test.ts`-style per-file unit test
  pattern already used in this repo.
- `excelReader.test.ts`: a `.xlsx` buffer built in-memory with SheetJS for each of: a single
  non-empty sheet, multiple sheets with leading empty sheets, every sheet empty, a
  password-protected/corrupt buffer, a cell with a comma/quote/newline, an empty cell, a
  comma-decimal text amount cell.
- `Uploader.excel.test.tsx` / extend `Uploader` tests: `.xlsx`/`.xls` dispatch to the Excel
  path (mocked `excelReader`), `.pdf` shows `errors.pdfNotSupported` without importing the
  Excel module, unrecognized extension shows `errors.fileNotCsv`, Excel parse failure and
  dynamic-import rejection both show `errors.parseFailed`, and the Uploader remains usable
  for a follow-up upload after each error.
- `csvUtils.classifyFile.test.ts`: one example per `FileKind` branch (extension and MIME
  fallbacks).
- i18n/content checks: `errors.pdfNotSupported` exists in both locales;
  `errors.fileNotCsv`/`upload.supportedFormats`/`errors.parseFailed` mention the right
  formats in both locales; `README.md` mentions CSV/.xlsx/.xls support and PDF rejection;
  `package.json` pins the SheetJS tarball URL (not the npm registry package).
- Extend `tests/integration.bankFixtures.test.ts` / add `tests/integration.excelFixtures.test.ts`:
  for each committed Excel fixture (from the Fixture_Generator), run it through
  `Excel_Reader → locateHeader → parseStatement → runDetection` and assert the result is
  identical to running the fixture's matching committed CSV fixture through
  `locateHeader → parseStatement → runDetection`.
- New file `tests/build/excelChunk.build.test.ts` (picked up by `vitest.build.config.ts`,
  which includes `tests/build/**`): after a production build, assert an Excel-named chunk
  file exists under `dist/assets/`, that the main entry chunk does not contain SheetJS, and
  that the chunk's URL is present in the `__PRECACHE__` entries embedded in `dist/sw.js`.
  `tests/build/dist.build.test.ts` is not edited.
- Determinism check for the Fixture_Generator: run `generateFixtures()` (the generator's pure
  row-building function, factored out from its file-writing `main()`) twice and assert the
  returned row/cell data structures are deeply equal both times.

**Required example tests for the date, error and e2e behavior** (all required, none
optional):
- `excelReader.test.ts`, unformatted Plausible_Serial (Requirement 3.15): an in-memory
  workbook with a `Fecha` header and the numeric cell `45292` (no number format) yields
  `2024-01-01`; the same cell below 2 Junk_Rows also converts; a numeric amount column with
  the same value is not converted.
- `excelReader.test.ts` and an App-level test, non-plausible numeric (Requirement 3.16): a
  `Fecha` cell holding `5` (and one holding `45292.5`) stays a number (`"5.00"`,
  `"45292.50"`); `readWorkbook` returns `{ ok: true }`; rendering the App with that CSV_Text
  shows the column mapper or an error message and does not throw.
- `excelReader.test.ts`, failed dynamic import (Requirements 5.3, 5.5, 5.6):
  `vi.doMock('xlsx', () => { throw new Error('chunk load failed') })`, then
  `readWorkbook(bytes)` resolves to `{ ok: false }` and does not reject. A second case
  rejects the import asynchronously. An Uploader test mocks `../engine/excelReader` to
  reject and asserts `errors.parseFailed` is shown.
- `excelReader.test.ts`, corrupt Workbook (Requirement 5.6): truncated and random bytes
  return `{ ok: false }`.
- `e2e/offline.spec.ts`, two new tests (Requirements 7.7, 7.8):
  (a) "CSV-only session never requests the Excel chunk": using `recordRequests`, load the
  app, upload a sample CSV, and assert that no recorded request URL matches the Excel_Chunk
  file name (read from `dist/assets` at test time). (b) "Excel upload works offline after
  the first visit": wait for the service worker precache (seal shows "Works offline:
  ready"), call `context.setOffline(true)` (and stop the preview server in a variant), then
  upload a `tests/fixtures/excel/*.xlsx` file through `input[type="file"]` and assert the
  crypt renders with no failed requests.
- Existing tests that assert the old `accept` attribute or the old "not a CSV" message text
  may be updated for the new behavior. Nothing else in those files changes. The Vampire_Id
  baselines, `tests/baselines/csp.txt` and all baseline and preservation tests stay
  untouched (Requirements 8.6, 8.7).

**Property-based tests** (fast-check, ≥100 iterations each, in `tests/*.property.test.ts`):
see Correctness Properties below for the nine properties and their requirement mappings.
All of them are required.

**noNetworkScan extension**: no test file changes are needed beyond what already exists —
`noNetworkScan.test.ts`'s `src/**` walk and `dist/assets/*.js` walk are already
extension/path-agnostic, so `excelReader.ts`, `headerLocator.ts`, and the new Excel_Chunk are
scanned automatically. If SheetJS's bundled source introduces any occurrence of the four
network patterns in the built `dist/assets/*.js` output (none were found in the raw
`xlsx.mjs` source during design review), `DIST_MAX_COUNTS` is updated with an explicit,
commented reason rather than silently passing.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sheet selection skips empty sheets and reads only the first non-empty one

For any Workbook built from a list of sheets where a (possibly empty) prefix of the sheets
is empty and the remaining sheets are non-empty, `readWorkbook` SHALL produce `CSV_Text`
derived only from the first non-empty sheet's content, and that content SHALL be unaffected
by the content of any sheet after it.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Excel and CSV built from the same rows produce identical detection results

For any generated set of valid statement rows (date, description, amount, consistent column
layout), building a CSV_Text document and an `.xlsx` Workbook from the same rows and running
each — after `locateHeader` and `parseStatement` — through `runDetection` SHALL produce the
same set of vampires, with equal `Vampire_Id`s, equal `amountCents`, and equal
`annualBloodLossCents` for every vampire, for both inputs.

**Validates: Requirements 3.1, 3.2, 8.11**

### Property 3: Numeric amount cells round-trip to cents without floating-point error

For any numeric amount cell value with at most 2 fractional digits (as a currency amount
would have), writing it through `formatAmount` and then parsing the resulting string with
the existing `parseCents(s, 'dotDecimal')` SHALL yield exactly `Math.round(v * 100)`, with no
floating-point rounding discrepancy.

**Validates: Requirements 3.6, 3.8**

### Property 4: Excel date conversion is stable across process timezone and matches Excel's displayed calendar date

For any Workbook format in {`.xlsx`, `.xls`}, any date-formatted `Excel_Serial_Date` cell,
any `Excel_Date_Cell`, any unformatted Plausible_Serial in a Date_Header_Column, and any
numeric amount cell, and for any of the process timezones UTC-12:00, UTC+00:00 and
UTC+14:00, `readWorkbook` SHALL produce identical `CSV_Text` in all three timezones. Every
date field in that text SHALL equal the calendar date Excel displays for the underlying
serial value, computed independently from the 1899-12-30 epoch and not through `Date`'s
local-timezone getters. The test runs on both `.xlsx` and `.xls` Workbooks, sets the process
timezone (`process.env.TZ`) to each value, and is required.

**Validates: Requirements 3.3, 3.4, 3.5, 3.12, 8.12**

### Property 5: Special characters in Excel text cells survive a CSV round trip

For any string containing any combination of commas, double quotes, and line breaks, writing
it into a sheet cell, converting the sheet to `CSV_Text` via `sheetToCsvText`, and parsing
that `CSV_Text` with the existing `csvUtils.parseCsvText` (Papa Parse) SHALL yield back a
cell value identical to the original string.

**Validates: Requirements 3.9**

### Property 6: Excel_Reader never throws on malformed input

For any byte sequence that is not a valid Excel Workbook (including truncated, corrupted, or
password-protected byte sequences), calling `readWorkbook` on those bytes SHALL NOT throw and
SHALL resolve to `{ ok: false, error }`. The example test for a failed dynamic import
(Requirement 5.3) covers the same never-throws guarantee for the import step.

**Validates: Requirements 5.2, 5.5**

### Property 7: Unrecognized file extensions are rejected with the generic message

For any file name extension that is not `.csv`, `.xlsx`, `.xls`, or `.pdf` (case-insensitive),
and any MIME type other than the recognized CSV/Excel/PDF MIME types, `classifyFile` SHALL
return `'unknown'`, and the Uploader SHALL display `errors.fileNotCsv` for that file.

**Validates: Requirements 4.4**

### Property 8: Prepending Junk_Rows never changes detection results

For any valid statement grid (headers + rows that `parseStatement` and `runDetection` accept)
and any number of synthetic Junk_Rows from 0 to 10 (blank rows, single-filled-cell rows, and
multi-filled-cell title/account rows) prepended above the real header row, running
`locateHeader` then `parseStatement` then `runDetection` on the grid-with-Junk_Rows SHALL
produce the same vampires, the same `Vampire_Id`s, and the same `amountCents` as running the
same pipeline on the grid without the prepended Junk_Rows.

**Validates: Requirements 9.1, 9.2, 9.3, 9.11**

### Property 9: Header_Locator falls back to the first non-empty row when no row qualifies

For any grid of up to 30 rows in which no row has both (a) at least 3 non-empty cells and
(b) accent-folded cell text matching both a date keyword and an amount-or-description
keyword, `locateHeader` SHALL return the first non-empty row of the grid as the header row.

**Validates: Requirements 9.4**

### Reflection on Redundant Properties

The initial pass identified a 10th candidate property — "the first row is returned as-is
when it is already the real header row" (Requirement 9.3) — as a special case of Property 8
(Junk_Rows count = 0) and of the general selection rule tested directly by Property 1 of the
Header_Locator unit tests; it is not restated as a separate property. Requirement 3.7 ("text
amounts with a comma decimal pass through unchanged") was folded into the cell-type
distinction already asserted by Properties 3 and 5 together (numeric/date cells transform,
string cells never do) and is additionally covered by a direct unit test rather than a
seventh near-duplicate property. Requirements 3.1 and 8.11 are the same parity obligation as
3.2, restated for emphasis in the spec, so they are validated by the single Property 2 rather
than three separate properties. Requirements 3.3–3.5, 3.12 and 8.12 are likewise one timezone/date
property (Property 4), not four.

## Design Decisions

- **Dynamic import boundary lives in the Uploader, not deeper.** `excelReader.ts` is itself
  dynamically imported by the Uploader (in addition to `excelReader.ts` dynamically importing
  `xlsx`), so that even the small amount of glue code in `excelReader.ts` never loads for
  CSV-only sessions. This two-level dynamic import adds negligible complexity and strengthens
  Requirement 7.3 ("the browser SHALL not request the Excel_Chunk" for CSV-only sessions).
- **Header_Locator runs unconditionally, not only when Junk_Rows are suspected.** Running it
  on every upload (CSV and Excel alike) is simpler than trying to detect "does this look like
  it has junk rows" first, and the fallback behavior (return the first non-empty row when no
  row qualifies) is designed to be a no-op for every statement that already starts with its
  header row — which Property 8 (at N=0 Junk_Rows) and the full existing sample/bank fixture
  regression suite (Requirement 8.5, 9.12) both verify produces unchanged output for existing
  statements.
- **No sheet picker UI.** Requirement 2.4 explicitly rules this out; the single-Data_Sheet
  heuristic (first non-empty sheet) is judged sufficient because real-world bank Excel
  exports overwhelmingly use one data sheet, optionally preceded by blank placeholder sheets
  some banking software leaves behind.
- **`npm audit` reporting (Requirement 8.3–8.4) and the "keep customHttp.yml unchanged"
  checks (Requirement 6.4–6.5) are not modeled as properties or unit tests** — they are either
  a one-time maintainer action (audit) or a straightforward file-equality/non-modification
  check against a fixed baseline, with no meaningfully varying input. They are tracked as
  implementation tasks, not as entries in the Correctness Properties section.
