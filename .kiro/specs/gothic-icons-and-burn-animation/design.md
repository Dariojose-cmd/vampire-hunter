# Design Document

## Overview

Two UI-layer enhancements to the existing Vampire Hunter app:

1. **Burn Sequence** — a ≤ 1.5 s flame-and-ash overlay that plays after the user confirms "Burn the Crypt", then resolves to the Upload View (empty altar). Degrades to a ≤ 300 ms cross-fade under reduced motion. It never shows the Cleansed (victory) ending.
2. **Gothic Icon System** — a single `Icon` component rendering a named set of inline, thin-line-art SVGs that inherit `currentColor`, replacing every emoji in the components and removing emojis from the i18n strings.

Both changes are confined to `src/components/`, `src/i18n/`, and `src/styles/`. The engine and data layers are untouched. No new dependencies; Framer Motion (already used) drives the burn animation. No network calls are introduced.

### Design Goals

- Decouple the burn *animation* from the burn *data wipe* and *view switch* so the wipe still happens on confirm and cannot be lost if the animation is skipped.
- One icon style, one component, one source of truth per concept (shared glyphs).
- Zero accessibility regressions: existing `aria-label`s preserved; icons default to decorative.
- No emoji characters anywhere in the rendered DOM or i18n values.

### Current State (what we are changing)

| File | Current emoji / behavior | Change |
|---|---|---|
| `App.tsx` | brand `🦇`; sound toggle `🔊`/`🔇`; burn flow `onConfirm={() => { burn(); reset(); }}` | icons + orchestrate Burn Sequence |
| `BurnButton.tsx` | `🔥` on label and confirm | icons; signal "confirmed" up to App to start the sequence |
| `VampireCard.tsx` | `🩸 📈 🎟️ 🙏 🧄 🪦 ↺` | icons |
| `BloodMeter.tsx` | `🛡️` | icon |
| `Cleansed.tsx` | `🛡️` | icon (unchanged otherwise; still the victory ending) |
| `StakeModal.tsx` | `🔗 🩸` | icons |
| `Summoning.tsx` | `🩸` | icon |
| `EmptyState.tsx` | `⚰️` | icon |
| `Uploader.tsx` | `⚠️` | icon |
| `SamplePicker.tsx` | `🦅 🌮 ☕ 🕸️` | icons + short country labels (US/MX/CO) + messy icon |
| `i18n/en.json`, `es.json` | `🔒`, `🧛‍♂️`, `⚠️` inside strings | strip emoji from values |

The burn flow today lives entirely inside `App`: `BurnButton` calls `onConfirm`, which does `burn()` (wipe) then `reset()` (set `view='upload'`). The crypt disappears instantly. The new design keeps `burn()` on confirm but defers the visual switch to after the sequence.

---

## Architecture

### Layering

All work stays in the UI layer (`src/components`, `src/i18n`, `src/styles`). The engine (`src/engine`) and data (`src/data`) layers, and all detection behavior/public APIs, are unchanged (Req 8.2, 8.5). Framer Motion (already a dependency) powers the burn animation; `useReducedMotion()` provides the reduced-motion branch consistent with the rest of the app (Req 3.5).

### Burn Sequence orchestration

The burn flow is lifted so the *data wipe* and the *visual transition* are independent:

```
BurnButton confirm
      │
      ▼
onBurnConfirmed()  ──►  burn()            // wipe localStorage decisions NOW (Req 1.4)
      │                 setBurnPhase('burning')
      │                 // keep view === 'results' so the crypt is still visible
      ▼
<BurnOverlay> mounts over the crypt content region, inside <main>, below Top Bar
      │
      │  full motion: flames rise + region chars + embers drift  (≤ 1.5 s)
      │  reduced:     cross-fade only                            (≤ 300 ms)
      ▼
onBurnComplete()   ──►  reset()           // setResult(null); setView('upload')
                        setBurnPhase('idle')
      ▼
Upload View (empty altar)
```

Rationale: calling `burn()` immediately satisfies "data wipe does not depend on the animation" (Req 1.4). The view flip is moved into `onBurnComplete` so the crypt is still on screen to be visually consumed. If the overlay is ever skipped, `onBurnComplete` still runs via `onAnimationComplete` and a guaranteed safety timeout, so the app always reaches the Upload View (Req 1.5).

### Z-index / layering

```
Top Bar            → own stacking context, visually above overlay (controls usable)
BurnOverlay        → z-index: var(--z-overlay) (100), pointer-events: none, inside <main>
Crypt content      → z-base, frozen underneath during 'burning'
```

