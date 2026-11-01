# Implementation Plan: Vampire Hunter

## Overview

Build the Vampire Hunter SPA in a strict bottom-up order: scaffolding → styles/i18n → sample data → pure engine → property/unit tests → catalog/exchange-rate data → React UI → persistence → accessibility/responsive polish → Amplify deploy config. Each layer depends only on the layers below it. The detection engine (`src/engine/`) is kept entirely free of React imports; all engine functions return `Result<T, AppError>` and never throw.

## Tasks

- [x] 1. Project scaffolding and tooling
  - [x] 1.1 Initialize Vite + React + TypeScript project with strict mode
    - The repo root already contains `.kiro/` and `LICENSE`, which must NEVER be deleted or overwritten. Scaffold in a temporary folder (`npm create vite@latest /tmp/vh-scaffold -- --template react-ts`), copy its files into the repo root, then delete the temporary folder. Do not use the "remove existing files" option
    - Enable `"strict": true` in `tsconfig.json`
    - Add a `.gitignore` with `node_modules/` and `dist/` (never ignore `.kiro/`)
    - Add `paths` aliases: `@engine`, `@data`, `@components`, `@i18n`, `@styles` pointing to `src/*`
    - Install production dependencies: `framer-motion`, `papaparse`, `@types/papaparse`
    - Install dev dependencies: `vitest`, `@vitest/ui`, `fast-check`, `@testing-library/react`, `@testing-library/user-event`, `@axe-core/react`, `jsdom`
    - Configure `vitest.config.ts` with `environment: 'jsdom'` and the path aliases
    - _Requirements: 13.1 (all processing in browser), 13.4 (no analytics)_

  - [x] 1.2 Create the project directory skeleton
    - Create empty `src/engine/`, `src/data/`, `src/components/`, `src/i18n/`, `src/styles/`, `samples/`, `tests/` directories with `.gitkeep` placeholders
    - _Requirements: project structure rule_

- [x] 2. Design tokens, global styles, and i18n foundations
  - [x] 2.1 Create CSS design tokens and global stylesheet
    - Write `src/styles/tokens.css` with all CSS custom properties: `--color-bg: #0d0d1a`, `--color-surface: #1a1a2e`, `--color-text: #e8e0f0`, `--color-text-muted: #a89bc0`, `--color-accent: #c0392b`, `--color-accent-light: #e74c3c`, `--color-low: #27ae60`, `--color-medium: #f39c12`, `--color-high: #e67e22`, `--color-critical: #c0392b`, `--color-focus: #f0e68c`; spacing scale and font variables
    - Write `src/styles/global.css` importing tokens; set `*:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }` and responsive base styles
    - Import both files in `src/main.tsx`
    - _Requirements: 15.2, 15.3_

  - [x] 2.2 Create English and Spanish i18n JSON files
    - Write `src/i18n/en.json` with keys for every UI string: upload screen, column mapper, crypt labels, action button labels (with ARIA patterns), blood meter, stake modal (cancellation email template), garlic ICS description, burn confirmation, empty state, error messages, privacy notice, threat level labels, cadence descriptions ("bites every month", etc.)
    - Write `src/i18n/es.json` with the Spanish equivalents for every key in `en.json`
    - Add a `useTranslation` hook in `src/i18n/index.ts` that accepts a language key and returns typed string accessors
    - _Requirements: 12.1, 12.3, 12.4_

- [x] 3. Sample CSV files
  - [x] 3.1 Create the four synthetic sample CSV files
    - All dates must be between May 2026 and October 2026 so predicted next bites are always in the future
    - Write `samples/us-bank-usd.csv`: `MM/DD/YYYY` dates with charge days above 12 (e.g. 14, 17, 21, 27, 28) so MM/DD/YYYY is unambiguous; dot decimal; single amount column (negative = debit); USD; rows include Netflix (price increase: $15.49 for 2 months then $17.99), Spotify, iCloud ($2.99) and Apple Music ($10.99) both described as `APPLE.COM/BILL` a few days apart each month (interleaved → two vampires), Amazon Prime, Planet Fitness gym, AT&T mobile, a weekly Green Chef meal-box ($6.99/week), a HelloFresh free trial ($0.00 converting to $12.99/month), a Costco annual membership ($139.00 in May 2026 + one prior charge from May 2025), salary credits, and two one-time charges
    - Write `samples/latam-bank-mxn.csv`: `DD/MM/YYYY` dates, comma decimal (e.g. `"-259,00"`), Spanish noise words (`COMPRA`, `CARGO`, `PAGO`) in descriptions, MXN; rows include Netflix, Spotify, Disney+, Blim TV (local streaming), Smart Fit gym chain, salary credits, and transfers
    - Write `samples/latam-bank-cop.csv`: `DD/MM/YYYY` dates, dot thousands separator with no decimals (e.g. `"-44.900"`, `"3.500.000"`), Spanish descriptions, COP; rows include Netflix, Spotify, SmartFit gym, Claro mobile carrier, salary credits, and one-time purchases
    - Write `samples/messy-statement.csv`: mix only `DD/MM/YYYY` and `YYYY-MM-DD` within the date column (never MM/DD alongside DD/MM — that is unresolvable); extra whitespace in headers; amounts with embedded `$`/`USD` symbols in cells; one blank row; duplicate headers mid-file — designed to stress-test parser robustness; still includes detectable monthly Netflix, Spotify, and gym charges
    - Each file must contain only synthetic data — no real personal financial information
    - _Requirements: 1.13, 1.14_

