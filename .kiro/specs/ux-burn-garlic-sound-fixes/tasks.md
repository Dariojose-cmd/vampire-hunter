# Implementation Plan: ux-burn-garlic-sound-fixes

## Overview

Implementation is in TypeScript (strict), React and Vitest + fast-check, matching the existing project. The plan builds bottom-up: shared constants first, then the pure-ish `src/audio` module with its tests, then the garlic copy and components, then wiring sound into `Crypt` and `App`, then the fixed burn overlay and scroll-to-top. It ends with a Playwright MCP verification task and a task confirming nothing was committed. Task 10 is a later bug-fix amendment that makes the sound audible on small speakers. Task 11 is a second amendment that redesigns the ambience as an eerie, evolving sound (pad, wind gusts, bell, rare details) because the first audible version sounded like a steady fan hum. Task 12 is a third amendment that lifts the ambience loudness (measured RMS 0.012 against a target of about 0.05) without breaking the 0.5 peak cap. Task 13 is a fourth amendment that adds a master limiter, relaxes the per-layer budgets that only existed to prevent clipping, lifts the loudness again (overall RMS 0.019 against a target of 0.05, bell quieter than the pad) and widens the Pad spectrum.

All changes stay uncommitted. No task runs `git commit` or `git push`.

## Tasks

- [x] 1. Shared constants and module setup
  - [x] 1.1 Export `GARLIC_REMINDER_DAYS = 3` from `src/engine/icsGenerator.ts`
    - Use the constant in `isoMinusDaysToIcsDate(vampire.nextBiteDate, GARLIC_REMINDER_DAYS)`
    - Switch `icsEventSummary` in `en.json` and `es.json` to use `{{days}}` and pass `days` where it is translated
    - Keep the engine free of React and browser imports
    - Existing `tests/icsGenerator.test.ts` must still pass
    - _Requirements: 4.2b_

  - [x] 1.2 Write property test for the ICS offset
    - Create `tests/icsOffset.test.ts` with fast-check (at least 100 runs)
    - **Property 1: ICS offset equals the shared constant**
    - **Validates: Requirements 4.1, 4.2, 4.2b, 12.8a**

  - [x] 1.3 Add the `@audio` alias and `soundConfig.ts`
    - Add `@audio` -> `src/audio` to `vite.config.ts` and `tsconfig` paths, matching `@engine`, `@data`, `@i18n`
    - Create `src/audio/soundConfig.ts` with `SOUND_CONFIG` (master 0.6, ambience 0.08, ambience fade 800 ms, crackle 0.25, reduced factor 0.5, crackle fade-out 300 ms, chime 0.2, chime max 1500 ms, stake 0.3, stop ramp 80 ms, max summed peak 0.5) and the ducked ambience gain 0.04
    - _Requirements: 7.6, 7.7, 7.8, 8.2, 8.5, 8.6, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4_

- [x] 2. Sound engine and sound persistence
  - [x] 2.1 Implement the Sound_Engine in `src/audio`
    - Create `audioContextFactory.ts`, `soundEngine.ts` (`createSoundEngine(deps)` with `enable`, `disable`, `isEnabled`, `playStake`, `startCrackle`, `stopCrackle`, `playChime`, `setDocumentHidden`) and `index.ts`
    - Inject factory, `setTimeout`, `clearTimeout` and `random` for testing
    - Lazy context: the factory is never called before `enable()`; all commands are no-ops while disabled
    - Ambience singleton (detuned sine drones plus low-passed noise) with fade-in; ducking while crackle, chime or stake play; `playStake` scales its peak so the summed peak stays at or below 0.5
    - `disable()` ramps master to 0 within `stopRampMs`, then stops and disconnects every tracked node, clears timers and closes the context
    - Wrap every method in try/catch so an unsupported or throwing factory stays silent
    - Move the stake thud from `src/components/sound.ts` into `playStake()` and delete `sound.ts`
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 7.1, 7.3a, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.6, 10.1, 10.2, 10.3_

  - [x] 2.2 Write property test for sound off
    - Create `tests/soundEngine.test.ts` with a `FakeAudioContext` that records nodes, gain automation, start/stop/disconnect calls, plus fake timers and injected `random`
    - **Property 5: Sound off creates nothing**
    - **Validates: Requirements 6.2, 6.3, 8.7, 9.6**

  - [x] 2.3 Write property test for disable
    - **Property 6: Disable releases everything**
    - **Validates: Requirements 6.4, 6.5, 7.8, 12.3**

  - [x] 2.4 Write property test for the ambience singleton
    - **Property 7: Ambience is a singleton**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.3a, 7.4, 12.4**

  - [x] 2.5 Write property test for volume limits
    - **Property 8: Volume limits hold**
    - **Validates: Requirements 7.6, 8.5, 8.6, 9.3, 9.4, 10.1, 10.2, 10.3, 12.5**

  - [x] 2.6 Write property test for the crackle lifecycle
    - **Property 10: Crackle lifecycle is balanced**
    - **Validates: Requirements 8.1, 8.2, 12.6**

  - [x] 2.7 Write property test for unsupported Web Audio
    - **Property 11: Unsupported Web Audio is harmless**
    - **Validates: Requirements 6.8**

  - [x] 2.8 Persist the sound preference in `src/engine/cryptStorage.ts`
    - Add optional `soundEnabled?: boolean` to `CryptStorage`
    - `saveCryptStorage` writes it; `loadCryptStorage` defaults to `false` when absent or invalid
    - Confirm `burnCrypt()` removal wipes it; store only the boolean
    - _Requirements: 6.1, 11.3_

  - [x] 2.9 Write property test for sound preference round trip and wipe
    - Create `tests/cryptStorage.sound.test.ts`
    - Add a small `tests/soundConfig.test.ts` example test asserting the constants against Requirements 7, 8, 9, 10
    - **Property 12: Sound preference round trip and wipe**
    - **Validates: Requirements 6.1, 10.4, 11.3**

