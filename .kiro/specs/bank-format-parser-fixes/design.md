# Bank Format Parser Fixes Bugfix Design

## Overview

The Itaú BR and ING NL fixtures cannot be loaded because the parser lacks four capabilities, and one scoring rule is too narrow. The fix is small and local to `src/engine`:

1. Recognize a debit/credit indicator column and use it to classify rows.
2. Add header synonyms (description: lançamento, histórico, omschrijving, naam; amount: bedrag, valor) and a widest-text-column fallback for the description.
3. Accept compact `YYYYMMDD` dates and normalize them to ISO.
4. Cap every 2-bite candidate without a catalog match at score 59 (today only price-increase merges are capped).

5. Cap clusters of a "creeping amount" merchant (one uncatalogued merchant whose amount rises a little every month) below vampire level, so it is no longer listed twice as a vampire.

All changes stay in pure TypeScript. No new date format member is added to `DateFormat`; compact dates are handled like the existing "ISO is unambiguous" rule. The fixtures are never edited.

A fifth finding affects the test harness, not the engine: `ing-nl.expected.json` and `itau-br.expected.json` omit the `bites` field, while `tests/integration.bankFixtures.test.ts` compares `v.bites.length === exp.bites`. With `exp.bites` undefined that comparison is always false, so both fixtures would still fail after the engine fix. The harness must treat a missing `bites` as "not checked". This is a test change, not a fixture change, and existing fixtures that declare `bites` keep being checked.

## Glossary

- **Bug_Condition (C)**: Input that triggers any of the defects: an indicator column, a new header synonym, no description keyword match, a compact date, or a 2-bite candidate without catalog match.
- **Property (P)**: The desired behavior for those inputs (see Correctness Properties).
- **Preservation**: Behavior for all inputs outside C: other fixtures at 51/51, same vampire ids on the 5 in-app samples, same scores for candidates with 3+ bites or a catalog match.
- **Indicator column**: A column whose values say whether the row is a debit or a credit (ING "Af Bij" with `Af`/`Bij`; "D/C"; "Débito/Crédito"), used with unsigned amounts.
- **Bite**: One charge. **Vampire**: candidate with score >= 60 (`VAMPIRE_THRESHOLD`). **Possible vampire**: score 1 to 59.
- **detectColumns** (`src/engine/parser.ts`): Resolves the `ColumnLayout` from headers and rows.
- **parseRows** (`src/engine/parser.ts`): Turns rows into `Transaction[]` using the layout.
- **inferDateFormat / parseDate** (`src/engine/parser.ts`): Infer and parse the date column.
- **runDetection** (`src/engine/index.ts`): Pipeline that scores candidates and applies the 2-bite cap.
- **In-app samples**: the 5 CSVs in `public/samples/` offered by `SamplePicker`.

## Bug Details

### Bug Condition

The bug manifests when a statement or candidate has any of the traits below. `detectColumns` does not know the indicator column, the new header words or the widest-column fallback; `inferDateFormat` reports `ambiguous` for 8-digit dates; and `runDetection` applies its 2-bite cap only when `hasPriceIncrease` is true.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type StatementOrCandidate
  OUTPUT: boolean

  RETURN hasIndicatorColumn(X)                         // header in {af bij, d/c, débito/crédito, ...}
                                                       //   AND values in debit/credit vocabulary
         OR descHeaderIn(X, {lançamento, lancamento, histórico, historico, omschrijving, naam})
         OR amountHeaderIn(X, {bedrag, valor})
         OR (noDescriptionKeywordMatches(X) AND widestTextColumnExists(X))
         OR dateColumnIsCompactYYYYMMDD(X)
         OR (X.bites.length = 2 AND X.catalogMatch = none)
         OR isCreepingSplit(X)
END FUNCTION

FUNCTION isCreepingSplit(X)
  INPUT: X of type Candidate
  OUTPUT: boolean

  siblings := all candidates with the same normalizedName as X
  merged   := all bites of siblings, sorted by date
  RETURN X.catalogMatch = none
         AND siblings.length >= 2
         AND all siblings share the same cadence
         AND merged.length >= 4
         AND FORALL i : merged[i].amountCents < merged[i+1].amountCents   // strictly rising, no plateau