The Top Bar (brand, language, currency, sound) is rendered outside the overlay's region and remains visible/usable throughout the sequence (Req 1.3, 2.6). The overlay sets `pointer-events: none`, so it never traps input (Req 1.3).

### Icon System architecture

A single `Icon` component is the only place SVG markup lives. A module-local `PATHS: Record<IconName, ReactNode>` map holds each glyph's inner shapes; every icon is wrapped in one shared `<svg>` with identical `viewBox`, stroke, and linecaps so the whole set shares one style (Req 4.1, 4.2). All geometry uses `stroke="currentColor"` only (Req 4.3). Icons are inline SVG with no network fetch (Req 4.5). Each concept (blood-drop, shield, flame, …) is defined once and reused everywhere it appears (Req 5.5).

---

## Components and Interfaces

### New component: `BurnOverlay`

`src/components/BurnOverlay.tsx` (+ `BurnOverlay.module.css`).

```typescript
export interface BurnOverlayProps {
  /** Called once when the sequence (or reduced-motion fade) finishes. */
  onComplete: () => void;
}
```

Behavior:

- Renders a `motion.div` positioned `absolute`, covering the `<main>`/crypt region, `z-index: var(--z-overlay)`, `pointer-events: none`.
- `useReducedMotion()` branches between full motion and fade.

**Full-motion composition (≤ 1.5 s):**

1. **Flame Layer** — inline SVG flame band anchored to the bottom, animated upward. Layered flame paths tinted with `--color-accent`, `--color-accent-light`, `--color-candle`, rising via `translateY`/`scaleY` with a flicker from staggered `opacity`. Inline SVG, no external asset (Req 2.1, 2.5).
2. **Char/dissolve scrim** — a dark-to-transparent gradient that sweeps upward across the crypt region so the cards read as consumed (Req 2.2). The region is charred, not each card, for performance and simplicity.
3. **Embers** — ~8–12 small `motion.span` particles rising and fading (`y: -40…-120`, `opacity 1→0`) with randomized `x` and delays (Req 2.3).
4. Timeline budgeted so the last particle ends ~1.4 s; `onComplete` fires on the orchestrating animation's `onAnimationComplete`, with a `setTimeout(BURN_MS)` safety fallback. Ends with no residual flame/ash (Req 2.4).

**Reduced-motion composition (≤ 300 ms):** no flame, no embers — a single scrim `opacity 0→1` cross-fade, then `onComplete` (Req 3.1–3.4).

Module-local timing constants:

```
const BURN_MS = 1400;      // full-motion budget (< 1500 cap, Req 1.2)
const BURN_FADE_MS = 280;  // reduced-motion (< 300, Req 3.2)
```

### New component: `Icon`

`src/components/Icon.tsx`.

```typescript
export type IconName =
  | 'blood-drop' | 'coffin' | 'tombstone' | 'shield' | 'garlic'
  | 'praying-hands' | 'trend-up' | 'ticket' | 'flame' | 'link'
  | 'warning' | 'bat' | 'sound-on' | 'sound-off' | 'undo'
  | 'marker-us' | 'marker-mx' | 'marker-co' | 'web' | 'lock';

export interface IconProps {
  name: IconName;
  /** CSS size; defaults to '1em' so icons track adjacent text (Req 4.4). */
  size?: string | number;
  /** Accessible name. When provided, the icon is announced (role="img"); */
  /** when omitted (default), the icon is decorative (aria-hidden) (Req 6.4). */
  title?: string;
  className?: string;
}
```

Rendering rules:

- One shared `<svg>`: `viewBox="0 0 24 24"`, `width/height = size`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"` (Req 4.2, 4.3).
- `aria-hidden="true"` by default; when `title` is present, drop `aria-hidden`, add `role="img"`, `aria-label={title}`, and a `<title>` child (Req 6.1, 6.2, 6.4).
- Pure inline SVG; no `<img>`, no fetch (Req 4.5).

### Modified components

- **`App.tsx`** — add `burnPhase` state and the two handlers; swap brand `🦇` → `<Icon name="bat" />` (decorative) and the sound toggle glyph → `<Icon name={soundEnabled ? 'sound-on' : 'sound-off'} />` inside the existing button (button keeps its `aria-label`/`aria-pressed`). Render `<BurnOverlay>` inside `<main>` when `view === 'results' && burnPhase === 'burning'`.
- **`BurnButton.tsx`** — replace `🔥` on label and confirm with `<Icon name="flame" />` (decorative). `onConfirm` now simply signals App (`onBurnConfirmed`); the confirm handler closes the modal as today. The modal's focus trap/behavior is unchanged.
- **`VampireCard.tsx`, `BloodMeter.tsx`, `Cleansed.tsx`, `StakeModal.tsx`, `Summoning.tsx`, `EmptyState.tsx`, `Uploader.tsx`, `SamplePicker.tsx`** — swap emoji for the mapped `<Icon>` per the replacement map; keep text, labels, and positions (Req 5.4).