- [x] 4. Detection engine — shared types and error model
  - [x] 4.1 Define all shared TypeScript types and the Result/AppError model
    - Create `src/engine/types.ts` with every interface and type from the design: `Transaction`, `TransactionType`, `Cadence`, `RecurrenceCandidate`, `ScoredCandidate`, `ThreatLevel`, `Vampire`, `CatalogEntry`, `UserDecision`, `CryptStorage`, `DetectionInput`, `DetectionResult`, `ColumnLayout`, `ParsedRow`, `AppError`, `Result<T, E>`
    - All monetary fields typed as `number` (integer cents); all date fields typed as `string` (ISO 8601)
    - `AppError` union: `PARSE_FAILED`, `COLUMN_MAPPING_NEEDED`, `DATE_FORMAT_AMBIGUOUS`, `NO_VALID_ROWS`, `STORAGE_UNAVAILABLE`
    - Zero React imports — pure TypeScript only
    - _Requirements: 1.9, 1.12, 4.1_

- [x] 5. Detection engine — parser (`parser.ts`)
  - [x] 5.1 Implement `inferNumberFormat` and `parseCents`
    - In `src/engine/parser.ts`, implement `inferNumberFormat(column: string[]): 'dotDecimal' | 'commaDecimal' | 'noDecimal'` using the column-level algorithm from design: scan every non-empty value; if any separator is always followed by exactly 3 digits → thousands separator; if followed by 1–2 digits → decimal separator
    - Implement `parseCents(s: string, format: NumberFormat): number`: strip whitespace and currency symbols; apply format; multiply by 100 for decimal formats; return absolute value; result must always be an integer (use `Math.round`)
    - _Requirements: 1.8, 1.12_

  - [x] 5.2 Implement `parseDate` and `inferDateFormat`
    - In `src/engine/parser.ts`, implement `parseDate(s: string, format: DateFormat): Result<string, AppError>` supporting `DD/MM/YYYY`, `MM/DD/YYYY`, and `YYYY-MM-DD`; return `{ ok: true, value: 'YYYY-MM-DD' }` on success or `{ ok: false, error: { code: 'PARSE_FAILED', message } }` on failure; function MUST NEVER throw
    - Implement `inferDateFormat(column: string[]): DateFormat | 'ambiguous'`: if first segment > 12 in any row → `DD/MM/YYYY`; if second segment > 12 → `MM/DD/YYYY`; else `'ambiguous'`
    - _Requirements: 1.9, 1.10, 1.11_

  - [x] 5.3 Implement column auto-detection and full row parsing
    - In `src/engine/parser.ts`, implement `detectColumns(headers: string[], rows: string[][]): ColumnLayout | AppError` using the header-keyword and value-type heuristics from the design; return `{ code: 'COLUMN_MAPPING_NEEDED', headers }` when required columns cannot be resolved
    - Implement `parseRows(rows: string[][], layout: ColumnLayout, dateFormat: DateFormat, numberFormat: NumberFormat): { transactions: Transaction[]; skipped: number }`: iterate rows, call `parseDate` and `parseCents`, classify debit/credit (single-column: negative = debit; two-column: debit-column presence), set `type`, convert to `Transaction`; skip invalid rows and count them; assign a deterministic `id` from row index + description hash; never throw
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.16, 1.17_

