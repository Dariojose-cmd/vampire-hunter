# Requirements Document

## Introduction

This spec covers two visual-polish improvements to the existing Vampire Hunter app, created for the Costume Contest:

1. **The Burn the Crypt moment** — when the user confirms "Burn the Crypt", a short cinematic sequence plays (flames rise, tombstones are consumed, ashes drift away) before the app returns to the Upload View (empty altar). The effect is brief, never blocks interaction, and degrades to a simple fade under `prefers-reduced-motion`.
2. **A custom gothic icon system** — every emoji in the UI is replaced by a small, consistent set of inline SVG icons drawn in a single thin-line-art style that matches the gothic theme and inherits theme colors via `currentColor`. Icons are decorative (`aria-hidden`) when paired with visible text, or carry an accessible label when they stand alone. Emojis are also removed from the i18n string files.

Both improvements build on the completed vampire-hunter app and must preserve all existing behavior, accessibility, and the privacy guarantee (no network calls with user data).

## Glossary

- **Burn Sequence**: The animated transition that plays after the user confirms "Burn the Crypt".
- **Flame Layer**: An overlay element that renders the rising-flame animation on top of the crypt content during the Burn Sequence. It sits above the crypt content but below the top bar.
- **Ash / Ember**: Small particles that drift upward and fade out as the flames recede.
- **Upload View (empty altar)**: The app's empty/landing screen with the drop zone, "Pick a file" / "Try a sample", and the privacy notice. This is where the app returns after a burn.
- **Cleansed View**: The existing victory ending ("The crypt is cleansed") shown inside the results view when every vampire has a decision, displaying the total blood saved. This is NOT the post-burn destination and is unaffected by the Burn Sequence.
- **Top Bar**: The persistent header containing the brand mark, language switch, currency selector, and sound toggle (and the Burn the Crypt button on the results view).
- **Icon**: A single inline SVG glyph rendered by the shared Icon Component.
- **Icon Set**: The complete collection of named SVG icons that replace the app's emojis.
- **Icon Component**: The shared React component that renders a named icon with consistent sizing, stroke, and accessibility attributes.
- **Decorative Icon**: An icon adjacent to visible text that repeats its meaning; hidden from assistive technology via `aria-hidden="true"`.
- **Standalone Icon**: An icon that is the only content of a control or conveys meaning on its own; it carries an accessible name.
- **Reduced Motion**: The user/OS preference `prefers-reduced-motion: reduce`.

---

## Requirements

### Requirement 1: Burn Sequence Trigger and Timing

**User Story:** As a user, I want a dramatic but quick payoff when I burn the crypt, so that the destructive action feels satisfying without making me wait.

#### Acceptance Criteria

1. WHEN the user confirms "Burn the Crypt" in the confirmation prompt, THE App SHALL play the Burn Sequence before returning to the Upload View (empty altar).
2. THE Burn Sequence SHALL complete in no more than 1.5 seconds (full-motion variant), after which the Upload View (empty altar) is shown.
3. THE Burn Sequence SHALL NOT block user interaction: the Flame Layer SHALL NOT trap input, SHALL NOT cover the Top Bar, and SHALL NOT prevent the user from using the app once the sequence ends.
4. THE App SHALL clear Crypt Storage decisions at the same logical moment as today (on confirm) regardless of the animation; the data wipe SHALL NOT depend on the animation completing.
5. WHEN the Burn Sequence finishes, THE App SHALL return to the Upload View (empty altar) exactly as the current burn flow does (no change to the destination state).
6. THE Burn Sequence SHALL NOT show the Cleansed View victory ending at any point; the Cleansed View remains reserved for the all-decisions-made ending inside the results view.
7. THE Burn Sequence SHALL run only in response to a confirmed burn, never on page load, reload, or any non-burn navigation.

### Requirement 2: Burn Sequence Visual Content

