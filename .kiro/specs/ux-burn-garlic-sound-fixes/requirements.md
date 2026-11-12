# Requirements Document

## Introduction

This feature delivers three UX fixes to Vampire Hunter:

1. **Burn overlay fix.** The Burn Sequence currently renders absolutely positioned over the crypt region, so when the user burns while scrolled mid-crypt the flames and scrim are misplaced. The overlay becomes viewport-fixed, the page scrolls to the top when the burn completes, and Reduced Motion remains respected.
2. **Honest garlic feedback.** The Garlic action downloads an `.ics` calendar file but gives no clear explanation of what happened. The System shows a truthful toast in English and Spanish, and the Garlic button explains itself through a tooltip and a visible hint.
3. **Synthesized sound.** The existing single stake thud is expanded into a Web Audio ambience that plays on every screen while sound is on, a fire crackle during the burn, and a chime on garlic. All sound is synthesized in the browser, off by default, gentle in volume, and stops immediately when turned off.

**Amendment (bug fix, sound audibility).** With sound on and the system volume at maximum, users hear nothing on laptop and phone speakers. Root cause, verified in `src/audio/soundEngine.ts` and `src/audio/soundConfig.ts`: the Ambience is two sine drones at 55 Hz and 82 Hz plus noise low-passed at 220 Hz, and small speakers cannot reproduce content below roughly 150 to 200 Hz. The effective Ambience level is also about 0.014 of full scale (0.6 Master_Gain x 0.08 Ambience gain x 0.3 inner gains). The stake thud (180 Hz falling to 55 Hz) has the same problem. Requirements 7, 8, 9 and 10 are amended, and Requirement 15 (Audible band) is new. Amended criteria are marked "(amended)". The old limits are superseded, see "Superseded limits" below.

**Amendment 2 (ambience redesign, eerie rather than steady).** User testing of the audible Ambience reported that the constant band-passed noise plus 110/220/330 Hz sines sounds like a laptop fan: a steady hum the brain ignores, not spooky. The Ambience is redesigned as four layers that change over time: a slow minor-chord Pad (the main, musical layer), rare Wind_Gusts through a resonant band-pass, a distant Bell_Toll and optional Rare_Details (owl hoot or wood creak). There is no constant noise bed and no steady tone. Requirement 7 (criteria 7.11 to 7.14, plus new 7.15 to 7.19), Requirement 12, Requirement 13 and Requirement 15 are amended. Criteria changed by this second amendment are marked "(amended 2)". All other sound limits (Master_Gain, ducking, crackle, chime, stake, 80 ms stop, summed cap 0.5) are unchanged. Whether the result is actually spooky is subjective and cannot be measured by tests; the tests only prove that the sound changes over time, stays in the audible band and stays within the volume budget.

**Amendment 3 (loudness lift).** After the amendment 2 redesign, Chrome measured an overall Ambience RMS of 0.012 (peak 0.12 against a bound of 0.225), versus 0.051 for the earlier steady version, so it risks being inaudible on laptop speakers. Decision: lift the overall RMS to about 0.05 or more, measured the same way (Chrome, 90 s, tap on the master output), without breaking the 0.5 summed-peak cap. Allowed levers: Pad voice gains, the Ambience_Bus up to 0.30, and a louder Bell_Toll through a rebalanced Layer_Share. Criteria 7.6, 7.13, 12.11 and 13.10 change and are marked "(amended 3)". No other limit changes (ducked bus 0.12, crackle 0.2, chime 0.18, stake 0.3, no compressor or limiter). The RMS value is a verification target, not a strict test.

**Amendment 4 (master limiter, second loudness lift, brighter Pad).** After amendment 3, Chrome measured an overall Ambience RMS of 0.019 (target 0.05 or more) and a peak of only 0.12. The Bell_Toll was quieter than the Pad when it rang (bell block RMS about 0.011 against a mean Pad block RMS of about 0.0185). Every further lift was blocked by deterministic caps that exist only to prevent clipping without a limiter: the bus at 0.3 (7.6), the Pad alone at 0.15 (7.13), a Pad_Crest_Factor of about 1.27 (the bound of the offline Pad worst-case simulation), the Layer_Share and bell bounds, and the ducked sum 0.12 + 0.2 + 0.18. Decision (user, options 2 and 3 plus a limiter):

1. A `DynamicsCompressorNode` configured as a limiter is added to the master output (chain: Master_Gain, Limiter, Output_Gain, destination). The peak ceiling is enforced by the Limiter instead of by conservative per-layer budgets (new Requirement 16).
2. The per-layer budgets are relaxed: the deterministic "sum of peaks at most 0.5" gates become obsolete and are removed (7.6, 7.13, 7.18, 10.1, 10.2, 12.5, 12.11); they are replaced by a limiter that is present and configured, and by sensible hard maxima per layer. Ducking while crackle, chime or stake play is kept for clarity. The levers are raised: bus 0.60, Pad_Crest_Factor 2.8, a much larger Bell_Toll share.
3. The Pad spectrum is widened: lowpass from 1200 Hz to 2500 Hz and two soft Pad_Upper_Voices per chord (415 to 880 Hz), so that more energy sits between 300 Hz and 2500 Hz, where laptop speakers respond.

The Limiter is honest about what it is: a `DynamicsCompressorNode` is not a true brickwall limiter (finite attack lets short transients overshoot; Chrome has a fixed look-ahead of about 6 ms that other browsers are not guaranteed to have; the node applies an automatic makeup gain that cannot be disabled). The contract is therefore "output peak at most 0.5 within a stated tolerance, verified by measurement in Chrome, with a documented headroom and a final safety gain", not a mathematical guarantee. Unit tests can only prove that the node exists, its parameters and the wiring; the peak ceiling, the RMS and the bell-to-pad ratio are verified only by measurement. Criteria changed by this amendment are marked "(amended 4)". Unchanged: sound off by default, no audio files, no network, singleton Ambience, 80 ms stop, ducking, stake peak at most 0.3, crackle at most 0.2, chime at most 0.18. The RMS, bell-to-pad and peak figures are verification targets, not strict tests.

All processing stays in the browser. No audio assets are downloaded and no network requests are made. The work is verified with unit tests and with Playwright MCP on desktop and a 390px mobile viewport. Changes are not committed.

## Glossary