- [x] 6. Detection engine — normalizer (`normalizer.ts`)
  - [x] 6.1 Implement the `normalize` function
    - In `src/engine/normalizer.ts`, implement `normalize(s: string): string` in this exact order: (1) uppercase, (2) remove noise keywords `POS|PURCHASE|COMPRA|PAGO|CARGO|DEBIT|PAYMENT` with word-boundary regex, (3) remove card-number patterns (4+ consecutive digits), (4) remove reference-code patterns (alphanumeric tokens of 6+ chars at start/end of string), (5) collapse consecutive whitespace to single space, (6) trim
    - Zero React imports
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 7. Detection engine — grouper (`grouper.ts`)
  - [x] 7.1 Implement Step 1 (primary grouping) and Step 2a (amount clustering)
    - In `src/engine/grouper.ts`, implement `groupByMerchant(transactions: Transaction[]): Map<string, Transaction[]>` with two-pass logic
    - Step 1: group all transactions by `normalizedName`
    - Step 2a: within each primary group, assign bites to amount clusters using running median comparison (within 10% of cluster median → assign; within 10% of multiple → closest; outside all → new cluster); order of iteration must not affect final cluster membership (order-independence)
    - _Requirements: 4.1, 4.5_

  - [x] 7.2 Implement Step 2b (price-increase merge) and cluster finalization
    - In `src/engine/grouper.ts`, extend `groupByMerchant` with Step 2b: attempt to merge non-overlapping clusters where B_first ≤ A_last × 1.5 and B median > A median; merge only if clusters do not overlap in time; set `hasPriceIncrease = true` on merged cluster
    - Each resulting cluster becomes an independent `RecurrenceCandidate`; assign cluster ID as `normalizedName + "_" + clusterIndex`
    - _Requirements: 4.5, 4.6_

- [ ] 8. Detection engine — cadence detector (`cadenceDetector.ts`)
  - [ ] 8.1 Implement `detectCadence` with free-trial and price-increase flags
    - In `src/engine/cadenceDetector.ts`, implement `detectCadence(dates: string[]): Cadence | null`: sort dates, compute consecutive gaps, compute median gap, match to buckets `[5–9]→weekly`, `[26–35]→monthly`, `[85–97]→quarterly`, `[355–375]→yearly`; require ≥ 60% of gaps within the matched bucket; return `null` if < 2 transactions or no bucket matches
    - Implement `detectFreeTrial(bites: Transaction[], medianCents: number): boolean`: flag if first bite is 0 cents or < 20% of median
    - Implement `detectPriceIncrease(bites: Transaction[]): boolean`: flag if amounts are monotonically non-decreasing with at least one increase > 5%
    - _Requirements: 4.2, 4.3, 4.7_

- [ ] 9. Detection engine — scorer (`scorer.ts`)
  - [ ] 9.1 Implement `computeScore`
    - In `src/engine/scorer.ts`, implement `computeScore(candidate: RecurrenceCandidate, hasCatalogMatch: boolean): number`
    - Accumulate points: bites=2 → +20; bites 3–5 → +30; bites ≥ 6 → +40; cadence regularity (< 2 day gap variance) → +20; amount stable → +20; catalog match → +20
    - Clamp result to `[0, 100]` using `Math.max(0, Math.min(100, score))`
    - Return integer
    - _Requirements: 5.1, 5.2_

