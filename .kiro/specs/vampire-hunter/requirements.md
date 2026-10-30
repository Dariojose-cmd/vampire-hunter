# Requirements Document

## Introduction

Vampire Hunter is a browser-only web application that helps regular users discover forgotten recurring charges ("vampire subscriptions") hidden in their bank statement CSV files. The user uploads a CSV, the app detects recurring charges entirely in the browser, and presents each one as a "vampire" in a haunted crypt. The user decides what to do with each vampire: stake it (cancel), spare it (keep), or hang garlic (set a reminder). No transaction data ever leaves the user's device.

## Glossary

- **App**: The Vampire Hunter single-page browser application.
- **Transaction**: A single row from the uploaded CSV representing one bank operation.
- **Vampire**: A recurring charge detected by the Detection Engine with a confidence score ≥ 60.
- **Possible Vampire**: A recurring charge candidate with a confidence score between 1 and 59.
- **Bite**: A single charge instance belonging to a Vampire.
- **Blood Drained**: The total money spent on a Vampire to date (sum of all Bites).
- **Annual Blood Loss**: The annualized cost of a Vampire based on detected cadence and amount.
- **Threat Level**: A severity category (Low / Medium / High / Critical) derived from Annual Blood Loss.
- **Stake**: The user action to mark a Vampire as cancelled.
- **Spare**: The user action to mark a Vampire as intentionally kept.
- **Garlic**: The user action to schedule a reminder before the next Bite.
- **Crypt**: The main screen displaying all Vampires as cards.
- **Blood Meter**: The summary bar showing total Annual Blood Loss and blood saved from staked Vampires.
- **Detection Engine**: The pure TypeScript module that parses, normalizes, and scores recurring charge candidates.
- **Catalog**: The local JSON file listing ~60 known subscription services with aliases and cancellation data.
- **Normalizer**: The Detection Engine sub-module that cleans merchant description strings.
- **Cadence**: The detected payment frequency — weekly, monthly, quarterly, or yearly.
- **Confidence Score**: An integer 0–100 representing how likely a candidate is a recurring subscription.
- **ICS File**: An iCalendar file (`.ics`) used to add a calendar event.
- **Crypt Storage**: The localStorage namespace where user decisions are persisted.

---

## Requirements

### Requirement 1: CSV Import

**User Story:** As a user, I want to drag-and-drop or pick a CSV bank statement file, so that the App can find my recurring charges without me having to copy anything manually.

#### Acceptance Criteria

1. THE App SHALL accept CSV file input via drag-and-drop onto a designated drop zone.
2. THE App SHALL accept CSV file input via a file-picker dialog triggered by a button.
3. WHEN a CSV file is provided, THE App SHALL parse it using Papa Parse entirely in the browser without sending data over the network.
4. WHEN column auto-detection succeeds, THE App SHALL identify the date, description, and amount columns without user intervention.
5. WHEN column auto-detection fails to identify required columns, THE App SHALL display a column-mapping step allowing the user to assign each required column manually.
6. THE App SHALL support amount data in a single column where debits are negative numbers and credits are positive numbers.
7. THE App SHALL support amount data split across two columns (one for debits, one for credits).
8. THE App SHALL parse decimal amounts that use either a dot (`.`) or a comma (`,`) as the decimal separator.
9. THE App SHALL parse dates in `DD/MM/YYYY`, `MM/DD/YYYY`, and `YYYY-MM-DD` formats and store them as ISO 8601 date strings.
10. WHEN the date format is ambiguous (both interpretations are valid calendar dates, e.g. `03/04/2026`), THE App SHALL inspect the entire date column: if any value's first segment is greater than 12, the format is `DD/MM/YYYY`; if any value's second segment is greater than 12, the format is `MM/DD/YYYY`.
11. IF the date format cannot be inferred from the column data alone, THE App SHALL ask the user to select the date format explicitly during the column-mapping step.
12. THE App SHALL convert all parsed monetary amounts to integer cents before passing them to the Detection Engine.
13. THE App SHALL provide three built-in sample CSV statements: one US bank statement in USD with dot decimals, one Latin American bank statement in Spanish with comma decimals, and one intentionally messy statement with inconsistent formatting.
14. THE App SHALL display a "Try a sample" button that loads a selected sample file without requiring the user to upload a real file.
15. IF a provided file is not a valid CSV or cannot be parsed, THEN THE App SHALL display a human-readable error message without crashing.
16. THE App SHALL classify each parsed transaction as a debit (outgoing money) or credit (incoming money). In a single-amount column, negative values are debits and positive values are credits. In a two-column layout, any value in the debit column is an outgoing charge.
17. THE App SHALL pass only debit transactions to the Detection Engine. Credit transactions (salary, transfers, refunds) SHALL be silently excluded from vampire detection.
18. THE App SHALL classify zero-amount transactions (0.00) as debits, because free trials appear as zero charges on bank statements.