- **System**: The Vampire Hunter single-page web application running in the browser.
- **Burn_Overlay**: The decorative flame, char scrim and ember layer shown during the Burn Sequence (`BurnOverlay` component).
- **Burn_Sequence**: The animation played when the user burns the crypt, ending with a return to the Upload View.
- **Crypt_View**: The screen listing detected vampires, which can be scrolled vertically.
- **Upload_View**: The initial screen where the user uploads or picks a statement.
- **Viewport**: The visible area of the browser window.
- **Reduced_Motion**: The user's operating-system preference `prefers-reduced-motion: reduce`, as detected by the System.
- **Garlic_Action**: The per-vampire action that downloads an `.ics` calendar reminder for the vampire's next charge.
- **Garlic_Button**: The button on a Vampire_Card that triggers the Garlic_Action.
- **Vampire_Card**: The card showing one detected recurring charge.
- **Garlic_Toast**: A transient, non-blocking message shown after the Garlic_Action.
- **Garlic_Hint**: Visible text near the Garlic_Button that explains what the Garlic_Action does.
- **Sound_Toggle**: The top-bar control that turns sound on or off.
- **Sound_Engine**: The module that synthesizes and controls all audio with the Web Audio API.
- **Ambience**: (amended 2) The quiet, synthesized background sound made of four layers that evolve over time: the Pad, the Wind_Gusts, the Bell_Toll and the Rare_Details. It is not a loop and contains no steady tone and no constant noise bed.
- **Fire_Crackle**: A synthesized crackling noise played during the Burn_Sequence.
- **Garlic_Chime**: A short synthesized bell-like tone played when the Garlic_Action succeeds.
- **Master_Gain**: (amended 4) The gain node that every voice and the Ambience_Bus connect to. Its output feeds the Limiter, not the destination directly.
- **Desktop_Viewport**: A browser viewport of 1280px width or larger.
- **Mobile_Viewport**: A browser viewport of 390px width.
- **Small_Speaker**: A laptop or phone speaker, assumed to reproduce little energy below about 150 Hz.
- **Audio_Rate_Oscillator**: Any oscillator whose output is routed (directly or through gains and filters) to the Master_Gain. (amended 2) The Ambience no longer contains any control-rate oscillator, so every oscillator the Sound_Engine creates is an Audio_Rate_Oscillator.
- **Wind_Band**: (amended 2) The high-Q resonant band-pass filter through which the looping noise of the Wind_Gusts passes.
- **Wind_LFO**: (superseded by amendment 2) The sub-1 Hz oscillator that modulated the Wind_Band centre. It is removed. The sweep is now automated per Wind_Gust on the filter `frequency` parameter.
- **Ambience_Bus**: The gain node through which all Ambience voices pass before the Master_Gain.
- **Effective_Ambience_Level**: (amended 2, amended 4) Master_Gain x Ambience_Bus gain x sum of the Layer_Share gains, as a fraction of full scale. After amendment 4 it is a reporting figure only: it is no longer a limit and no longer a peak bound, because the Limiter enforces the ceiling.
- **Pad**: The main Ambience layer. Soft minor chords of detuned triangle and sine voices that fade in and out slowly and overlap.
- **Chord_Set**: The allowed Pad chords: D minor, Bb major, G minor and A major in the progression D minor, Bb, G minor, A, plus one tritone colour chord (D half-diminished: D, F, Ab, C). (amended 4) Each chord has four body notes (as before) and two Pad_Upper_Voices; the Chord_Set is the union of the body notes and the upper voicings of all chords.
- **Wind_Gust**: A single swell of resonant, whistling wind that rises from silence, sweeps the Wind_Band centre and fades back to near silence.
- **Bell_Toll**: A distant, inharmonic bell strike with a long exponential decay and a short feedback-delay reverb.
- **Rare_Detail**: An occasional low owl hoot or wood creak.
- **Layer_Share**: (amended 4) The mix weight (gain on the layer bus) of one layer: Pad 0.5, Wind_Gusts 0.12, Bell_Toll 0.7, Rare_Details 0.08. Each is at most 1.0. They no longer sum to 1.0 and are no longer a peak budget.
- **Pad_Crest_Factor**: (amendment 3, amended 4) The coherent (all voices in phase) sum of the Pad voice gains of one chord, as a multiple of 1.0. It was exactly 1.0 before amendment 3, at most 2.0 after it, and is at most 3.0 after amendment 4 (chosen 2.8, roughly the square root of the 9 voices per chord).
- **Ambience_Event**: A scheduled Wind_Gust, Bell_Toll, Rare_Detail or Pad chord start, driven by a tracked timer that uses the injected random.
- **Limiter**: (amendment 4) A `DynamicsCompressorNode` configured as a limiter (threshold -8 dB, knee 2 dB, ratio 20, attack 0.003 s, release 0.2 s) placed after the Master_Gain. It is a fast compressor, not a true brickwall limiter.
- **Output_Gain**: (amendment 4) The last gain node before the destination (chosen 0.6). It sits after the Limiter, absorbs the automatic makeup gain that Chrome's compressor adds, and provides the safety margin between the Limiter ceiling and the Output_Peak_Target.
- **Output_Peak_Target**: (amendment 4) 0.5 of full scale, measured at the Output_Gain output, with the tolerance of Requirement 16.5.
- **Pad_Upper_Voice**: (amendment 4) A soft pure sine at 415 to 880 Hz added to a Pad chord above its body notes, detuned 3 to 8 cents, with a voice weight of 0.45 relative to the weight 1.0 of one body note. Each chord has two.
- **Gain_Staging_Budget**: (amendment 4) The table of stage gains in the design that predicts the overall RMS (about +11 dB on the Pad compared with amendment 3). It is an estimate, verified by measurement.

## Superseded limits

The following limits from the first version of this spec are replaced by this amendment. They were wrong for Small_Speakers, not just too quiet.

