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

---

## Property 3b — Same-Merchant Clustering Order Independence

**Validates: Requirements 4.5, 4.8** — `tests/detection.property.test.ts`,
`{ numRuns: 1000 }`.

### What the property asserts

Property 3 proves order independence only for statements whose recurring series
each use a *distinct* merchant. Property 3b targets the harder, inherently
ambiguous case the main generator deliberately sidesteps: **2–3 independent
recurring series that all share ONE merchant, with per-series base amounts
clustered mutually within 10% of each other** (`max/min <= 1.1`, right at the
grouper's ±10% cluster-tolerance boundary). Each series is a valid weekly/monthly
series of 3–8 bites; the usual 0–10 one-off noise transactions are mixed in.

The property runs `runDetection` on the generated array, then again on a genuine
random permutation of the *same* multiset (seed-based random sort keys,
`k = Math.sin((i+1)*(seed+1))` — the same permutation approach Property 3 uses,
not a fixed reverse). It then asserts **both**:

- **(a)** `allVampireIds(reordered)` deep-equals `allVampireIds(original)` —
  identical sorted vampire ids; and
- **(b)** identical bite memberships per cluster — a `Map<vampireId, sortedBiteKeys>`
  (bite key = `${date}|${amountCents}|${type}`) built from each run is
  deep-equal for every id.

There is **no coverage guard** on this property: masking is not the goal —
exposing the order-dependence is.

### Before (pre-fix engine) — FAILS

Run against the current (unfixed) engine, Property 3b fails: the same multiset of
same-merchant transactions produces a *different number of clusters* (and hence
different vampire ids / bite memberships) depending on input order. The root
cause is `clusterByAmount` in `src/engine/grouper.ts`: its seeding loop and
iterative k-medians reassignment iterate `bites` in **input order** and tie-break
eligible clusters only by absolute percent difference, so near-boundary
(within ~10%) same-merchant amounts land in different clusters depending on
order.

**Exact fast-check output (verbatim):**

```
Error: Property failed after 37 tests
{ seed: 661867412, path: "36:1:1:1:1:1:1:5:1:1:1:1:1:1:1:1:1:1:1:1:1:1:1:2:1:1:1:1:1:1:1:1:0:0:0:0:0:0:0:0:0:0:0:0:2:0:1:21:6:2:1:3:1:1:2:1:4:2:1:4:1:1:1:3:2:1:1:1:1:1:1:2:1:1", endOnFailure: true }
Counterexample: [[{"id":"s0-b0","date":"2020-01-01","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2006,"type":"debit","currency":"USD"},{"id":"s0-b1","date":"2020-01-08","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2026,"type":"debit","currency":"USD"},{"id":"s0-b2","date":"2020-01-15","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2006,"type":"debit","currency":"USD"},{"id":"s1-b0","date":"2020-01-01","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2207,"type":"debit","currency":"USD"},{"id":"s1-b1","date":"2020-01-06","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2207,"type":"debit","currency":"USD"},{"id":"s1-b2","date":"2020-01-15","description":"NETFLIX.COM","normalizedName":"NETFLIX.COM","amountCents":2207,"type":"debit","currency":"USD"}],0]
Shrunk 73 time(s)

Hint: Enable verbose mode in order to have the list of all failing values encountered during the run

Caused by: AssertionError: expected [ 'NETFLIX.COM_0' ] to deeply equal [ 'NETFLIX.COM_0', 'NETFLIX.COM_1' ]

- Expected
+ Received

  [
    "NETFLIX.COM_0",
-   "NETFLIX.COM_1",
  ]
```

**Counterexample decoded:** one `NETFLIX.COM` statement holds two weekly series —
series 0 at ~2006–2026 cents and series 1 at 2207 cents (within 10% of each
other). In the original order the engine forms a single cluster
(`NETFLIX.COM_0`); after the permutation it forms two (`NETFLIX.COM_0`,
`NETFLIX.COM_1`). The vampire ids (and therefore bite memberships) depend on
input order — exactly the order-dependence bug.

### After (fix)

**Code change (`src/engine/grouper.ts`):** at the very start of
`clusterByAmount`, before the initial seeding loop, the input bites are copied
and sorted into a **canonical order** and that sorted copy is used for *both* the
seeding loop and every iterative k-medians reassignment pass:

```ts
const sorted = [...bites].sort((a, b) => {
  if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
});
```

Canonical sort key: `amountCents` **ascending**, then `date` **ascending**
(`localeCompare` on the ISO `YYYY-MM-DD` string), then `id` **ascending**
(`localeCompare`). The sort is applied to a **copy** (`[...bites]`), so the
caller's array is never mutated. Because both loops now iterate `sorted` instead
of the raw `bites`, seeding and tie-breaking always encounter near-boundary
(within ~10%) same-merchant amounts in the same deterministic sequence, so
cluster membership no longer depends on input order.

No public signatures changed (`clusterByAmount`, `groupByMerchant`,
`buildCandidates` are untouched in shape). The post-clustering "sort clusters
ascending by median" step in `groupByMerchant`/`buildCandidates` remains the
cluster-index convention, and Step 2b merge logic plus the
`computeMedian`/`isWithinTolerance`/`absPctDiff` helpers are unchanged.

Result: Property 3b now **passes at 1000 runs** — identical sorted vampire ids
and identical per-cluster bite memberships across every random permutation —
Properties 3/4/5/8 still pass (Property 3's and 5's ≥ 80% coverage guards still
hold), and the full suite is green: **16 test files / 243 tests passed**, with
`npx tsc -b` clean.
