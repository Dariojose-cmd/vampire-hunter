# Design Document

## Overview

Vampire Hunter is a fully client-side single-page application (SPA) that detects recurring bank charges ("vampire subscriptions") from an uploaded CSV file and presents them in a spooky, gamified UI. All processing happens in the browser; no transaction data ever leaves the user's device.

The application is built with Vite + React 18 + TypeScript (strict mode), styled with CSS modules and CSS custom-property design tokens, animated with Framer Motion, and deployed as a static site on AWS Amplify Hosting. CSV parsing is handled by Papa Parse. Tests use Vitest + fast-check for property-based coverage of the pure detection engine.

### Core Data Flow

```
CSV file (local)
  │
  ▼
Papa Parse → raw rows (string[][])
  │
  ▼
Column Classifier → { date, description, amount, currency? }
  │
  ▼
Row Parser → Transaction[] (cents, ISO date, debit/credit tag)
  │
  ▼
Debit Filter → Transaction[] (credits excluded)
  │
  ▼
Normalizer → Transaction[] (normalized descriptions)
  │
  ▼
Grouper → Map<normalizedName, Transaction[]>
  │
  ▼
Cadence Detector → RecurrenceCandidate[]
  │
  ▼
Scorer → ScoredCandidate[]
  │
  ▼
Catalog Matcher → Vampire[]
  │
  ▼
React UI (Crypt screen, VampireCards, BloodMeter, actions)
  │
  ▼
localStorage (user decisions only — no transaction data)
```

---

## Architecture

### Module Boundaries

The application is split into three strict layers:

| Layer | Path | Allowed Dependencies |
|---|---|---|
| Engine | `src/engine/` | Pure TypeScript only. No React, no DOM, no fetch. |
| Data | `src/data/` | Static JSON only. |
| UI | `src/components/`, `src/i18n/`, `src/styles/` | React, Framer Motion, engine (read-only), data. |

The engine layer has zero UI imports. Every engine function is a pure function (same inputs → same outputs, no side effects). This is the boundary that makes property-based testing effective.

### File Organization

```
vampire-hunter/
├── src/
│   ├── engine/
│   │   ├── parser.ts          # CSV row → Transaction
│   │   ├── normalizer.ts      # Description cleaning
│   │   ├── grouper.ts         # Group by normalized name
│   │   ├── cadenceDetector.ts # Gap analysis → Cadence
│   │   ├── scorer.ts          # Confidence score computation
│   │   ├── catalogMatcher.ts  # Catalog lookup
│   │   ├── profileBuilder.ts  # Annual loss, threat level, next bite, avatar
│   │   ├── currencyUtils.ts   # Currency detection, threshold conversion
│   │   ├── icsGenerator.ts    # ICS calendar file builder
│   │   └── index.ts           # Public API: runDetection()
│   ├── data/
│   │   ├── catalog.json       # ~60 known services
│   │   └── exchangeRates.json # Static USD→other rate table
│   ├── components/
│   │   ├── App.tsx
│   │   ├── Uploader.tsx
│   │   ├── ColumnMapper.tsx
│   │   ├── Crypt.tsx
│   │   ├── VampireCard.tsx
│   │   ├── BloodMeter.tsx
│   │   ├── StakeModal.tsx
│   │   ├── GarlicButton.tsx
│   │   ├── SpareButton.tsx
│   │   ├── LanguageSwitch.tsx
│   │   ├── CurrencySelector.tsx
│   │   ├── EmptyState.tsx
│   │   └── BurnButton.tsx
│   ├── i18n/
│   │   ├── en.json
│   │   └── es.json
│   └── styles/
│       ├── tokens.css
│       └── global.css
├── samples/
│   ├── us-bank-usd.csv
│   ├── latam-bank-mxn.csv
│   ├── latam-bank-cop.csv
│   └── messy-statement.csv
└── tests/
    ├── parser.test.ts
    ├── normalizer.test.ts
    ├── cadenceDetector.test.ts
    ├── scorer.test.ts
    ├── profileBuilder.test.ts
    └── detection.property.test.ts
```

---

## Components and Interfaces

### Component Tree

```
App
├── LanguageSwitch
├── CurrencySelector
├── Uploader (shown when no detection results)
│   ├── DropZone
│   └── SamplePicker
├── ColumnMapper (shown when auto-detection fails)
└── Crypt (shown when detection results exist)
    ├── BloodMeter
    ├── FilterBar
    ├── VampireCard (×N)
    │   ├── VampireAvatar
    │   ├── BitesHistory
    │   ├── StakeButton → StakeModal
    │   ├── SpareButton
    │   └── GarlicButton
    └── BurnButton
```

### Key Component Responsibilities

| Component | Responsibility |
|---|---|
| `App` | Top-level state orchestration: detection results, user decisions, language, currency |
| `Uploader` | File drop zone + sample picker; calls Papa Parse; passes raw CSV to engine |
| `ColumnMapper` | Manual column assignment when auto-detection fails |
| `Crypt` | Main vampire display; sorting, filtering, Blood Meter |
| `VampireCard` | Single vampire profile card with all actions |
| `BloodMeter` | Animated bar showing total annual drain vs. blood saved |
| `StakeModal` | Cancel instructions, cancellation email draft, copy button |
| `BurnButton` | "Burn the Crypt" with confirmation prompt |
| `LanguageSwitch` | Toggles `en`/`es`; persisted in localStorage |
| `CurrencySelector` | Override detected currency; persisted in localStorage |
| `grouper.ts` | Group by normalized name; two-pass amount clustering with non-overlapping price-increase merge |