| Old limit | New limit | Criterion |
| --- | --- | --- |
| Ambience gain <= 0.08 | Ambience_Bus <= 0.3 at the Master_Gain input (chosen 0.25) | 7.6 |
| Master_Gain <= 0.6 | Master_Gain <= 1.0 (chosen 0.9) | 10.1 |
| Crackle peak <= 0.25 | Crackle peak <= 0.2 | 8.5 |
| Chime peak <= 0.2 | Chime peak <= 0.18 | 9.4 |
| Ducked Ambience 0.04 | Ducked Ambience 0.12 | 10.2 |
| Drones at 55 Hz and 82 Hz, noise low-passed at 220 Hz | Harmonic drone at 110/220/330 Hz, band-passed wind at 400 to 1200 Hz | 7.11, 7.12 |
| Stake thud 180 Hz falling to 55 Hz | 300 Hz falling to 120 Hz plus mid body | 10.6 |
| (amendment 2) Steady 110/220/330 Hz sine drone | Pad: detuned triangle and sine chord voices, each at 116.5 Hz or higher, chords change every few seconds | 7.12, 15.5 |
| (amendment 2) Constant band-passed noise at 800 Hz (Q 1.2) swept by the Wind_LFO, wind inner gain 0.5 | Wind_Gusts: resonant band-pass (Q 8 to 14) swept 350 to 900 Hz, gain about 0 between gusts, Layer_Share 0.2; Wind_LFO removed | 7.11, 15.3, 15.4 |
| (amendment 2) Effective level 0.225 = wind 0.5 + drone 0.5 (inner gains) | Effective level 0.225 = Pad 0.5 + Wind 0.2 + Bell 0.2 + Detail 0.1 (Layer_Shares); Pad alone 0.1125 | 7.13, 7.18 |
| (amendment 2) Exactly one LFO and one looping buffer source in the Ambience | No LFO; exactly one looping buffer source (wind) and one scheduler timer per layer | 7.4, 15.4 |
| (amendment 3) Ambience_Bus 0.25 | Ambience_Bus 0.30 (ducked stays 0.12) | 7.6 |
| (amendment 3) Layer_Shares Pad 0.5, Wind 0.2, Bell 0.2, Detail 0.1; bell wet 0.2 and `bellDrySum` 0.75 | Pad 0.5, Wind 0.15, Bell 0.25, Detail 0.1 (sum 1.0); bell wet 0.15 and `bellDrySum` 0.8 | 7.13, 7.15 |
| (amendment 3) Effective level 0.225 (range 0.15 to 0.25), Pad alone 0.1125, Pad voice gains normalised to a coherent sum of 1.0 | Nominal effective level 0.27 (range 0.15 to 0.30), Pad alone 0.135, Pad_Crest_Factor up to 2.0; overall RMS target about 0.05 or more (verification target, not a test) | 7.13, 12.11, 13.10 |
| (amendment 4) Ambience_Bus 0.30, ducked 0.12 | Ambience_Bus 0.60 (hard maximum 1.0), ducked 0.24 (at most 0.5 x the normal bus) | 7.6, 10.2 |
| (amendment 4) Summed peak at the Master_Gain input at most 0.5 (`maxSummedPeak`); ducked 0.12 + crackle 0.2 + chime 0.18 = 0.50; strict unducked bound | Removed as a gate. The ceiling comes from the Limiter; the 0.5 is now the measured Output_Peak_Target at the final output | 10.2, 16.5 |
| (amendment 4) `allowedPeak` scaling of the stake, crackle and chime by the other active voices | Removed. Stake at most 0.3, crackle at most 0.2, chime at most 0.18 each stay. Ducking of the Ambience stays | 10.2, 10.3 |
| (amendment 4) Output peak at most 0.45 (= 0.9 x 0.5) by arithmetic | Output peak at most 0.5 by measurement, with tolerance and headroom | 10.1, 16.5 |
| (amendment 4) Effective level between 0.15 and 0.30, Pad alone between 0.10 and 0.15, Layer_Shares sum to 1.0 | Pad alone (Master_Gain x bus x Pad share) between 0.15 and 0.40; each Layer_Share at most 1.0; no sum rule | 7.13 |
| (amendment 4) Pad_Crest_Factor at most 2.0 (chosen 1.25 to 1.8, offline simulation bound about 1.27) | Pad_Crest_Factor at most 3.0 (chosen 2.8); the offline Pad worst-case simulation is removed | 7.13, 12.11 |
| (amendment 4) Layer_Shares Pad 0.55, Wind 0.12, Bell 0.25, Detail 0.08; `bellDrySum` 0.8 bounded by 1 / (1 + wet / (1 - feedback)) | Pad 0.5, Wind 0.12, Bell 0.7, Detail 0.08; `bellDrySum` 1.8 (hard maximum 2.0, the 0.8 bound is removed); wet 0.15 and feedback 0.4 unchanged | 7.15, 7.18 |
| (amendment 4) Per-layer worst-case sum of simultaneous voice peaks at most 1.0 of the layer gain | Removed | 7.18 |
| (amendment 4) Pad lowpass 1200 Hz, four body notes per chord | Pad lowpass 2500 Hz, four body notes plus two Pad_Upper_Voices (415 to 880 Hz) per chord | 7.12, 15.5 |
| (amendment 4) Master_Gain connected directly to the destination, no compressor or limiter | Master_Gain, Limiter, Output_Gain (0.6), destination | 10.1, 16.1 |
| (amendment 4) Disable ramps the Master_Gain to 0 | Disable ramps the Master_Gain and the Output_Gain to 0 within 80 ms and releases the Limiter | 7.8, 16.6 |

Unchanged by all amendments: stake peak <= 0.3 (10.3), fade-in >= 500 ms (7.7), stop ramp <= 100 ms with 80 ms chosen (7.8), crackle fade-out <= 400 ms (8.2), chime duration <= 1500 ms (9.3). The summed peak cap 0.5 (10.2) was unchanged by amendments 1 to 3 but is replaced by amendment 4: it is no longer a deterministic gate, it is the measured Output_Peak_Target enforced by the Limiter.

Tests that encode the old limits or frequencies and must be updated: `tests/soundConfig.test.ts` (master <= 0.6, ambience <= 0.08, crackle <= 0.25, chime <= 0.2, ducked sum), `tests/soundEngine.test.ts` Property 7 (looks for drones set at 55 and 82 Hz and exactly one looping buffer source), `tests/soundEngine.test.ts` Property 8 (master <= 0.6, ambience <= 0.08, chime <= 0.2, crackle <= 0.25 and 0.125). `tests/appSound.test.tsx` was searched and contains no gain or frequency literals, so it is not expected to change.

Tests that encode the first-amendment ambience and must be updated by amendment 2 (task 11.2): `tests/soundConfig.test.ts` (drone frequencies 110/220/330, drone detune, wind centre 800 and sweep 300, wind LFO, and the inner-share sum of wind 0.5 plus drones), and `tests/soundEngine.test.ts` Property 6 (assumes no timers except release timers), Property 7 (asserts drones at 110/220/330 Hz and exactly one LFO), Property 8 (reads `ctx.nodes[1]` as the ambience bus and the inner share sum), Property 10 (uses `ctx.nodes.length` right after `enable()` as a stable baseline, which breaks once Ambience_Events create nodes over time) and Property 13 (asserts 110/220/330 Hz oscillators and exactly one LFO).

Tests that encode amendment 3 limits and must change in task 13.2: `tests/soundConfig.test.ts` (bus 0.30 and ducked 0.12, shares pad 0.55 / wind 0.12 / bell 0.25 / detail 0.08 summing to 1.0, effective level window, Pad alone window 0.10 to 0.15, `padCrestFactor` at most 2.0, `maxSummedPeak`, ducked sum, strict unducked bound, the whole "Pad worst-case waveform simulation" describe block, `padLowpassHz` if asserted, `bellDrySum` bound), `tests/soundEngine.test.ts` Property 6 (asserts the Master_Gain connects to the destination and ramps to 0), Property 7 (node counts, add exactly one compressor), Property 8 (summed peaks, layer sums, `ctx.nodes[0]` master connected to the destination), Property 11 (the throwing fake context needs `createDynamicsCompressor`), Property 13 and 14 (Chord_Set membership now includes the upper voicings, voice counts per chord), and the `FakeAudioContext` itself. `tests/appSound.test.tsx` and `tests/garlicChime.test.tsx` contain hand-written fake contexts that need `createDynamicsCompressor`, otherwise `enable()` fails silently and their sound assertions break.

## Requirements

### Requirement 1: Viewport-fixed burn overlay

**User Story:** As a user who burns the crypt while scrolled down, I want the fire to cover the whole screen I am looking at, so that the animation looks complete wherever I am on the page.

#### Acceptance Criteria

1. WHEN the Burn_Sequence starts, THE Burn_Overlay SHALL cover the entire Viewport using fixed positioning.
2. WHILE the Burn_Sequence is playing, THE Burn_Overlay SHALL cover the entire Viewport regardless of the vertical scroll offset of the Crypt_View.
3. WHILE the Burn_Sequence is playing, THE Burn_Overlay SHALL anchor the flame layer to the bottom edge of the Viewport.
4. WHILE the Burn_Sequence is playing, THE Burn_Overlay SHALL ignore pointer events so that keyboard and mouse input are not trapped.
5. WHILE the Burn_Sequence is playing, THE Burn_Overlay SHALL stack above the Crypt_View and the top bar.
6. WHEN the Burn_Sequence completes, THE System SHALL remove the Burn_Overlay from the document.
7. THE Burn_Overlay SHALL remain hidden from assistive technologies.
8. WHEN the Burn_Sequence starts with full motion, THE Burn_Sequence SHALL complete within 1500 ms.