### Emoji → Icon replacement map

| Location | Emoji | Icon name | A11y |
|---|---|---|---|
| App brand | `🦇` | `bat` | decorative (next to "Vampire Hunter") |
| App sound toggle | `🔊`/`🔇` | `sound-on`/`sound-off` | standalone; button keeps `aria-label` |
| BurnButton label / confirm | `🔥` | `flame` | decorative (next to label text) |
| Summoning loader | `🩸` | `blood-drop` | decorative |
| VampireCard threat badge | `🩸` | `blood-drop` | decorative (badge has text + aria-label) |
| VampireCard price-increase | `📈` | `trend-up` | decorative |
| VampireCard free-trial | `🎟️` | `ticket` | decorative |
| VampireCard spared banner | `🙏` | `praying-hands` | decorative |
| VampireCard garlic banner | `🧄` | `garlic` | decorative |
| VampireCard staked mark | `🪦` | `tombstone` | decorative (already aria-hidden) |
| VampireCard undo | `↺` | `undo` | decorative (next to "Undo") |
| BloodMeter saved | `🛡️` | `shield` | decorative |
| Cleansed saved | `🛡️` | `shield` | decorative |
| StakeModal cancel URL | `🔗` | `link` | decorative (next to link text) |
| StakeModal confirm | `🩸` | `blood-drop` | decorative |
| EmptyState | `⚰️` | `coffin` | decorative (already aria-hidden) |
| Uploader error | `⚠️` | `warning` | decorative (alert has text) |
| Uploader privacy notice | `🔒` (in i18n string) | `lock` | decorative (next to notice text) |
| SamplePicker US | `🦅` | `marker-us` + "US" label | decorative icon, text label visible |
| SamplePicker MX | `🌮` | `marker-mx` + "MX" label | decorative icon, text label visible |
| SamplePicker CO | `☕` | `marker-co` + "CO" label | decorative icon, text label visible |
| SamplePicker messy | `🕸️` | `web` | decorative (keeps its text label) |

Shared-glyph rule (Req 5.5): `blood-drop`, `shield`, `flame` each defined once and reused at every listed site. `marker-us/mx/co` are small shield/scroll glyphs; the visible country text label lives in the SamplePicker next to the icon, not inside the SVG (Req 5.3).

### i18n string cleanup

Remove emoji glyphs (and any now-stray leading space) from these values in **both** `en.json` and `es.json`, keeping keys identical (Req 7.4):

| Key | Before | After |
|---|---|---|
| `upload.privacyNotice` | `🔒 Your data never leaves…` | `Your data never leaves…` |
| `crypt.allStaked` | `…blood is safe. 🧛‍♂️` | `…blood is safe.` |
| `garlic.icsEventSummary` | `⚠️ {{name}} charge in 3 days` | `{{name}} charge in 3 days` |

The privacy notice keeps its lock meaning visually: the `🔒` is removed from the string and a decorative `lock` `<Icon>` is rendered next to the notice text in `Uploader` (Req 7.2) — privacy is the app's key differentiator, so it stays visible at a glance. The ICS summary stays text-only so the downloaded `.ics` renders cleanly (Req 7.3). The `IcsI18n` doc-comment example in `src/engine/types.ts` is updated to drop the emoji (comment only; no behavior change).

### Styling

A shared `.icon` class (in `global.css` or an `Icon.module.css`) sets `display: inline-block; vertical-align: -0.125em;` for baseline alignment. Default size `1em`; callers needing a larger glyph pass `size`. Icons inherit color from the parent via `currentColor`, so no new color tokens are needed. `BurnOverlay.module.css` holds the flame/ember/scrim styles using existing tokens.

---

## Data Models

No persistent or engine data model changes. The only new runtime state is UI-local:

```typescript
// App.tsx — transient, not persisted
type BurnPhase = 'idle' | 'burning';

// Icon.tsx — compile-time union of available glyph names
type IconName =
  | 'blood-drop' | 'coffin' | 'tombstone' | 'shield' | 'garlic'
  | 'praying-hands' | 'trend-up' | 'ticket' | 'flame' | 'link'
  | 'warning' | 'bat' | 'sound-on' | 'sound-off' | 'undo'
  | 'marker-us' | 'marker-mx' | 'marker-co' | 'web' | 'lock';
```