---

### Requirement 2: Transaction Normalization

**User Story:** As the Detection Engine, I need cleaned merchant names to group charges reliably, so that the same service is not split into multiple candidates due to reference codes or formatting noise.

#### Acceptance Criteria

1. THE Normalizer SHALL remove card numbers (sequences of 4 or more consecutive digits) from description strings.
2. THE Normalizer SHALL remove reference codes and transaction identifiers that match common bank noise patterns (e.g., alphanumeric codes at the start or end of descriptions).
3. THE Normalizer SHALL remove the words `POS`, `PURCHASE`, `COMPRA`, `PAGO`, `CARGO`, `DEBIT`, and `PAYMENT` (case-insensitive) from description strings.
4. THE Normalizer SHALL collapse multiple consecutive whitespace characters into a single space and trim leading and trailing whitespace.
5. THE Normalizer SHALL convert all characters to uppercase before returning the normalized string.
6. FOR ALL strings `s`, applying the Normalizer twice SHALL produce the same result as applying it once (idempotence property).
7. WHEN two descriptions refer to the same merchant but differ only by noise patterns, THE Normalizer SHALL produce identical normalized strings for both.

---

### Requirement 3: Catalog Matching

**User Story:** As a user, I want the App to recognize known subscription services by name, so that my vampires have proper names and cancellation info without me having to look anything up.

#### Acceptance Criteria

1. THE App SHALL ship a Catalog containing at least 60 well-known subscription services, including but not limited to: Netflix, Spotify, Disney+, YouTube Premium, Amazon Prime, iCloud, Google One, ChatGPT Plus, Adobe Creative Cloud, and major gym chains and mobile carriers.
2. WHEN a normalized description matches a Catalog entry's canonical name or any of its aliases (case-insensitive), THE Detection Engine SHALL associate the candidate with that Catalog entry.
3. WHERE a Catalog entry is matched, THE App SHALL display the service's canonical name instead of the raw description.
4. WHERE a Catalog entry is matched, THE App SHALL make the service's cancellation URL and step-by-step cancellation instructions available for the Stake action.
5. WHEN no Catalog entry matches, THE Detection Engine SHALL still report the Vampire using the normalized description as its name if it meets the confidence threshold.

---

### Requirement 4: Recurrence Detection

**User Story:** As a user, I want the App to automatically identify which charges are recurring, so that I don't have to manually review hundreds of transactions.

#### Acceptance Criteria

1. THE Detection Engine SHALL group transactions by normalized merchant name before evaluating recurrence.
2. THE Detection Engine SHALL detect the following cadences with widened tolerances to accommodate weekends and bank holidays: weekly (5–9 days), monthly (26–35 days), quarterly (85–97 days), and yearly (355–375 days).
3. WHEN a group of transactions contains at least two charges matching a supported cadence with date tolerance, THE Detection Engine SHALL classify it as a recurring candidate.
4. FOR ALL ordered sequences of transactions where each consecutive gap is between 26 and 35 days, THE Detection Engine SHALL classify the cadence as monthly.
5. THE Detection Engine SHALL evaluate amount stability: a candidate is amount-stable if all Bites are within 10% of the median Bite amount.
6. WHEN a candidate's amounts are not stable but show a consistent upward trend over time, THE Detection Engine SHALL flag the candidate as having a price increase and record the history of amounts.
7. WHEN the first charge in a group is zero cents or less than 20% of the subsequent median amount, THE Detection Engine SHALL flag the candidate as a free-trial conversion.
8. FOR ALL orderings of the input transaction rows, THE Detection Engine SHALL produce the same set of detected Vampires (order-independence property).
9. WHEN a transaction appears in only one instance with no matching charges at any supported cadence, THE Detection Engine SHALL NOT include it in the Vampire results.
10. THE Detection Engine SHALL NEVER classify a credit (incoming) transaction as a Vampire or Possible Vampire, regardless of recurrence patterns.

---

### Requirement 5: Confidence Scoring

**User Story:** As a user, I want to see only likely recurring charges by default, so that the crypt is not cluttered with false positives.

#### Acceptance Criteria