- [ ] 10. Data files — catalog and exchange rates
  - [ ] 10.1 Create `catalog.json` with ≥ 60 subscription services
    - Write `src/data/catalog.json` as a JSON array of `CatalogEntry` objects; include at minimum: Netflix, Spotify, Disney+, YouTube Premium, Amazon Prime, iCloud, Google One, ChatGPT Plus, Adobe Creative Cloud, HBO Max, Hulu, Paramount+, Apple TV+, Apple Music, Microsoft 365, Xbox Game Pass, PlayStation Plus, Nintendo Switch Online, Duolingo, Headspace, Calm, NordVPN, ExpressVPN, Dropbox, LastPass, 1Password, Canva, Figma, Notion, Slack, Zoom, Grammarly, LinkedIn Premium, Tinder Gold, Bumble Boost, Crunchyroll, Mubi, Deezer, Tidal, SiriusXM, The New York Times, The Washington Post, WSJ, Peloton, ClassPass, Planet Fitness, Anytime Fitness, T-Mobile, AT&T, Verizon, Claro, Telcel, Movistar, Mercado Pago, Rappi Prime, Uber One, DoorDash DashPass, and at least 5 more to reach ≥ 60
    - Each entry: `id`, `canonicalName`, `aliases` (normalized, uppercase), `cancelUrl`, `cancelSteps[]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 10.2 Create `exchangeRates.json`
    - Write `src/data/exchangeRates.json` with the static rate table from the design: USD, MXN, COP, ARS, CLP, EUR, BRL, GBP, CAD, PEN
    - _Requirements: 14.5_

- [ ] 11. Detection engine — catalog matcher, profile builder, currency utils, ICS generator
  - [ ] 11.1 Implement `matchCatalog`
    - In `src/engine/catalogMatcher.ts`, implement `matchCatalog(normalizedName: string, catalog: CatalogEntry[]): CatalogEntry | undefined`
    - For each entry, build a word-boundary regex for the canonical name and each alias: `new RegExp('\\b' + escapeRegex(term) + '\\b', 'i')` — use a helper `escapeRegex` that escapes all regex special characters
    - Test the pattern against `normalizedName`; return the first match; word-boundary matching ensures "MAX" matches "HBO MAX" but not "MAXI DESPENSA"
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [ ] 11.2 Implement `annualBloodLossCents`, `threatLevelFromCents`, and `predictNextBite`
    - In `src/engine/profileBuilder.ts`, implement `annualBloodLossCents(medianCents: number, cadence: Cadence): number` with multipliers weekly×52, monthly×12, quarterly×4, yearly×1
    - Implement `threatLevelFromCents(annualCents: number, currency: string, rates: ExchangeRates): ThreatLevel`: convert to USD (`annualCents / 100 / rates[currency] ?? 1.0`); apply thresholds Low<50, Medium<200, High<500, Critical≥500
    - Implement `predictNextBite(lastBiteDate: string, cadence: Cadence): string`: add interval days (weekly=7, monthly=30, quarterly=91, yearly=365) to `lastBiteDate`; return ISO 8601 string
    - _Requirements: 6.2, 6.3, 6.6_

  - [ ] 11.3 Implement `generateAvatar`
    - In `src/engine/profileBuilder.ts`, implement `generateAvatar(normalizedName: string): string`
    - Compute a 32-bit FNV-1a hash of the input string
    - Derive: eye style (hash mod 4), fang style (hash mod 3), cape color (8-color palette indexed by `(hash >> 4) mod 8`), skin tone (4 options indexed by `(hash >> 8) mod 4`)
    - Compose and return a self-contained SVG string using the derived values; same input must always produce identical output
    - _Requirements: 6.5_

  - [ ] 11.4 Implement currency detection and `inferCurrency`
    - In `src/engine/currencyUtils.ts`, implement `inferCurrency(amountColumn: string[], headerRow: string[]): string`
    - Scan for currency symbols (`$`, `€`, `£`, `¥`, `₩`, `R$`, `S/`) and ISO 4217 codes (`USD`, `EUR`, `MXN`, `COP`, `ARS`, `BRL`, etc.) in column values and headers
    - If `$` found but no locale signal → default to `'USD'`
    - _Requirements: 14.1, 14.2_

  - [ ] 11.5 Implement `generateIcs`
    - In `src/engine/icsGenerator.ts`, implement `generateIcs(vampire: Vampire, language: 'en' | 'es', i18nStrings: IcsI18n): string`
    - Event date = `predictNextBite` result minus 3 days; include vampire name, predicted bite amount (formatted as currency string), and a short bilingual description from i18n strings
    - Return a valid ICS string (VCALENDAR/VEVENT with DTSTART, SUMMARY, DESCRIPTION, END); never throw — return `Result<string, AppError>`
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 12. Detection engine — public API (`index.ts`)
  - [ ] 12.1 Wire the engine pipeline into `runDetection`
    - In `src/engine/index.ts`, implement `runDetection(input: DetectionInput): DetectionResult`
    - Pipeline: debit filter → normalize each transaction → `groupByMerchant` → `detectCadence` per group → `detectFreeTrial` / `detectPriceIncrease` → `computeScore` (with catalog pre-match) → `matchCatalog` → `buildProfile` (annual loss, threat level, next bite, avatar) → split by confidence threshold into `vampires` (≥60) and `possibleVampires` (1–59)
    - Single-transaction groups → `null` cadence → excluded from results (no-singleton rule)
    - All credits excluded before pipeline entry
    - Zero React imports
    - _Requirements: 4.1, 4.8, 4.9, 4.10, 5.3, 5.5_

- [ ] 13. Engine unit tests
  - [ ] 13.1 Write unit tests for `parser.ts`
    - In `tests/parser.test.ts`, cover: dot-decimal amounts; comma-decimal amounts; thousands-separator dot (`45.900` → 4590000 cents); `DD/MM/YYYY` parsing; `MM/DD/YYYY` parsing; `YYYY-MM-DD` parsing; ambiguous date → `'ambiguous'` result; two-column debit/credit layout; invalid date row → skipped; invalid amount row → skipped; `parseDate` always returns `Result`, never throws
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

  - [ ] 13.2 Write property test — Property 9: Amount Cents Integrity
    - In `tests/detection.property.test.ts`, implement Property 9 using `fc.oneof` of dot-decimal and comma-decimal generators; assert `Number.isInteger(parseCents(s, format))` for all generated strings
    - Tag comment: `// Property 9: Amount Cents Integrity — Validates: Requirements 1.8, 1.12`
    - _Requirements: 1.8, 1.12_

  - [ ] 13.3 Write property test — Property 11: Thousands-Separator Detection
    - In `tests/detection.property.test.ts`, generate columns of amounts like `"45.900"` where dot is always followed by exactly 3 digits; assert `inferNumberFormat` returns `'noDecimal'`; assert each value parses to integer × 100 cents
    - Tag comment: `// Property 11: Thousands-Separator Detection — Validates: Requirements 1.8, 1.12`
    - _Requirements: 1.8, 1.12_

  - [ ] 13.4 Write unit tests for `normalizer.ts`
    - In `tests/normalizer.test.ts`, test each noise keyword (POS, PURCHASE, COMPRA, PAGO, CARGO, DEBIT, PAYMENT) case-insensitively; card-number removal (4+ digits); reference-code removal at start/end; whitespace collapsing; uppercase output; combined noise in a single string
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 13.5 Write property test — Property 1: Normalization Idempotence
    - In `tests/detection.property.test.ts`, implement Property 1: `fc.property(fc.string(), s => expect(normalize(normalize(s))).toBe(normalize(s)))`
    - Tag comment: `// Property 1: Normalization Idempotence — Validates: Requirements 2.6`
    - _Requirements: 2.6_

  - [ ] 13.6 Write unit tests for `cadenceDetector.ts`
    - In `tests/cadenceDetector.test.ts`, cover: exactly 2 bites; gaps at each cadence boundary (weekly 5, weekly 9, monthly 26, monthly 35, quarterly 85, quarterly 97, yearly 355, yearly 375); gaps outside all buckets → `null`; free-trial detection (first bite zero cents); price-increase detection; ≥ 60% gap requirement (noisy data)
    - _Requirements: 4.2, 4.3, 4.7_

  - [ ] 13.7 Write property test — Property 2: Monthly Cadence Detection
    - In `tests/detection.property.test.ts`, implement Property 2 using `fc.integer({ min: 2, max: 24 })` for count and `fc.integer({ min: 26, max: 35 })` for gap; assert `detectCadence` returns `'monthly'`
    - Tag comment: `// Property 2: Monthly Cadence Detection — Validates: Requirements 4.2, 4.4`
    - _Requirements: 4.2, 4.4_

  - [ ] 13.8 Write property test — Property 10: Cadence Tolerance Coverage
    - In `tests/detection.property.test.ts`, implement Property 10 for all four cadence ranges `[5–9]`, `[26–35]`, `[85–97]`, `[355–375]`; use `CADENCE_RANGES` loop; assert correct cadence label for each range
    - Tag comment: `// Property 10: Cadence Tolerance Coverage — Validates: Requirements 4.2`
    - _Requirements: 4.2_

  - [ ] 13.9 Write unit tests for `grouper.ts`
    - In `tests/grouper.test.ts`, cover: same merchant two different amounts interleaved → 2 clusters; sequential price step within 50% → 1 cluster with `hasPriceIncrease`; sequential step > 50% → 2 clusters; overlapping clusters → never merged; single transaction → no candidate; multiple merchants → independent grouping
    - _Requirements: 4.5, 4.6_

  - [ ] 13.10 Write property test — Property 12a: Interleaved Series → Two Vampires
    - In `tests/detection.property.test.ts`, implement Property 12a: generate two clearly different amounts (> 10% apart) from the same merchant, interleave their transactions, assert `groupByMerchant` produces exactly 2 clusters
    - Tag comment: `// Property 12a: Intra-Merchant Clustering — Validates: Requirements 4.5, 4.6`
    - _Requirements: 4.5, 4.6_

  - [ ] 13.11 Write property test — Property 12b: Sequential Price Step → One Vampire
    - In `tests/detection.property.test.ts`, implement Property 12b: generate n charges at amountA then m charges at amountB where B ≤ A × 1.5 and B > A, no date overlap; assert exactly 1 cluster with `hasPriceIncrease = true`
    - Tag comment: `// Property 12b: Sequential Price Step Merge — Validates: Requirements 4.5, 4.6`
    - _Requirements: 4.5, 4.6_

  - [ ] 13.12 Write unit tests for `scorer.ts`
    - In `tests/scorer.test.ts`, cover: all signals present → score ≤ 100; no signals → score = 0; each signal in isolation; score with catalog bonus; clamping at 100 and 0
    - _Requirements: 5.1, 5.2_

  - [ ] 13.13 Write property test — Property 6: Confidence Score Range
    - In `tests/detection.property.test.ts`, implement Property 6 using `arbitraryCandidate()` generator; assert `Number.isInteger(score)`, `score >= 0`, `score <= 100`
    - Tag comment: `// Property 6: Confidence Score Range — Validates: Requirements 5.1`
    - _Requirements: 5.1_

  - [ ] 13.14 Write unit tests for `profileBuilder.ts`
    - In `tests/profileBuilder.test.ts`, cover: annual loss formula for each cadence (weekly×52, monthly×12, quarterly×4, yearly×1); threat level boundaries (boundary values at 50, 200, 500 USD equivalent); next-bite prediction for each cadence; `generateAvatar` same input → same output; different inputs → different outputs (probabilistic)
    - _Requirements: 6.2, 6.3, 6.5, 6.6_

  - [ ] 13.15 Write property test — Property 7: Threat Level Monotonicity
    - In `tests/detection.property.test.ts`, implement Property 7 using two `fc.integer` generators for annual cents; if centsA > centsB assert `THREAT_ORDER[levelA] >= THREAT_ORDER[levelB]`
    - Tag comment: `// Property 7: Threat Level Monotonicity — Validates: Requirements 6.3, 14.5`
    - _Requirements: 6.3, 14.5_

  - [ ] 13.16 Write property test — Property 8: Avatar Determinism
    - In `tests/detection.property.test.ts`, implement Property 8: `fc.property(fc.string({ minLength: 1 }), name => expect(generateAvatar(name)).toBe(generateAvatar(name)))`
    - Tag comment: `// Property 8: Avatar Determinism — Validates: Requirements 6.5`
    - _Requirements: 6.5_

  - [ ] 13.17 Write unit tests for `currencyUtils.ts`
    - In `tests/currencyUtils.test.ts`, cover: detect USD from `$` symbol; detect EUR from `€`; detect MXN from header keyword; detect via ISO 4217 code; `$` with no locale signal → `'USD'`; threshold conversion for each currency in the table; `fallback rate = 1.0` when currency not in table
    - _Requirements: 14.1, 14.2, 14.5_

  - [ ] 13.18 Write unit tests for `icsGenerator.ts`
    - In `tests/icsGenerator.test.ts`, cover: output contains `BEGIN:VCALENDAR` and `BEGIN:VEVENT`; event DTSTART is 3 days before next bite; SUMMARY contains vampire display name; DESCRIPTION changes with language; never throws (always returns `Result`)
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 14. Full-pipeline integration property tests
  - [ ] 14.1 Write property test — Property 3: Order Independence
    - In `tests/detection.property.test.ts`, implement Property 3: generate an array of transactions, shuffle, run `runDetection` twice; assert same vampire IDs (sorted) in both results
    - Tag comment: `// Property 3: Order Independence — Validates: Requirements 4.8`
    - _Requirements: 4.8_

  - [ ] 14.2 Write property test — Property 4: No-Singleton Rule
    - In `tests/detection.property.test.ts`, implement Property 4: generate a single arbitrary debit transaction; assert it never appears in vampires or possibleVampires output
    - Tag comment: `// Property 4: No-Singleton Rule — Validates: Requirements 4.3, 4.9`
    - _Requirements: 4.3, 4.9_

  - [ ] 14.3 Write property test — Property 5: Credit Exclusion
    - In `tests/detection.property.test.ts`, implement Property 5: force first transaction to `type: 'credit'`; assert no bite in any output has `type === 'credit'`
    - Tag comment: `// Property 5: Credit Exclusion — Validates: Requirements 1.17, 4.10`
    - _Requirements: 1.17, 4.10_

