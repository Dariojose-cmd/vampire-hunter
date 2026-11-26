# Implementation Plan: Excel Statement Support

## Overview

The plan adds `.xlsx`/`.xls` upload on top of the unchanged Pipeline, in TypeScript (the language of the existing codebase). Work proceeds in this order: install SheetJS from the CDN tarball and audit it, build the pure `Header_Locator`, build the lazy `Excel_Reader` with its tests, generate fixtures, add i18n and README text, wire the Uploader, `csvUtils` and `App`, verify the build and precache in a new test file, extend the offline e2e spec, and finish with a full verification checkpoint.

Every task and every test in this plan is required, including all property tests. No task is optional.

## Tasks

- [x] 1. Install SheetJS from the CDN tarball and audit it
  - [x] 1.1 Install SheetJS from the tarball
    - Run `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` so `package.json` lists `xlsx` under `dependencies` with that exact URL
    - Confirm `package-lock.json` resolves `xlsx` to the tarball URL and not to the npm registry, and that no `xlsx` 0.18.x entry exists
    - _Requirements: 8.1, 8.2_

  - [x] 1.2 Run `npm audit` and record the result
    - Run `npm audit` and paste the full output into the task output
    - If any advisory names `xlsx` or a package SheetJS added, report the advisory to the user before this task is marked complete
    - _Requirements: 8.3, 8.4_

- [ ] 2. Implement headerKeywords and Header_Locator
  - [x] 2.1 Extract shared header keywords
    - Create `src/engine/headerKeywords.ts` exporting the date, description and amount keyword regexes currently inside `src/engine/parser.ts`
    - Update `parser.ts` (`detectColumns`) to import them, with no change in behavior
    - Do not edit any existing test
    - _Requirements: 9.2, 9.12_

  - [x] 2.2 Implement `locateHeader`
    - Add the `HeaderLocation` interface to `src/engine/types.ts`
    - Create `src/engine/headerLocator.ts` with pure `locateHeader(grid: string[][]): HeaderLocation`, no React imports
    - Select the first row among the first 30 with at least 3 non-empty cells and, after accent folding, a date keyword plus an amount or description keyword
    - Fall back to the first non-empty row when no row qualifies, and handle blank, single-cell and multi-cell Junk_Rows
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.9_

  - [x] 2.3 Write unit tests for `locateHeader`
    - Create `tests/headerLocator.test.ts` covering CSV_Text with Junk_Rows, Excel-derived CSV_Text with Junk_Rows, no Junk_Rows, and no recognizable header row
    - Cover blank, single-cell and multi-cell Junk_Rows, and accent-folded headers
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.10_

  - [x] 2.4 Write property test for Junk_Rows invariance
    - Create `tests/headerLocator.junkRows.property.test.ts`, prepending 0 to 10 generated Junk_Rows (blank, single-cell, multi-cell) to a valid generated statement
    - Compare vampires, Vampire_Ids and amounts in Cents of `locateHeader → parseStatement → runDetection` with and without the Junk_Rows
    - **Property 8: Prepending Junk_Rows never changes detection results**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.11**

  - [x] 2.5 Write property test for the header fallback
    - Create `tests/headerLocator.fallback.property.test.ts` with generated grids of up to 30 rows in which no row has at least 3 non-empty cells plus a date keyword and an amount or description keyword
    - Assert `locateHeader` returns the first non-empty row as the header row
    - **Property 9: Header_Locator falls back to the first non-empty row when no row qualifies**
    - **Validates: Requirements 9.4**