1. THE Detection Engine SHALL assign every recurring candidate a Confidence Score integer in the range 0–100.
2. THE Detection Engine SHALL factor the following signals into the Confidence Score: number of observed Bites, cadence regularity (date variance), amount stability, and Catalog match.
3. THE App SHALL display only Vampires with a Confidence Score ≥ 60 in the default crypt view.
4. THE App SHALL provide a toggle control that, when activated, additionally displays Possible Vampires (Confidence Score 1–59) with a distinct visual treatment.
5. WHEN a candidate has a Confidence Score below 1, THE App SHALL not display it under any view setting.

---

### Requirement 6: Vampire Profiles

**User Story:** As a user, I want to see a clear summary for each vampire, so that I understand exactly how much a subscription is costing me.

#### Acceptance Criteria

1. THE App SHALL display the following data for each Vampire: canonical name, generated avatar image, Cadence description in plain language (e.g., "bites every month"), amount per Bite in the user's currency, total Blood Drained to date, date of first Bite, predicted date of next Bite, Annual Blood Loss, and Threat Level.
2. THE Detection Engine SHALL calculate Annual Blood Loss as: (amount per Bite in cents) × (number of Bites per year implied by Cadence).
3. THE Detection Engine SHALL classify Threat Level as: Low (Annual Blood Loss < $50), Medium ($50–$199), High ($200–$499), Critical (≥ $500).
4. WHEN a Vampire has a recorded price-increase history, THE App SHALL display the history of Bite amounts in chronological order on the Vampire's profile.
5. THE App SHALL generate a unique avatar for each Vampire deterministically from the Vampire's normalized name, so that the same Vampire always shows the same avatar.
6. THE Detection Engine SHALL predict the next Bite date by adding one Cadence interval to the date of the most recent Bite.

---

### Requirement 7: The Crypt (Main Screen)

**User Story:** As a user, I want to see all my vampires in one dramatic screen, so that I can grasp at a glance how much money they are draining.

#### Acceptance Criteria

1. THE App SHALL display all Vampires as cards in a Crypt screen styled with a dark, spooky visual theme.
2. THE App SHALL sort Vampire cards by Threat Level descending (Critical first) by default.
3. THE App SHALL display a Blood Meter at the top of the Crypt showing the total Annual Blood Loss across all active (non-staked) Vampires and the total blood saved from staked Vampires.
4. THE App SHALL provide filter controls that show: all Vampires, only Staked, only Spared, or only Garlic-marked Vampires.
5. WHEN no CSV has been uploaded and no decisions are stored, THE App SHALL display an empty-state prompt guiding the user to upload a file or try a sample.

---

### Requirement 8: Stake Action (Cancel)

**User Story:** As a user, I want to stake a vampire and get clear cancellation instructions, so that I can actually stop the charge without hunting for the cancellation page myself.

#### Acceptance Criteria

1. WHEN the user selects the Stake action on a Vampire, THE App SHALL display step-by-step cancellation instructions and a direct cancellation URL from the Catalog (if available).
2. WHEN the user selects the Stake action on a Vampire, THE App SHALL generate and display a cancellation email draft in the currently selected UI language, including the service name, the user's intent to cancel, and a request for written confirmation.
3. THE App SHALL provide a one-click copy button for the generated cancellation email.
4. WHEN a Vampire is staked, THE App SHALL play a stake animation using Framer Motion where the Vampire card transitions to a dust/ash state.
5. WHEN a Vampire is staked, THE App SHALL add its Annual Blood Loss to the "blood saved" total in the Blood Meter.
6. WHEN a Vampire is staked, THE App SHALL persist the Staked status to Crypt Storage (localStorage) so it survives page reload.

---

### Requirement 9: Spare Action (Keep)

**User Story:** As a user, I want to mark a subscription as intentional, so that it stops cluttering my crypt with things I actually want.

#### Acceptance Criteria

1. WHEN the user selects the Spare action on a Vampire, THE App SHALL mark the Vampire card with a distinct "spared" visual treatment and dim it relative to unreviewed Vampires.
2. WHEN a Vampire is spared, THE App SHALL persist the Spared status to Crypt Storage so it survives page reload.
3. WHEN a spared Vampire's Spare status is removed by the user, THE App SHALL restore the card to its default unreviewed visual state.

---

### Requirement 10: Garlic Action (Reminder)

**User Story:** As a user, I want to set a reminder before a vampire's next bite, so that I can decide whether to cancel before being charged again.

#### Acceptance Criteria

1. WHEN the user selects the Garlic action on a Vampire, THE App SHALL generate and trigger a download of an ICS calendar event file.
2. THE ICS file SHALL schedule the event 3 days before the predicted next Bite date.
3. THE ICS file SHALL include the Vampire's name, the predicted Bite amount, and a short description in the currently selected UI language.
4. WHEN a Vampire is marked with Garlic, THE App SHALL persist the Garlic status to Crypt Storage so it survives page reload.