END FUNCTION
```

### Examples

- ING row `"20250125","Salaris Werkgever BV",...,"Bij","2800,00"`: today parsing fails (`COLUMN_MAPPING_NEEDED`); if only the headers were fixed it would be a monthly vampire of 2800,00. Expected: a credit, ignored.
- ING `"Naam / Omschrijving"` and `"Bedrag (EUR)"`: no description or amount match today. Expected: description and amount columns found.
- ING date `20250103`: `DATE_FORMAT_AMBIGUOUS` today. Expected: `2025-01-03`.
- Itaú header `data;lançamento;ag./origem;valor (R$);saldos`: no description match today. Expected: description = `lançamento`, amount = `valor (R$)`, `saldos` ignored as balance.
- Header-less description (for example `fecha;movimiento;importe`): today `COLUMN_MAPPING_NEEDED`. Expected: `movimiento` chosen as widest text column.
- ING "Tikkie Jan": 12,50 on 2025-06-20 and 2025-06-28 (weekly bucket, stable) scores 20+20+20 = 60 today. Expected: at most 59.
- Itaú "TARIFA CESTA SERVICOS": 45,00 on 2025-05-27 and 2025-08-27 (quarterly bucket, stable) scores 60 today. Expected: at most 59.
- Edge: ING "Disney Plus" has a `Bij` row with `0,00` in January. Zero amounts stay debits (free-trial rule, 3.3). The series is 0,00 then two 11,99 charges 144 days apart; it must not become a vampire (verify with `scripts/detect.ts` after the fix).
- Edge: Chase "Details" column holds DEBIT/CREDIT with signed amounts. It is not an indicator header, so Chase is unchanged.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Signed-amount, split debit/credit and positive-is-charge statements classify rows exactly as before.
- A row whose indicator cell is empty or unknown falls back to sign-based classification.
- Zero amounts remain debits.
- Previously recognized header keywords resolve the same columns; a header-matched description beats the fallback.
- `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` (with optional time) parse as before; undecidable slash dates stay `ambiguous`.
- Candidates with 3+ bites or a catalog match keep their score.
- The other 11 fixtures keep 51/51; the 5 in-app samples keep identical vampire ids.

**Scope:**
All inputs outside C are unaffected: statements without an indicator column, with already-known headers and non-compact dates, and candidates with 3+ bites or a catalog match.

## Hypothesized Root Cause

1. **Missing header vocabulary**: the description regex in `detectColumns` lacks lançamento/histórico/omschrijving/naam, and the amount regex lacks `bedrag` (`valor` is already there). With no description match, `detectColumns` returns `COLUMN_MAPPING_NEEDED` (confirmed for both fixtures).
2. **No indicator concept**: `ColumnLayout` and `parseRows` derive debit/credit only from the sign (single layout) or from which split column is filled. Unsigned amounts plus `Af/Bij` are all positive, and `detectPositiveIsCharge` would even flip them to "positive = charge". Also, the debit regex (`débito`) would grab a "Débito/Crédito" header before any indicator check.
3. **Date inference ignores compact dates**: `inferDateFormat` only recognizes ISO and slash dates, and `parseDate` only splits on `-` or `/`, so `20250103` yields `ambiguous`.
4. **Narrow 2-bite cap**: the cap in `runDetection` has `candidate.hasPriceIncrease` in its condition, so plain 2-bite series with a perfect cadence and stable amount (20+20+20 = 60) reach the vampire tier.
5. **Amount clustering splits a creeping series**: `grouper.ts` clusters a merchant's bites by amount. A series that rises steadily (Itaú "PADARIA DO ZE" 12,95 to 19,60, ING "THUISBEZORGD.NL" 23,30 to 32,40) is cut into several 2 to 3 bite clusters. Each 3-bite cluster has a perfect cadence and a near-stable median, so `computeScore` gives 70 and both appear as vampires. The scorer sees one cluster at a time and cannot know its siblings; the sibling view exists only in `runDetection`, after `buildCandidates`.
6. **Harness gap (test only)**: the new expected files omit `bites`, which `integration.bankFixtures.test.ts` treats as a hard requirement.

## Correctness Properties

Property 1: Bug Condition - Bank formats parse and income never becomes a vampire

_For any_ statement where the bug condition holds (isBugCondition returns true), the fixed engine SHALL resolve the columns instead of returning `COLUMN_MAPPING_NEEDED` (synonym headers or widest-text fallback), SHALL normalize compact `YYYYMMDD` dates to ISO, SHALL classify rows by the indicator column so that no income row is ever a charge, vampire or possible vampire, and SHALL give any 2-bite candidate without a catalog match a confidence score of at most 59, and SHALL give every cluster of an uncatalogued merchant whose merged bites form one strictly rising series (creeping amount) a score of at most 59, so it is never a vampire.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

Property 2: Preservation - Existing formats and results are unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the fixed engine SHALL produce the same result as the original: the same column layout, transactions, debit/credit types, dates and scores; all other fixtures SHALL stay at 51/51 and the 5 in-app samples SHALL yield exactly the baseline vampire ids. Catalog-matched merchants, price-increase series with a plateau and merchants with several flat plans keep their scores and vampires.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

**File**: `src/engine/types.ts`

1. **Layout field**: add an optional `indicatorCol?: number` to the `single` variant of `ColumnLayout`. Optional, so `ColumnMapper` and existing callers compile and behave unchanged.

**File**: `src/engine/parser.ts`

**Functions**: `detectColumns`, `inferDateFormat`, `parseDate`, `parseRows`, plus small pure helpers (exported for tests).

2. **Indicator detection** (`detectColumns`): before the keyword loop, find a column whose header matches `^(af\s*\/?\s*bij|d\s*\/\s*c|db\s*\/\s*cr|cr\s*\/\s*db|d[eé]bito\s*\/\s*cr[eé]dito|debit\s*\/\s*credit|cargo\s*\/\s*abono)$` (accent- and case-insensitive) AND whose non-empty values (at least one) all belong to the vocabulary. Mark it `indicatorCol` and skip it in the keyword loop so it never becomes debit, credit or description. Export `classifyIndicator(value): 'debit' | 'credit' | null` with debit = af, d, db, deb, dr, debit, debito, débito, cargo; credit = bij, c, cr, cred, credit, credito, crédito, abono (accents stripped, lowercased).
3. **Header synonyms**: extend the description regex with `lan[cç]amento|hist[oó]rico|omschrijving|\bnaam\b`; extend the amount regex with `bedrag` (`valor` already present).
4. **Description fallback**: after pass 1, if `descCol === -1` and `weakDescCol === -1`, pick among unassigned columns (not date, amount, debit, credit, indicator, balance header, and not mostly numeric) the one with the largest mean trimmed value length. Keyword matches, including the weak `detail` match, always win. Only if none exists, return `COLUMN_MAPPING_NEEDED`.
5. **Single layout with indicator**: return `{ type: 'single', amountCol, dateCol, descCol, indicatorCol }` only when an indicator was found; otherwise the object is identical to today's.
6. **Compact dates**: in `inferDateFormat`, treat `/^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/` like an ISO value (`sawIso`), so an all-compact (or ISO + compact) column returns `'YYYY-MM-DD'`. In `parseDate`, accept that pattern before the format switch, validate with `isValidDate` and return `YYYY-MM-DD`. Also let the pass-2 `DATE_VALUE_RE` fallback accept compact dates. No change to the `DateFormat` union.
7. **Row classification** (`parseRows`): when `layout.type === 'single'` and `indicatorCol` is defined and `classifyIndicator(cell)` is non-null, set `type` from the indicator (ignoring the amount sign and `positiveIsCharge`); if the amount is 0, keep `debit`. When the cell is empty or unknown, use today's sign logic.

**File**: `src/engine/index.ts`

8. **positiveIsCharge**: `detectPositiveIsCharge` must return false when the layout has `indicatorCol` (unsigned amounts would otherwise read as "positive = charge"). `parseStatement` and `parseWithLayout` need no other change since they pass the layout through.
9. **2-bite cap** (`runDetection`): change the condition to `candidate.bites.length === 2 && match === undefined`, dropping `candidate.hasPriceIncrease`. Update the comment. Candidates with 3+ bites or a catalog match are untouched.

**File**: `src/engine/index.ts` (second change, creeping amounts)

11. **Creeping-amount cap** (`runDetection`): after `buildCandidates`, group the candidates by `normalizedName`. For each group with 2 or more clusters, all clusters sharing one cadence and no catalog match (`matchCatalog` is undefined), merge all bites sorted by date. If the merged series has at least 4 bites and every bite amount is strictly higher than the previous one (no equal amounts, so no plateau), mark every cluster of the group as creeping. In step 4e, for a creeping cluster apply `confidenceScore = Math.min(confidenceScore, VAMPIRE_THRESHOLD - 1)`. Implement the check as a small pure helper (for example `creepingNames(candidates, cadences, matches): Set<string>`), computing cadence and catalog match once per candidate. Exempt: catalog-matched merchants (Netflix 13,99 x5 then 15,49 x3), groups with any repeated amount (price increase with plateau), and merchants with several flat plans (Videoland 7,99 and Videoland Extra Kids 4,99 have different normalizedName or flat series with repeated amounts). Clusters with differing cadences are not treated as creeping. Fixtures are not touched.

**File**: `tests/integration.bankFixtures.test.ts` (harness only)

10. **Optional `bites`**: make `bites` optional in `ExpectedSubscription` and compare `exp.bites === undefined || v.bites.length === exp.bites`. Fixtures are not touched.

## Testing Strategy

### Validation Approach

Surface counterexamples on the unfixed code first (exploration), capture baselines for what must not change (preservation), then fix and re-run the same tests. The baseline of the 5 in-app samples is captured BEFORE any engine change.

### Exploratory Bug Condition Checking

**Goal**: Show the bug on unfixed code and confirm the root causes.

**Test Plan**: Add `tests/bankFormatParser.bugCondition.test.ts` with fast-check properties scoped to the failing cases. Run on the UNFIXED code and record counterexamples.

**Test Cases**:
1. **Income is never a vampire**: generate ING-style rows (`Af Bij`, unsigned comma-decimal amounts, YYYYMMDD) where a random merchant and amount recur monthly with `Bij` for 3 to 12 months; assert `parseStatement` succeeds and neither `vampires` nor `possibleVampires` contain it (fails: parse error, then wrongly detected).
2. **Header synonyms**: for each description synonym and `bedrag`/`valor`, `detectColumns` returns a layout, not `COLUMN_MAPPING_NEEDED` (fails for the new words).
3. **Fallback**: a header row with no description keyword and one wide text column resolves to that column (fails).
4. **Compact dates**: for generated valid dates, `inferDateFormat([YYYYMMDD...])` is `'YYYY-MM-DD'` and `parseDate` returns the ISO string (fails: `ambiguous`).
5. **2-bite cap**: generated 2-bite series with an uncatalogued name, equal amounts and gaps inside a cadence bucket give `confidenceScore <= 59` and no vampire (fails: score 60).
7. **Creeping amount**: `itau-br.csv` ("PADARIA DO ZE") and `ing-nl.csv` ("THUISBEZORGD.NL") each show the merchant twice as a vampire with score 70; a generated strictly rising uncatalogued monthly series of 6 to 12 bites yields a vampire (fails).
6. **Fixtures**: `npx tsx scripts/detect.ts` on both fixtures currently returns `COLUMN_MAPPING_NEEDED`; the 2 bankFixtures tests fail.

**Expected Counterexamples**:
- `parseStatement` returns `COLUMN_MAPPING_NEEDED` for `Naam / Omschrijving` and `lançamento` headers.
- `DATE_FORMAT_AMBIGUOUS` for `20250103`.
- A 2-bite weekly/quarterly series scoring exactly 60.
- Possible causes: missing keywords, no indicator concept in `ColumnLayout`, narrow cap condition (all hypothesized above).

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed engine behaves as specified.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := engine_fixed(X)
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  RETURN columnsResolved(result)                                  // no COLUMN_MAPPING_NEEDED when a column exists
         AND allDatesAreISO(result.transactions)
         AND NOT EXISTS t IN result.transactions
                 WHERE t.type = 'debit' AND t.sourceIndicator IN creditVocabulary AND t.amountCents > 0
         AND NOT EXISTS v IN (result.vampires + result.possibleVampires)
                 WHERE v.bites ARE income rows
         AND FORALL c IN candidates
                 WHERE c.bites.length = 2 AND c.catalogMatch = none : c.confidenceScore <= 59
END FUNCTION
```

