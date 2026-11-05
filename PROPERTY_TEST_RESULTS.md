# Property-Based Test Results

Fast-check property tests for the detection engine, each running `{ numRuns: 1000 }`.
Command: `npm test` (`vitest run`).

This document is a **before/after record**: it captures what each property revealed
*before* the fix (the verbatim fast-check counterexample), and what changed to make it
pass.

## Summary (after review-feedback fixes)

- **Test files:** 12 passed (12 total)
- **Tests:** 206 passed (206 total)
- Two real engine behaviors were surfaced by the properties and fixed in `src/`:
  - **Property 1** (normalizer idempotence) — once the generator was made
    bank-like it exposed that a single cleanup pass is not a fixpoint. Fixed by
    iterating the cleaning steps to a fixpoint.
  - **Property 12b** (grouper price step) — sub-10% / sustained small steps were
    never flagged. Fixed by a product decision: flag any sustained increase ≥ 2%.

## Property-by-property status

| Property | File | Status |
|---|---|---|
| 1 — Normalization Idempotence | `tests/normalizer.property.test.ts` | PASS (1000 runs) + regression unit test |
| 2 — Monthly Cadence Detection | `tests/cadenceDetector.property.test.ts` | PASS (1000 runs) |
| 10 — Cadence Tolerance Coverage (weekly/monthly/quarterly/yearly) | `tests/cadenceDetector.property.test.ts` | PASS (1000 runs each bucket) |
| 6 — Confidence Score Range | `tests/scorer.property.test.ts` | PASS (1000 runs) |
| 7 — Threat Level Monotonicity | `tests/profileBuilder.property.test.ts` | PASS (1000 runs) |
| 9 — Amount Cents Integrity | `tests/parser.property.test.ts` | PASS (1000 runs) |
| 11 — Thousands-Separator Detection | `tests/parser.property.test.ts` | PASS (1000 runs) |
| 12a — Interleaved series → two vampires | `tests/grouper.property.test.ts` | PASS (1000 runs) |
| 12b — Sequential price step → one vampire w/ hasPriceIncrease | `tests/grouper.property.test.ts` | PASS (1000 runs) |

---

## Property 1 — Normalization Idempotence

### Before

The original test used `fc.string()` as the generator. It passed, but only
because `fc.string()` almost never produces bank-like text (mixed merchant words,
noise keywords, card-number digit runs, and alphanumeric reference codes), so it
never exercised the normalizer's boundary-anchored (`^`/`$`) ref-code cleanup.

The generator was replaced with a **bank-like** one: arrays of 1–8 tokens joined
by single spaces, each token drawn from a mix of merchant words
(`NETFLIX`, `SPOTIFY`, `APPLE.COM`, `AMAZON`, `UBER`, `STARBUCKS`, `WALMART`,
`BILL`), noise keywords (`POS`, `PURCHASE`, `COMPRA`, `PAGO`, `CARGO`, `DEBITO`,
`DEBIT`, `PAYMENT`), digit runs of 4–8 digits, and alphanumeric codes of 6–10
chars from `[A-Z0-9]` that always contain at least one digit so they hit the
ref-code regex.

Run once against the **un-fixed** normalizer, this immediately failed.

**Exact fast-check output (verbatim), property test:**

```
Error: Property failed after 4 tests
{ seed: -317379776, path: "3:1:1:2:3:2:2:2:2:2:2:2:2:2:2", endOnFailure: true }
Counterexample: ["NETFLIX 00U000 000000"]
Shrunk 14 time(s)

Caused by: AssertionError: expected 'NETFLIX' to be 'NETFLIX 00U000' // Object.is equality

Expected: "NETFLIX 00U000"
Received: "NETFLIX"
```

**Exact fast-check output (verbatim), regression unit test** on the reviewer's
example `"NETFLIX 0AA000 0AAAA0"`:

```
AssertionError: expected 'NETFLIX' to be 'NETFLIX 0AA000' // Object.is equality

Expected: "NETFLIX 0AA000"
Received: "NETFLIX"
```