---

### Requirement 11: Persistence and Reset

**User Story:** As a user, I want my decisions to be remembered across sessions, and I want to be able to wipe everything cleanly, so that I stay in control of my data.

#### Acceptance Criteria

1. THE App SHALL persist all user decisions (Staked, Spared, Garlic) in Crypt Storage using localStorage.
2. THE App SHALL NOT persist raw transaction data or uploaded file contents in localStorage or any other storage mechanism.
3. THE App SHALL provide a "Burn the Crypt" button that clears all data from Crypt Storage.
4. WHEN the user activates "Burn the Crypt", THE App SHALL display a confirmation prompt before deleting any data.
5. WHEN the user confirms "Burn the Crypt", THE App SHALL remove all Crypt Storage entries and return to the empty-state view.

---

### Requirement 12: Language Selection

**User Story:** As a user, I want to switch between English and Spanish, so that the app works in my preferred language.

#### Acceptance Criteria

1. THE App SHALL support English (`en`) and Spanish (`es`) as UI languages.
2. THE App SHALL display a language switch control visible on all screens.
3. WHEN the user activates the language switch, THE App SHALL re-render all UI strings in the selected language without a page reload.
4. WHEN the user activates the language switch, THE App SHALL regenerate any displayed cancellation email drafts in the newly selected language.
5. THE App SHALL persist the selected language preference in localStorage so it is restored on next visit.

---

### Requirement 13: Privacy and Data Safety

**User Story:** As a user, I want to be certain my bank data never leaves my computer, so that I can trust the app with sensitive financial information.

#### Acceptance Criteria

1. THE App SHALL perform all CSV parsing, normalization, and detection entirely within the browser using client-side JavaScript.
2. THE App SHALL NOT make any network request that transmits transaction descriptions, amounts, dates, or any derived financial data.
3. THE App SHALL display a visible privacy notice on the upload screen stating that data never leaves the user's device.
4. THE App SHALL NOT include any third-party analytics, tracking scripts, or session recording tools.

---

### Requirement 14: Currency Detection

**User Story:** As a user, I want the app to recognize my currency automatically so that threat levels and amounts are displayed correctly for my region.

#### Acceptance Criteria

1. THE App SHALL attempt to auto-detect the transaction currency from currency symbols (e.g., `$`, `€`, `£`) or ISO 4217 codes (e.g., `USD`, `EUR`, `MXN`, `COP`, `ARS`, `BRL`) present in the CSV amount column or a dedicated currency column.
2. WHEN a currency is detected, THE App SHALL display it as the active currency and use it for all amount formatting throughout the UI.
3. THE App SHALL provide a currency selector control that allows the user to override the auto-detected currency.
4. WHEN the user changes the currency via the selector, THE App SHALL re-format all displayed amounts using the newly selected currency without re-running detection.
5. THE Detection Engine SHALL express Threat Level thresholds in the detected or user-selected currency's base units (e.g., Low < 50 units, Medium 50–199 units, High 200–499 units, Critical ≥ 500 units), so the thresholds remain meaningful across currencies.
6. THE App SHALL persist the user's currency override in localStorage so it is restored on next visit.

---

### Requirement 15: Accessibility and Responsive Layout

**User Story:** As a user with accessibility needs or a small screen, I want the app to be fully usable with a keyboard, a screen reader, and on a mobile device, so that I am not excluded from understanding my finances.

#### Acceptance Criteria

1. THE App SHALL support full keyboard navigation: all interactive elements (file picker, sample button, vampire card actions, filters, language switch, currency selector) SHALL be reachable and activatable via keyboard alone.
2. ALL interactive elements SHALL display a clearly visible focus indicator when focused via keyboard.
3. ALL text and UI components SHALL meet WCAG 2.1 AA color contrast requirements (minimum 4.5:1 for normal text, 3:1 for large text and UI components).
4. ALL Vampire cards SHALL include appropriate ARIA labels describing the vampire name, annual cost, and available actions for screen-reader users.
5. ALL action buttons (Stake, Spare, Garlic) SHALL have accessible names that convey their purpose to screen readers (e.g., "Stake Netflix – cancel this subscription").
6. WHEN the user's operating system or browser reports `prefers-reduced-motion: reduce`, THE App SHALL replace the Framer Motion stake animation (dust/dissolve) with a simple CSS opacity fade of ≤ 300 ms.
7. THE App layout SHALL be responsive and fully usable at a minimum viewport width of 360 px, with Vampire cards stacking vertically on narrow screens.
8. THE App SHALL not rely on hover-only interactions; all information and actions available on hover SHALL also be accessible via focus or tap.