- [x] 3. Checkpoint - Sound engine and storage
  - Run `npx vitest --run` and `npx tsc --noEmit`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Honest garlic feedback
  - [x] 4.1 Replace garlic copy in `en.json` and `es.json`
    - Add `vampireCard.garlicTitle` and `vampireCard.garlicHint`
    - Replace `garlic.downloadSuccess` and `garlic.downloadError`, add `garlic.toastDismissAriaLabel`, using the exact text from the design
    - Keep identical key sets and placeholders in both files
    - _Requirements: 4.1, 4.2, 4.2a, 4.3, 4.4, 4.5, 4.9, 5.1, 5.2a, 5.5, 5.6, 5.9_

  - [x] 4.2 Create `GarlicToast` and `GarlicHint` components
    - `src/components/GarlicToast.tsx` and `.module.css`: `role="status"`, `aria-live="polite"`, dismiss button, auto-dismiss at 6000 ms cleared on unmount, no motion under reduced motion
    - `src/components/GarlicHint.tsx` and `.module.css`: always-visible `<p id>` with `overflow-wrap: anywhere; min-width: 0`
    - Add `garlicHintId(id)` to `src/components/format.ts` (sanitize unsafe characters, keep ids unique)
    - _Requirements: 4.6, 4.7, 4.8, 4.10, 5.2, 5.2b, 5.4, 5.8_

  - [x] 4.3 Update `VampireCard.tsx`
    - Add `title` and `aria-describedby` to the Garlic button and render `GarlicHint` using `GARLIC_REMINDER_DAYS` as `{{days}}`
    - Leave the existing `aria-label` unchanged
    - Language switches update title and hint
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.9_

  - [x] 4.4 Write property test for truthful garlic copy
    - Create `tests/garlicCopy.test.tsx` (React Testing Library, both languages)
    - **Property 2: Garlic copy is truthful and complete**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.5, 5.6, 5.9, 12.8**

  - [x] 4.5 Write property test for locale key parity
    - **Property 3: Locale key parity for garlic copy**
    - **Validates: Requirements 4.4, 4.5, 5.5, 5.6, 5.7**

  - [x] 4.6 Write property test for hint linking and unique ids
    - **Property 4: Hint is linked and ids are unique**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 4.7 Write example tests for `GarlicToast`
    - Create `tests/garlicToast.test.tsx`: live region role, auto-dismiss at 6000 ms with fake timers, dismiss button, error message, no motion under reduced motion
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 5. Wire sound into the app
  - [x] 5.1 Create the `useSoundEngine` hook in `src/components/useSoundEngine.ts`
    - Create the engine once with `defaultAudioContextFactory`
    - Register the `visibilitychange` listener calling `setDocumentHidden`
    - Call `disable()` on unmount
    - For a persisted "on" choice, arm a one-time `pointerdown`/`keydown` listener that calls `enable()` so no context exists before a user gesture
    - _Requirements: 6.1, 6.3, 6.7, 7.9, 7.10_

  - [x] 5.2 Wire `Crypt.tsx` to the engine and toast
    - Replace the `soundEnabled` prop with `sound: SoundEngine`; use `sound.playStake()`
    - Hold one `GarlicToastState` (a new action replaces the previous one and restarts the timer)
    - On garlic success show the success toast and call `sound.playChime()`; on failure show the error toast, play no chime
    - Update the `Crypt` import of the moved sound code
    - _Requirements: 4.1, 4.3, 4.9, 9.1, 9.5, 9.6_

  - [x] 5.3 Write property test for chime on success only
    - Create `tests/garlicChime.test.tsx` (mocked engine or fake context)
    - **Property 9: Chime plays only on success while enabled**
    - **Validates: Requirements 9.1, 9.5, 9.6, 12.7**

- [x] 6. Fixed burn overlay, scroll to top and App sound wiring
  - [x] 6.1 Make `BurnOverlay` viewport-fixed
    - In `BurnOverlay.module.css` use `position: fixed; inset: 0; z-index: var(--z-overlay); pointer-events: none;` with flames anchored `bottom: 0`
    - Apply `fixed` to the reduced-motion scrim branch as well
    - Keep `aria-hidden="true"` and the existing fallback timeout calling `onComplete` once
    - Ensure the token `--z-overlay` stacks above the Crypt_View and top bar
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 3.1, 3.2, 3.3_

  - [x] 6.2 Update `App.tsx` for sound, burn lifecycle and scroll
    - Own the engine via `useSoundEngine`; the Sound_Toggle `onClick` calls `enable()` or `disable()` inside the gesture, then sets state, persists it and exposes `aria-pressed`
    - Render `BurnOverlay` at the App root (not inside `<main>`)
    - Call `sound.startCrackle({ reducedMotion })` when `burnPhase` becomes `'burning'`
    - In `onBurnComplete`: `sound.stopCrackle()`, clear storage and state, set `view` to `'upload'`, `window.scrollTo({ top: 0, left: 0, behavior: 'auto' })`
    - Add a `useLayoutEffect` keyed on `view === 'upload'` that scrolls again and focuses the Upload heading (`tabIndex={-1}`)
    - Pass `sound` to `Crypt`
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 6.1, 6.6, 6.7, 6.9, 7.1, 7.2, 7.3, 7.3a, 8.1, 8.2, 8.7_

  - [x] 6.3 Write example tests for the burn overlay and scroll
    - Create `tests/burnOverlay.test.tsx`: fixed class and `aria-hidden`, reduced-motion branch renders only the scrim, `window.scrollTo` called with `top: 0` on completion, Upload_View shown and focused, `startCrackle` on burn start and `stopCrackle` on completion with a mocked engine
    - _Requirements: 1.1, 1.7, 2.1, 2.2, 2.4, 2.5, 3.1, 3.3, 8.1, 8.2, 12.6, 12.9, 12.10_

  - [x] 6.4 Write example tests for the Sound_Toggle and visibility handling
    - Create `tests/appSound.test.tsx`: toggle is off on first render with `aria-pressed="false"`, no factory call before the first gesture, `visibilitychange` suspends and resumes, turning sound off mid-burn lets the burn finish
    - _Requirements: 6.1, 6.3, 6.6, 6.9, 7.9, 7.10_