- [ ] 15. Checkpoint — engine and tests complete
  - Ensure all Vitest tests pass with `npx vitest --run`. Ask the user if any questions arise before proceeding to the UI layer.

- [ ] 16. React UI — foundation and routing
  - [ ] 16.1 Create `App.tsx` with top-level state and view routing
    - In `src/components/App.tsx`, define top-level state: `transactions`, `detectionResult`, `decisions` (from localStorage), `language` (`en`|`es`), `currency`, `showPossibleVampires`
    - Render `<LanguageSwitch>` and `<CurrencySelector>` always; conditionally render `<Uploader>` (no results), `<ColumnMapper>` (COLUMN_MAPPING_NEEDED error), or `<Crypt>` (results ready)
    - Import `runDetection` from `@engine/index`; call it client-side only after Papa Parse completes; never send parsed data over the network
    - _Requirements: 13.1, 13.2, 7.5_

- [ ] 17. React UI — upload and column mapping
  - [ ] 17.1 Implement `Uploader.tsx` with drop zone and sample picker
    - Drop zone: `onDragOver` / `onDrop` handlers; keyboard-accessible (native `<input type="file">`); scale + glow animation on drag-over using Framer Motion
    - "Try a sample" button: `<SamplePicker>` sub-component rendering four buttons for the four sample files (`us-bank-usd.csv`, `latam-bank-mxn.csv`, `latam-bank-cop.csv`, `messy-statement.csv`); loads the selected sample file object without network request
    - Privacy notice text from i18n keys
    - On file selection: call Papa Parse in the browser; on success pass result to column detector; on `COLUMN_MAPPING_NEEDED` set error state to show `ColumnMapper`; on invalid CSV show human-readable i18n error
    - _Requirements: 1.1, 1.2, 1.3, 1.13, 1.14, 1.15, 13.3_

  - [ ] 17.2 Implement `ColumnMapper.tsx` for manual column assignment
    - Display one `<select>` per required column (date, description, amount / debit / credit); pre-populate with detected column headers
    - If date format is `'ambiguous'`, show an additional date-format `<select>` with `DD/MM/YYYY` and `MM/DD/YYYY` options
    - On submit: call `parseRows` with the user-chosen layout; set focus to first unresolved select on mount
    - _Requirements: 1.5, 1.7, 1.10, 1.11_