---

## Data Models

All monetary values are stored as **integer cents**. Dates are stored as **ISO 8601 strings** (`YYYY-MM-DD`).

```typescript
// --- Raw parsing ---

type ColumnLayout =
  | { type: 'single'; amountCol: number; dateCol: number; descCol: number }
  | { type: 'split'; debitCol: number; creditCol: number; dateCol: number; descCol: number };

interface ParsedRow {
  rawDate: string;
  rawDescription: string;
  rawAmount: string;      // may use comma or dot decimal
  rawCurrency?: string;   // optional column
}

// --- Core domain ---

type TransactionType = 'debit' | 'credit';

interface Transaction {
  id: string;             // deterministic hash of row index + description
  date: string;           // ISO 8601
  description: string;    // original, unmodified
  normalizedName: string; // output of Normalizer
  amountCents: number;    // positive integer; always > 0
  type: TransactionType;
  currency: string;       // ISO 4217 code, e.g. 'USD'
}

type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface RecurrenceCandidate {
  normalizedName: string;
  bites: Transaction[];   // all charge instances, sorted by date asc
  cadence: Cadence;
  medianAmountCents: number;
  isAmountStable: boolean;
  hasFreeTrial: boolean;
  hasPriceIncrease: boolean;
  amountHistory: number[]; // cents per bite, chronological
}

interface ScoredCandidate extends RecurrenceCandidate {
  confidenceScore: number; // integer 0–100
}

type ThreatLevel = 'Low' | 'Medium' | 'High' | 'Critical';

interface CatalogEntry {
  id: string;
  canonicalName: string;
  aliases: string[];       // normalized aliases for matching
  cancelUrl: string;
  cancelSteps: string[];   // step-by-step instructions
  logoUrl?: string;        // optional bundled asset path
}

interface Vampire {
  id: string;              // stable identifier derived from normalizedName
  normalizedName: string;
  displayName: string;     // canonical name if catalog match, else normalizedName
  cadence: Cadence;
  bites: Transaction[];
  medianAmountCents: number;
  annualBloodLossCents: number;
  threatLevel: ThreatLevel;
  firstBiteDate: string;   // ISO 8601
  lastBiteDate: string;    // ISO 8601
  nextBiteDate: string;    // ISO 8601, predicted
  confidenceScore: number;
  isAmountStable: boolean;
  hasFreeTrial: boolean;
  hasPriceIncrease: boolean;
  amountHistory: number[];
  catalogEntry?: CatalogEntry;
  avatarSvg: string;       // deterministically generated SVG string
  currency: string;        // ISO 4217
}

// --- User decisions ---

type DecisionType = 'staked' | 'spared' | 'garlic' | null;

interface UserDecision {
  vampireId: string;
  decision: DecisionType;
  decidedAt: string;       // ISO 8601 timestamp
}

// --- Persistence (localStorage schema) ---

interface CryptStorage {
  decisions: Record<string, UserDecision>; // keyed by vampireId
  language: 'en' | 'es';
  currency: string;        // ISO 4217 override
}

// localStorage key: 'vampire-hunter:crypt'
// Value: JSON.stringify(CryptStorage)

// --- Detection engine public API ---

interface DetectionInput {
  transactions: Transaction[];
  currency: string;
}

interface DetectionResult {
  vampires: Vampire[];          // confidenceScore >= 60
  possibleVampires: Vampire[];  // confidenceScore 1–59
}

function runDetection(input: DetectionInput): DetectionResult;
```

---

## Detection Engine Pipeline

### 1. CSV Parsing (`parser.ts`)

**Column auto-detection heuristics:**

| Signal | Weight |
|---|---|
| Header contains "date", "fecha", "data" | High |
| Header contains "desc", "concept", "narrat", "detail" | High |
| Header contains "amount", "monto", "importe", "valor" | High |
| Column values match date regex | High |
| Column values are mostly numeric | High |

If any required column cannot be resolved with high confidence, return a `ColumnMappingNeeded` signal that triggers the `ColumnMapper` UI.

**Amount parsing (`parseCents`):**

**Number format inference is done at the column level, not per value.** Before parsing individual amounts, the parser inspects the entire amount column to determine the number format.