### Preservation Checking

**Goal**: For all inputs outside the bug condition, the fixed engine matches the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT engine_original(X) = engine_fixed(X)
END FOR
```

**Testing Approach**: Property-based tests plus recorded baselines, because they cover many generated inputs and catch edge cases a handful of examples would miss.

**Test Plan**: Observe on UNFIXED code, then write tests that pass before and after:
- Capture the vampire ids (and possible ids, for diagnostics) of the 5 `public/samples/*.csv` into `tests/baselines/inAppSamples.vampireIds.json` with a one-off script run on the unfixed code, and assert exact equality afterwards.
- The existing `integration.bankFixtures.test.ts` cases for the other 11 fixtures (51 expected subscriptions) must stay green.

**Test Cases**:
1. **In-app sample ids**: each of the 5 samples yields exactly its baseline vampire ids.
2. **Signed and split statements**: generated signed-amount rows without an indicator keep the same types before/after (no `indicatorCol` in the layout).
3. **Unknown indicator values**: rows with an empty/unknown indicator fall back to sign logic.
4. **Date formats**: generated `DD/MM/YYYY`, `MM/DD/YYYY` and `YYYY-MM-DD` dates parse as before; ambiguous slash columns stay ambiguous.
5. **Score preservation**: 3+ bite candidates and catalog-matched 2-bite candidates keep their `computeScore` result.

### Unit Tests

- `classifyIndicator` vocabulary (Af/Bij, D/C, Débito/Crédito, accents, case, unknown -> null).
- `detectColumns` on the exact ING and Itaú header rows, on "Débito/Crédito" (indicator, not split), on Chase (`Details` not an indicator).
- `parseDate` / `inferDateFormat` for compact dates, invalid compact dates (`20251345`), and 8-digit non-dates.
- `parseRows` with indicator: `Bij` + unsigned amount -> credit; `Af` -> debit; `Bij` + `0,00` -> debit; unknown -> sign logic.
- Scorer/pipeline: 2-bite uncatalogued capped at 59; catalogued 2-bite not capped.

### Property-Based Tests

- Income is never a vampire: for any generated recurring income (any merchant, amount, 3 to 12 months) marked `Bij`/credit, no vampire or possible vampire contains it.
- Indicator wins over sign: for any amount string and sign, the classified type equals the indicator's.
- Compact date round trip: for any valid date, formatting as YYYYMMDD then `parseDate` equals the ISO string.
- 2-bite cap: for any uncatalogued 2-bite series with any cadence-bucket gap and amounts, score <= 59 and it is never in `vampires`.
- Creeping amount: for any uncatalogued monthly series of 6 to 12 bites whose amounts are strictly rising, `runDetection` yields no vampire for that merchant.
- Multi-plan merchants: for any two flat plans of one merchant (different names, 3 to 8 bites each, constant amounts), both keep their vampires.
- Fallback: for any set of unassigned text columns, the chosen description column is the one with the largest mean length, and a keyword header always wins.

### Integration Tests

- `integration.bankFixtures.test.ts`: `itau-br.csv` and `ing-nl.csv` pass (detected: Netflix, Spotify, Smart Fit, Globoplay, YouTube Premium, Google One for Itaú; Netflix, Spotify, Basic-Fit, Ziggo, Videoland, Videoland Extra Kids for ING; nothing from `mustNotDetect`, no salary or refunds).
- `npx tsx scripts/detect.ts` on both fixtures exits 0 and prints the expected vampires.
- `tests/inAppSamples.preservation.test.ts` for the 5 in-app samples.
- Full `npx vitest run` green at the end.