**User Story:** As a user, I want the burn to look like flames consuming the crypt and leaving ashes, so that the horror theme is reinforced.

#### Acceptance Criteria

1. THE Burn Sequence SHALL render flames that rise from the bottom edge of the screen upward over the crypt contents.
2. THE Burn Sequence SHALL visually consume or dissolve the tombstones / vampire cards as the flames pass over them (e.g., fade, char, or dissolve the crypt content region).
3. THE Burn Sequence SHALL show ashes or embers that drift (upward/away) and fade out as the flames recede.
4. THE Burn Sequence SHALL end by revealing the Upload View (empty altar) with no flame or ash artifacts left on screen.
5. THE Flame Layer and particles SHALL be drawn with the existing theme colors (blood red / ember accents via design tokens), consistent with the gothic palette.
6. THE Flame Layer SHALL be layered above the crypt content region and below the Top Bar, so that the language switch, currency selector, and sound toggle remain visible and usable during the sequence.

### Requirement 3: Burn Sequence Reduced Motion

**User Story:** As a user who is sensitive to motion, I want the burn to be a calm fade instead of animated flames, so that the app does not trigger discomfort.

#### Acceptance Criteria

1. WHEN `prefers-reduced-motion: reduce` is active, THE App SHALL replace the animated Flame Layer and drifting ashes with a simple cross-fade from the crypt to the Upload View (empty altar).
2. THE reduced-motion fade SHALL complete within 300 ms.
3. THE reduced-motion variant SHALL NOT render rising-flame or particle motion.
4. THE reduced-motion variant SHALL reach the exact same Upload View (empty altar) as the full-motion variant.
5. THE App SHALL detect the preference using the same mechanism already used elsewhere (Framer Motion `useReducedMotion`) so behavior is consistent app-wide.

### Requirement 4: Icon Component and Style System

**User Story:** As a user on any operating system, I want icons to look identical and match the theme, so that the app feels crafted rather than relying on inconsistent emoji rendering.

#### Acceptance Criteria

1. THE App SHALL provide a single shared Icon Component that renders named inline SVG icons.
2. ALL icons in the Icon Set SHALL share one consistent visual style: thin line art on a common viewBox and stroke weight, matching the gothic theme.
3. ALL icons SHALL inherit color via `currentColor` (no hardcoded fills/strokes that bypass the theme), so an icon's color follows its surrounding text color / theme token.
4. THE Icon Component SHALL accept a size (defaulting to a value aligned with adjacent text, e.g. `1em`) and SHALL scale crisply without rasterization.
5. THE Icon Component SHALL render inline SVG only and SHALL NOT perform any network request to fetch icon assets.
6. THE Icon Set SHALL provide, at minimum, icons that replace every emoji currently used in the app (see Requirement 5 inventory).

### Requirement 5: Complete Emoji Replacement

**User Story:** As a user, I want no emoji left anywhere in the UI, so that the visual language is uniform.

#### Acceptance Criteria

1. THE App SHALL replace every emoji currently rendered in components with an Icon from the Icon Set. At minimum this includes:
   - blood drop (Summoning loader, VampireCard threat badge, StakeModal confirm button)
   - coffin / empty-state (EmptyState)
   - tombstone (VampireCard staked state)
   - shield (BloodMeter saved, Cleansed saved)
   - garlic (VampireCard garlic decision)
   - praying hands (VampireCard spared decision)
   - chart / trend-up (VampireCard price-increase flag)
   - ticket (VampireCard free-trial flag)
   - fire / flame (BurnButton label and confirm button)
   - link / external (StakeModal cancel URL)
   - warning (Uploader error, and anywhere an alert icon is shown)
   - bat (App brand mark)
   - speaker-on / speaker-off (App sound toggle)
   - undo (VampireCard undo control)
   - sample markers: US, Mexico, Colombia, messy/web (SamplePicker)