- [x] 7. Checkpoint - Full automated suite
  - Run `npx vitest --run`, `npx tsc --noEmit` and the project lint script. Ensure all tests pass, ask the user if questions arise.

- [x] 8. Playwright MCP verification
  - [x] 8.1 Verify in a real browser with Playwright MCP on desktop and 390px
    - Start the app with `npm run dev` in a background process (or serve the build) and drive it through the Playwright MCP tools; stop the server afterward and remove any temporary files
    - Desktop (width 1280 or more) and Mobile (390px): load a sample statement, scroll to the middle of the crypt, trigger the burn, confirm the overlay covers the full viewport, then confirm `window.scrollY === 0` and the Upload_View is visible
    - EN and ES garlic: trigger garlic on a vampire in each language and confirm the toast text, the button `title` and the visible hint name Google Calendar, Apple Calendar and Outlook and state 3 days; at 390px confirm no horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`)
    - Sound off then on: confirm the toggle is off on first load; with sound on confirm through console or audio-context inspection that the ambience starts, the crackle runs during the burn and turning sound off silences or suspends all output
    - Reduced motion: emulate `prefers-reduced-motion: reduce`, confirm only the fade scrim shows and the burn completes within 300 ms
    - Confirm the console shows no errors and the network log has no request carrying transaction data
    - Record any failures, fix them, and re-run the affected checks
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1, 4.4, 4.5, 5.1, 5.2, 5.5, 5.6, 5.8, 6.1, 6.4, 7.1, 8.1, 11.1, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

- [x] 9. Confirm nothing is committed
  - [x] 9.1 Verify the working tree is uncommitted and no push happened
    - Run `git status --short` and `git log origin/HEAD..HEAD --oneline` (or `git log -1`) and confirm all changes are unstaged or uncommitted, with no new commits made by this work
    - Do not run `git add`, `git commit` or `git push`; report the changed file list to the user
    - _Requirements: 14.1, 14.2_

- [x] 10. Fix audibility of sound on small speakers
  - Bug fix amendment. Requirements 7.6, 7.11 to 7.14, 8.5, 8.8, 9.4, 10.1, 10.2, 10.5, 10.6, 10.7 and 15 supersede the old limits. Edit only the files named below, and do not commit.
  - [x] 10.1 Update `SOUND_CONFIG` and implement the new synthesis
    - In `src/audio/soundConfig.ts` set master 0.9, ambience 0.25, ducked ambience 0.12, crackle 0.2, chime 0.18, stake 0.3, summed cap 0.5, stop ramp 80, fade-in 800, and add the new wind, drone, crackle band, stake and `minAudioHz` constants from the design
    - In `src/audio/soundEngine.ts` `startAmbience`: keep the ambience bus as the first node created after master; build looping noise -> band-pass (800 Hz, Q 1.2) -> wind gain 0.5 -> bus; build one 0.12 Hz LFO -> gain 300 -> band-pass `frequency` (not connected to the bus); build 110/220/330 Hz drone sines with detune -5/+6/-4 cents and gains 0.25/0.15/0.10 -> bus; track every node so `disable()` releases it
    - In `playBurst` use a band-pass with centre `1500 + random() * 2500` and Q 0.8 instead of the high-pass
    - In `playStake` use a 300 -> 120 Hz sine (shares 0.5), a 700 Hz triangle body with 0.12 s decay (shares 0.3), and a band-passed noise crack at 2000 Hz (shares 0.2); keep `allowedPeak` scaling, the 80 ms stop ramp, ducking, the singleton and the try/catch wrappers
    - Do not change the chime (880 Hz and 1320 Hz), the public `SoundEngine` interface or any file outside `src/audio`
    - _Requirements: 7.6, 7.11, 7.12, 7.13, 7.14, 8.5, 8.8, 9.4, 9.7, 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 10.2 Update tests that encode the old limits and add Property 13
    - `tests/soundConfig.test.ts`: replace the old limits with the new ones (master <= 1.0, ambience <= 0.3, crackle <= 0.2, chime <= 0.18), assert effective ambience (master x ambience x 1.0) is in [0.15, 0.25], ducked ambience + crackle + chime <= 0.5, and the shares sum to 1.0
    - `tests/soundEngine.test.ts` Property 7: look for drones set at 110, 220 and 330 Hz (one each), exactly one LFO and still exactly one looping buffer source; keep `start` call counts at one
    - `tests/soundEngine.test.ts` Property 8: new limits from Requirement 10, including the 0.15 to 0.25 effective ambience and the 0.5 summed cap; keep the crackle reduced-motion half limit (0.1)
    - Add **Property 13: Audible band** to `tests/soundEngine.test.ts`: extend the fake context to record `connect(param)` targets and all frequency automation values; assert every audio-rate oscillator and filter frequency is >= 100 Hz, the wind band-pass centre and sweep are within 400 to 1200 Hz, exactly one LFO <= 1 Hz wired oscillator -> gain -> filter.frequency and not to the master, and drones at 110/220/330 Hz exist
    - Run `tests/appSound.test.tsx` and fix only if it fails
    - **Property 13: Audible band**
    - **Validates: Requirements 7.11, 7.12, 7.13, 7.14, 8.8, 10.1, 10.2, 10.5, 10.6, 12.11, 12.12, 15.1, 15.2, 15.3, 15.4, 15.5**

  - [x] 10.3 Run the automated suite and verify audibility in Chrome
    - Run `npx vitest --run`, `npx tsc --noEmit` and the project lint script; fix failures
    - Using Playwright MCP in Chrome (or a small script that is deleted afterwards), enable sound and measure RMS and peak on the master output with an `AnalyserNode`, or render the same graph in an `OfflineAudioContext`; at minimum inspect the node graph for the frequencies and connections in Requirement 15
    - Report honestly what cannot be measured: loudness on a real laptop or phone speaker, a possibly silent headless audio sink, and that peak bounds are not RMS
    - Confirm the console shows no errors and no network requests carry transaction data; stop any dev server and remove temporary files
    - _Requirements: 13.7, 13.8, 13.10, 12.13_

  - [x] 10.4 Confirm nothing is committed
    - Run `git status --short` and `git log origin/HEAD..HEAD --oneline` (or `git log -1`); do not run `git add`, `git commit` or `git push`
    - _Requirements: 14.1, 14.2_

- [x] 11. Redesign ambience as an eerie pad with gusts, bell and rare details
  - Amendment 2. Requirements 7.11 to 7.19, 12.3, 12.4, 12.11, 12.14, 13.7, 13.10 and 15.3 to 15.6 supersede the steady drone and constant wind of task 10. Edit only `src/audio/*` and the sound tests named below. Do not commit. Subjective spookiness cannot be measured; report that honestly.
  - [x] 11.1 Implement the new ambience in `src/audio`
    - `src/audio/soundConfig.ts`: remove `ambienceWindShare`, `ambienceDroneShares`, `droneFrequencies`, `droneDetuneCents`, `windCenterHz`, `windSweepHz`, `windQ`, `windLfoHz`; add `layerShares` (0.5, 0.2, 0.2, 0.1), `chordSet`, `progression`, `tritoneChance`, pad, gust, bell and detail constants exactly as in the design section "Constants added to SOUND_CONFIG"; keep every other value (master 0.9, bus 0.25, ducked 0.12, crackle 0.2, chime 0.18, stake 0.3, cap 0.5, stop ramp 80, fade-in 800)
    - `src/audio/soundEngine.ts`: add `createDelay(maxDelayTime?: number): DelayNode` to `AudioContextLike`; keep `master` as the first node and the ambience bus as the second node created; replace the old `startAmbience` with a call to `startAmbience(host)`; build the `AmbienceHost` from the existing `schedule`, `track`, `groups`, `random` and a hidden flag set by `setDocumentHidden`; keep ducking, `allowedPeak`, the 80 ms stop, teardown, crackle, stake and chime unchanged
    - `src/audio/ambience.ts` (new, no React imports; split further into `padLayer.ts`, `windLayer.ts`, `bellLayer.ts` and `detailLayer.ts` if it passes about 300 lines): Pad (progression D minor, Bb, G minor, A with an occasional tritone chord from the injected random, never twice in a row; sine and triangle voices detuned 3 to 8 cents; every frequency from the Chord_Set and at least 100 Hz; raised-cosine `setValueCurveAtTime` envelope of 6 to 10 s peaking at 0.5; next chord after `max(0.5 x length, end of the chord before - now)` so at most 2 chords overlap and consecutive chords crossfade; lowpass 1200 Hz into a 0.5 pad bus); Wind gusts (one looping noise source, high-Q band-pass Q 8 to 14 swept 350 to 900 to 400 Hz, gate gain at 0.0001 between gusts, rise and fall total at most 7.5 s, new gust every 8 to 20 s, makeup gain 6 to be tuned in 11.3, 0.2 wind bus); Bell toll (5 inharmonic sine partials at ratios 1, 2.0, 2.76, 5.4, 8.9 on a base of 220 to 330 Hz, 15 ms attack, exponential decay 4 to 6 s with shorter decay for upper partials, every 25 to 45 s, long-lived delay network 0.16 s with feedback 0.4 and wet 0.2, `bellDrySum` 0.75, 0.2 bell bus); Rare details every 40 to 90 s, owl hoot (420 to 350 Hz then 380 to 310 Hz sines) or wood creak (noise burst, band-pass Q 5, glide 160 to 260 Hz), 0.1 detail bus
    - Scheduling: one tracked timer per layer through the engine `schedule` (injected `setTimeout`), delay `min + random() x (max - min)` seconds, re-armed after each fire; first Pad chord immediately at `enable()`, first gust, bell and detail one random gap after `enable()`; when the document is hidden a fire builds nothing and only re-arms; every in-flight group (chord, gust ramp, bell partials, detail) and its release timer is tracked so `disable()` clears all timers within the 80 ms stop and teardown releases every node, including the delay network
    - Singleton: `enable()` while a session exists never starts a second set of schedulers; no LFO and no oscillator below 100 Hz anywhere; use `gain.value = 0` for the chord gain before its single curve event to avoid overlapping automation errors
    - Do not change the public `SoundEngine` interface or any file outside `src/audio`
    - _Requirements: 7.4, 7.5, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17, 7.18, 7.19, 8.3, 10.2, 10.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 11.2 Update and extend the sound tests
    - Extend `FakeAudioContext` in `tests/soundEngine.test.ts` as in the design (Testing Strategy): `createDelay`, `setValueCurveAtTime`, `cancelScheduledValues`, `at` and `createdAt` timestamps, `connect(param)` and delay recording, opt-in `clock: 'fake-timers'` for `currentTime`, and a `gainAt(param, t)` helper
    - `tests/soundConfig.test.ts`: replace the drone, wind-LFO and inner-share assertions with the new ones from the design table (layer shares sum 1.0, effective level in [0.15, 0.25], pad alone in [0.10, 0.15], chords >= 100 Hz, detune <= 10 cents, gust sweep 350 to 900, Q 8 to 14, bell ratios and base, delay 0.12 to 0.2 s, feedback <= 0.5, `bellDrySum` bound, gap ranges, gust length below the minimum gap)
    - Amend Property 6 (all timers and event nodes released after events were in flight, no new node in the next 120 s), Property 7 (singleton: one looping source, no LFO, four scheduler timers after the first `enable()`, repeated `enable()` adds neither nodes nor timers), Property 8 (layer shares, per-layer peaks, pad alone, the 0.5 sum, `ctx.nodes[0]` master and `ctx.nodes[1]` bus order) and Property 13 (no oscillator below 100 Hz, wind Q and centre, Pad frequencies in the Chord_Set, bell partials, delay and feedback)
    - Fix Property 10 so its baseline does not depend on the total node count (see the design)
    - Add **Property 14: Pad changes chord over time and is musical** (120 s of fake time, Chord_Set membership, at least 3 distinct chords and 4 with random 0.999999, overlap, at most 2 concurrent, envelope 6 to 10 s)
    - Add **Property 15: Events are scheduled within their intervals** (600 s of fake time, injected random swept between 0, just below 1 and seeded; gust gaps 8 to 20 s, bell gaps 25 to 45 s, detail gaps 40 to 90 s, start counts 30 to 75, 13 to 24, 6 to 15)
    - Add **Property 16: Wind has no steady bed** (wind gate gain at most 0.02 outside gusts, above 0.1 during each gust)
    - Run `tests/appSound.test.tsx` and fix only if it fails
    - **Property 14: Pad changes chord over time and is musical**
    - **Property 15: Events are scheduled within their intervals**
    - **Property 16: Wind has no steady bed**
    - **Validates: Requirements 7.4, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17, 7.18, 7.19, 12.3, 12.4, 12.11, 12.12, 12.14, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**

  - [x] 11.3 Run the automated suite and measure the ambience in Chrome
    - Run `npx vitest --run`, `npx tsc --noEmit` and the project lint script; fix failures
    - Using Playwright MCP in Chrome (or a small script that is deleted afterwards), enable sound and record the master output for 60 to 90 s as in task 10.3 (an `AnalyserNode` on the master, with `AudioContext` patched before app start if needed to count created oscillators and sources)
    - Report: RMS and peak (and the peak against the 0.5 cap), the mean and standard deviation of the 1 s block RMS to show the sound is not steady, the number of Pad chord changes, Wind_Gusts and Bell_Tolls observed (guaranteed minimums in 90 s: 18 chords, 4 gusts, 1 bell), and the share of spectrum energy above 100 Hz and above 150 Hz. Tune `gustMakeup` here if the wind is inaudible or the peak is near the cap, and re-run the tests
    - Inspect the node graph for Requirement 15: no oscillator below 100 Hz, no LFO, wind Q 8 to 14 and centre 350 to 900, delay feedback at most 0.5
    - Report honestly what cannot be measured: perceived loudness on a physical laptop or phone speaker, a possibly silent headless audio sink, that peak bounds are not RMS, and that subjective spookiness cannot be measured
    - Confirm the console shows no errors and no network requests carry transaction data; stop any dev server and remove temporary files
    - _Requirements: 13.7, 13.8, 13.10, 12.13_

  - [x] 11.4 Confirm nothing is committed
    - Run `git status --short` and `git log origin/HEAD..HEAD --oneline` (or `git log -1`); do not run `git add`, `git commit` or `git push`
    - _Requirements: 14.1, 14.2_

- [x] 12. Lift ambience loudness
  - Amendment 3. Requirements 7.6, 7.13, 12.11 and 13.10 (marked "amended 3") and the design section "Loudness lift (amendment 3)" supersede the amendment 2 levels. Chrome measured RMS 0.012 and peak 0.12 after task 11. Target: overall RMS of about 0.05 or more, summed peak at or below 0.5. Edit only `src/audio/*` and the sound tests named below. No compressor or limiter. Do not commit.
  - [x] 12.1 Adjust the sound constants and update the tests
    - `src/audio/soundConfig.ts`: `ambienceGain` 0.30, keep `ambienceDuckedGain` 0.12, `layerShares` pad 0.5, wind 0.15, bell 0.25, detail 0.1, `bellWet` 0.15, `bellDrySum` 0.8, add `padCrestFactor` (start 1.8, at most 2.0); keep every other value
    - `src/audio/padLayer.ts`: multiply each voice gain by `padCrestFactor` (voice gain = `padCrestFactor x weight / notes.length`); `src/audio/bellLayer.ts`: use the new `bellDrySum` and wet; touch `src/audio/windLayer.ts` only if the new wind share requires it
    - Update `tests/soundConfig.test.ts` (bus <= 0.3 and 0.30 chosen, shares and sum 1.0, nominal effective level in [0.15, 0.30], Pad alone in [0.10, 0.15], `padCrestFactor` in [1.0, 2.0], `bellDrySum x (1 + wet / (1 - feedback))` <= 1.0, ducked sum <= 0.5, strict unducked bound <= 0.5)
    - Update `tests/soundEngine.test.ts` Properties 8 and 13 where they encode the old bus 0.25, shares or bell values; check Properties 7 and 14 to 16 still pass and change them only if they fail
    - Add a test with an offline simulation of the worst-case Pad waveform (voice frequencies, detunes, gains and the chord envelope from `SOUND_CONFIG`, two overlapping chords, a phase grid) asserting that the ducked sum `ambienceDuckedGain x (padPeakSim + other layer shares) + crackle + chime` is <= 0.5
    - Run `npx vitest --run`, `npx tsc --noEmit` and the project lint script; fix failures
    - _Requirements: 7.6, 7.13, 7.15, 7.18, 10.2, 10.5, 12.11, 12.14_

  - [x] 12.2 Measure in Chrome and tune until the target is met
    - Measure exactly as in task 11.3 (Playwright MCP in Chrome or a script deleted afterwards, sound on, 90 s, `AnalyserNode` tap on the master output, `AudioContext` patched before app start to count oscillators and sources)
    - Report: overall RMS (target about 0.05 or more), peak at the master input (target <= 0.5) and at the output (<= 0.45), mean and standard deviation of the 1 s block RMS with std/mean to show the sound still varies, the Bell_Toll block RMS against the Pad block RMS, and the counts of Pad chords, Wind_Gusts and Bell_Tolls (guaranteed minimums in 90 s: 18, 4, 1)
    - If the RMS is below the target or the peak is near the cap, tune `padCrestFactor` (limit 2.0), then the Pad share (limit 0.6, shares still sum 1.0), then `gustMakeup`; re-run the tests after each change and stop as soon as the target is met. If the limits are reached without meeting the target, stop and report the measured value to the user instead of breaking the cap
    - Report honestly what cannot be measured: perceived loudness on a physical laptop or phone speaker, a possibly silent headless audio sink, that peak bounds are not RMS, that the Pad peak is covered by simulation but the wind peak only by measurement, and that spookiness is subjective
    - Confirm the console shows no errors and no network requests carry transaction data; stop any dev server and remove temporary files
    - _Requirements: 7.13, 13.7, 13.8, 13.10, 12.13_

  - [x] 12.3 Confirm nothing is committed
    - Run `git status --short` and `git log origin/HEAD..HEAD --oneline` (or `git log -1`); do not run `git add`, `git commit` or `git push`
    - _Requirements: 14.1, 14.2_

- [x] 13. Add a master limiter and lift the ambience
  - Amendment 4. Requirements 7.6, 7.8, 7.12, 7.13, 7.15, 7.18, 10.1, 10.2, 10.3, 10.5, 12.5, 12.11, 12.14, 12.15, 13.10, 13.11, 15.5 and 16 and the design section "Amendment 4: master limiter and second loudness lift" supersede the amendment 3 levels, the "sum of peaks at most 0.5" gates and the "no compressor or limiter" rule. Edit only `src/audio/*` and the tests named below. No other source file changes. Sound stays off by default, no audio files, no network. Do not commit.
  - [x] 13.1 Implement the limiter chain, the relaxed budgets, the upper Pad voices and the louder bell in `src/audio`
    - `src/audio/soundConfig.ts`: set `ambienceGain` 0.6, `ambienceDuckedGain` 0.24, `layerShares` pad 0.5, wind 0.12, bell 0.7, detail 0.08, `padCrestFactor` 2.8, `padLowpassHz` 2500, `bellDrySum` 1.8; remove `maxSummedPeak`; add `outputPeakTarget` 0.5, `outputPeakTolerance` 1.1, `limiter` (`thresholdDb` -8, `kneeDb` 2, `ratio` 20, `attackSec` 0.003, `releaseSec` 0.2), `limiterOutputGain` 0.6, `chordUpper` (Dm 587.33 and 880.00, Bb 466.16 and 698.46, Gm 587.33 and 783.99, A 659.25 and 880.00, tri 415.30 and 523.25) and `padUpperWeight` 0.45; keep every other value
    - `src/audio/soundEngine.ts`: add `createDynamicsCompressor(): DynamicsCompressorNode` to `AudioContextLike`; in `enable()` create, in this order, the Master_Gain (`ctx.nodes[0]`), the Ambience_Bus (`ctx.nodes[1]`, moved out of `startAmbience`, with the same 0 to `ambienceGain` fade-in), the Limiter and the Output_Gain; set the Limiter parameters with `setValueAtTime` from `SOUND_CONFIG.limiter`; wire `bus -> master -> limiter -> output -> destination`; track all four in `session.nodes`; add `limiter` and `output` to `Session`; then start the Ambience with the existing bus; if any of these creations throws, close the context, create no session and stay silent
    - `src/audio/soundEngine.ts`: in `disable()` ramp both the Master_Gain and the Output_Gain to 0 over `stopRampMs` (80 ms), leaving the teardown timer and release path unchanged so the Limiter and Output_Gain are disconnected with every other node and re-enabling creates a fresh Limiter; remove `allowedPeak`, `othersPeak` and every use of `maxSummedPeak` (stake, crackle and chime play at `stakeGain`, `crackleGain` x reduced factor and `chimeGain`); keep `updateDucking` and the voices bookkeeping that drives it
    - `src/audio/padLayer.ts`: lowpass cutoff from `padLowpassHz`; add per chord the two upper sine voices from `chordUpper[name]` with detune `-c` (c from `padDetuneCents`) and weight `padUpperWeight`; voice gain `padCrestFactor x weight / W` with `W = notes.length + padUpperWeight x uppers.length` (the sum of one chord's voice gains stays `padCrestFactor`); leave the envelope, timing, overlap and crossfade unchanged; every frequency stays at least 100 Hz
    - `src/audio/bellLayer.ts`: the bell gets louder through `bellDrySum`, the bell share and the bus in `soundConfig.ts`; change the file only if needed (for example remove a comment or an assumption about the old 0.8 bound); `windLayer.ts`, `detailLayer.ts`, `ambience.ts` and `ambienceUtil.ts` need no logic change
    - Do not change the public `SoundEngine` interface or any file outside `src/audio`
    - _Requirements: 7.6, 7.8, 7.12, 7.13, 7.15, 7.18, 10.1, 10.2, 10.3, 10.5, 15.5, 16.1, 16.2, 16.3, 16.4, 16.6, 16.7_

  - [x] 13.2 Update the tests for the limiter and the relaxed budgets
    - `tests/soundEngine.test.ts` `FakeAudioContext`: add `createDynamicsCompressor` returning a node of kind `compressor` with recording `threshold`, `knee`, `ratio`, `attack` and `release` params and `reduction` 0; add a helper that follows `connections` to answer "does A reach B" and "which nodes connect to the destination"; locate the Limiter by kind, never by index
    - `tests/soundEngine.test.ts` Property 6: replace the assertion that `ctx.nodes[0].connections` contains the destination with a chain check; assert the Master_Gain and the Output_Gain are scheduled to 0 by `stopRampMs`, and that the Limiter and the Output_Gain are disconnected after `advance(5000)` with no timer left
    - `tests/soundEngine.test.ts` Property 7: exactly one compressor and one Output_Gain per session; repeated `enable()` adds no node and no timer; Property 11: the throwing fake context also throws from `createDynamicsCompressor`, and add an example test that a context that cannot create the compressor leaves the engine silent with nothing connected to the destination
    - `tests/soundEngine.test.ts` Property 8: rewrite with hard maxima only (master <= 1.0, bus 0.60 <= 1.0, ducked bus below the bus and at most half of it, Layer_Shares each <= 1.0 and equal to 0.5, 0.12, 0.7, 0.08, Pad alone in [0.15, 0.40], `padCrestFactor` in [1.0, 3.0] and equal to the sum of one chord's Pad voice gains, chord envelope peak <= 0.5, `bellDrySum` <= 2.0, feedback <= 0.5, crackle <= 0.2 and <= 0.1 in reduced motion, chime <= 0.18 and 1500 ms, stake <= 0.3 and unscaled, Output_Gain <= 1.0); delete the summed-peak, per-layer-sum, effective-level and ducked-sum assertions and keep the `ctx.nodes[0]` master and `ctx.nodes[1]` bus reads
    - `tests/soundEngine.test.ts` Properties 13 and 14: Chord_Set membership is the body notes plus `chordUpper`; each chord group has 10 oscillators (4 sine and 4 triangle body voices, 2 sine upper voices); upper voices lie in 415 to 880 Hz with a detune of at most 10 cents; the Pad lowpass cutoff equals `padLowpassHz`; the group gain sum equals `padCrestFactor`
    - `tests/soundEngine.test.ts` new **Property 17: Limiter is the last stage before the destination and is released on disable** (one compressor, parameters equal to `SOUND_CONFIG.limiter` and inside the allowed ranges, only the Output_Gain connects to the destination, every source reaches the destination only through master, Limiter and Output_Gain, creation order, ramp to 0 within 80 ms, release, fresh Limiter after re-enable)
    - `tests/soundConfig.test.ts`: delete the `maxSummedPeak`, ducked-sum, strict unducked bound, effective-level and old Pad-alone tests, the `padCrestFactor <= 2.0` test, the `bellDrySum` bound test and the whole "Pad worst-case waveform simulation" describe block; add the new bus, ducked bus, shares, Pad alone, crest, `bellDrySum`, `padLowpassHz`, `chordUpper`, `padUpperWeight`, `limiter`, `limiterOutputGain` and `outputPeakTarget` tests from the design table "Tests to update for amendment 4"
    - `tests/appSound.test.tsx` and `tests/garlicChime.test.tsx`: add `createDynamicsCompressor` (a fake node with params) to their hand-written fake contexts; change nothing else unless a test fails
    - State plainly in test comments that the fake context cannot prove the peak ceiling, the RMS, the makeup gain or the bell-to-pad ratio (Requirement 16.8)
    - **Property 17: Limiter is the last stage before the destination and is released on disable**
    - **Validates: Requirements 7.6, 7.8, 7.12, 7.13, 7.15, 7.18, 10.1, 10.2, 10.3, 10.5, 12.5, 12.11, 12.14, 12.15, 15.5, 16.1, 16.2, 16.3, 16.4, 16.6, 16.7, 16.8**

  - [x] 13.3 Run the suite and measure in Chrome, tuning until the targets are met
    - Run `npx vitest --run`, `npx tsc --noEmit` and the project lint script; fix failures
    - Measure in Chrome (Playwright MCP or a script deleted afterwards) as in task 12.2, with the tap on the Output_Gain output, sound on, 90 s, `AudioContext` patched before app start to count oscillators and sources and to capture the Limiter; then run the burst scenario (crackle, chime and stake overlapping the Ambience, at least three repetitions) and the toggle-off check
    - Targets: overall RMS 0.05 or more; Bell_Toll block RMS at least 1.5 times the mean Pad block RMS; output peak 0.5 or less (isolated transient samples up to 0.55 are reported and tolerated, the count above 0.5 is reported); std/mean of the 1 s block RMS still shows variation; silence about 80 ms after toggle-off; no console errors; no network request with transaction data
    - Report: RMS, peak (also during the bursts), mean and std of the 1 s block RMS with std/mean, bell block RMS against the Pad mean block RMS, the counts of Pad chords, Wind_Gusts and Bell_Tolls (guaranteed minimums in 90 s: 18, 4, 1), the share of spectrum energy above 100 Hz, above 150 Hz and above 300 Hz, the Limiter `reduction` mean and maximum, and the Requirement 15 and 16 node graph facts
    - Tune in this order and re-run the tests after each change, stopping as soon as all targets hold: RMS low, raise `padCrestFactor` (limit 3.0), then `ambienceGain` (limit 0.8), then the Pad share (limit 0.7); bell low, raise the bell share (limit 1.0), then `bellDrySum` (limit 2.0); peak above the tolerance, lower `limiterOutputGain` (limit 0.4), then the threshold (limit -12 dB), then the bus; `padUpperWeight` may be changed if the spectrum share above 300 Hz is judged too small. If a target is still missed at a hard maximum, stop and report the measured values to the user instead of breaking a limit
    - Report honestly what cannot be established: perceived loudness on a physical laptop or phone speaker, a possibly silent headless audio sink, behaviour in browsers other than Chrome, that the Limiter is a compressor and not a brickwall (so the 0.5 is a measured contract with tolerance), that a bell strike may be limited and briefly dip the Pad, and that spookiness is subjective
    - Stop any dev server and remove temporary files
    - _Requirements: 7.13, 13.7, 13.8, 13.10, 13.11, 12.13, 16.5_

  - [x] 13.4 Confirm nothing is committed
    - Run `git status --short` and `git log origin/HEAD..HEAD --oneline` (or `git log -1`); do not run `git add`, `git commit` or `git push`
    - _Requirements: 14.1, 14.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design
- Unit and example tests validate specific cases and edge behavior
- Tests that share a file are placed in separate waves to avoid write conflicts
- Task 13 (amendment 4, master limiter and loudness lift) is the only open work. 13.3 may change constants in `soundConfig.ts` after measuring and must re-run the tests. Task 12 is complete; its "no compressor or limiter" rule and its 0.5 summed-peak gates are superseded by task 13. Task 10 is a bug-fix amendment added after tasks 1 to 9 were completed and is now complete. Task 11 is complete. Source changes in task 11 were limited to `src/audio` and the tests named in 11.2
- Tasks 13.1 and 13.2 touch the sound code and the sound tests, so they are in separate waves; 13.2 depends on the constants, the creation order (master, bus, Limiter, Output_Gain) and the file layout of 13.1. The fake contexts in `tests/appSound.test.tsx` and `tests/garlicChime.test.tsx` need `createDynamicsCompressor`, otherwise `enable()` fails silently
- Unit tests cannot prove the output peak, the RMS or the bell-to-pad ratio; those are measured in Chrome in 13.3 and reported honestly
- Tasks 11.1 and 11.2 both touch the sound code and tests, so they are in separate waves; 11.2 depends on the constants and file layout of 11.1
- Task 11.3 may adjust `gustMakeup` in `soundConfig.ts` after measuring; if it does, it re-runs the tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.8", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.9", "4.2", "5.1"] },
    { "id": 3, "tasks": ["2.3", "4.3", "4.7"] },
    { "id": 4, "tasks": ["2.4", "4.4", "5.2"] },
    { "id": 5, "tasks": ["2.5", "4.5", "5.3", "6.2"] },
    { "id": 6, "tasks": ["2.6", "4.6", "6.3", "6.4"] },
    { "id": 7, "tasks": ["2.7"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["10.1"] },
    { "id": 11, "tasks": ["10.2"] },
    { "id": 12, "tasks": ["10.3"] },
    { "id": 13, "tasks": ["10.4"] },
    { "id": 14, "tasks": ["11.1"] },
    { "id": 15, "tasks": ["11.2"] },
    { "id": 16, "tasks": ["11.3"] },
    { "id": 17, "tasks": ["11.4"] },
    { "id": 18, "tasks": ["12.1"] },
    { "id": 19, "tasks": ["12.2"] },
    { "id": 20, "tasks": ["12.3"] },
    { "id": 21, "tasks": ["13.1"] },
    { "id": 22, "tasks": ["13.2"] },
    { "id": 23, "tasks": ["13.3"] },
    { "id": 24, "tasks": ["13.4"] }
  ]
}
```