- [x] 3. Implement Excel_Reader
  - [x] 3.1 Implement `readWorkbook`
    - Add `ExcelReadResult` to `src/engine/types.ts`
    - Create `src/engine/excelReader.ts` with a named export only: `export async function readWorkbook(bytes: ArrayBuffer): Promise<ExcelReadResult>`; no default export and no top-level `xlsx` import
    - Put `await import('xlsx')` inside the `try` block, so a failed dynamic import returns `{ ok: false, error }` with code `PARSE_FAILED` instead of rejecting; `readWorkbook` returns a Result for every input and never throws
    - Read with `{ type: 'array', cellDates: true }`, choose the first sheet with a non-empty cell, and return `{ ok: false, error }` when every sheet is empty or SheetJS throws
    - Convert `'d'` cells with `getUTCFullYear/Month/Date` only, never local getters
    - Build the display-text grid of the first 30 rows, call `locateHeader` to find the header row and the Date_Header_Columns (using the shared `headerKeywords`), and convert a numeric cell below the header row in a Date_Header_Column to `YYYY-MM-DD` only when it is a Plausible_Serial (integer, year 1990 to 2100, UTC arithmetic, `date1904` offset honored)
    - Write every other numeric cell, including non-plausible values in a Date_Header_Column, with `formatAmount`: round to cents and always write exactly 2 decimals, dot separator, no thousands separator (`1500` becomes `"1500.00"`)
    - Pass `'s'`/`'b'`/`'e'` cells through unchanged with RFC 4180 quoting, and write empty cells as empty fields
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 5.1, 5.2, 5.3, 5.5, 6.1, 6.2, 7.1_

  - [x] 3.2 Write unit tests for `readWorkbook`
    - Create `tests/excelReader.test.ts` using workbooks built in memory with SheetJS
    - Cover a single sheet, leading empty sheets, later sheets ignored, all sheets empty (failure Result), a cell with comma, quote and newline, an empty cell, a comma-decimal text amount left unchanged (`"1.299,00"`), a date-formatted serial and an Excel_Date_Cell written as ISO dates, and numeric amounts such as `19.99`, `19.9` and `1500` written as `"19.99"`, `"19.90"` and `"1500.00"`
    - Assert the named export is the only export (no `default` key)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3, 3.4, 3.6, 3.7, 3.9, 3.10, 3.11_

  - [x] 3.3 Write example tests for unformatted serials
    - Create `tests/excelReader.dates.test.ts`
    - Unformatted Plausible_Serial: a workbook with a `Fecha` header and the numeric cell `45292` (no number format) yields `2024-01-01`; the same cell below 2 Junk_Rows also converts; a numeric value in an amount column is not converted as a date
    - Non-plausible values: a `Fecha` cell holding `5` and one holding `45292.5` stay numbers (`"5.00"`, `"45292.50"`), and `readWorkbook` still returns `{ ok: true }`
    - _Requirements: 3.12, 3.13, 3.15, 3.16_

  - [x] 3.4 Write example tests for corrupt workbook and failed dynamic import
    - Create `tests/excelReader.errors.test.ts`
    - Corrupt workbook: truncated bytes and random bytes both return `{ ok: false }` and do not throw
    - Failed dynamic import: `vi.resetModules()` then `vi.doMock('xlsx', () => { throw new Error('chunk load failed') })` makes `readWorkbook(bytes)` resolve to `{ ok: false }` and not reject; a second case rejects the import asynchronously and gets the same result
    - _Requirements: 5.2, 5.3, 5.5, 5.6_

  - [x] 3.5 Write property test for sheet selection
    - Create `tests/excelSheetSelection.property.test.ts`, building workbooks with a generated empty prefix of sheets followed by non-empty sheets
    - Assert the output derives only from the first non-empty sheet and does not change when later sheets change
    - **Property 1: Sheet selection skips empty sheets and reads only the first non-empty one**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 3.6 Write property test for amount round trip
    - Create `tests/excelAmounts.property.test.ts` with generated numeric amounts having at most 2 fractional digits, including negatives and large values
    - Assert the `readWorkbook` output for each amount cell has exactly 2 decimal digits, a dot separator and no thousands separator or exponent
    - Assert `parseCents(s, 'dotDecimal')` on that string equals `Math.round(v * 100)` exactly, and that the Cents equal those parsed from the same value written without the 2-decimal formatting
    - **Property 3: Numeric amount cells round-trip to cents without floating-point error**
    - **Validates: Requirements 3.6, 3.8, 3.11**

  - [x] 3.7 Write property test for timezone-stable dates on .xlsx and .xls
    - Create `tests/excelDates.property.test.ts`
    - Generate workbooks in both `.xlsx` and `.xls` formats containing date-formatted serial cells, Excel_Date_Cell cells, unformatted Plausible_Serial cells in a Date_Header_Column, and numeric amount cells
    - Run `readWorkbook` with `process.env.TZ` set to each of UTC-12:00, UTC+00:00 and UTC+14:00 (for example `Etc/GMT+12`, `UTC`, `Etc/GMT-14`), restoring the original value afterward, and assert the output text is identical in all three
    - Assert each date equals the calendar date computed independently from the 1899-12-30 epoch with integer day arithmetic, not through `Date` local getters
    - **Property 4: Excel date conversion is stable across process timezone and matches Excel's displayed calendar date**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.12, 8.12**

  - [x] 3.8 Write property test for CSV escaping
    - Create `tests/excelCsvEscaping.property.test.ts` with generated strings built from commas, double quotes, line breaks and ordinary characters
    - Write each string into a text cell, run `readWorkbook`, parse the result with `parseCsvText`, and assert the cell value equals the original string
    - **Property 5: Special characters in Excel text cells survive a CSV round trip**
    - **Validates: Requirements 3.9**

  - [x] 3.9 Write property test that malformed input never throws
    - Create `tests/excelMalformed.property.test.ts` with generated arbitrary, truncated and corrupted byte sequences
    - Assert `readWorkbook` always resolves (never rejects or throws) and resolves to `{ ok: false, error }` for bytes that are not a valid workbook
    - **Property 6: Excel_Reader never throws on malformed input**
    - **Validates: Requirements 5.2, 5.5**

  - [x] 3.10 Write property test for CSV and Excel parity
    - Create `tests/excelCsvParity.property.test.ts`, generating statement rows (date, description, amount) and building both a CSV_Text and an `.xlsx` workbook from the same rows
    - Run each through `locateHeader → parseStatement → runDetection` and assert equal vampires, Vampire_Ids, `amountCents` and `annualBloodLossCents`
    - **Property 2: Excel and CSV built from the same rows produce identical detection results**
    - **Validates: Requirements 3.1, 3.2, 8.11**