### Requirement 2: Scroll to top after burn

**User Story:** As a user who just burned the crypt, I want to land at the top of the Upload View, so that I do not end up looking at an empty part of the page.

#### Acceptance Criteria

1. WHEN the Burn_Sequence completes, THE System SHALL scroll the page to a vertical offset of 0.
2. WHEN the Burn_Sequence completes, THE System SHALL show the Upload_View.
3. WHEN the Burn_Sequence completes, THE System SHALL perform the scroll to offset 0 no later than the moment the Upload_View is rendered.
4. WHILE Reduced_Motion is active, THE System SHALL scroll to offset 0 instantly, without smooth scrolling.
5. WHEN the Burn_Sequence completes, THE System SHALL move keyboard focus to a visible element at the top of the Upload_View.

### Requirement 3: Reduced motion for the burn

**User Story:** As a user who prefers reduced motion, I want the burn to be a simple fade, so that I am not exposed to flames and moving particles.

#### Acceptance Criteria

1. WHILE Reduced_Motion is active, THE Burn_Overlay SHALL render a single full-Viewport scrim that fades in, without flame layer and without embers.
2. WHILE Reduced_Motion is active, THE Burn_Sequence SHALL complete within 300 ms.
3. WHILE Reduced_Motion is active, THE Burn_Overlay SHALL cover the entire Viewport using fixed positioning.
4. WHEN the Burn_Sequence completes while Reduced_Motion is active, THE System SHALL show the Upload_View scrolled to offset 0.

### Requirement 4: Honest garlic toast

**User Story:** As a user who sets garlic on a vampire, I want a message that says exactly what happened, so that I know a calendar file was downloaded and what to do with it.

#### Acceptance Criteria

1. WHEN the Garlic_Action succeeds, THE System SHALL show a Garlic_Toast stating that a calendar reminder file was downloaded and that opening the file adds a reminder 3 days before the next charge.
2. THE Garlic_Toast text SHALL NOT state or imply that the reminder was already added to a calendar, and SHALL NOT state that the reminder falls "the day before" the charge.
2a. THE Garlic_Toast text SHALL name Google Calendar, Apple Calendar and Outlook as the calendars that can open the file.
2b. THE 3-day offset stated in the Garlic_Toast, the Garlic_Hint and the Garlic_Button `title` SHALL equal the offset used by `generateIcs` in `src/engine/icsGenerator.ts` (an all-day event dated 3 days before `nextBiteDate`), and the System SHALL define that offset as a single exported constant used by both the generator and the copy.
3. THE Garlic_Toast SHALL include the display name of the vampire.
4. WHERE the interface language is English, THE System SHALL show the Garlic_Toast text in English from `en.json`.
5. WHERE the interface language is Spanish, THE System SHALL show the Garlic_Toast text in Spanish from `es.json`.
6. WHEN the Garlic_Toast appears, THE System SHALL announce the Garlic_Toast text to assistive technologies through a polite live region.
7. WHEN the Garlic_Toast has been visible for 6000 ms, THE System SHALL dismiss the Garlic_Toast.
8. THE Garlic_Toast SHALL provide a control that dismisses the Garlic_Toast immediately.
9. IF the Garlic_Action fails, THEN THE System SHALL show an error message stating that the calendar file could not be created.
10. WHILE Reduced_Motion is active, THE Garlic_Toast SHALL appear and disappear without movement animation.
11. THE System SHALL generate the `.ics` file locally and SHALL NOT send transaction data over the network.

### Requirement 5: Garlic button tooltip and visible hint

**User Story:** As a user deciding what to do with a vampire, I want the Garlic button to explain itself before I click it, so that I am not surprised by a file download.

#### Acceptance Criteria

1. THE Garlic_Button SHALL expose a `title` attribute explaining that the action downloads a calendar file which, when opened in Google Calendar, Apple Calendar or Outlook, adds a reminder 3 days before the next charge.
2. THE Vampire_Card SHALL display a Garlic_Hint as visible text near the Garlic_Button, so that the explanation is available on touch devices where `title` tooltips do not appear.
2a. THE Garlic_Hint text SHALL name Google Calendar, Apple Calendar and Outlook and SHALL state the 3-day offset.
2b. THE Garlic_Hint SHALL NOT depend on hover or focus to be visible.
3. THE Garlic_Button SHALL reference the Garlic_Hint through `aria-describedby`.
4. THE `aria-describedby` value of the Garlic_Button SHALL equal the `id` of the Garlic_Hint element, and each such `id` SHALL be unique within the document.
5. WHERE the interface language is English, THE System SHALL show the `title` and the Garlic_Hint in English from `en.json`.
6. WHERE the interface language is Spanish, THE System SHALL show the `title` and the Garlic_Hint in Spanish from `es.json`.
7. WHEN the user switches the interface language, THE System SHALL update the `title` and the Garlic_Hint to the selected language.
8. THE Garlic_Hint SHALL remain visible on the Mobile_Viewport without horizontal scrolling of the Vampire_Card.
9. THE Garlic_Hint text SHALL state that the action downloads a calendar file and does not add the reminder automatically.

### Requirement 6: Sound off by default and full stop

**User Story:** As a user, I want sound to be opt-in and to stop instantly when I turn it off, so that the app never surprises me with noise.

#### Acceptance Criteria

1. WHEN the System first loads with no stored sound preference, THE System SHALL set sound to off.
2. WHILE sound is off, THE Sound_Engine SHALL produce no audio output.
3. WHILE sound is off, THE System SHALL NOT start an audio context before the user turns sound on.
4. WHEN the user turns sound off, THE Sound_Engine SHALL stop the Ambience, the Fire_Crackle and the Garlic_Chime within 100 ms.
5. WHEN the user turns sound off, THE Sound_Engine SHALL release all running oscillators, noise sources and timers it created.
6. WHEN the user turns sound off during the Burn_Sequence, THE Burn_Sequence SHALL continue to completion without audio.
7. WHEN the user turns sound on, THE Sound_Engine SHALL resume or create the audio context within the same user gesture.
8. IF the browser does not support the Web Audio API, THEN THE Sound_Engine SHALL leave the interface working without audio and without displaying an error.
9. THE Sound_Toggle SHALL expose its on or off state through `aria-pressed`.

### Requirement 7: Ambience on every screen

**User Story:** As a user who enabled sound, I want a quiet spooky background on every screen, so that the whole app feels like one haunted place.

#### Acceptance Criteria