```
inferNumberFormat(column: string[]): 'dotDecimal' | 'commaDecimal' | 'noDecimal'
  For each non-empty value in the column:
    - Extract any separator characters ('.' or ',') and what follows them
    - If ANY separator is always followed by exactly 3 digits across ALL its occurrences in the column
      → that separator is a thousands separator (not decimal)
      → if the other separator appears → it is the decimal separator
      → if no other separator appears → format is 'noDecimal' (integer amounts)
    - If a separator is sometimes followed by 1-2 digits → it is a decimal separator
  Examples:
    ["45.900", "12.500", "1.200.000"] → dot is thousands separator, format is 'noDecimal'
    ["45,90", "12,50", "1.200,00"]   → dot is thousands, comma is decimal → 'commaDecimal'
    ["45.90", "12.50"]               → dot is decimal → 'dotDecimal'

parseCents(s: string, format: NumberFormat): number
  1. Strip all whitespace and currency symbols
  2. Apply format:
     - 'dotDecimal': remove commas (thousands), parse dot as decimal
     - 'commaDecimal': remove dots (thousands), replace comma with dot, parse as decimal
     - 'noDecimal': remove all dots and commas, parse as integer
  3. Multiply by 100 if not already integer (i.e., dotDecimal/commaDecimal), round to nearest int
  4. Return absolute value (sign handled separately by debit/credit logic)
```

**Date parsing (`parseDate`):**

```
parseDate(s: string, format: DateFormat): Result<string, AppError>
  Supported formats: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  On success: returns { ok: true, value: 'YYYY-MM-DD' }  (ISO 8601 string)
  On failure: returns { ok: false, error: { code: 'PARSE_FAILED', message: '...' } }
  Never throws.
  Consistent with the engine no-throw rule: all engine functions return Result<T, AppError>.
```

**Format disambiguation:**

```
inferDateFormat(column: string[]): DateFormat | 'ambiguous'
  For each value in column:
    parse as DD/MM and MM/DD
    if first segment > 12 in any row → must be DD/MM/YYYY
    if second segment > 12 in any row → must be MM/DD/YYYY
  If neither signal found → 'ambiguous' (ask user)
```

### 2. Debit Classification

A transaction is a **debit** if:
- Single-column layout: parsed amount is negative (stored as positive cents with `type: 'debit'`)
- Zero amounts (0.00) are classified as debits, because free trials appear as 0.00 charges on bank statements. This lets the free-trial conversion be detected.
- Two-column layout: value is in the debit column

All credits (`type: 'credit'`) are filtered out before entering the detection pipeline.

### 3. Normalization (`normalizer.ts`)

Applied sequentially to each description string:

```
normalize(s: string): string
  1. Uppercase all characters
  2. Remove noise keywords (POS, PURCHASE, COMPRA, PAGO, CARGO, DEBIT, PAYMENT) — word-boundary match, case-insensitive
  3. Remove card-number patterns: sequences of 4+ consecutive digits
  4. Remove reference-code patterns: alphanumeric tokens of 6+ chars at start/end of string
  5. Collapse consecutive whitespace → single space
  6. Trim leading/trailing whitespace
  7. Return result
```

The function is **idempotent**: `normalize(normalize(s)) === normalize(s)` for all inputs (Property 1).

### 4. Grouping (`grouper.ts`)

```
groupByMerchant(transactions: Transaction[]): Map<string, Transaction[]>

  Step 1 — Primary grouping: group all transactions by normalizedName.

  Step 2 — Intra-merchant amount clustering (two-pass):

    Step 2a — Amount-based cluster assignment:
      For each bite in the primary group (order does not matter):
        Compare bite.amountCents against the latest median of EVERY existing cluster.
        If bite.amountCents is within 10% of exactly one cluster's latest median → add to that cluster.
        If within 10% of multiple clusters → add to the closest one (smallest absolute % difference).
        If within 10% of no cluster → create a new cluster containing just this bite.
      Each cluster accumulates its own running median as bites are added.

    Step 2b — Price-increase merge (non-overlapping clusters only):
      Two clusters A and B may be merged if ALL of the following hold:
        1. They do not overlap in time: every bite in A is dated strictly before every bite in B.
        2. B's first bite amount is higher than A's last bite amount by no more than 50%.
           (i.e., B_first ≤ A_last × 1.5)
        3. The amount increase is monotonically upward (B's median > A's median).
      If merge conditions hold → combine A and B into a single cluster with hasPriceIncrease = true.
      Overlapping clusters ALWAYS remain separate vampires regardless of amounts.

  Step 3 — Each resulting cluster becomes an independent RecurrenceCandidate.
    Cluster ID is derived from: normalizedName + "_" + cluster index (0-based), used as vampireId.

  Key invariants:
    - "APPLE.COM/BILL" with interleaved bites at $2.99 (Jan 1), $10.99 (Jan 5), $2.99 (Feb 1),
      $10.99 (Feb 5): Step 2a assigns to two amount clusters ($2.99 cluster, $10.99 cluster).
      Step 2b: clusters overlap in time → NO merge → two vampires. ✓
    - "NETFLIX" with sequential bites at $13.99 (Jan), $15.49 (Apr), $17.99 (Jul):
      Step 2a: $13.99 and $15.49 are within 10%? No (10.7% difference) → two clusters initially.
      Step 2b: clusters do NOT overlap (Jan bites before Apr bites), $15.49 ≤ $13.99 × 1.5 → merge.
      Result: one cluster with hasPriceIncrease = true. ✓
    - Two different products from same merchant with non-overlapping dates but a 200% price difference:
      Step 2b condition 2 fails (B_first > A_last × 1.5) → remain two separate vampires. ✓
```

### 5. Cadence Detection (`cadenceDetector.ts`)

For each group with ≥ 2 transactions:

```
detectCadence(dates: string[]): Cadence | null
  1. Sort dates ascending
  2. Compute gaps in days between consecutive dates
  3. Compute median gap
  4. Match median gap to cadence buckets:
     [5,  9]   → 'weekly'
     [26, 35]  → 'monthly'
     [85, 97]  → 'quarterly'
     [355,375] → 'yearly'
  5. Require ≥ 60% of gaps fall within the matched bucket (noise tolerance)
  6. Return null if no bucket matches or group has < 2 transactions
```

Groups with exactly 1 transaction always return `null` (no-singleton rule, Property 4).

**Free-trial detection:**
If `bites[0].amountCents === 0` or `bites[0].amountCents < 0.2 * medianAmount`, flag `hasFreeTrial = true`.

**Price-increase detection:**
If amounts are monotonically non-decreasing with at least one increase > 5%, flag `hasPriceIncrease = true`.

**Amount stability:**
A candidate is stable if all bite amounts are within 10% of the median bite amount (after excluding potential free-trial first charge).

### 6. Confidence Scoring (`scorer.ts`)

Score starts at 0 and accumulates points:

| Signal | Points |
|---|---|
| Number of bites: 2 | +20 |
| Number of bites: 3–5 | +30 |
| Number of bites: ≥ 6 | +40 |
| Cadence regularity (< 2 day gap variance) | +20 |
| Amount stable | +20 |
| Catalog match | +20 |

Score is clamped to `[0, 100]` (Property 6).

### 7. Catalog Matching (`catalogMatcher.ts`)

```
matchCatalog(normalizedName: string, catalog: CatalogEntry[]): CatalogEntry | undefined
  For each entry in catalog:
    Prepare a word-boundary regex for the canonical name and each alias:
      pattern = /\b{term}\b/i   (where {term} is the canonical name or alias, regex-escaped)
    Test pattern against normalizedName.
    If any pattern matches → return this entry.
  Return undefined if no entry matches.

  Example:
    alias "MAX" with pattern /\bMAX\b/ matches "HBO MAX" but NOT "MAXI DESPENSA".
    alias "APPLE" with pattern /\bAPPLE\b/ matches "APPLE.COM BILL" but NOT "SNAPPLE BEVERAGES".
```

### 8. Profile Building (`profileBuilder.ts`)

**Annual Blood Loss:**
```
annualBloodLossCents(medianCents: number, cadence: Cadence): number
  Multipliers: weekly×52, monthly×12, quarterly×4, yearly×1
  Return medianCents * multiplier
```

**Threat Level:**
Thresholds are defined in USD cents and converted by the active exchange rate.

```
threatLevelFromCents(annualCents: number, rateToUsd: number): ThreatLevel
  annualUsd = annualCents / 100 / rateToUsd   // convert to USD
  if annualUsd < 50    → 'Low'
  if annualUsd < 200   → 'Medium'
  if annualUsd < 500   → 'High'
  else                 → 'Critical'
```

**Next Bite Prediction:**
```
predictNextBite(lastBiteDate: string, cadence: Cadence): string
  Interval days: weekly=7, monthly=30, quarterly=91, yearly=365
  Return addDays(lastBiteDate, interval) as ISO 8601
```

**Avatar Generation (`generateAvatar`):**
Generates a deterministic SVG from the normalized name using a seeded hash:

```
generateAvatar(normalizedName: string): string
  1. Compute 32-bit FNV-1a hash of normalizedName
  2. Derive: eye style (0–3), fang style (0–2), cape color (palette of 8), skin tone (4 options)
  3. Compose SVG string from static templates + derived values
  4. Return SVG string
```

Same input always produces the same SVG (Property 8).

---

## Currency Detection and Threshold Conversion

### Auto-Detection

The parser scans the amount column (or a dedicated currency column) for:
- Currency symbols: `$`, `€`, `£`, `¥`, `₩`, `R$`, `S/`, `COP`, `CLP`, etc.
- ISO 4217 codes in column headers or values

The first unambiguous match sets the active currency. If the symbol `$` appears and the locale cannot be inferred, default to `USD` and display the currency selector prominently.

### Static Exchange Rate Table (`exchangeRates.json`)

```json
{
  "USD": 1.0,
  "MXN": 17.5,
  "COP": 4000.0,
  "ARS": 900.0,
  "CLP": 950.0,
  "EUR": 0.92,
  "BRL": 5.0,
  "GBP": 0.79,
  "CAD": 1.36,
  "PEN": 3.75
}
```

These are approximate rates hardcoded as a constant. No network calls are made at runtime.

**Threshold conversion formula:**

```
thresholdInCurrency(usdThreshold: number, currency: string): number
  rate = exchangeRates[currency] ?? 1.0
  return usdThreshold * rate
```

Threat level boundaries in local currency:
| Level | USD | MXN (×17.5) | COP (×4000) |
|---|---|---|---|
| Low | < $50 | < $875 | < $200,000 |
| Medium | $50–$199 | $875–$3,482 | $200k–$796k |
| High | $200–$499 | $3,500–$8,732 | $800k–$2M |
| Critical | ≥ $500 | ≥ $8,750 | ≥ $2M |

The monotonicity invariant (`threatLevel` is non-decreasing with `annualBloodLoss`) holds regardless of which currency multiplier is applied (Property 7).