- [x] 4. Create the fixture generator and fixtures
  - [x] 4.1 Write the Fixture_Generator and npm script
    - Create `scripts/generate-excel-fixtures.ts` with a pure exported `generateFixtures()` that returns the row data, and a `main()` that writes the files with SheetJS
    - Use only erasable TypeScript syntax (no enums, namespaces or parameter properties) and explicit `.ts` extensions on relative imports, so the script runs under Node's native type stripping
    - Layout A: single amount column, dates as numeric serials with a real date number format (`cell.z = 'yyyy-mm-dd'`), 3 Junk_Rows above the header. Layout B: split debit and credit columns, dates as native `Excel_Date_Cell` values, numeric amounts, no Junk_Rows
    - Write each layout as `.xlsx`, `.xls` and an equivalent `.csv` into `tests/fixtures/excel/`, using only hard-coded synthetic data with no randomness; no fixture relies on unformatted serials
    - Add `"generate:excel-fixtures": "node scripts/generate-excel-fixtures.ts"` to `package.json`; do not add `tsx` unless the script fails to run under `node`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 4.2 Generate and commit the fixtures
    - Run `npm run generate:excel-fixtures` and confirm all 4 Excel files and the 2 matching CSV files exist in `tests/fixtures/excel/`
    - Confirm the files contain no real bank data
    - _Requirements: 10.2, 10.6, 10.7_

  - [x] 4.3 Write fixture parity and determinism tests
    - Create `tests/integration.excelFixtures.test.ts`: for each Excel fixture, run `readWorkbook → parseCsvText → locateHeader → parseStatement → runDetection` and assert the result equals the matching CSV fixture run through the same stages after `parseCsvText`
    - Assert `generateFixtures()` called twice returns deeply equal data
    - Assert the fixtures hold date-formatted serial cells (layout A) and Excel_Date_Cell cells (layout B) by decoding them with SheetJS
    - _Requirements: 8.10, 10.4, 10.9_

- [x] 5. Checkpoint - Engine and fixtures
  - Run `npm test` and confirm the new engine tests and all existing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update i18n and README
  - [x] 6.1 Update `en.json` and `es.json`
    - Add `errors.pdfNotSupported` in both locales, suggesting export as Excel (.xlsx or .xls)
    - Edit `errors.fileNotCsv` to name .csv, .xls and .xlsx, `errors.parseFailed` to mention Excel, and `upload.supportedFormats` to say CSV and Excel files are supported, in both locales
    - Use the texts from the design's i18n table
    - _Requirements: 4.2, 4.5, 4.6, 8.14, 8.15, 8.16_

  - [x] 6.2 Update the README
    - State that CSV, `.xlsx` and `.xls` files are supported and that PDF files are not
    - _Requirements: 8.13_

  - [x] 6.3 Write i18n and content tests
    - Create `tests/excelContent.test.ts` asserting `errors.pdfNotSupported` exists in both locales and names Excel, `errors.fileNotCsv` names .csv, .xls and .xlsx in both locales, `errors.parseFailed` and `upload.supportedFormats` mention Excel in both locales, the README states the supported and unsupported formats, and `package.json` pins the SheetJS tarball URL and has no registry `xlsx`
    - Assert `en.json` and `es.json` expose the same key set
    - _Requirements: 4.2, 4.5, 4.6, 8.1, 8.2, 8.13, 8.14, 8.15, 8.16_