1. WHILE sound is on, THE Sound_Engine SHALL play the Ambience on the Upload_View.
2. WHILE sound is on, THE Sound_Engine SHALL play the Ambience on the Crypt_View.
3. WHILE sound is on, THE Sound_Engine SHALL play the Ambience on the sample picker, the column mapper, the summoning screen and the cleansed screen.
3a. WHILE sound is on, THE Ambience SHALL be independent of which screen is shown, so that it plays on every screen without being started by any individual screen.
4. WHEN the user navigates between screens while sound is on, THE Sound_Engine SHALL keep a single continuous Ambience instance without restarting or stacking.
5. THE Sound_Engine SHALL synthesize the Ambience with Web Audio nodes and SHALL NOT load audio files.
6. (amended, amended 3, amended 4) THE Sound_Engine SHALL set the Ambience_Bus gain to no more than 1.0 of full scale (hard maximum) and SHALL choose 0.60 as its normal value (0.30 after amendment 3, 0.25 before). The peak at the output is no longer bounded by this value; the Limiter (Requirement 16) enforces the ceiling. This replaces the old limits of 0.08 and 0.3.
7. WHEN the user turns sound on, THE Sound_Engine SHALL fade the Ambience in over at least 500 ms.
8. (amended 4) WHEN the user turns sound off, THE Sound_Engine SHALL ramp the Master_Gain and the Output_Gain to 0 over no more than 100 ms (chosen 80 ms) before releasing nodes. The Limiter SHALL be released with all other nodes (Requirement 16.6).
9. WHEN the document becomes hidden, THE Sound_Engine SHALL suspend audio output.
10. WHEN the document becomes visible again while sound is on, THE Sound_Engine SHALL resume audio output.
11. (amended 2) THE Ambience SHALL include Wind_Gusts made of looping noise through a resonant band-pass filter (the Wind_Band) with Q between 8 and 14, whose centre frequency is automated during each Wind_Gust along a sweep of roughly 350 Hz up to 900 Hz and back to about 400 Hz. The centre frequency SHALL stay between 350 Hz and 900 Hz at every automation point. Each Wind_Gust SHALL swell from near silence to its peak and fade back to near silence, and a new Wind_Gust SHALL start every 8 to 20 seconds, chosen with the injected random.
12. (amended 2, amended 4) THE Ambience SHALL include a Pad made of soft minor chords. The chords SHALL follow the progression D minor, Bb major, G minor, A major, and a tritone colour chord MAY replace a progression chord occasionally, chosen with the injected random and never in two consecutive slots. Each chord SHALL be built from four body notes, each a detuned triangle and sine pair (detune of 10 cents or less), and (amended 4) two Pad_Upper_Voices, each a single detuned sine (3 to 8 cents, opposite sign to the body sine) with a voice weight of 0.45 relative to 1.0 for one body note. Each voice SHALL have a frequency of at least 100 Hz and belong to the Chord_Set (body notes, for example D3 146.8 Hz, F3, A3, Bb2 116.5 Hz, plus the upper voicings: Dm 587.33 and 880.00 Hz, Bb 466.16 and 698.46 Hz, Gm 587.33 and 783.99 Hz, A 659.25 and 880.00 Hz, tritone 415.30 and 523.25 Hz). The Pad lowpass cutoff SHALL be 2500 Hz (1200 Hz before amendment 4). Each chord SHALL fade in and out over about 6 to 10 seconds with slow gain envelopes. Consecutive chords SHALL overlap in a crossfade, no more than two chords SHALL sound at the same time, and the Pad SHALL NOT be a single steady tone. The aim of the upper voices and the higher cutoff is more energy between 300 Hz and 2500 Hz, where laptop speakers respond; the spectrum share above 150 Hz and above 300 Hz is reported by the verifier (13.10), not asserted.
13. (amended 4) THE Sound_Engine SHALL use this Gain_Staging_Budget: Master_Gain 0.9, Ambience_Bus 0.60, Layer_Shares Pad 0.5, Wind_Gusts 0.12, Bell_Toll 0.7, Rare_Details 0.08, Pad_Crest_Factor 2.8 (hard maximum 3.0), `bellDrySum` 1.8 (hard maximum 2.0). The Pad alone (Master_Gain x Ambience_Bus x Pad share, 0.9 x 0.60 x 0.5 = 0.27) SHALL be between 0.15 and 0.40. The windows of amendment 3 (nominal effective level 0.15 to 0.30, Pad alone 0.10 to 0.15, Layer_Shares summing to 1.0) are removed. THE Ambience SHALL reach an overall RMS of 0.05 or more at the final output (0.019 measured after amendment 3), a Bell_Toll block RMS of at least 1.5 times the mean Pad block RMS while it rings (about 0.6 times after amendment 3), and an output peak of 0.5 or less (Requirement 16.5), all as measured in Chrome (13.10). These are verification targets reported honestly, not strict automated tests. The estimated budget (about +11 dB on the Pad against amendment 3) is in the design section "Master limiter and second loudness lift (amendment 4)".
14. THE Ambience SHALL be audible on a Small_Speaker, and the Sound_Engine SHALL NOT rely on any content below 100 Hz (see Requirement 15).
15. (new, amendment 2, amended 4) THE Ambience SHALL include a Bell_Toll every 25 to 45 seconds, chosen with the injected random. The Bell_Toll SHALL use inharmonic sine partials with ratios of 1, 2.0, 2.76, 5.4 and 8.9 on a base frequency between 220 Hz and 330 Hz (every partial at 100 Hz or higher), a soft attack, and an exponential decay of 4 to 6 seconds for the base partial. The Bell_Toll SHALL be slightly reverberant through a feedback delay of 120 to 200 ms with a feedback gain of at most 0.5 and a small wet gain (0.15). The delay network nodes SHALL be tracked and released like every other node. (amended 4) The partial gains are `bellShares[i] x bellDrySum` with `bellDrySum` at most 2.0 (chosen 1.8) on a bell bus with Layer_Share 0.7, so that the Bell_Toll is clearly louder than the Pad when it rings (target: bell block RMS at least 1.5 times the mean Pad block RMS, measured, see 7.13). The former bound `bellDrySum <= 1 / (1 + wet / (1 - feedback))` is removed.
16. (new, amendment 2) THE Ambience MAY include one Rare_Detail every 40 to 90 seconds, chosen with the injected random, and the kind SHALL be chosen randomly between a low owl hoot and a wood creak. The owl hoot SHALL be two soft falling sine notes (about 420 Hz falling to 350 Hz, then about 380 Hz falling to 310 Hz) with short envelopes. The wood creak SHALL be a short band-passed noise burst with a slow centre glide, with every frequency at 100 Hz or higher.
17. (new, amendment 2) THE Ambience SHALL schedule the Pad chords, Wind_Gusts, Bell_Toll and Rare_Details with tracked timers that use the injected `setTimeout` and the injected random, one pending scheduler timer per layer. WHEN the Wind_Gust ends, THE wind gain SHALL return to 0.02 or less and SHALL stay there until the next Wind_Gust, so that there is no steady noise bed. WHILE the document is hidden, THE Sound_Engine SHALL NOT create new Ambience_Event node groups, so that suspended-time events do not pile up.
18. (new, amendment 2, amended 4) THE Sound_Engine SHALL give each Ambience layer its own gain node connected to the Ambience_Bus with the Layer_Share as its gain (Pad 0.5, Wind_Gusts 0.12, Bell_Toll 0.7, Rare_Details 0.08). Each Layer_Share SHALL be at most 1.0 and the Layer_Shares SHALL NOT be required to sum to 1.0. The worst-case rules of amendments 2 and 3 (sum of simultaneous voice peaks at most 1.0 of the layer gain, Ambience peak at most the bus gain, ducked Ambience + Fire_Crackle + Garlic_Chime = 0.50) are removed: they existed to prevent clipping without a limiter, and the Limiter (Requirement 16) now enforces the peak ceiling. The remaining hard maxima are: Ambience_Bus at most 1.0, Pad alone between 0.15 and 0.40, Pad_Crest_Factor at most 3.0, `bellDrySum` at most 2.0 and the bell feedback at most 0.5. Ducking of the Ambience_Bus while the Fire_Crackle, the Garlic_Chime or the stake thud play is kept (10.2).
19. (new, amendment 2) THE Sound_Engine SHALL release every node created by an Ambience_Event, and clear every Ambience timer (Pad, Wind_Gust, Bell_Toll, Rare_Detail, event release timers), within the 80 ms stop on disable, and SHALL keep the Ambience a singleton: repeated `enable()` calls SHALL NOT add a second Pad scheduler or any other layer scheduler.

