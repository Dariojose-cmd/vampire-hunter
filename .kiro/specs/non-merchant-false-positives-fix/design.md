# Non-Merchant False Positives Bugfix Design

## Overview

On a real Ecuadorian statement with no subscriptions, `runDetection` returned 0 vampires but listed two "possible vampires" that are not subscriptions: "****RETENCION IVASD DLC* UBER" (a VAT withholding) and "TRANSFERENCIA INTERNET" (the user's own transfers). Both showed a weekly cadence, the first showed "Started as a free trial" and the second showed "Price history". The display name also kept its edge asterisks.

Three independent defects cause this, all in `src/engine/index.ts` and the flag logic it calls:

1. Non-merchant movements (transfers, tax withholdings, ATM withdrawals, card payments) are grouped and scored like merchants.
2. `displayName` is built from `normalizeForDisplay(...)`, which keeps edge symbols.
3. `hasFreeTrial` and `hasPriceIncrease` are exposed on any series, including a series of 2 charges with a weekly or monthly cadence.

The fix is small and local: a pre-grouping exclusion filter, an edge-symbol trim on `displayName`, and a badge gate. The gate is `flagsAllowed = bites.length >= 3 OR cadence is 'quarterly' or 'yearly'`. Two charges are enough for quarterly and yearly series because one year of data holds only 2 annual charges. Scoring keeps using the raw flags so every existing score stays the same.

The engine's `Cadence` type (`src/engine/types.ts`) has exactly four values: `'weekly' | 'monthly' | 'quarterly' | 'yearly'`. There is no `biweekly` or `unknown` value. A candidate with no detectable cadence (`detectCadence` returns `null`) is dropped before any flag is computed. So "weekly, biweekly, monthly or unknown" in `bugfix.md` maps to `'weekly'` and `'monthly'` in code.

Verification of this design against the code and fixtures (done while writing it):

- The "Price history" badge is `vampireCard.priceIncreaseLabel`. It is "Price history" in `src/i18n/en.json` and "Historial de precios" in `src/i18n/es.json`. `VampireCard.tsx` renders it when `vampire.hasPriceIncrease` is true. The free-trial badge is `vampireCard.freeTrial` ("Started as a free trial" / "Comenzó como prueba gratuita"), rendered when `vampire.hasFreeTrial` is true. Both badges read the `Vampire` object, so gating those two fields in `runDetection` fixes the UI with no component change.
- The proposed exclusion regex was run over all 1394 transactions in the 19 CSVs of `samples/` and `tests/fixtures/banks/`. It matches only these descriptions: `RETIRO CAJERO AUTOMATICO`, `TRANSFERENCIA RECIBIDA FAMILIAR`, `TRANSFERENCIA ENVIADA ARRIENDO`, `TRANSFERENCIA ENVIADA AMIGO`, `TRANSFERENCIA ENVIADA RENTA`, `TRANSFERENCIA A NEQUI`, `SAQUE ATM 24H`, `ATM Withdrawal`. None of them appears in any baseline vampire or possible-vampire list (dumped from the current engine). `tests/fixtures/excel/*.csv` has no matching description.
- Not matched, by design: `TARIFA CESTA SERVICOS` (bank fee, stays a possible vampire in `itau-br.csv`), `NETFLIX PRESENTE CARTAO` (only "pagamento/pago + tarjeta/cartão/fatura" matches), `PAGO PSE SMART FIT`, `PAGO CLARO COLOMBIA`, `PIX ENVIADO MARIA SILVA`, `TO JOHN SMITH`, `TIKKIE JAN`.
- No catalog alias or canonical name in `src/data/catalog.json` contains a transfer, withholding, ATM or withdrawal term.

## Glossary

- **Bug_Condition (C)**: A statement has a recurring group whose description is a non-merchant movement, or whose display name has edge symbols, or that has fewer than 3 charges, a cadence other than quarterly or yearly, and shows `hasFreeTrial` or `hasPriceIncrease`.
- **Property (P)**: Non-merchant groups are absent from `vampires` and `possibleVampires`; no display name starts or ends with a junk character (`* # _ ~ | \ / = + -` or whitespace); no vampire with fewer than 3 charges and a weekly or monthly cadence has `hasFreeTrial` or `hasPriceIncrease` set.
- **Preservation**: Every vampire id, possible-vampire id, cadence, median, score and catalog match on the 5 in-app samples and on every `tests/fixtures/banks` fixture stays identical.
- **Non-merchant movement**: A bank movement that is not a purchase from a business: own or third-party transfer, tax withholding, ATM or cash withdrawal, credit-card bill payment.
- **Bank fee**: A recurring charge from the bank itself (comisión, mantenimiento, tarifa). Not excluded.
- **runDetection**: The pipeline in `src/engine/index.ts` that filters, normalizes, groups, scores and splits transactions into `vampires` and `possibleVampires`.
- **NON_MERCHANT_RE**: New regular expression (in a new `src/engine/nonMerchant.ts`) tested against the accent-stripped raw description.
- **trimEdgeSymbols**: New helper that removes leading and trailing runs of junk characters (`* # _ ~ | \ / = + -` and whitespace).
- **MIN_CHARGES_FOR_FLAGS**: New constant, 3. Minimum charges for the badges on series whose cadence is not quarterly or yearly.
- **LONG_CADENCES**: New set `{'quarterly', 'yearly'}`. Series with these cadences need only 2 charges to show the badges.
- **flagsAllowed**: `bites.length >= MIN_CHARGES_FOR_FLAGS || LONG_CADENCES.has(cadence)`. Gates the two badge fields on the `Vampire` object only.

## Bug Details

### Bug Condition

The bug manifests when a recurring group is a non-merchant movement, when its display name begins or ends with symbols, or when a 2-charge weekly or monthly series gets a free-trial or price-history flag. `runDetection` has no concept of non-merchant movements, builds `displayName` without trimming symbols, and `detectFreeTrial` plus the grouper's `hasPriceIncrease` have no minimum series length.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type DetectionInput (transactions from one statement)
  OUTPUT: boolean

  RETURN EXISTS group G IN recurringGroups(X) WHERE
           matchesNonMerchantList(G.description)
        OR hasEdgeSymbolRun(displayName(G))
        OR (G.bites.length < 3
              AND G.cadence NOT IN {'quarterly', 'yearly'}
              AND (G.hasFreeTrial OR G.hasPriceIncrease))
END FUNCTION
```

### Examples

- `****RETENCION IVASD DLC* UBER`, 2 charges of 0.64, 9 days apart. Current: possible vampire, weekly, "Started as a free trial", name shown with asterisks. Expected: not listed.
- `TRANSFERENCIA INTERNET`, 2 charges of 7.55, 9 days apart. Current: possible vampire, weekly, "Price history". Expected: not listed.
- `RETIRO CAJERO AUTOMATICO`, `SAQUE ATM 24H`, `ATM Withdrawal` repeated monthly. Expected: not listed.
- `PAGO TARJETA DE CREDITO VISA` monthly (ES), `PAGAMENTO FATURA CARTAO` monthly (PT), `CREDIT CARD PAYMENT` monthly (EN). Expected: not listed.
- `COMISION MANTENIMIENTO CUENTA` 3 or more monthly charges. Expected: still a vampire or possible vampire (bank fee).
- `*ACME SHOP*` that is a real 3-charge merchant. Expected: shown as `ACME SHOP`.
- Edge case: a 2-charge monthly series whose first charge is 10% of the median. Expected: `hasFreeTrial` false. With 3 charges and a 0.00 first charge: `hasFreeTrial` true (Globoplay in `itau-br.csv` keeps it).
- Edge case: `COSTCO ANNUAL MEMBERSHIP`, 2 yearly charges with a price step. Expected: `hasPriceIncrease` stays true. A 2-charge quarterly series with a first charge at 10% of the median keeps `hasFreeTrial` true.
- `PIX ENVIADO MARIA SILVA`, `TIKKIE JAN`, `TO JOHN SMITH` and a bare `IVA` or `IMPUESTO` description repeated monthly. Expected: still detected as before (decided, not excluded).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Bank fees (comisión, mantenimiento, tarifa) keep being detected.
- Ordinary merchants keep the same cadence, score and id.
- Series of 3 or more charges keep `hasFreeTrial` and `hasPriceIncrease` exactly as computed today (Hulu, HelloFresh, Globoplay, Disney Plus keep the trial flag; Netflix keeps price history).
- Quarterly and yearly series with 2 charges keep both flags exactly as computed today (`COSTCO ANNUAL MEMBERSHIP` keeps `hasPriceIncrease`).
- PIX ENVIADO, Tikkie-style requests, Revolut-style "TO <person>" transfers and bare IVA or impuesto stay detectable.
- Display names that already have no leading or trailing junk character are unchanged.
- Catalog matches keep showing the canonical name.
- The 5 in-app samples and every `tests/fixtures/banks` fixture keep their exact vampire ids and possible-vampire ids.

**Scope:**
All inputs where no description matches `NON_MERCHANT_RE`, no display name has edge symbols, and no series with fewer than 3 charges and a weekly or monthly cadence carries a flag are unaffected. One known side effect stays inside the stated requirements and does not change any id:

- `NS GROEP UTRECHT`, `THUISBEZORGD.NL`, `PAO DE ACUCAR`, `UBER *TRIP`, `PADARIA DO ZE`, `TFL TRAVEL`, `TO JOHN SMITH`, `MERCADO EXTRA` are possible vampires with a price-history flag on 2 charges and a weekly or monthly cadence. They stay listed; only the flag turns off (requirement 2.4).

`COSTCO ANNUAL MEMBERSHIP` in `amex-us.csv` and `amex-us-probe.csv` has 2 yearly charges and `hasPriceIncrease = true` today. It keeps the flag (requirement 3.8), so it is not a side effect. Its id, cadence, median and score (80) stay the same.

## Hypothesized Root Cause

1. **No non-merchant concept**: `runDetection` filters only credits and `PAYMENT_RECEIVED_RE`. Any repeated description with a regular gap passes `detectCadence` and gets score above 0 from bite count plus cadence regularity, so it lands in `possibleVampires`.
2. **Display name built from the first bite's raw text**: `normalizeForDisplay` removes noise words, dates and reference codes but never edge punctuation, so `****RETENCION IVASD DLC* UBER` keeps `****`.
3. **No minimum series length on the flags**: `detectFreeTrial` returns true for a first charge below 20% of the median even with 2 charges. The grouper's price-increase merge and `hasSustainedIncrease` accept `k >= 2`. Two points are not a history for weekly or monthly series. Quarterly and yearly series are the exception, because one year of data holds only 2 annual charges.
4. **Possible alternative (checked and rejected)**: the badge strings may be wrong. They are not: `vampireCard.priceIncreaseLabel` maps to "Price history" as intended and `VampireCard.tsx` only reads `vampire.hasPriceIncrease`.

## Correctness Properties

Property 1: Bug Condition - Non-merchant movements, edge symbols and thin-series flags

_For any_ statement where the bug condition holds (isBugCondition returns true), the fixed `runDetection` SHALL return no item in `vampires` or `possibleVampires` whose bite descriptions match the non-merchant list, SHALL return display names that have no leading or trailing junk character, and SHALL return `hasFreeTrial = false` and `hasPriceIncrease = false` for every item with fewer than 3 charges and a weekly or monthly cadence.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Everything else is unchanged

_For any_ statement where the bug condition does NOT hold (isBugCondition returns false), the fixed `runDetection` SHALL produce the same vampires and possible vampires (ids, display names, cadence, median, score, flags) as the original function, preserving bank fees, ordinary merchants, flags on series of 3 or more charges, flags on quarterly and yearly series with 2 or more charges, PIX ENVIADO, Tikkie, Revolut "TO <person>" and bare IVA or impuesto detection, already-clean display names, catalog canonical names, the 5 in-app sample ids and all `tests/fixtures/banks` ids.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `src/engine/nonMerchant.ts` (new, pure TypeScript, no React)

1. **Exclusion list**: export `isNonMerchant(description: string): boolean`. It tests `NON_MERCHANT_RE` against `stripAccents(description)`, case-insensitive, with word boundaries. Patterns, grouped by language:
   - Transfers (ES/EN/PT): `transfer`, `transferencia(s)`, `transferir`, `transf` (whole word, so `transferwise` is not matched).
   - Withholding: `retencion(es)`, `retencao/retencoes`, `withholding`.
   - Cash withdrawal: `retiro(s)`, `cajero`, `atm`, `saque(s)`, `levantamento`, `withdrawal(s)`.
   - Card bill payment: `pago|pagamento` + optional `de|da|a|con` + optional `la|su` + `tarjeta|cartao|fatura`; `credit card payment`; `payment to/of (your) (credit) card`.
   - Not included, decided: bare `iva`, `impuesto`, `tax`, bare `card payment`, `pix` (PIX ENVIADO), Tikkie-style requests, Revolut-style `to <person>` transfers, `tarifa`, `comision`, `mantenimiento`. PIX ENVIADO, Tikkie and "TO <person>" can be real recurring charges such as rent. Bare IVA or impuesto is too broad. Bare `card payment` is how some banks label ordinary purchases. These items stay detectable and no other items are added to the list.

**File**: `src/engine/index.ts`

**Function**: `runDetection`

**Specific Changes**:
1. **Pre-grouping filter**: add `&& !isNonMerchant(t.description)` to the existing credit/`PAYMENT_RECEIVED_RE` filter in Step 1. Excluding before grouping keeps ids of surviving groups the same, because a non-matching description never normalizes to the same name as a matching one.
2. **Edge-symbol trim**: add `trimEdgeSymbols(s) = s.replace(/^[*#_~|\\/=+\-\s]+|[*#_~|\\/=+\-\s]+$/g, '')`, which trims only runs of the junk characters `* # _ ~ | \ / = + -` and whitespace at both edges (a trailing `.` and closing `)` or `]` are kept, so `ZIGGO B.V.` and `NETFLIX (US)` stay intact), and apply it to the non-catalog `displayName`. If the trimmed result is empty, fall back to `trimEdgeSymbols(candidate.normalizedName)`, then to the untrimmed value. `normalizedName` and ids are not touched.
3. **Badge gate**: add `const MIN_CHARGES_FOR_FLAGS = 3` and `const LONG_CADENCES: ReadonlySet<Cadence> = new Set(['quarterly', 'yearly'])`. Inside the Step 4 loop, after the null-cadence `continue`, compute `const flagsAllowed = candidate.bites.length >= MIN_CHARGES_FOR_FLAGS || LONG_CADENCES.has(cadence)`. Pass the raw `hasFreeTrial` and `candidate.hasPriceIncrease` to `RecurrenceCandidate` and `computeScore` (so scores do not move), and set `Vampire.hasFreeTrial = hasFreeTrial && flagsAllowed` and `Vampire.hasPriceIncrease = candidate.hasPriceIncrease && flagsAllowed`.
4. **No change** to `grouper.ts`, `cadenceDetector.ts`, `scorer.ts`, `normalizer.ts` or any component. Their unit and property tests keep working because they test the raw candidate-level flags.

**Note on existing tests**: the property test in `tests/bankFormatParser.preservation.test.ts` rebuilds a candidate from the `Vampire` flags and compares `computeScore` with `confidenceScore`. It only generates constant-amount series, where raw and gated flags are equal, so it still passes. A test that generates 2-charge weekly or monthly series with price steps would see a mismatch by design, because scoring uses the raw flags.

## Testing Strategy

### Validation Approach

Two phases. First, write bug-condition tests and run them on the unfixed code to see them fail for the reasons above. Second, apply the fix and confirm they pass while the preservation tests, which pass before and after, stay green. Run with `npx vitest --run`.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on the UNFIXED code. These tests are written first and must be confirmed failing before any source change.

**Test Plan**: New file `tests/nonMerchant.bugCondition.test.ts`. It builds a synthetic HTML-as-.xls page with the same shape as the real statement, following `tests/excelReader.html.test.ts` (`cutPage` helper): a "Fecha este Corte" summary table, then a movements table with columns FECHA, OFIC., N.DOC., DESCRIPCION, DEBITO, CREDITO, SALDO and dates like `15-oct.`. It runs `readWorkbook` -> `parseCsvText` -> `locateHeader` -> `parseStatement` -> `runDetection`. No real data is used.

Fixture content (about 55 movements, no subscriptions): 2 `****RETENCION IVASD DLC* UBER` debits of 0.64 nine days apart; 2 `TRANSFERENCIA INTERNET` debits of 7.55 nine days apart; one `RETIRO CAJERO AUTOMATICO` pair; one `PAGO TARJETA DE CREDITO` pair; assorted one-off purchases; salary credit.

**Test Cases**:
1. **Real-shape statement lists nothing**: `vampires` and `possibleVampires` are both empty (fails on unfixed code: 2 or more possible vampires).
2. **Exclusion list by language**: table of descriptions in ES/EN/PT (`TRANSFERENCIA INTERNET`, `TRANSFER TO SAVINGS`, `TRANSFERÊNCIA ENVIADA`, `RETENCION IVA`, `RETENÇÃO IMPOSTO`, `RETIRO CAJERO`, `ATM WITHDRAWAL`, `SAQUE ATM 24H`, `PAGO TARJETA DE CREDITO`, `PAGAMENTO FATURA CARTAO`, `CREDIT CARD PAYMENT`), each as a 4-charge monthly series, none listed (fails on unfixed code).
3. **Edge symbols**: a 3-charge merchant `*ACME SHOP*` and a `****RETENCION IVASD DLC* UBER`-style name that is not excluded when changed to a merchant: `displayName` has no leading or trailing junk character (`* # _ ~ | \ / = + -` or whitespace) (fails on unfixed code).
4. **Thin-series flags**: a 2-charge monthly series with first charge 10% of the median has `hasFreeTrial = false`; a 2-charge monthly series with a 20% step has `hasPriceIncrease = false`; same for a 2-charge weekly series (fails on unfixed code).
   - **Long-cadence flags stay**: a 2-charge yearly series with a 20% step keeps `hasPriceIncrease = true`; a 2-charge quarterly series with first charge 10% of the median keeps `hasFreeTrial = true` (passes before and after; guards over-gating).
   - **Person-to-person stay**: `PIX ENVIADO MARIA SILVA`, `TIKKIE JAN`, `TO JOHN SMITH` and bare `IVA` as 4-charge monthly series are listed (passes before and after).
5. **Bank fee stays**: `COMISION MANTENIMIENTO CUENTA`, 4 monthly charges, is listed (passes before and after; guards over-exclusion).

**Expected Counterexamples**:
- `possibleVampires` contains `TRANSFERENCIA INTERNET` and `****RETENCION IVASD DLC* UBER`.
- `displayName` is `****RETENCION IVASD DLC* UBER` or similar with edge asterisks.
- `hasFreeTrial` or `hasPriceIncrease` is true on a weekly or monthly series with `bites.length === 2`.
- Possible causes: missing exclusion filter, untrimmed display name, no minimum series length (as hypothesized).

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := runDetection'(X)
  ASSERT FOR ALL v IN result.vampires UNION result.possibleVampires:
           NOT isNonMerchant(v.bites[0].description)
           AND startsAndEndsWithLetterOrDigit(v.displayName)
           AND (v.bites.length >= 3
                OR v.cadence IN {'quarterly', 'yearly'}
                OR (NOT v.hasFreeTrial AND NOT v.hasPriceIncrease))
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT runDetection(X) = runDetection'(X)
END FOR
```

**Testing Approach**: Property-based testing, because it generates many merchant names, amounts and cadences and catches edge cases that hand-picked examples miss.

**Test Plan**: Observe behavior on the UNFIXED code first. Before touching `src/`, record a golden file `tests/baselines/detectionOutput.json` with, for each of the 5 samples and each `tests/fixtures/banks` CSV, the id, displayName, cadence, median, score and bite count of every vampire and possible vampire (generated with the dump script used for this design). Then write preservation tests against it.

**Test Cases**:
1. **Samples and banks golden**: new `tests/nonMerchant.preservation.test.ts` asserts the full golden list for all 19 CSVs, ignoring only the `hasPriceIncrease`/`hasFreeTrial` values of items with fewer than 3 charges whose cadence is not `'quarterly'` or `'yearly'`. Items with a quarterly or yearly cadence (such as `COSTCO ANNUAL MEMBERSHIP`) are compared on every field, flags included. The existing `tests/inAppSamples.preservation.test.ts` and `tests/integration.bankFixtures.test.ts` keep asserting exact vampire ids.
2. **Exclusion list never hits the baseline**: scan every transaction description in the 19 CSVs, collect those matching `isNonMerchant`, and assert the set equals the 8 descriptions listed in the Overview. Any new match fails the test and requires asking the user before adding a rule (any rule that changes a baseline needs approval).
3. **Bank fee and look-alikes**: `COMISION`, `MANTENIMIENTO`, `TARIFA CESTA SERVICOS`, `NETFLIX PRESENTE CARTAO`, `PAGO PSE SMART FIT`, `TRANSFERWISE` are not matched by `isNonMerchant`.
4. **Property: clean merchants unchanged**: generate merchant names from letters and digits that do not match the list, monthly series of 3 to 12 charges, constant amounts; assert `runDetection` output equals the golden computation from the pre-fix algorithm (copy of the old `displayName` and flag logic kept inside the test as the oracle).

### Unit Tests

- `isNonMerchant`: positive table (ES/EN/PT, with and without accents, upper and lower case) and negative table (merchants, fees, look-alikes).
- `trimEdgeSymbols`: `****X*` -> `X`, `*A B*` -> `A B`, `A&T` unchanged, all-symbol input -> empty, idempotence.
- Flag gating, table over cadence and charge count: 2 bites with `'weekly'` or `'monthly'` and raw flags true gives `false`; 2 bites with `'quarterly'` or `'yearly'` keeps `true` for both flags; 3 or more bites keep `true` for every cadence.
- Score invariance: a 2-bite yearly catalog series with a price step keeps score 80 and `hasPriceIncrease = true` (Costco shape). A 2-bite monthly series with a price step keeps its pre-fix score while `hasPriceIncrease` is `false` (scoring uses the raw flags).

### Property-Based Tests

- For any generated list of transactions (fast-check), no returned item has a bite description matching `isNonMerchant`.
- For any generated display name, `trimEdgeSymbols` output has no leading or trailing junk character, never adds characters, and `trimEdgeSymbols(trimEdgeSymbols(s)) === trimEdgeSymbols(s)`.
- For any generated series (cadence drawn from `weekly`, `monthly`, `quarterly`, `yearly`; 2 to 12 charges), every returned item with `bites.length < 3` and a weekly or monthly cadence has both flags false.
- For any generated series with a quarterly or yearly cadence and 2 or more charges, the returned flags equal the raw flags computed before the fix.
- For any generated series with 3 or more charges, the returned flags equal the flags before the fix.
- For any generated series, `confidenceScore` equals the score computed from the raw flags, whether or not the badges are gated.

### Integration Tests

- The synthetic HTML-as-.xls statement (real-shape, no subscriptions) returns empty `vampires` and `possibleVampires` end to end.
- The same statement with a real subscription added (Netflix, 3 or more monthly charges) returns exactly that subscription.
- `tests/integration.bankFixtures.test.ts`, `tests/inAppSamples.preservation.test.ts`, `tests/integration.sampleStatements.test.ts` and `tests/integration.excelFixtures.test.ts` pass unchanged.
- Render check (component test): a `VampireCard` for a 2-charge monthly vampire shows neither the "Started as a free trial" nor the "Price history" text, in English and Spanish. A `VampireCard` for a 2-charge yearly vampire with the flags set (Costco shape) still shows "Price history" / "Historial de precios".