- [x] 7. Wire Uploader, csvUtils and App
  - [x] 7.1 Add `classifyFile` to `csvUtils.ts`
    - Add `FileKind` and `classifyFile(file)` (extension first, then MIME fallback) to `src/components/csvUtils.ts`
    - Make `isCsvFile` delegate to `classifyFile(file) === 'csv'`
    - _Requirements: 1.1, 1.2, 4.1, 4.4_

  - [x] 7.2 Write classification tests
    - Create `tests/csvUtils.classifyFile.test.ts` with one example per `FileKind` branch, including MIME fallbacks and upper-case extensions
    - Create `tests/classifyFile.property.test.ts` with generated extensions and MIME types outside `.csv`, `.xlsx`, `.xls`, `.pdf` and the recognized MIME types, asserting `classifyFile` returns `'unknown'`
    - **Property 7: Unrecognized file extensions are rejected with the generic message**
    - **Validates: Requirements 4.4**

  - [x] 7.3 Update `Uploader.tsx`
    - Set the `accept` attribute to `.csv,.xlsx,.xls,.pdf` plus the matching MIME types
    - Dispatch with `classifyFile`: `csv` uses the existing path, `excel` reads the file as an `ArrayBuffer`, runs `const { readWorkbook } = await import('../engine/excelReader')` inside a try/catch, calls `readWorkbook`, and delivers `csvText` to `onCsv(file.name, csvText)`, `pdf` reports `errors.pdfNotSupported` without any dynamic import, and `unknown` reports `errors.fileNotCsv`
    - Add an optional `onParseError?: (key: TranslationKey) => void` prop; report `errors.parseFailed` on a failure Result or a rejected dynamic import, and never call `onCsv('', '')` for Excel failures
    - Do not add any state that blocks a follow-up upload, and do not add a sheet picker
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 2.5, 4.1, 4.3, 4.4, 5.1, 5.3, 5.4, 7.1_

  - [x] 7.4 Wire `locateHeader` and `onParseError` in `App.tsx`
    - In `handleCsv`, call `locateHeader([raw.headers, ...raw.rows])` at a single call site right after `parseCsvText(csvText)` and before `parseStatement`, for both CSV and Excel input
    - Pass `onParseError` to the Uploader and map it to the existing `setErrorKey`
    - Leave the Pipeline modules (`parser`, `normalizer`, `grouper`, `cadenceDetector`, `scorer`, `index`) unchanged
    - _Requirements: 3.1, 3.14, 5.4, 9.6, 9.7, 9.8, 9.12_

  - [x] 7.5 Find and update assertions on the old accept attribute and old "not a CSV" text
    - Search `tests/` and `e2e/` (for example `grep -rniE "accept|not a csv|fileNotCsv|supportedFormats|parseFailed|\.csv" tests e2e`) for assertions on the old `accept` value or the old "not a CSV" message text, then run `npm test` to confirm which tests fail because of the new behavior
    - Update only those assertions to the new behavior; change nothing else in those files
    - Do not touch the Vampire_Id baselines, `tests/baselines/csp.txt`, or any baseline or preservation test; if one of them fails, fix the source and not the test
    - _Requirements: 8.5, 8.6, 8.7_

  - [x] 7.6 Write Uploader dispatch tests
    - Create `tests/Uploader.excel.test.tsx` with a mocked `excelReader`: `.xlsx` and `.xls` dispatch to the Excel path and `onCsv` receives the CSV_Text, `.pdf` shows `errors.pdfNotSupported` and never imports the Excel module, an unknown extension shows `errors.fileNotCsv`, a failure Result and a rejected dynamic import both show `errors.parseFailed`, and a second upload works after each error
    - Assert the `accept` attribute lists `.csv`, `.xlsx` and `.xls`, and that no sheet picker renders for a multi-sheet workbook
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 2.5, 4.1, 4.3, 4.4, 5.1, 5.3, 5.4_

  - [x] 7.7 Write App-level tests for non-plausible dates and Junk_Rows
    - Create `tests/App.excel.test.tsx`: feed the App the CSV_Text produced from a workbook whose `Fecha` column holds `5` and `45292.5`, and assert it shows the column mapper or an error message and does not throw
    - Feed the App CSV_Text with Junk_Rows from both a CSV and an Excel source and assert the crypt renders, showing the header is found before the Pipeline runs
    - _Requirements: 3.14, 3.16, 9.6, 9.7_