- [ ] 18. React UI — crypt screen and vampire cards
  - [ ] 18.1 Implement `Crypt.tsx` with sorting, filtering, and Blood Meter
    - Render `<BloodMeter>` at top; render `<FilterBar>` with four filter buttons (All / Staked / Spared / Garlic); render vampire grid using `.crypt-grid` CSS (responsive `auto-fill minmax(300px, 1fr)`, collapses to 1 column at ≤ 480px)
    - Default sort: Threat Level descending (Critical first)
    - Pass `showPossibleVampires` toggle down; render Possible Vampires with distinct visual treatment (e.g., lower opacity, dashed border) when toggle is active
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 5.3, 5.4_

  - [ ] 18.2 Implement `VampireCard.tsx` with full profile display and actions
    - Render `<article role="article" aria-label="{name} – {threatLevel} – {annualLoss} per year">` with: `<VampireAvatar>` (renders the `avatarSvg`), display name, cadence description (from i18n), amount per bite, Blood Drained total, first bite date, next bite date, Annual Blood Loss, Threat Level badge, price-increase history (if `hasPriceIncrease`)
    - Action buttons: `<StakeButton>`, `<SpareButton>`, `<GarlicButton>` — each a native `<button>` with full ARIA label pattern from i18n
    - Card entrance animation: Framer Motion `whileInView` stagger
    - Stake animation: Framer Motion variants `alive` / `dusted`; use `useReducedMotion()` to swap full dust effect for ≤ 300ms opacity fade
    - _Requirements: 6.1, 6.4, 8.4, 8.5, 15.1, 15.4, 15.5, 15.6_

  - [ ] 18.3 Implement `BloodMeter.tsx`
    - Animated bar (Framer Motion width transition) showing total Annual Blood Loss across non-staked vampires and total blood saved from staked vampires
    - Update on stake/un-stake events
    - _Requirements: 7.3, 8.5_

