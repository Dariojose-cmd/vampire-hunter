# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Bank formats parse and income never becomes a vampire
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - Create `tests/bankFormatParser.bugCondition.test.ts` (Vitest + fast-check); engine imports only from `src/engine`; do NOT edit anything in `tests/fixtures/banks/`
  - **Scoped PBT Approach**: scope each property to the failing cases from isBugCondition in the design
  - Property "income is never a vampire": generate ING-style statements (headers `Datum`, `Naam / Omschrijving`, `Af Bij`, `Bedrag (EUR)`; YYYYMMDD dates; unsigned comma-decimal amounts) where a random merchant recurs monthly (3 to 12 months) with `Bij`; assert `parseStatement` succeeds and neither `vampires` nor `possibleVampires` contains that merchant
  - Property "header synonyms": for description words lançamento, lancamento, histórico, historico, omschrijving, naam and amount words bedrag, valor, `detectColumns` returns a layout (not `COLUMN_MAPPING_NEEDED`)
  - Property "description fallback": with no description keyword and one wide text column, `detectColumns` picks the widest text column
  - Property "compact dates": for any valid date, `inferDateFormat` of YYYYMMDD strings is `'YYYY-MM-DD'` and `parseDate` returns the ISO string
  - Property "2-bite cap": for any uncatalogued 2-bite debit series with equal amounts and a gap inside a cadence bucket (weekly 5-9, monthly 26-35, quarterly 85-97, yearly 355-375 days), `runDetection` gives `confidenceScore <= 59` and the series is not in `vampires` (use names that cannot match `src/data/catalog.json`)
  - Run on UNFIXED code: `npx vitest run tests/bankFormatParser.bugCondition.test.ts`
  - Also run `npx tsx scripts/detect.ts tests/fixtures/banks/itau-br.csv` and `.../ing-nl.csv` and record that both return `COLUMN_MAPPING_NEEDED`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g. "Naam / Omschrijving -> COLUMN_MAPPING_NEEDED", "20250103 -> DATE_FORMAT_AMBIGUOUS", "2-bite weekly series scores 60")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing formats and results are unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **IMPORTANT**: Do this BEFORE touching anything in `src/engine`. Capture the baseline first.
  - Step A, baseline capture: write a one-off script (for example `scripts/captureSampleBaseline.ts`, run with `npx tsx`) that runs each of the 5 files in `public/samples/` (`us-bank-usd.csv`, `latam-bank-mxn.csv`, `latam-bank-cop.csv`, `amex-positive-charges.csv`, `messy-statement.csv`) through `parseCsvText` -> `parseStatement` -> `runDetection` exactly like `scripts/detect.ts`, and writes `tests/baselines/inAppSamples.vampireIds.json` with `{ "<file>": { "vampireIds": [...], "possibleIds": [...] } }`, ids sorted. Run it on UNFIXED code, commit-ready, then delete the script
  - Step B, observe on UNFIXED code: the other 11 fixtures in `tests/fixtures/banks/` pass (`npx vitest run tests/integration.bankFixtures.test.ts` shows only the itau-br and ing-nl failures, 51/51 expected subscriptions elsewhere)
  - Create `tests/bankFormatParser.preservation.test.ts` (Vitest + fast-check) and `tests/inAppSamples.preservation.test.ts`
  - `inAppSamples.preservation.test.ts`: for each sample, vampire ids equal the baseline JSON exactly (assert `vampireIds` strictly; `possibleIds` is diagnostic only)
  - Property "signed amounts unchanged": generated statements with `Date,Description,Amount` and signed amounts classify debit/credit by sign (negative = debit) and the layout has no `indicatorCol`
  - Property "split columns unchanged": `Debit`/`Credit` split layouts classify by the populated column
  - Property "date formats unchanged": generated DD/MM/YYYY, MM/DD/YYYY and YYYY-MM-DD (with optional time part) parse to the same ISO string; undecidable slash columns stay `'ambiguous'`
  - Property "score unchanged": for generated candidates with 3 or more bites, or with a catalog match, `runDetection` scores equal `computeScore` (no cap applied)
  - Property "known headers unchanged": a header-matched description (`Description`, `Concepto`, `Merchant`, ...) is chosen over any wider text column
  - Property "zero amount stays debit": a `0` amount row is a debit
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix for Itaú and ING bank formats (indicator columns, header synonyms, compact dates, 2-bite cap)

  - [x] 3.1 Add indicator column support
    - `src/engine/types.ts`: add optional `indicatorCol?: number` to the `single` variant of `ColumnLayout`
    - `src/engine/parser.ts`: export `classifyIndicator(value)` returning `'debit' | 'credit' | null` (debit: af, d, db, deb, dr, debit, debito, débito, cargo; credit: bij, c, cr, cred, credit, credito, crédito, abono; case and accent insensitive)
    - `detectColumns`: detect an indicator column by header (`Af Bij`, `D/C`, `DB/CR`, `Débito/Crédito`, `Debit/Credit`, `Cargo/Abono`) AND values all in the vocabulary; check it BEFORE the debit/credit keyword rules so "Débito/Crédito" never becomes a split debit column; skip it for description/amount; add `indicatorCol` to the single layout only when found
    - `parseRows`: when `indicatorCol` is set and the cell classifies, set `type` from the indicator regardless of amount sign; zero amount stays `debit`; empty/unknown cell uses the existing sign logic
    - `detectPositiveIsCharge`: return false when the layout has `indicatorCol`
    - Keep the engine pure TypeScript (no React imports), money as integer cents
    - _Bug_Condition: isBugCondition(X) where hasIndicatorColumn(X)_
    - _Expected_Behavior: expectedBehavior(result) from design (income rows never charges, vampires or possibles)_
    - _Preservation: statements without an indicator column classify exactly as before_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.2 Add header synonyms and description fallback
    - `detectColumns`: extend the description regex with `lan[cç]amento|hist[oó]rico|omschrijving|\bnaam\b`; extend the amount regex with `bedrag` (`valor` is already there)
    - When no description (including the weak `detail` match) is found, choose the widest text column among unassigned columns (not date, amount, debit, credit, indicator, balance header, not mostly numeric) by mean trimmed length; keyword matches always win; return `COLUMN_MAPPING_NEEDED` only if no candidate column exists
    - Do not change behavior for headers that already matched
    - _Bug_Condition: isBugCondition(X) where descHeaderIn / amountHeaderIn / noDescriptionKeywordMatches_
    - _Expected_Behavior: expectedBehavior(result) from design (columns resolved)_
    - _Preservation: already-recognized headers resolve the same columns_
    - _Requirements: 2.3, 2.4, 2.5, 3.4_

  - [x] 3.3 Add compact YYYYMMDD dates
    - `inferDateFormat`: treat `/^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/` like an ISO value so an all-compact (or ISO + compact) column returns `'YYYY-MM-DD'`
    - `parseDate`: accept the compact pattern regardless of the requested format, validate with `isValidDate`, return `YYYY-MM-DD`; do not add a new member to `DateFormat`
    - Let the pass-2 date-column fallback (`DATE_VALUE_RE` check) also accept compact dates
    - _Bug_Condition: isBugCondition(X) where dateColumnIsCompactYYYYMMDD(X)_
    - _Expected_Behavior: expectedBehavior(result) from design (ISO dates, no ambiguity)_
    - _Preservation: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD parse as before; undecidable slash dates stay ambiguous_
    - _Requirements: 2.6, 3.5_

  - [x] 3.4 Cap every 2-bite uncatalogued candidate below vampire level
    - `src/engine/index.ts` `runDetection`: change the cap condition to `candidate.bites.length === 2 && match === undefined`, removing the `candidate.hasPriceIncrease` requirement; update the comment; keep `Math.min(score, VAMPIRE_THRESHOLD - 1)`
    - Candidates with 3+ bites or a catalog match are untouched
    - _Bug_Condition: isBugCondition(X) where X.bites.length = 2 AND X.catalogMatch = none_
    - _Expected_Behavior: expectedBehavior(result) from design (score <= 59)_
    - _Preservation: 3+ bite and catalog-matched candidates keep their score_
    - _Requirements: 2.7, 3.6_

  - [x] 3.4b Cap creeping-amount split clusters below vampire level
    - Finding after 3.1-3.5: both fixtures parse and all 12 expected subscriptions are detected, but `tests/integration.bankFixtures.test.ts` still fails on unexpected vampires: itau-br "PADARIA DO ZE" (3 bites median 1580 and 3 bites median 1865, score 70, "PADARIA" in mustNotDetect) and ing-nl "THUISBEZORGD.NL" (3 bites median 2460 and 3 bites median 2850, score 70, "Thuisbezorgd" in mustNotDetect). Root cause: amount clustering in `src/engine/grouper.ts` splits one merchant's creeping series into several 2 to 3 bite clusters
    - Read `src/engine/grouper.ts`, `index.ts` and `scorer.ts` first; do NOT edit the fixtures and do NOT change the grouper or `computeScore`
    - `src/engine/index.ts` `runDetection`: after `buildCandidates`, compute cadence and `matchCatalog` per candidate, group by `normalizedName`; for a group with 2+ clusters of the same cadence, no catalog match, and merged bites (sorted by date, at least 4) strictly rising (each amount higher than the previous, no repeated amount), cap every cluster's score with `Math.min(score, VAMPIRE_THRESHOLD - 1)`
    - Exempt: catalog-matched merchants (Netflix 13,99 x5 then 15,49 x3), series with a plateau of equal amounts, merchants with several flat plans (Videoland 7,99 and Videoland Extra Kids 4,99)
    - Keep it a small pure helper, no React imports, money as integer cents
    - Add to `tests/bankFormatParser.test.ts`: fast-check property "a strictly rising uncatalogued monthly series of 6 to 12 bites never yields a vampire"; fast-check property "flat multi-plan merchants keep their vampires" (two flat plans of one merchant, constant amounts, 3 to 8 bites each); unit cases for the Padaria and Thuisbezorgd series, a plateau price increase and a catalogued Netflix price increase
    - Verify: `npx vitest run tests/integration.bankFixtures.test.ts` (itau-br and ing-nl pass, other 11 fixtures stay 51/51), `npx vitest run tests/inAppSamples.preservation.test.ts` (5 samples keep baseline ids), and `npx vitest run tests/bankFormatParser.preservation.test.ts`
    - _Bug_Condition: isBugCondition(X) where isCreepingSplit(X)_
    - _Expected_Behavior: expectedBehavior(result) from design (creeping clusters score <= 59)_
    - _Preservation: catalog matches, plateau price increases and flat multi-plan merchants keep their scores_
    - _Requirements: 2.8, 3.6, 3.7, 3.8, 3.10_

  - [x] 3.5 Make the fixtures test tolerate an omitted `bites`
    - `tests/integration.bankFixtures.test.ts` only (NOT the fixtures): make `bites` optional in `ExpectedSubscription` and match with `exp.bites === undefined || v.bites.length === exp.bites`; the new expected files omit `bites`, and the current strict comparison would fail them even with a correct engine
    - Fixtures that declare `bites` must still be checked strictly
    - _Requirements: 2.1, 2.3, 2.6, 2.7, 3.7_

  - [x] 3.6 Add unit and property tests for the new behavior
    - Add `tests/bankFormatParser.test.ts` (unit: `classifyIndicator` vocabulary, ING and Itaú header rows, "Débito/Crédito" as indicator, Chase `Details` not an indicator, compact dates incl. invalid `20251345`, `parseRows` with indicator including `Bij` + `0,00`, 2-bite cap with and without catalog match)
    - Add fast-check properties where they fit: "income is never a vampire", "indicator wins over amount sign", "compact date round trip", "2-bite uncatalogued series never a vampire", "description fallback picks the widest text column" (the two creeping-amount properties from 3.4b live in the same file)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Bank formats parse and income never becomes a vampire
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - Run `npx vitest run tests/bankFormatParser.bugCondition.test.ts` and `npx vitest run tests/integration.bankFixtures.test.ts`
    - Run `npx tsx scripts/detect.ts` on `tests/fixtures/banks/itau-br.csv` and `ing-nl.csv`: both exit 0, expected vampires present, no salary, refunds, Tikkie, Tarifa, Disney Plus, Padaria do Ze or Thuisbezorgd as vampires
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing formats and results are unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests and do NOT regenerate the baseline JSON
    - Run `npx vitest run tests/bankFormatParser.preservation.test.ts tests/inAppSamples.preservation.test.ts tests/integration.bankFixtures.test.ts tests/integration.sampleStatements.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (all 5 in-app samples keep the baseline vampire ids; the other 11 fixtures stay 51/51)
    - If a sample's vampire ids changed, stop and diagnose which fix caused it (including the creeping-amount cap from 3.4b) instead of editing the baseline
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 4. Checkpoint - Run the full test suite
  - Run `npx vitest run` (single run, not watch mode) and confirm every test file passes
  - Run `npx tsc -b --noEmit` (or the project's typecheck) to confirm `ColumnLayout` change compiles with `ColumnMapper.tsx` and `App.tsx`
  - Confirm `tests/fixtures/banks/itau-br.*` and `ing-nl.*` are unmodified (`git status` shows them untracked/unchanged, no edits)
  - Ensure all tests pass, ask the user if questions arise.
