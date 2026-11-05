# Property-Based Test Results

Fast-check property tests for the detection engine, each running `{ numRuns: 1000 }`.
Command: `npm test` (`vitest run`).

## Summary

- **Test files:** 1 failed, 11 passed (12 total)
- **Tests:** 1 failed, 204 passed (205 total)
- The single failure is **Property 12b** (grouper price-step). It is a **real engine
  behavior surfaced by the property**, not a test bug. Per instructions, `src/` was
  NOT modified and the test was NOT weakened to hide the failure.

## Property-by-property status

| Property | File | Status |
|---|---|---|
| 1 — Normalization Idempotence | `tests/normalizer.property.test.ts` | PASS (1000 runs) |
| 2 — Monthly Cadence Detection | `tests/cadenceDetector.property.test.ts` | PASS (1000 runs) |
| 10 — Cadence Tolerance Coverage (weekly/monthly/quarterly/yearly) | `tests/cadenceDetector.property.test.ts` | PASS (1000 runs each bucket) |
| 6 — Confidence Score Range | `tests/scorer.property.test.ts` | PASS (1000 runs) |
| 7 — Threat Level Monotonicity | `tests/profileBuilder.property.test.ts` | PASS (1000 runs) |
| 9 — Amount Cents Integrity | `tests/parser.property.test.ts` | PASS (1000 runs) |
| 11 — Thousands-Separator Detection | `tests/parser.property.test.ts` | PASS (1000 runs) |
| 12a — Interleaved series → two vampires | `tests/grouper.property.test.ts` | PASS (1000 runs) |
| 12b — Sequential price step → one vampire w/ hasPriceIncrease | `tests/grouper.property.test.ts` | **FAIL** (see below) |

## Failing property: 12b — Sequential price step → one vampire with hasPriceIncrease

**Test:** `tests/grouper.property.test.ts > Property 12b: Sequential price step → one vampire with hasPriceIncrease > a price step series from one merchant yields exactly 1 candidate with hasPriceIncrease`

**Exact fast-check output (verbatim):**

```
Error: Property failed after 2 tests
{ seed: 953337734, path: "1:0:0:0", endOnFailure: true }
Counterexample: [100,0.009999999776482582,2,2]
Shrunk 3 time(s)

Caused by: AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
```

(An earlier run produced the same shrunk counterexample under a different seed:
`{ seed: 1797019313, path: "0:0:0:0:0" }`, `Counterexample: [100,0.009999999776482582,2,2]`,
`Shrunk 4 time(s)` — the minimal counterexample is stable across seeds.)

**Counterexample decoded:** arguments are `[amountA, stepFraction, n, m]` =
`[100, ~0.01, 2, 2]`. The test computes
`amountB = min(amountA + max(1, round(amountA * stepFraction)), floor(amountA * 1.5))`
= `min(100 + max(1, round(1)), 150)` = **101**. So the series is two charges at
100 cents followed by two charges at 101 cents (a 1% step), same merchant `NETFLIX`,
non-overlapping in time.

Expected per design Property 12b: exactly 1 candidate with `hasPriceIncrease === true`.
Actual: exactly 1 candidate, but `hasPriceIncrease === false`.

**Root cause (real engine behavior, not a test defect):**
`buildCandidates` first runs amount-based k-medians clustering (`clusterByAmount`),
which groups any two amounts within **10%** of the cluster median into the *same*
cluster. A step of 1% (100 → 101) is inside that 10% tolerance, so both tiers land
in a single cluster immediately. The price-increase flag (`hasPriceIncrease`) is only
set by the Step 2b-ii *merge* pass, which merges two *separate* clusters. Because a
sub-10% step never produces two clusters to merge, the resulting single candidate is
reported with `hasPriceIncrease = false`.

Observed clustering behavior (A = 100 cents):

| B (cents) | step | clusters | hasPriceIncrease |
|---|---|---|---|
| 101 | +1%  | 1 | false |
| 105 | +5%  | 1 | false |
| 110 | +10% | 1 | false |
| 111 | +11% | 1 | **true** |
| 150 | +50% | 1 | **true** |

So the design property, as literally stated ("for any base amount A and stepped
amount B where B > A and B ≤ A × 1.5 … always … hasPriceIncrease = true"), does not
hold for steps that fall within the grouper's 10% clustering tolerance
(roughly `A < B ≤ round(A × 1.10)`). For steps strictly greater than 10% the property
holds. The property and the implementation disagree on the small-step boundary; the
test faithfully reports that gap.

**Action taken:** none in `src/`. The test is left failing on purpose so the real
behavior is visible. Resolving it is a design decision (either tighten the property's
lower bound to require a step > 10%, or change the engine to flag sub-10% steps as a
price increase) and is out of scope for this test-only task.