- [ ] 19. React UI — action modals and buttons
  - [ ] 19.1 Implement `StakeModal.tsx` with cancellation instructions and email draft
    - When opened: display Catalog cancellation URL and step-by-step instructions (if catalog match); display generated cancellation email draft (call i18n template with service name and selected language); one-click copy button for the email draft
    - Focus trap: set `autoFocus` on first focusable element; return focus to Stake button on close (use Framer Motion `AnimatePresence`)
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 19.2 Implement `SpareButton.tsx` and `GarlicButton.tsx`
    - `SpareButton`: native `<button>` with ARIA label; on click call `onSpare`; add "spared" CSS class (dimmed visual treatment); on re-click remove Spare status and restore default state
    - `GarlicButton`: native `<button>` with ARIA label; on click call `generateIcs` and trigger browser download via `URL.createObjectURL`; add "garlic-active" class with pulse animation; handle ICS generation failure gracefully (disable button, no crash)
    - _Requirements: 9.1, 9.3, 10.1, 10.2, 10.3_

  - [ ] 19.3 Implement `LanguageSwitch.tsx` and `CurrencySelector.tsx`
    - `LanguageSwitch`: toggle button or two-segment control; on change update language in App state and persist to localStorage; re-render all i18n strings without page reload; regenerate any open cancellation email draft in new language
    - `CurrencySelector`: `<select>` with ISO 4217 options; on change update currency in App state and re-format all displayed amounts; persist to localStorage
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 14.3, 14.4, 14.6_

  - [ ] 19.4 Implement `EmptyState.tsx` and `BurnButton.tsx`
    - `EmptyState`: shown when no CSV uploaded and no decisions in storage; display spooky prompt with upload CTA and "Try a sample" link
    - `BurnButton`: "Burn the Crypt" button; on click show confirmation modal (native `<dialog>` or Framer Motion animated div with focus trap); on confirm call `burnCrypt()` (clear localStorage key, clear React state, navigate to empty-state), return focus to upload drop zone
    - _Requirements: 7.5, 11.3, 11.4, 11.5_

- [ ] 20. Persistence layer (`localStorage`)
  - [ ] 20.1 Implement `useCryptStorage` hook
    - In `src/engine/cryptStorage.ts` (pure TS, no React) implement: `loadCryptStorage(): CryptStorage | null`, `saveCryptStorage(storage: CryptStorage): void`, `burnCrypt(): void`; handle `localStorage` unavailable gracefully (catch `SecurityError`, return `null` and signal `STORAGE_UNAVAILABLE`)
    - In `src/components/useCryptStorage.ts` (React hook), wrap the pure functions: initialize state from `loadStorage` on mount; expose `setDecision(vampireId, decision)`, `setLanguage`, `setCurrency`, `burn`; write through to localStorage on every change; never persist raw transaction data or CSV contents
    - _Requirements: 11.1, 11.2, 11.3, 8.6, 9.2, 10.4_