**Root cause (real engine behavior, not a test defect):**
`normalize` did a **single** cleaning pass. The ref-code regexes are anchored at
the start/end of the string. Removing the end-anchored ref code from
`"NETFLIX 0AA000 0AAAA0"` leaves `"NETFLIX 0AA000"` — but now `0AA000` has become
the new end-anchored token. A single pass therefore returns `"NETFLIX 0AA000"`,
while a second pass removes `0AA000` too and returns `"NETFLIX"`. Hence
`normalize(normalize(s)) !== normalize(s)` — one pass is not a fixpoint.

### After (fix)

`normalize` now **iterates the cleaning steps to a fixpoint**. The uppercase step
runs once; then the noise-keyword / whitespace-collapse / ref-code / card-number /
whitespace / trim steps repeat until a pass leaves the string unchanged
(`prev === next`), with a defensive max-iteration cap (the string is
monotonically shrinking-or-stable, so it converges quickly). The set of noise
keywords and the regex patterns were **not** changed, and the public signature
`normalize(s: string): string` is unchanged.

A **regression unit test** (plain `it`, not property-based) was added asserting
idempotence on the exact string `"NETFLIX 0AA000 0AAAA0"`.

Result: both the bank-like property (1000 runs) and the regression unit test pass.

---

## Property 12b — Sequential price step → one vampire with hasPriceIncrease

### Before

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

**Counterexample decoded:** arguments were `[amountA, stepFraction, n, m]` =
`[100, ~0.01, 2, 2]`, i.e. two charges at 100 cents then two at 101 cents (a 1%
step), same merchant `NETFLIX`, non-overlapping in time. Expected exactly 1
candidate with `hasPriceIncrease === true`; actual was 1 candidate with
`hasPriceIncrease === false`.

**Root cause (real engine behavior, not a test defect):**
`buildCandidates` first runs amount-based k-medians clustering
(`clusterByAmount`), which groups any two amounts within **10%** of the cluster
median into the *same* cluster. A step of 1% (100 → 101) is inside that 10%
tolerance, so both tiers land in a single cluster immediately. Previously,
`hasPriceIncrease` was only set by the Step 2b-ii *merge* pass, which merges two
*separate* clusters. Because a sub-10% step never produces two clusters to merge,
the resulting single candidate was reported with `hasPriceIncrease = false`.

Observed clustering behavior (A = 100 cents):

| B (cents) | step | clusters | hasPriceIncrease (before) |
|---|---|---|---|
| 101 | +1%  | 1 | false |
| 105 | +5%  | 1 | false |
| 110 | +10% | 1 | false |
| 111 | +11% | 1 | **true** |
| 150 | +50% | 1 | **true** |

### After (product decision + fix)

**Product decision:** flag any **sustained price increase of at least 2%**,
regardless of whether clustering split the tiers.

**Code change (`src/engine/grouper.ts`):** after clustering, within each final
cluster's chronologically-sorted, trial-excluded series (`paidHistory` — the same
series the stability check uses, so leading free-trial bites do not trigger a
false "increase"), `buildCandidates` now also sets `hasPriceIncrease = true` when
a new helper `hasSustainedIncrease` finds a split index `p` in `[1, k-1]` with:

- `min(a[p..k-1]) >= max(a[0..p-1])` (every later bite ≥ every earlier bite), AND
- `median(a[p..]) * 100 >= median(a[..p]) * 102` (later median ≥ 2% above earlier,
  compared in integer cents to avoid float rounding).

This is **OR-ed** with the existing 2b-ii merge flag, so any price increase the
merge pass already detected still counts. The change only affects the
`hasPriceIncrease` flag; it does **not** change how many clusters form, so
Property 12a (interleaved A / B = A×2.5 → exactly 2 clusters) is unaffected.

**Test change:** the Property 12b generator now produces steps of **≥ 2%** (and
≤ 50%). `amountB` is computed as `clamp(lowerB=max(ceil(A*1.02), A+1), …,
upperB=floor(A*1.5))`, with `fc.pre(lowerB <= upperB)` to skip the degenerate
tiny-amount case where the ≥2% floor exceeds the ≤50% ceiling.

Result: Property 12b passes (1000 runs) — exactly 1 candidate with
`hasPriceIncrease === true`; Property 12a still passes unchanged.