2. THE App SHALL NOT render any Unicode emoji character in the DOM after this change (verified by scanning rendered output and source).
3. WHERE a sample-picker item previously used a flag/emoji, THE App SHALL use a themed Icon plus a short gothic-styled country label ("US", "MX", "CO") so each sample stays clearly identifiable without flag emojis. The messy/stress sample SHALL use a themed Icon with its existing text label.
4. THE replacement SHALL preserve the existing layout, label text, and control semantics (same buttons, same actions, same positions).
5. THE Icon Set SHALL reuse one shared icon for the same concept across the app (e.g., the same blood-drop icon in all three places it appears) rather than drawing per-location variants.

### Requirement 6: Icon Accessibility

**User Story:** As a screen-reader user, I want icons to be announced correctly, so that decorative icons are silent and meaningful standalone icons are described.

#### Acceptance Criteria

1. WHEN an Icon is adjacent to visible text that conveys the same meaning, THE Icon SHALL be decorative (`aria-hidden="true"`) and SHALL NOT add redundant announcements.
2. WHEN an Icon stands alone as the entire content of a control, THE control OR the Icon SHALL expose an accessible name describing its purpose (e.g., the sound toggle).
3. THE icon replacement SHALL NOT remove or weaken any existing `aria-label` on a control; existing accessible names SHALL be preserved.
4. THE Icon Component SHALL default to decorative (`aria-hidden="true"`) and SHALL require an explicit accessible name to be announced, so icons are never accidentally announced.
5. THE change SHALL preserve existing focus indicators, keyboard operability, and WCAG 2.1 AA contrast of all affected controls.

### Requirement 7: Remove Emojis from i18n Strings

**User Story:** As a translator and as a user, I want translation strings to contain only words, so that icons are a UI concern and text stays clean in every language.

#### Acceptance Criteria

1. THE App SHALL remove emoji characters from all i18n string values in `en.json` and `es.json`, including at minimum: the privacy notice (`🔒`), the "all staked" celebration (`🧛‍♂️`), and the ICS event summary (`⚠️`).
2. WHERE an emoji in a string conveyed meaning, THE App SHALL convey that meaning with an adjacent Icon in the UI, not inside the translated string.
3. THE ICS calendar event text SHALL contain no emoji, so downloaded `.ics` files render cleanly in all calendar apps.
4. THE English and Spanish files SHALL remain structurally identical (same keys) after emoji removal.
5. THE change SHALL NOT alter the meaning of any translated string beyond removing the emoji glyph and any now-stray whitespace.

### Requirement 8: Preserve Existing Behavior and Guarantees

**User Story:** As a user, I want these visual changes to leave everything else working, so that nothing regresses.

#### Acceptance Criteria

1. THE change SHALL NOT make any network request carrying transaction data, and SHALL NOT add analytics or tracking (privacy guarantee preserved).
2. THE change SHALL keep the engine layer free of UI concerns; icons and burn animation live only in the UI layer.
3. THE existing test suite SHALL continue to pass, and the production build SHALL succeed.
4. THE existing burn data-wipe behavior (clearing Crypt Storage on confirm) SHALL remain correct and verifiable.
5. ALL existing component responsibilities, props, and public behavior SHALL remain intact except for the icon/animation presentation changes described here.

### Requirement 9: Verification

**User Story:** As the reviewer, I want visual proof that both features work, so that I can approve them confidently.

#### Acceptance Criteria

1. THE work SHALL be verified with the Playwright MCP, capturing screenshots of: one or more frames of the Burn Sequence, the vampire cards with icons, the Blood Meter with icons, the Stake modal with icons, the cleansed (victory) ending, and a mobile (≈360 px) view.
2. THE verification SHALL confirm no emoji remain in the rendered DOM.
3. THE verification SHALL confirm the reduced-motion burn path resolves to the Upload View (empty altar) without flame/particle motion.
4. THE verification screenshots SHALL be shown to the user.