`CryptStorage` (localStorage), `Vampire`, `UserDecision`, and all engine types are unchanged. No emoji are stored anywhere (Req 7, 8.5).

---

## Error Handling

- **Animation never signals completion**: `BurnOverlay` guarantees `onComplete` via a `setTimeout(BURN_MS | BURN_FADE_MS)` fallback in addition to `onAnimationComplete`, so the app always reaches the Upload View even if a transition event is missed.
- **Reduced motion / global motion kill-switch**: when `prefers-reduced-motion` is set (or the global `global.css` safety net neutralizes transitions), the overlay uses the fade branch and still fires `onComplete` via the timeout (Req 3.x).
- **Data wipe independent of animation**: `burn()` runs on confirm, before the overlay mounts, so a failed/early-unmounted animation never leaves stale decisions (Req 1.4, 8.4).
- **Unknown icon name**: `IconName` is a closed union, so an invalid name is a compile-time error; there is no runtime unknown-icon path. (Defensive default: render nothing rather than throw.)
- **Burn only on confirm**: `burnPhase` is initialized `'idle'` and mutated only by `onBurnConfirmed`; no load/reload path sets it (Req 1.7).

---

## Correctness Properties

These are verified with Vitest + Testing Library (jsdom). The burn/icon work is presentational, so properties focus on invariants rather than fast-check generators.

### Property 1: Icons are decorative by default

*For any* `IconName` rendered without a `title`, the produced `<svg>` has `aria-hidden="true"` and exposes no accessible name.

**Validates: Requirements 6.1, 6.4**

### Property 2: Titled icons are announced

*For any* `IconName` rendered with a non-empty `title`, the `<svg>` is not `aria-hidden`, has `role="img"`, and its accessible name equals the `title`.

**Validates: Requirements 6.2**

### Property 3: Consistent style and theme color

*For any* `IconName`, the rendered `<svg>` uses the shared `viewBox="0 0 24 24"` and `stroke="currentColor"` (no hardcoded color).

**Validates: Requirements 4.2, 4.3**

### Property 4: No emoji remain

Scanning `src/components/**/*.tsx` and `src/i18n/*.json` for emoji codepoints yields zero matches.

**Validates: Requirements 5.2, 7.1**

### Property 5: Burn wipes immediately and lands on Upload

Confirming the burn clears Crypt Storage decisions synchronously, and after the sequence completes the app shows the Upload View (empty altar) — never the Cleansed victory ending.

**Validates: Requirements 1.4, 1.5, 1.6, 8.4**

### Property 6: i18n key parity

`en.json` and `es.json` have the identical set of keys after emoji removal.

**Validates: Requirements 7.4**

---

## Testing Strategy

1. **`tests/icon.test.tsx`** — Properties 1–3: decorative-by-default, titled-announced, shared viewBox + `currentColor`.
2. **`tests/no-emoji.test.ts`** — Property 4: scan components and i18n JSON for emoji codepoints; assert none.
3. **`tests/burnFlow.test.tsx`** — Property 5: confirming burn clears storage immediately and reaches the Upload View (fake timers / mocked reduced motion for determinism).
4. **`tests/i18n.parity`** (or an assertion added to an existing i18n test) — Property 6: key-set equality.
5. **Existing suite + build** — must stay green; `npm run build` must succeed (Req 8.3).
6. **Playwright MCP verification (Req 9)** — screenshots of: a Burn Sequence frame, cards with icons, Blood Meter with icons, Stake modal with icons, the Cleansed (victory) ending, and a mobile ≈360 px view; plus a rendered-DOM emoji scan and a reduced-motion burn pass landing on the empty altar.

---

## Files

**New**
- `src/components/Icon.tsx`
- `src/components/BurnOverlay.tsx`
- `src/components/BurnOverlay.module.css`
- `tests/icon.test.tsx`
- `tests/no-emoji.test.ts`
- `tests/burnFlow.test.tsx`

**Modified**
- `src/components/App.tsx` (burn orchestration, brand + sound icons)
- `src/components/BurnButton.tsx` (icon; confirm signals App)
- `src/components/VampireCard.tsx`, `BloodMeter.tsx`, `Cleansed.tsx`, `StakeModal.tsx`, `Summoning.tsx`, `EmptyState.tsx`, `Uploader.tsx`, `SamplePicker.tsx` (icons)
- `src/i18n/en.json`, `src/i18n/es.json` (strip emoji)
- `src/engine/types.ts` (doc-comment emoji removed; no behavior change)
- `src/styles/global.css` or a module (shared `.icon` alignment class)

**Unchanged**
- `src/engine/*` logic, `src/data/*`, all detection behavior and public APIs.