---

## Persistence Strategy

### localStorage Schema

Single key: `vampire-hunter:crypt`

```typescript
{
  "decisions": {
    "vampire-id-abc": {
      "vampireId": "vampire-id-abc",
      "decision": "staked",
      "decidedAt": "2024-11-01T14:30:00.000Z"
    }
  },
  "language": "en",
  "currency": "MXN"
}
```

**Rules:**
- Raw transaction data, CSV contents, and detection results are **never** persisted
- Detection always runs fresh from the uploaded file on each session
- Decisions from storage are overlaid onto freshly detected Vampires by matching `vampireId`
- `vampireId` is derived deterministically from `normalizedName` so decisions survive re-uploads of the same file

### "Burn the Crypt"

```
burnCrypt():
  1. Show confirmation modal
  2. On confirm: localStorage.removeItem('vampire-hunter:crypt')
  3. Clear all React state
  4. Navigate to empty-state / upload screen
```

---

## Animation Strategy

All animations use **Framer Motion** with automatic reduced-motion support.

### Reduced Motion Detection

```typescript
// useReducedMotion hook (from Framer Motion)
const shouldReduceMotion = useReducedMotion();

const stakeVariants = {
  alive: { opacity: 1, scale: 1, filter: 'none' },
  dusted: shouldReduceMotion
    ? { opacity: 0, transition: { duration: 0.3 } }           // simple fade ≤ 300ms
    : { opacity: 0, scale: 0.8, filter: 'blur(8px) grayscale(1)',
        transition: { duration: 0.6, ease: 'easeOut' } }      // full dust effect
};
```

### Animation Inventory

| Animation | Component | Description |
|---|---|---|
| Stake (dust) | `VampireCard` | Card dissolves to ash; reduced-motion: opacity fade ≤ 300ms |
| Card entrance | `VampireCard` | Stagger-in with `whileInView` as crypt loads |
| Blood Meter fill | `BloodMeter` | Animated width on initial render and on stake events |
| Garlic pulse | `GarlicButton` | Subtle pulse when garlic is active |
| Upload drag | `Uploader` | Scale + glow on drag-over |

---

## Accessibility Design

### ARIA and Keyboard Navigation

Every interactive element is a native `<button>` or `<input>` (no div-click hacks), ensuring native keyboard access and focus management.

```html
<!-- VampireCard action buttons -->
<button
  aria-label="Stake Netflix – cancel this subscription"
  onClick={handleStake}
>
  🧛 Stake
</button>

<button
  aria-label="Spare Netflix – keep this subscription"
  onClick={handleSpare}
>
  🦇 Spare
</button>

<button
  aria-label="Set garlic reminder for Netflix – next charge on Dec 15"
  onClick={handleGarlic}
>
  🧄 Garlic
</button>
```

**VampireCard ARIA region:**
```html
<article
  role="article"
  aria-label="Netflix – Critical threat – $144 per year"
>
```

### Focus Management