### Requirement 8: Fire crackle during burn

**User Story:** As a user who enabled sound, I want to hear fire while the crypt burns, so that the animation feels real.

#### Acceptance Criteria

1. WHEN the Burn_Sequence starts while sound is on, THE Sound_Engine SHALL start the Fire_Crackle.
2. WHEN the Burn_Sequence completes, THE Sound_Engine SHALL fade the Fire_Crackle out and stop it within 400 ms.
3. WHILE the Fire_Crackle is playing, THE Sound_Engine SHALL keep the Ambience at or below its normal gain.
4. THE Sound_Engine SHALL synthesize the Fire_Crackle from filtered noise bursts at randomized intervals and SHALL NOT load audio files.
5. (amended) THE Sound_Engine SHALL set the Fire_Crackle peak gain to no more than 0.2 of full scale at the Master_Gain input (chosen 0.2). This replaces the old limit of 0.25.
6. WHILE Reduced_Motion is active and sound is on, THE Sound_Engine SHALL play the Fire_Crackle at no more than half of its full-motion peak gain.
7. WHILE sound is off, THE Burn_Sequence SHALL start without creating a Fire_Crackle.
8. (amended) THE Fire_Crackle noise bursts SHALL pass through a band-pass filter with a centre frequency randomized between 1500 Hz and 4000 Hz, so that the crackle is audible on a Small_Speaker.

### Requirement 9: Garlic chime

**User Story:** As a user who enabled sound, I want a soft chime when I set garlic, so that I get gentle confirmation.

#### Acceptance Criteria

1. WHEN the Garlic_Action succeeds while sound is on, THE Sound_Engine SHALL play the Garlic_Chime once.
2. THE Sound_Engine SHALL synthesize the Garlic_Chime from sine oscillators with an exponential decay and SHALL NOT load audio files.
3. THE Sound_Engine SHALL limit the Garlic_Chime duration to 1500 ms.
4. (amended) THE Sound_Engine SHALL set the Garlic_Chime peak gain to no more than 0.18 of full scale at the Master_Gain input (chosen 0.18). This replaces the old limit of 0.2.
5. IF the Garlic_Action fails, THEN THE Sound_Engine SHALL NOT play the Garlic_Chime.
6. WHILE sound is off, THE Garlic_Action SHALL complete without creating a Garlic_Chime.
7. THE Garlic_Chime partials SHALL stay at 880 Hz and 1320 Hz.

### Requirement 10: Gentle overall volume and no clipping

**User Story:** As a user, I want all sounds to be soft and balanced, so that nothing is startling.

#### Acceptance Criteria

1. (amended, amended 4) THE Sound_Engine SHALL route all sounds through a single Master_Gain with a value of no more than 1.0 (chosen 0.9). The Master_Gain output SHALL feed the Limiter, the Limiter SHALL feed the Output_Gain, and only the Output_Gain SHALL connect to the destination (Requirement 16.1). Before amendment 4 the safety came from a summed peak of at most 0.5 at the Master_Gain input (output at most 0.45); now it comes from the Limiter and the Output_Gain, with the Output_Peak_Target of 0.5 verified by measurement.
2. (amended, amended 4) WHILE any other voice (Fire_Crackle, Garlic_Chime or stake thud) is active, THE Sound_Engine SHALL duck the Ambience_Bus from 0.60 to 0.24 (the ducked gain SHALL be below the normal gain and at most 0.5 times it), using the existing 50 ms ramp, so that the foreground sounds stay clear. The summed peak cap of 0.5 at the Master_Gain input, the ducked sum 0.12 + 0.2 + 0.18 and the `allowedPeak` scaling of voices by each other are removed (they were the anti-clipping mechanism of amendments 1 to 3; the Limiter replaces them). Pad, Wind_Gust, Bell_Toll and Rare_Detail voices remain part of the Ambience and are ducked together through the Ambience_Bus.
3. (amended 4) THE Sound_Engine SHALL keep the stake thud peak gain at or below 0.3 of full scale at the Master_Gain input. It is no longer scaled down when other voices are active (the Limiter handles overlaps). The Fire_Crackle (at most 0.2) and the Garlic_Chime (at most 0.18) keep their own peaks, so the relative loudness of the foreground sounds is unchanged.
4. THE Sound_Engine SHALL expose its volume constants from a single module so that tests can assert them.
5. (amended, amended 4) THE Sound_Engine SHALL expose from `SOUND_CONFIG` these values: `masterGain` 0.9, `ambienceGain` 0.60, `ambienceDuckedGain` 0.24, `crackleGain` 0.2, `chimeGain` 0.18, `stakeGain` 0.3, `stopRampMs` 80, `ambienceFadeInMs` 800, `padCrestFactor` 2.8, `padLowpassHz` 2500, `layerShares` (pad 0.5, wind 0.12, bell 0.7, detail 0.08), `bellDrySum` 1.8, the Pad upper voicings and their weight, a `limiter` group (threshold -8 dB, knee 2 dB, ratio 20, attack 0.003 s, release 0.2 s), `limiterOutputGain` 0.6 and `outputPeakTarget` 0.5. `maxSummedPeak` is removed.
6. (amended) THE stake thud SHALL start at about 300 Hz and fall to about 120 Hz (a 300 to 120 Hz pitch drop over about 0.18 s) and SHALL add a mid-frequency body, a triangle oscillator at about 700 Hz with a short decay (about 0.12 s) plus the existing band-passed noise crack, so that it is audible on a Small_Speaker. The body voices share the stake peak: low 0.5, mid body 0.3, crack 0.2, summing to 1.0.
7. THE Sound_Engine SHALL keep the 80 ms Master_Gain stop ramp, SHALL create no audio files and no network requests, and SHALL keep the Ambience a singleton.

### Requirement 11: Privacy and offline behavior

**User Story:** As a privacy-conscious user, I want the new features to keep my data on my computer, so that the core promise holds.

#### Acceptance Criteria

1. THE System SHALL make no network requests to implement the Burn_Overlay, the Garlic_Toast or the Sound_Engine.
2. THE System SHALL NOT download audio files, fonts or images for the Sound_Engine, the Garlic_Toast or the Garlic_Hint.
3. THE System SHALL persist the sound on or off choice only in `localStorage`, and the System SHALL remove the sound choice when the user triggers the "wipe everything" action.

### Requirement 12: Unit tests

**User Story:** As a maintainer, I want automated tests for the new behavior, so that regressions are caught.