- [ ] 21. Checkpoint — UI and persistence complete
  - Ensure all Vitest tests pass with `npx vitest --run`. Verify that no test imports from `src/components/` within `tests/` (engine tests only). Ask the user if questions arise.

- [ ] 22. Accessibility and responsive polish
  - [ ] 22.1 Audit and fix keyboard navigation and ARIA labels
    - Confirm every interactive element is a native `<button>` or `<input>` (no div-click handlers)
    - Add or verify ARIA labels on all `<VampireCard>` action buttons matching the pattern `"Stake {name} – cancel this subscription"`, `"Spare {name} – keep this subscription"`, `"Set garlic reminder for {name} – next charge on {date}"`
    - Verify `<article aria-label="{name} – {threatLevel} – {annualLoss} per year">` on each card
    - Run `@axe-core/react` in development and fix any reported violations
    - _Requirements: 15.1, 15.4, 15.5_

  - [ ] 22.2 Add focus management to modals and page transitions
    - `StakeModal`: focus trap (cycle Tab/Shift+Tab within modal); `autoFocus` on first element; return focus to trigger button on close
    - `ColumnMapper`: focus first unresolved `<select>` on mount
    - After "Burn the Crypt" confirm: move focus to upload drop zone
    - _Requirements: 15.1_

  - [ ] 22.3 Implement reduced-motion support throughout
    - Ensure all Framer Motion animation components use `useReducedMotion()` hook
    - Stake animation: swap to `opacity: 0, transition: { duration: 0.3 }` when reduced motion is preferred
    - All other animations: use `0` or very short durations; verify via browser `prefers-reduced-motion: reduce` media query in devtools
    - _Requirements: 15.6_

  - [ ] 22.4 Responsive layout at 360px minimum
    - Add `.crypt-grid` CSS with `auto-fill minmax(300px, 1fr)` and `@media (max-width: 480px)` override to single column
    - Verify vampire card actions stack vertically at narrow widths
    - Test layout at 360px, 480px, 768px, 1280px
    - Ensure no hover-only interactions: all info available on `:focus-visible` or tap
    - _Requirements: 15.7, 15.8_

- [ ] 23. AWS Amplify deploy configuration
  - [ ] 23.1 Add Amplify build configuration
    - Create `amplify.yml` at the repo root with build commands: `npm ci` and `npm run build`; set `baseDirectory: dist`; set `framework: vite`
    - Confirm `vite.config.ts` `base` is set to `'/'` for correct asset resolution on Amplify
    - Verify `dist/` is in `.gitignore`
    - No server-side or network-dependent configuration — this is a fully static site
    - _Requirements: 13.1 (static, no backend)_

- [ ] 24. Final checkpoint — all tests pass, build succeeds
  - Run `npx vitest --run` and confirm all tests pass (unit + all 12 property-based tests)
  - Run `npm run build` and confirm the Vite build succeeds with zero TypeScript errors
  - Confirm no test file imports from React components (engine tests are pure TS only)
  - Ask the user if questions arise before handoff.

## Notes

- All property-based tests are required: they verify the correctness properties defined in design.md
- Engine tasks (4–14) must be fully complete before any UI tasks begin — the engine has zero React imports
- All monetary values are integer cents throughout; never use floats for money
- All dates are ISO 8601 strings (`YYYY-MM-DD`) throughout; never use `Date` objects at engine boundaries
- Engine functions never throw; all errors are `Result<T, AppError>` return values
- Property tests reference design document properties by number for traceability
- localStorage stores only decisions, language, and currency — never raw transaction data
- The three sample CSV files are needed before UI work begins because they are used in parser unit tests
- The two-pass grouper (Step 2a + Step 2b) is the most complex engine module; its unit tests and property tests are split into separate sub-tasks for clarity

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2", "6.1"] },
    { "id": 4, "tasks": ["5.3", "7.1", "8.1", "9.1"] },
    { "id": 5, "tasks": ["7.2", "10.1", "10.2"] },
    { "id": 6, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 7, "tasks": ["12.1"] },
    { "id": 8, "tasks": ["13.1", "13.4", "13.6", "13.9", "13.12", "13.14", "13.17", "13.18"] },
    { "id": 9, "tasks": ["13.2", "13.3", "13.5", "13.7", "13.8", "13.10", "13.11", "13.13", "13.15", "13.16"] },
    { "id": 10, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 11, "tasks": ["16.1"] },
    { "id": 12, "tasks": ["17.1", "17.2", "18.3", "20.1"] },
    { "id": 13, "tasks": ["18.1", "18.2"] },
    { "id": 14, "tasks": ["19.1", "19.2", "19.3", "19.4"] },
    { "id": 15, "tasks": ["22.1", "22.2", "22.3", "22.4"] },
    { "id": 16, "tasks": ["23.1"] }
  ]
}
```
