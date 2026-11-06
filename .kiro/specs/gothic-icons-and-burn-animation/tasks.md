# Implementation Plan

## Overview

Two UI-layer features: a shared gothic Icon component that replaces every emoji (in components and i18n strings), and a Burn Sequence overlay that plays on "Burn the Crypt" before returning to the Upload View (empty altar). The Icon component is built first because every replacement depends on it; the burn overlay and i18n cleanup are independent of each other; guard tests and full verification run last.

## Tasks

- [x] 1. Build the shared Icon component and its glyph set
- [x] 1.1 Create the `Icon` component with the shared SVG wrapper and a11y behavior
  - Add `src/components/Icon.tsx` exporting `IconName`, `IconProps`, and `Icon`.
  - Render one shared `<svg>`: `viewBox="0 0 24 24"`, `width/height={size}` (default `1em`), `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
  - Decorative by default (`aria-hidden="true"`); when `title` is passed, drop `aria-hidden`, set `role="img"`, `aria-label={title}`, and render a `<title>` child.
  - Inline SVG only; no `<img>`, no network fetch.
  - Add a shared `.icon` alignment style (`display:inline-block; vertical-align:-0.125em;`) in `global.css` or an `Icon.module.css`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.4_
- [x] 1.2 Author all glyphs in the `PATHS` map (one consistent thin-line style)
  - Define `PATHS: Record<IconName, ReactNode>` with hand-authored line shapes for: `blood-drop, coffin, tombstone, shield, garlic, praying-hands, trend-up, ticket, flame, link, warning, bat, sound-on, sound-off, undo, marker-us, marker-mx, marker-co, web, lock`.
  - All geometry uses stroke only (no hardcoded fills/colors); each concept defined once for reuse.
  - _Requirements: 4.2, 4.3, 4.6, 5.5_
- [x] 1.3 Write Icon component unit tests
  - Add `tests/icon.test.tsx` (jsdom + Testing Library): renders `<svg>` with shared `viewBox` and `stroke="currentColor"`; decorative by default (`aria-hidden`, no accessible name); with `title` exposes `role="img"` + accessible name and is not `aria-hidden`.
  - _Requirements: 4.2, 4.3, 6.1, 6.2, 6.4_

- [ ] 2. Replace emojis across all components with the Icon
- [-] 2.1 App brand mark and sound toggle
  - In `App.tsx`, replace brand `bat` emoji with `<Icon name="bat" />` (decorative) and the sound-toggle glyph with `<Icon name={soundEnabled ? 'sound-on' : 'sound-off'} />`; keep the button's `aria-label` and `aria-pressed`.
  - _Requirements: 5.1, 5.4, 6.2, 6.3_
- [~] 2.2 VampireCard icons (blood-drop, trend-up, ticket, praying-hands, garlic, tombstone, undo)
  - Replace the threat, price-increase, free-trial, spared, garlic, staked-mark, and undo emojis with the mapped decorative `<Icon>`s; preserve existing text, `aria-label`s, and the already-`aria-hidden` staked mark.
  - _Requirements: 5.1, 5.4, 5.5, 6.1, 6.3_
- [~] 2.3 BloodMeter and Cleansed shield icons
  - Replace the shield emoji in `BloodMeter.tsx` and `Cleansed.tsx` with `<Icon name="shield" />` (decorative). Cleansed remains the victory ending, otherwise unchanged.
  - _Requirements: 5.1, 5.4, 5.5, 6.1_
- [~] 2.4 StakeModal icons (link, blood-drop)
  - Replace the cancel-URL link emoji and the confirm-button blood-drop emoji with decorative `<Icon>`s; keep link text and button `aria-label`s.
  - _Requirements: 5.1, 5.4, 5.5, 6.1, 6.3_
- [~] 2.5 Summoning, EmptyState, Uploader icons (blood-drop, coffin, warning, lock)
  - `Summoning.tsx`: blood-drop emoji → `blood-drop`. `EmptyState.tsx`: coffin emoji → `coffin` (keep aria-hidden). `Uploader.tsx`: warning emoji → `warning`, and add a decorative `<Icon name="lock" />` next to the privacy notice text.
  - _Requirements: 5.1, 5.4, 6.1, 7.2_
- [~] 2.6 BurnButton flame icons
  - Replace the fire emoji on the label and the confirm button with `<Icon name="flame" />` (decorative); keep labels and `aria-label`s. (The confirm→App signal change is wired in task 3.2.)
  - _Requirements: 5.1, 5.4, 5.5, 6.1, 6.3_
- [~] 2.7 SamplePicker themed markers + country labels
  - Replace the four sample emojis with `marker-us / marker-mx / marker-co / web` icons; show a short gothic-styled country label ("US", "MX", "CO") next to the US/MX/CO markers; keep the messy sample's existing text label. Icons decorative.
  - _Requirements: 5.1, 5.3, 5.4, 6.1_

- [ ] 3. Implement the Burn Sequence
- [~] 3.1 Create the BurnOverlay component and styles
  - Add `src/components/BurnOverlay.tsx` + `BurnOverlay.module.css` with `BurnOverlayProps { onComplete }`.
  - Full motion (≤ 1.4s): layered flame SVG rising from the bottom, an upward char/dissolve scrim over the whole crypt region (one sweeping fire, not per-card), and ~8–12 drifting/fading embers; tint with `--color-accent`, `--color-accent-light`, `--color-candle`.
  - Reduced motion (`useReducedMotion`): single scrim cross-fade ≤ 280ms, no flames/particles.
  - Positioned `absolute` over `<main>`, `z-index: var(--z-overlay)`, `pointer-events: none`; fire `onComplete` via `onAnimationComplete` with a `setTimeout` safety fallback; leave no residual flame/ash.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.5, 1.3_
- [~] 3.2 Orchestrate the burn in App and rewire BurnButton
  - Add `burnPhase: 'idle' | 'burning'` to `App`. `onBurnConfirmed()` calls `burn()` immediately (data wipe) then sets `burnPhase='burning'` while keeping `view==='results'`. `onBurnComplete()` calls `reset()` (→ Upload View) and sets `burnPhase='idle'`.
  - Change `BurnButton` so confirm calls the new `onConfirm` (App's `onBurnConfirmed`) and closes the modal; render `<BurnOverlay onComplete={onBurnComplete} />` inside `<main>` only when `view==='results' && burnPhase==='burning'` (Top Bar stays above/usable).
  - Never trigger on load/reload; never route through the Cleansed victory ending.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 3.4_
- [~] 3.3 Write the burn flow test
  - Add `tests/burnFlow.test.tsx`: confirming burn clears Crypt Storage decisions synchronously, and after the sequence completes the app shows the Upload View (empty altar), never the Cleansed ending. Use fake timers / mocked reduced motion for determinism.
  - _Requirements: 1.4, 1.5, 1.6, 8.4_

- [ ] 4. Remove emojis from i18n strings and engine doc-comment
- [~] 4.1 Strip emoji from en.json and es.json
  - Remove the lock glyph from `upload.privacyNotice`, the vampire glyph from `crypt.allStaked`, and the warning glyph from `garlic.icsEventSummary` in both files (and any stray leading/trailing space). Keep key sets identical and meanings otherwise unchanged.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
- [~] 4.2 Remove emoji from the IcsI18n doc-comment
  - Update the `IcsI18n` example comment in `src/engine/types.ts` to drop the warning glyph (comment only; no behavior change; engine stays UI-free).
  - _Requirements: 7.1, 8.2_

- [ ] 5. Guard tests and full verification
- [~] 5.1 Add the no-emoji guard test and i18n key-parity assertion
  - Add `tests/no-emoji.test.ts` scanning `src/components/**/*.tsx` and `src/i18n/*.json` for emoji codepoints and asserting none remain. Add/extend an i18n test asserting `en.json` and `es.json` have identical key sets.
  - _Requirements: 5.2, 7.1, 7.4_
- [~] 5.2 Run the full suite and production build
  - Run `npx vitest run` (all green) and `npm run build` (succeeds). Fix any regressions introduced by the icon/animation changes.
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

## Task Dependency Graph

```
1.1 ──► 1.2 ──► 1.3
         │
         ├──► 2.1
         ├──► 2.2
         ├──► 2.3
         ├──► 2.4
         ├──► 2.5
         ├──► 2.6 ──► 3.2
         └──► 2.7
3.1 ──► 3.2 ──► 3.3
4.1 (independent)
4.2 (independent)
(2.*, 3.*, 4.*) ──► 5.1 ──► 5.2
```

- Task 1.2 depends on 1.1 (same file). Task 1.3 depends on 1.2 (tests the glyphs).
- All of task 2 depends on 1.2 (needs the glyph set). 2.6 and 3.1 both feed 3.2 (App + BurnButton wiring).
- 3.3 depends on 3.2 (tests the wired flow).
- 4.1 and 4.2 are independent of the Icon work and of each other.
- 5.1 depends on all emoji removal (2.*, 4.*) being done; 5.2 runs last.

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1"] },
    { "wave": 2, "tasks": ["1.2"] },
    { "wave": 3, "tasks": ["1.3", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.1", "4.1", "4.2"] },
    { "wave": 4, "tasks": ["3.2"] },
    { "wave": 5, "tasks": ["3.3"] },
    { "wave": 6, "tasks": ["5.1"] },
    { "wave": 7, "tasks": ["5.2"] }
  ]
}
```

## Notes

- UI layer only: `src/components`, `src/i18n`, `src/styles`, plus one doc-comment in `src/engine/types.ts`. No engine logic, data, or detection behavior changes.
- No new dependencies; Framer Motion (already present) drives the burn animation. No network calls introduced (privacy preserved).
- Playwright MCP verification (Requirement 9) is performed by the orchestrator after task 5.2: capture a Burn Sequence frame, cards with icons, Blood Meter with icons, Stake modal with icons, the Cleansed (victory) ending, and a mobile ≈360px view; confirm no emoji in the rendered DOM and that the reduced-motion burn lands on the empty altar.