#### Acceptance Criteria

1. THE System SHALL include Vitest unit tests for the Sound_Engine using a mocked `AudioContext`.
2. THE unit tests SHALL verify that sound off creates no audio context and produces no nodes.
3. (amended 2) THE unit tests SHALL verify that turning sound off stops and disconnects the Ambience (including in-flight Pad chords, Wind_Gusts, Bell_Toll with its delay network, and Rare_Details), the Fire_Crackle and the Garlic_Chime, and clears all timers including the Pad, Wind_Gust, Bell_Toll and Rare_Detail timers.
4. (amended 2) THE unit tests SHALL verify that starting the Ambience twice results in one running instance: one Pad scheduler, one Wind_Gust scheduler, one Bell_Toll scheduler, one Rare_Detail scheduler, one looping buffer source and no LFO.
5. (amended 4) THE unit tests SHALL verify that the Master_Gain, Ambience_Bus, ducked bus, Layer_Shares, Pad_Crest_Factor, `bellDrySum`, Output_Gain, Fire_Crackle, Garlic_Chime and stake values stay within the hard maxima of Requirements 7, 8, 9, 10 and 16, and that the ducked bus is below the normal bus. THE unit tests SHALL NOT assert any sum of peaks.
6. THE unit tests SHALL verify that the Fire_Crackle starts on Burn_Sequence start and stops on Burn_Sequence completion.
7. THE unit tests SHALL verify that the Garlic_Chime plays on Garlic_Action success and not on failure.
8. THE unit tests SHALL verify that the Garlic_Toast, `title`, Garlic_Hint and `aria-describedby` render in both English and Spanish, that each names Google Calendar, Apple Calendar and Outlook, and that each states 3 days.
8a. THE unit tests SHALL verify that the offset in `generateIcs` output (`DTSTART` minus `nextBiteDate`) equals the exported offset constant.
9. THE unit tests SHALL verify that the Burn_Overlay uses fixed positioning and that the page scroll offset is 0 after the Burn_Sequence completes.
10. THE unit tests SHALL verify the Reduced_Motion branch of the Burn_Overlay.
11. (amended 4) THE unit tests SHALL encode the limits of Requirements 7, 8, 9, 10 and 16 as amended by amendment 4 and SHALL NOT encode the superseded ones. These earlier tests are removed: the "sum of peaks at most 0.5" assertions (`maxSummedPeak`, ducked sum 0.12 + 0.2 + 0.18, strict unducked bound), the worst-case layer-sum assertions of 7.18, the Property 8 summed-peak and per-layer-sum assertions, and the offline simulation of the worst-case Pad waveform. The nominal Effective_Ambience_Level and Pad alone windows of amendment 3 are replaced by Pad alone in [0.15, 0.40]. The RMS, bell-to-pad and peak targets are not asserted by unit tests.
12. THE unit tests SHALL verify the Audible band property of Requirement 15.
13. WHEN `vitest --run` is executed, THE System SHALL pass all existing and new tests.
14. (new, amendment 2, amended 4) THE unit tests SHALL use fake timers, an injected `setTimeout` and an injected random, and a `FakeAudioContext` extended with `createDelay`, `setValueCurveAtTime` and `cancelScheduledValues`, and SHALL verify: (a) the Pad changes chord over simulated time, every voice belongs to the Chord_Set (body notes and upper voicings) at 100 Hz or higher, chords overlap and no more than two sound at once, and at least 3 distinct chords occur in a simulated 120 s (4 with a random that never selects the tritone chord); (b) Wind_Gust, Bell_Toll and Rare_Detail gaps stay within 8 to 20 s, 25 to 45 s and 40 to 90 s with the injected random swept between its minimum and its maximum; (c) the wind gain returns to 0.02 or less between gusts; (d) the Layer_Shares, the 0.60 bus, the ducked bus below the normal bus and the delay feedback of at most 0.5.
15. (new, amendment 4) THE unit tests SHALL extend the `FakeAudioContext` (and the hand-written fake contexts in `tests/appSound.test.tsx` and `tests/garlicChime.test.tsx`) with `createDynamicsCompressor`, and SHALL verify: (a) exactly one Limiter exists per session, with threshold, knee, ratio, attack and release equal to the `SOUND_CONFIG` values; (b) the output chain is Master_Gain, Limiter, Output_Gain, destination, the Output_Gain is the only node connected to the destination, and every voice and the Ambience_Bus reach the destination only through the Limiter; (c) the creation order is Master_Gain first, Ambience_Bus second, Limiter third, Output_Gain fourth; (d) on `disable()` the Master_Gain and the Output_Gain are scheduled to 0 within 80 ms, the Limiter and the Output_Gain are disconnected after the stop and no timer remains; (e) a context that cannot create the compressor leaves the engine silent and harmless; (f) each Pad chord has two Pad_Upper_Voices from the upper voicings and the Pad lowpass cutoff is 2500 Hz. THE unit tests SHALL NOT claim to prove the peak ceiling, the RMS, the compressor makeup gain or the bell-to-pad ratio: a fake context has no signal processing, so those are verified only in Chrome (13.10, 13.11).

### Requirement 13: Playwright MCP verification

**User Story:** As a maintainer, I want the fixes checked in a real browser at desktop and mobile sizes, so that layout and behavior are proven beyond unit tests.

#### Acceptance Criteria

1. WHEN verification runs on the Desktop_Viewport, THE verifier SHALL load a sample statement, scroll to the middle of the Crypt_View, trigger the burn, and confirm that the Burn_Overlay covers the full Viewport.
2. WHEN verification runs on the Mobile_Viewport, THE verifier SHALL load a sample statement, scroll to the middle of the Crypt_View, trigger the burn, and confirm that the Burn_Overlay covers the full Viewport.
3. WHEN the Burn_Sequence completes in either viewport, THE verifier SHALL confirm that `window.scrollY` equals 0 and that the Upload_View is visible.
4. WHEN verification runs on either viewport, THE verifier SHALL trigger the Garlic_Action in English and in Spanish and confirm the Garlic_Toast text, the `title` and the visible Garlic_Hint.
5. WHEN verification runs on the Mobile_Viewport, THE verifier SHALL confirm that the Garlic_Hint causes no horizontal overflow of the page.
6. WHEN verification runs on either viewport, THE verifier SHALL confirm that the Sound_Toggle is off on first load.
7. (amended 2) WHEN verification runs on either viewport with sound turned on, THE verifier SHALL confirm through console or audio-context inspection that the Ambience starts (Pad chords are created and change), that the Fire_Crackle runs during the burn, and that turning sound off suspends or silences all output.
8. WHEN verification runs, THE verifier SHALL confirm that the browser console shows no errors and that no network request carries transaction data.
9. WHEN verification runs with Reduced_Motion emulated, THE verifier SHALL confirm that the Burn_Overlay shows only the fade scrim and that the Burn_Sequence completes within 300 ms.
10. (amended 2, amended 3, amended 4) WHEN verification runs with sound on, THE verifier SHALL measure the final output (an `AnalyserNode` or script processor tapped on the Output_Gain output, with `AudioContext` patched before app start to count oscillators and sources and to capture the Limiter instance) over 60 to 90 seconds of Ambience, or render the same graph in an `OfflineAudioContext`, and SHALL report: the overall RMS (target 0.05 or more; 0.019 after amendment 3); the peak (target 0.5 or less, tolerance in 16.5); the mean and standard deviation of the 1 s block RMS and their ratio std/mean, to show the sound still varies; the Bell_Toll block RMS against the mean Pad block RMS (target at least 1.5 times; about 0.6 times after amendment 3); the number of Pad chord changes, Wind_Gusts and Bell_Tolls observed (guaranteed minimums in 90 s: 18, 4, 1); the share of spectrum energy above 100 Hz, above 150 Hz and above 300 Hz (reported, not asserted); and the Limiter `reduction` readout (mean and maximum gain reduction in dB) to show how hard it works. THE verifier SHALL report honestly that real loudness on a physical Small_Speaker cannot be measured, that a headless audio sink may be silent, that the Limiter is a compressor and not a brickwall, that a Bell_Toll strike is expected to be limited for a few hundred milliseconds and may briefly dip the Pad (reported, not hidden), and that whether the result is spooky is subjective and cannot be measured.
11. (new, amendment 4) WHEN verification runs with sound on, THE verifier SHALL also run a burst scenario with the Ambience playing while the Fire_Crackle, the Garlic_Chime and the stake thud overlap (at least three repetitions), report the output peak during the bursts against the 0.5 target and its tolerance, and confirm that turning sound off brings the output to silence within about 80 ms (tap RMS below 0.001 from 150 ms after the toggle). THE verifier SHALL confirm that the console shows no errors and that no network request carries transaction data (13.8 applies unchanged).