- `StakeModal` traps focus when open and returns focus to the Stake button on close (using Framer Motion's `AnimatePresence` + `autoFocus` on the first focusable element)
- `ColumnMapper` sets focus to the first unresolved select on mount
- After "Burn the Crypt" confirmation, focus returns to the upload drop zone

### Color Contrast

Design tokens enforce WCAG 2.1 AA minimums:

```css
:root {
  --color-bg:           #0d0d1a;   /* deep night */
  --color-surface:      #1a1a2e;
  --color-text:         #e8e0f0;   /* contrast 13:1 on bg */
  --color-text-muted:   #a89bc0;   /* contrast 5.2:1 on bg */
  --color-accent:       #c0392b;   /* blood red */
  --color-accent-light: #e74c3c;
  --color-low:          #27ae60;
  --color-medium:       #f39c12;
  --color-high:         #e67e22;
  --color-critical:     #c0392b;
  --color-focus:        #f0e68c;   /* high-visibility focus ring */
}

*:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
```

---

## Responsive Layout

Minimum supported width: **360 px**.

```css
/* Crypt grid */
.crypt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-4);
}

/* Stacks to single column at 360px */
@media (max-width: 480px) {
  .crypt-grid {
    grid-template-columns: 1fr;
  }
  .vampire-card__actions {
    flex-direction: column;
    gap: var(--space-2);
  }
}
```

All information and actions available on hover are also accessible via `:focus-visible` or tap (no hover-only interactions).

---

## Sample CSV Files

All dates span **May–October 2026** so predicted next bites are always in the future. All files contain **only synthetic data** — no real personal financial information.

### `samples/us-bank-usd.csv`

US format: `MM/DD/YYYY` dates (charge days include 14, 17, 21, 27, 28 — unambiguous day-first vs month-first), dot decimal, single amount column (negative = debit), USD.
Contains: Netflix (price increase from $15.49 → $17.99 after 2 months), Spotify, two `APPLE.COM/BILL` lines per month at different amounts ($2.99 iCloud and $10.99 Apple Music interleaved → two separate vampires), Amazon Prime, Planet Fitness gym, AT&T mobile, a weekly Green Chef meal-box ($6.99/week), a HelloFresh free trial ($0.00) that converts to $12.99/month, a one-time Costco annual membership ($139.00 in May 2026 with a prior charge from May 2025 visible as a second yearly bite), salary credits, and two one-time charges.

### `samples/latam-bank-mxn.csv`

Latin American format: `DD/MM/YYYY` dates, comma decimal (e.g. `"-259,00"`), Spanish noise words (`COMPRA`, `CARGO`, `PAGO`), MXN.
Contains: Netflix, Spotify, Disney+, Blim TV (local streaming), Smart Fit gym chain, salary credits, and transfers.

### `samples/latam-bank-cop.csv`

Colombian format: `DD/MM/YYYY` dates, dot thousands separator with no decimals (e.g. `"-44.900"`, `"3.500.000"`), Spanish descriptions, COP.
Contains: Netflix, Spotify, SmartFit gym, Claro mobile carrier, salary credits, and one-time purchases.

### `samples/messy-statement.csv`

Stress-test file combining: `DD/MM/YYYY` and `YYYY-MM-DD` date formats in the same column (never MM/DD in the same file as DD/MM — that would be unresolvable), extra whitespace in all headers, amounts with embedded `$`/`USD` symbols in cells, one blank row, and a duplicate header row mid-file. Still includes detectable monthly Netflix, Spotify, and gym recurring charges.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The properties below are verified using **Vitest + fast-check**. Each property-based test runs a minimum of 100 iterations.

---

### Property 1: Normalization Idempotence

*For any* string `s`, applying the Normalizer twice produces the same result as applying it once: `normalize(normalize(s)) === normalize(s)`.

**Validates: Requirements 2.6**

**fast-check generator sketch:**
```typescript
fc.property(fc.string(), (s) => {
  expect(normalize(normalize(s))).toBe(normalize(s));
});
```

---

### Property 2: Monthly Cadence Detection

*For any* sequence of two or more dates where every consecutive gap is between 26 and 35 days, `detectCadence` returns `'monthly'`.

**Validates: Requirements 4.2, 4.4**

**fast-check generator sketch:**
```typescript
fc.property(
  fc.integer({ min: 2, max: 24 }),
  fc.integer({ min: 26, max: 35 }),
  (count, gap) => {
    const startMs = new Date('2023-01-01').getTime();
    const dates = Array.from({ length: count }, (_, i) =>
      new Date(startMs + i * gap * 86_400_000).toISOString().slice(0, 10)
    );
    expect(detectCadence(dates)).toBe('monthly');
  }
);
```

---

### Property 3: Order Independence

*For any* set of transactions, shuffling the input in any order produces the same set of detected Vampires (same IDs, same cadences, same scores).

**Validates: Requirements 4.8**

**fast-check generator sketch:**
```typescript
fc.property(
  fc.array(arbitraryTransaction(), { minLength: 2, maxLength: 50 }),
  (transactions) => {
    const shuffled = [...transactions].sort(() => Math.random() - 0.5);
    const r1 = runDetection({ transactions, currency: 'USD' });
    const r2 = runDetection({ transactions: shuffled, currency: 'USD' });
    const ids1 = r1.vampires.map(v => v.id).sort();
    const ids2 = r2.vampires.map(v => v.id).sort();
    expect(ids1).toEqual(ids2);
  }
);
```

---

### Property 4: No-Singleton Rule

*For any* merchant that appears in exactly one transaction, it is never included in the Vampire or Possible Vampire output.

**Validates: Requirements 4.3, 4.9**

**fast-check generator sketch:**
```typescript
fc.property(arbitraryTransaction(), (txn) => {
  const result = runDetection({ transactions: [txn], currency: 'USD' });
  const allVampires = [...result.vampires, ...result.possibleVampires];
  const found = allVampires.some(v => v.normalizedName === txn.normalizedName);
  expect(found).toBe(false);
});
```

---

### Property 5: Credit Exclusion

*For any* transaction with `type === 'credit'`, it never appears as a Bite in any Vampire or Possible Vampire output.

**Validates: Requirements 1.17, 4.10**

**fast-check generator sketch:**
```typescript
fc.property(
  fc.array(arbitraryTransaction(), { minLength: 1, maxLength: 50 }),
  (transactions) => {
    const withCredit = transactions.map((t, i) =>
      i === 0 ? { ...t, type: 'credit' as const } : t
    );
    const result = runDetection({ transactions: withCredit, currency: 'USD' });
    const allBites = [...result.vampires, ...result.possibleVampires]
      .flatMap(v => v.bites);
    const creditBite = allBites.find(b => b.type === 'credit');
    expect(creditBite).toBeUndefined();
  }
);
```

---

### Property 6: Confidence Score Range

*For any* recurring candidate passed through the scorer, `score(candidate)` returns an integer in `[0, 100]`.

**Validates: Requirements 5.1**

**fast-check generator sketch:**
```typescript
fc.property(arbitraryCandidate(), (candidate) => {
  const score = computeScore(candidate);
  expect(Number.isInteger(score)).toBe(true);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});
```

---

### Property 7: Threat Level Monotonicity

*For any* two Vampires A and B, if `annualBloodLoss(A) > annualBloodLoss(B)` then `threatLevel(A) >= threatLevel(B)` in the ordering `Low < Medium < High < Critical`.

**Validates: Requirements 6.3, 14.5**

**fast-check generator sketch:**
```typescript
const THREAT_ORDER = { Low: 0, Medium: 1, High: 2, Critical: 3 };
fc.property(
  fc.integer({ min: 0, max: 10_000_000 }),
  fc.integer({ min: 0, max: 10_000_000 }),
  (centsA, centsB) => {
    const levelA = computeThreatLevel(centsA, 'USD');
    const levelB = computeThreatLevel(centsB, 'USD');
    if (centsA > centsB) {
      expect(THREAT_ORDER[levelA]).toBeGreaterThanOrEqual(THREAT_ORDER[levelB]);
    }
  }
);
```

---

### Property 8: Avatar Determinism

*For any* normalized name `n`, `generateAvatar(n)` always returns the same SVG string.

**Validates: Requirements 6.5**

**fast-check generator sketch:**
```typescript
fc.property(fc.string({ minLength: 1 }), (name) => {
  expect(generateAvatar(name)).toBe(generateAvatar(name));
});
```

---

### Property 9: Amount Cents Integrity

*For any* amount string (using dot or comma as decimal separator), `parseCents(s)` returns an integer with no fractional part.

**Validates: Requirements 1.8, 1.12**

**fast-check generator sketch:**
```typescript
const arbitraryAmountString = fc.oneof(
  // dot decimal: "1234.56"
  fc.tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 99 }))
    .map(([i, d]) => `${i}.${String(d).padStart(2, '0')}`),
  // comma decimal: "1234,56"
  fc.tuple(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 99 }))
    .map(([i, d]) => `${i},${String(d).padStart(2, '0')}`)
);

fc.property(arbitraryAmountString, (s) => {
  const cents = parseCents(s);
  expect(Number.isInteger(cents)).toBe(true);
});
```

---

### Property 10: Cadence Tolerance Coverage

*For any* gap `g` in the defined tolerance windows, `detectCadence` correctly classifies the cadence:
- `g ∈ [5, 9]` → `'weekly'`
- `g ∈ [26, 35]` → `'monthly'`
- `g ∈ [85, 97]` → `'quarterly'`
- `g ∈ [355, 375]` → `'yearly'`

**Validates: Requirements 4.2**

**fast-check generator sketch:**
```typescript
const CADENCE_RANGES: [number, number, Cadence][] = [
  [5, 9, 'weekly'],
  [26, 35, 'monthly'],
  [85, 97, 'quarterly'],
  [355, 375, 'yearly'],
];

for (const [min, max, expected] of CADENCE_RANGES) {
  it(`detects ${expected} for gaps [${min},${max}]`, () => {
    fc.assert(
      fc.property(
        fc.integer({ min, max }),
        fc.integer({ min: 2, max: 12 }),
        (gap, count) => {
          const startMs = new Date('2023-01-01').getTime();
          const dates = Array.from({ length: count }, (_, i) =>
            new Date(startMs + i * gap * 86_400_000).toISOString().slice(0, 10)
          );
          expect(detectCadence(dates)).toBe(expected);
        }
      )
    );
  });
}
```

---

### Property 11: Thousands-Separator Detection

*For any* column of amount strings where a single separator is consistently followed by exactly 3 digits, that separator is classified as a thousands separator and `parseCents` returns the correct integer (e.g., "45.900" → 4590000 cents, not 4590).

**Validates: Requirements 1.8, 1.12**

**fast-check generator sketch:**
```typescript
// Generate amounts like "45.900" or "1.200.000" (dot = thousands, no decimal part)
const arbitraryThousandsDotAmount = fc.integer({ min: 1000, max: 99_999_999 })
  .map(n => n.toLocaleString('de-DE').replace(/,/g, '')); // e.g. "45.900"

fc.property(
  fc.array(arbitraryThousandsDotAmount, { minLength: 2, maxLength: 20 }),
  (column) => {
    const format = inferNumberFormat(column);
    expect(format).toBe('noDecimal');
    // Each value parsed as integer, no phantom decimals
    for (const val of column) {
      const numeric = parseInt(val.replace(/\./g, ''), 10);
      expect(parseCents(val, format)).toBe(numeric * 100);
    }
  }
);
```

---

### Property 12: Intra-Merchant Clustering Correctness

Two sub-properties verified together:

**12a — Interleaved series → two vampires:**
*For any* two amount values A ≠ B (differing by more than 10%) and any count n ≥ 2,
interleaving n charges at amount A with n charges at amount B from the same normalized merchant name
always produces exactly two RecurrenceCandidates (two vampires), never one.

**12b — Sequential price step → one vampire:**
*For any* base amount A and a stepped amount B where B ≤ A × 1.5 and B > A,
a series of n ≥ 2 charges at amount A followed by m ≥ 2 charges at amount B (no date overlap)
always produces exactly one RecurrenceCandidate with hasPriceIncrease = true.

**Validates: Requirements 4.5, 4.6**

**fast-check generator sketch:**
```typescript
// 12a: interleaved different-amount charges → 2 vampires
fc.property(
  fc.integer({ min: 100, max: 50_000 }),   // amountA in cents
  fc.integer({ min: 2, max: 6 }),           // count per series
  (amountA, n) => {
    const amountB = Math.round(amountA * 2.5); // clearly different (>10%)
    const merchant = 'APPLE.COM BILL';
    const startMs = new Date('2023-01-01').getTime();
    // interleave: A on day 0, B on day 4, A on day 30, B on day 34, ...
    const transactions: Transaction[] = [];
    for (let i = 0; i < n; i++) {
      transactions.push(makeDebit(merchant, amountA, startMs + i * 30 * 86_400_000));
      transactions.push(makeDebit(merchant, amountB, startMs + i * 30 * 86_400_000 + 4 * 86_400_000));
    }
    const groups = groupByMerchant(transactions);
    const candidates = [...groups.values()].flat();
    // Should produce exactly 2 clusters for this merchant
    const merchantClusters = getClustersForMerchant(groups, merchant);
    expect(merchantClusters.length).toBe(2);
  }
);

// 12b: sequential price step → 1 vampire with hasPriceIncrease
fc.property(
  fc.integer({ min: 100, max: 50_000 }),                        // amountA in cents
  fc.float({ min: 1.01, max: 1.50 }).map(f => Math.round),      // step factor ≤ 1.5
  fc.integer({ min: 2, max: 6 }),                                // n charges at amountA
  fc.integer({ min: 2, max: 6 }),                                // m charges at amountB
  (amountA, factor, n, m) => {
    const amountB = Math.round(amountA * (1 + (factor * 0.49))); // between A and A×1.5
    const merchant = 'NETFLIX';
    const startMs = new Date('2023-01-01').getTime();
    const transactions: Transaction[] = [
      ...Array.from({ length: n }, (_, i) =>
        makeDebit(merchant, amountA, startMs + i * 30 * 86_400_000)),
      ...Array.from({ length: m }, (_, j) =>
        makeDebit(merchant, amountB, startMs + (n + j) * 30 * 86_400_000)),
    ];
    const groups = groupByMerchant(transactions);
    const merchantClusters = getClustersForMerchant(groups, merchant);
    expect(merchantClusters.length).toBe(1);
    expect(merchantClusters[0].hasPriceIncrease).toBe(true);
  }
);
```

---

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| File is not a valid CSV | Show `ParseError` message in upload zone; no crash |
| Column auto-detection fails | Render `ColumnMapper` UI for manual assignment |
| Date format ambiguous | Add "date format" field to `ColumnMapper` UI |
| Date value cannot be parsed | `parseDate` returns `{ ok: false, error: { code: 'PARSE_FAILED' } }`; row is skipped; skipped count included in summary |
| Amount cannot be parsed | Skip row; include count of skipped rows in summary |
| No vampires detected | Show friendly "Your crypt is empty" message |
| localStorage unavailable | Disable persistence; show warning banner |
| Exchange rate key not found | Fall back to `rate = 1.0` (treat as USD) |
| ICS generation fails | Log error; disable Garlic button for that vampire |

All errors from the engine are modeled as typed `Result<T, AppError>` return values — no thrown exceptions in the engine layer. The UI layer converts `AppError` into human-readable i18n strings.

```typescript
type AppError =
  | { code: 'PARSE_FAILED'; message: string }
  | { code: 'COLUMN_MAPPING_NEEDED'; headers: string[] }
  | { code: 'DATE_FORMAT_AMBIGUOUS'; sampleValues: string[] }
  | { code: 'NO_VALID_ROWS'; skipped: number }
  | { code: 'STORAGE_UNAVAILABLE' };

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used. They serve complementary purposes:

- **Unit tests**: verify specific examples, integration points, edge cases, and UI behavior
- **Property-based tests** (fast-check): verify the 11 correctness properties above across ≥ 100 random inputs each

### Unit Test Coverage

| Module | Unit Test Focus |
|---|---|
| `parser.ts` | Dot vs. comma decimal; DD/MM/YYYY vs MM/DD/YYYY; ambiguous dates; two-column layout; invalid rows |
| `normalizer.ts` | Each noise keyword; card-number removal; whitespace collapsing; uppercase |
| `cadenceDetector.ts` | Exactly 2 bites; free-trial detection; price-increase detection; gaps outside all cadence buckets |
| `scorer.ts` | Score with all signals present; score with no signals; catalog match bonus |
| `profileBuilder.ts` | Annual loss formula for each cadence; threat level boundaries; next-bite prediction |
| `currencyUtils.ts` | Currency detection from column; threshold conversion per currency; fallback to rate 1.0 |
| `icsGenerator.ts` | ICS output format; event date 3 days before next bite; bilingual descriptions |

### Property Test Configuration

All property tests live in `tests/detection.property.test.ts`. Each uses:

```typescript
fc.assert(fc.property(...), { numRuns: 100 });
```

Tag comments on each test reference the design property:
```typescript
// Feature: vampire-hunter, Property 1: Normalization Idempotence
```

### Accessibility Testing Notes

Automated WCAG checks run with `@axe-core/react` in development mode. Full validation requires manual testing with VoiceOver (macOS), NVDA (Windows), and TalkBack (Android). Keyboard navigation is verified manually against the interaction inventory in the Accessibility Design section.