- [x] 8. Verify the build and precache
  - [x] 8.1 Create the Excel chunk build test and run it
    - Create the new file `tests/build/excelChunk.build.test.ts` (picked up by `vitest.build.config.ts`); do not edit `tests/build/dist.build.test.ts`
    - After a production build, assert that `dist/assets/` has a `.js` chunk whose name matches `/excel|xlsx/i`, that the main entry chunk does not contain SheetJS code, and that the chunk URL appears in the `__PRECACHE__` entries embedded in `dist/sw.js`, failing when it is absent
    - Run `npm run test:build` and confirm it passes; do not change `build/vite.sw.config.ts` or `build/precachePlugin.ts` unless the check shows the chunk is missing
    - If `tests/noNetworkScan.test.ts` reports SheetJS hits in `dist/assets`, adjust `DIST_MAX_COUNTS` only with a commented reason
    - _Requirements: 6.3, 7.2, 7.3, 7.4, 7.5, 8.8_

- [x] 9. Extend the offline e2e spec
  - [x] 9.1 Add the CSV-only session test
    - In `e2e/offline.spec.ts`, add a test "CSV-only session never requests the Excel chunk": use `recordRequests`, load the app, upload a sample CSV, and assert that no recorded request URL matches the Excel_Chunk file name read from `dist/assets` at test time
    - Leave the existing tests in the file unchanged
    - _Requirements: 7.3, 7.7_

  - [x] 9.2 Add the offline Excel upload test
    - In `e2e/offline.spec.ts`, add a test "Excel upload works offline after the first visit": wait for the service worker precache (the seal shows "Works offline: ready"), call `context.setOffline(true)`, upload a `tests/fixtures/excel/*.xlsx` file through `input[type="file"]`, and assert the crypt renders with no failed requests
    - Add a variant that stops the preview server instead of setting the context offline
    - _Requirements: 7.6, 7.8_

- [x] 10. Final checkpoint - Full verification
  - Run the full `npm test` and confirm the whole Vitest suite passes, with only the assertions found in task 7.5 changed in existing test files
  - Run the e2e suite (`npx playwright test`) and confirm it passes, including the two new offline tests
  - Confirm `tests/noNetworkScan.test.ts` passes with the Excel_Reader and SheetJS included, and that `tests/cspBaseline.test.ts` and `tests/integration.bankFixtures.test.ts` pass with the 5 Sample_Statements keeping their Vampire_Ids
  - Run `git diff --exit-code customHttp.yml tests/baselines` and confirm there are no changes to `customHttp.yml` or the baselines, and `git diff --stat` shows no edits to the Vampire_Id baselines, `tests/baselines/csp.txt`, baseline or preservation tests, or `tests/build/dist.build.test.ts`
  - Run `npm run test:build` and confirm `tests/build/excelChunk.build.test.ts` passes
  - Run `npm run lint` and confirm it passes
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 6.3, 6.4, 6.5, 7.5, 8.5, 8.6, 8.7, 8.8, 8.9, 9.12_

## Notes

- Every task, test and property test is required; no task is optional.
- Each task references specific requirements for traceability, using the renumbered criteria in `requirements.md`.
- The i18n task (6.1) runs before the Uploader task (7.3) in the dependency graph so `errors.pdfNotSupported` exists when the Uploader is type-checked.
- `npm audit` (1.2) and the `customHttp.yml` and baseline diff checks (10) are maintainer actions, not property tests.
- Existing tests may change only in the assertions found in task 7.5. Baselines, `tests/baselines/csp.txt` and baseline and preservation tests stay untouched.
- New dist and precache checks live in `tests/build/excelChunk.build.test.ts`; `dist.build.test.ts` is not edited.
- Tasks 8.1, 9.1 and 9.2 are in separate waves because they build or serve `dist` and 9.1 and 9.2 edit the same file.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "4.1", "6.1", "6.2"] },
    { "id": 5, "tasks": ["4.2", "6.3", "7.1"] },
    { "id": 6, "tasks": ["4.3", "7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4", "7.6"] },
    { "id": 8, "tasks": ["7.5", "7.7", "8.1"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["9.2"] }
  ]
}
```