### Requirement 14: Change management

**User Story:** As a maintainer, I want to review the changes before they are committed, so that I stay in control of the repository history.

#### Acceptance Criteria

1. WHEN the implementation tasks finish, THE System SHALL leave all changes uncommitted in the working tree.
2. THE implementation SHALL NOT run `git commit` or `git push`.

### Requirement 15: Audible band (no reliance on low frequencies)

**User Story:** As a user with laptop or phone speakers, I want every sound to live in a frequency range my speakers can play, so that I actually hear it.

#### Acceptance Criteria

1. THE frequency of every Audio_Rate_Oscillator in the Ambience, the stake thud, the Fire_Crackle and the Garlic_Chime SHALL be at least 100 Hz at creation and at every scheduled automation point, including pitch-drop end values.
2. THE centre or cutoff frequency of every filter in the Ambience, the stake thud, the Fire_Crackle and the Garlic_Chime SHALL be at least 100 Hz.
3. (amended 2) THE Wind_Band centre frequency SHALL be within 350 Hz to 900 Hz at every automation point of every Wind_Gust, and its Q SHALL be between 8 and 14.
4. (amended 2) THE Ambience SHALL contain no Wind_LFO and no oscillator below 100 Hz. The former sub-1 Hz LFO exception is retired because the sweep is automated directly on the filter `frequency` parameter. Any oscillator created by the Sound_Engine SHALL therefore satisfy criterion 1.
5. (amended 2, amended 4) EVERY Pad voice frequency (the four body notes and the two Pad_Upper_Voices of the chord) SHALL belong to the Chord_Set and be at least 100 Hz, the upper voices SHALL lie between 415 Hz and 880 Hz with a detune of 10 cents or less, EVERY Bell_Toll partial SHALL be at least 100 Hz (base 220 to 330 Hz times ratios 1, 2.0, 2.76, 5.4, 8.9), and EVERY Rare_Detail frequency (owl hoot notes and wood creak glide) SHALL be at least 100 Hz.
6. (new, amendment 2) THE Bell_Toll feedback gain SHALL be at most 0.5 and its delay time between 120 ms and 200 ms.


### Requirement 16: Master limiter (amendment 4)

**User Story:** As a user with laptop or phone speakers, I want the ambience to be loud enough to hear and never harsh or clipped, so that I can use sound without adjusting my volume up and down.

#### Acceptance Criteria

1. THE Sound_Engine SHALL route its output as: every voice and the Ambience_Bus into the Master_Gain, the Master_Gain into the Limiter, the Limiter into the Output_Gain, the Output_Gain into the destination. Only the Output_Gain SHALL connect to the destination, and no voice SHALL bypass the Limiter.
2. THE Limiter SHALL be a `DynamicsCompressorNode` created with `createDynamicsCompressor`, with threshold -8 dB (allowed -12 to -6), knee 2 dB (allowed 0 to 3), ratio 20, attack 0.003 s (at most 0.005) and release 0.2 s (allowed 0.1 to 0.25), set at creation and read from `SOUND_CONFIG`.
3. THE Output_Gain SHALL be at most 1.0 and SHALL sit after the Limiter. The chosen value is 0.6. Reason: Chrome's compressor applies an automatic makeup gain of `(1 / saturate(1))^0.6`, which for these settings is estimated at about 1.6 to 1.7 (+4.2 to +4.6 dB) and cannot be disabled, so without a post gain the Limiter output would reach about 0.7 instead of the 0.42 steady-state ceiling that 0.6 gives (estimate: 0.70 x 0.6). The estimate is verified by measurement, not by unit tests.
4. THE `AudioContextLike` interface SHALL expose `createDynamicsCompressor`. The creation order SHALL be documented and tested: Master_Gain first (`ctx.nodes[0]`), Ambience_Bus second (`ctx.nodes[1]`), Limiter third, Output_Gain fourth, all created and wired inside `enable()` before the Ambience starts, so that no sound can reach the destination unlimited.
5. THE contract for the peak SHALL be: the measured peak at the Output_Gain output is at most 0.5 over at least 60 seconds of Ambience and over the burst scenario of 13.11. A tolerance of 10 percent applies to isolated transient samples (up to 0.55; the count of samples above 0.5 SHALL be reported); any sample above 0.55, or a sustained level above 0.5, fails the criterion and the levers are tuned (Output_Gain down to 0.4, threshold down to -12 dB) or the work stops and is reported. The documented headroom is the difference between the estimated steady-state ceiling (about 0.42) and 0.5, about 1.5 dB, which absorbs the overshoot allowed by the finite attack. A true brickwall guarantee is NOT claimed: the attack is finite, a look-ahead of about 6 ms exists in Chrome but is not guaranteed in other browsers, and the makeup gain is automatic.
6. WHEN the user turns sound off, THE Sound_Engine SHALL ramp the Master_Gain and the Output_Gain to 0 within 80 ms, and SHALL then stop, disconnect and release the Limiter and the Output_Gain together with every other tracked node and clear every timer. WHEN sound is turned on again, THE Sound_Engine SHALL create a fresh Limiter.
7. IF the Limiter cannot be created (for example the context has no `createDynamicsCompressor`), THEN THE Sound_Engine SHALL stay silent and leave the interface working without audio and without an error, so that audio is never played without the Limiter.
8. THE unit tests SHALL prove only that the Limiter exists, its parameters, the output chain wiring, the creation order and its release (12.15). THE peak ceiling, the RMS and the bell-to-pad ratio SHALL be verified only by measurement in Chrome (13.10, 13.11).
9. Unchanged: sound is off by default, no audio files are loaded, no network request is made, the Ambience stays a singleton and the changes are left uncommitted (Requirement 14).
