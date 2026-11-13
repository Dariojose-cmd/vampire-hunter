# Requirements Document

## Introduction

Vampire Hunter promises that "your bank data never leaves your computer". Today the promise is enforced by the Content-Security-Policy in `customHttp.yml` (`connect-src 'self'`), but users cannot see it. This feature makes the promise visible and provable in two ways:

1. **Offline support (PWA).** After the first visit, the whole app works with no internet. A service worker precaches the built assets and the 5 sample CSVs, and a web manifest makes the app installable. The service worker must work under the current CSP, and new deployments must reach users on the next load.
2. **Privacy seal.** A small badge shows facts the page measures itself: the number of connections to other servers (Resource Timing API), whether the app is ready for offline use, and whether the browser is currently offline. A short "How do we know?" panel explains the CSP and states only what is measured.

The feature adds unit, property-based and Playwright tests, and guarantees that the 5 bundled sample statements stay byte-for-byte unchanged.

Design constraints from the workspace rules:

- Counting logic is pure TypeScript with no React imports (engine-style), tested with Vitest and fast-check.
- No transaction data is ever sent over the network. No analytics, no accounts, no backend.
- Strings exist in both `en.json` and `es.json`. Tone is spooky but clear.
- One component per file; styling uses design tokens (CSS variables).

## Glossary

- **App**: The Vampire Hunter single-page web application, served as a static site.
- **Own_Origin**: The scheme, host and port from which the App was loaded (`location.origin`).
- **Service_Worker**: The script registered by the App that intercepts requests and serves cached responses.
- **Precache**: The set of files the Service_Worker stores on install: all built assets of the current build (HTML, JS, CSS, fonts, icons) and the 5 Sample_Files.
- **Cache_Version**: An identifier derived from the content of the current build, so that every deployment with different output has a different value.
- **Sample_Files**: The 5 bundled CSV statements in `public/samples/`: `amex-positive-charges.csv`, `latam-bank-cop.csv`, `latam-bank-mxn.csv`, `messy-statement.csv`, `us-bank-usd.csv`.
- **Web_Manifest**: The `manifest.webmanifest` file that describes the App name, icons, colors and start URL.
- **CSP**: The Content-Security-Policy response header defined in `customHttp.yml`.
- **Privacy_Seal**: The small badge UI component that shows measured privacy facts.
- **Compact_Label**: The short visible text on the collapsed Privacy_Seal button, made of the count and the Offline_Status in a compact form (English example: "0 external connections · offline ready"; Spanish example: "0 conexiones externas · listo sin conexión").
- **Full_Status_Text**: The full-sentence form of the same facts: "Connections to other servers: N" (Spanish: "Conexiones a otros servidores: N") plus one of "Works offline: ready", "Works offline: preparing", "Works offline: not available", or "You're offline — still working" (Spanish: "Funciona sin conexión: listo", "Funciona sin conexión: preparando", "Funciona sin conexión: no disponible", "Sin conexión — sigue funcionando"). The Full_Status_Text is shown in the Seal_Panel as status lines, which count toward the word limit of Requirement 10 criterion 9, and forms the second part of the Accessible_Name.
- **Accessible_Name**: The accessible name of the Privacy_Seal button, built as the exact visible Compact_Label text, then the separator ". " (period and space), then the Full_Status_Text sentences, each ending with a period. This satisfies WCAG 2.5.3 Label in Name, because the visible label text is the start of the accessible name. English example: "0 external connections · offline ready. Connections to other servers: 0. Works offline: ready." Spanish example: "0 conexiones externas · listo sin conexión. Conexiones a otros servidores: 0. Funciona sin conexión: listo."
- **Seal_Panel**: The expandable "How do we know?" explanation shown from the Privacy_Seal. It is a non-modal disclosure: it does not trap focus and does not move focus when it opens.
- **Resource_Entry**: A `PerformanceResourceTiming` entry reported by the browser for a resource the page requested. Only its `name` (URL string) is used by the counting logic.
- **Connection_Counter**: The pure TypeScript module in `src/engine/` that classifies Resource_Entry URLs and counts external ones.
- **External_Request**: A Resource_Entry whose URL has an `http:` or `https:` scheme and an origin different from Own_Origin.
- **Offline_Status**: One of four values: `checking` (Service_Worker not yet active), `ready` (Service_Worker active), `offline` (browser reports no connection), `unavailable` (service workers unsupported or registration failed).
- **Full_Flow**: Upload a CSV, pick a sample, view the crypt, stake a vampire, download a garlic `.ics` file, burn the crypt, toggle sound, and switch language.
- **Preview_Server**: The server started by `npm run preview`, which serves `dist/` with the headers from `customHttp.yml`.
- **Header_Rules**: The list of path patterns in `customHttp.yml`, each with its own set of headers (service worker script, Web_Manifest, `index.html`, and `/assets/*`).
- **Header_Reader**: The line-based reader in `vite.config.ts` that parses Header_Rules and applies them to Preview_Server responses.
- **Path_Class**: One of the request path groups `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, and `/assets/<hashed>`.
- **Contrast_Ratio**: The WCAG relative-luminance contrast ratio of two colors, a number from 1 to 21.
- **Contrast_Function**: The pure TypeScript function in `src/engine/` that computes the Contrast_Ratio of two colors.
- **Reload_Decision**: The pure TypeScript function that decides, from the previous controller state and the loaded-statement state, whether the App reloads when a Service_Worker takes control.
- **Previous_Controller**: The Service_Worker that controlled the page before a new Service_Worker took control. On the very first visit there is none.

## Requirements

### Requirement 1: Offline Precache

**User Story:** As a user, I want the app to keep working without internet after my first visit, so that I can check my statement anywhere and trust that nothing needs a server.

#### Acceptance Criteria

1. WHEN the App finishes loading in a browser that supports service workers, THE App SHALL register the Service_Worker from a path under Own_Origin within 5 seconds of the load event.
2. WHEN the Service_Worker installs, THE Service_Worker SHALL store every built asset of the current build and all 5 Sample_Files in the Precache before the install event completes.
3. WHEN the Service_Worker installs, THE Service_Worker SHALL store the Web_Manifest and every icon the Web_Manifest references in the Precache before the install event completes.
4. WHILE the browser has no network connection, WHEN a navigation request to Own_Origin is made, THE Service_Worker SHALL answer it with the cached App shell, and the App SHALL render its initial screen with no network error page.
5. WHILE the browser has no network connection, WHEN a request for a Precache entry is made, THE Service_Worker SHALL answer it from the Precache without contacting the network.
6. IF the Precache cannot be completed during installation (any single entry fails to be stored), THEN THE Service_Worker SHALL fail installation, SHALL keep the previously active Service_Worker and its Precache serving requests, if any, and SHALL leave no partial Precache entries from the failed build active.
7. IF a browser does not support service workers, THEN THE App SHALL skip registration, SHALL continue to work online with all features available, and SHALL show no error message to the user and log no uncaught error to the console.
8. IF service worker registration fails, THEN THE App SHALL continue to work online, SHALL show no error message to the user, and SHALL send no transaction data as part of any retry.
9. THE Service_Worker SHALL send no request to an origin other than Own_Origin.
10. THE Service_Worker SHALL read, cache or log no CSV contents, parsed transactions or decisions, and the Precache SHALL contain only entries from the build, the Sample_Files and the Web_Manifest with its icons.

### Requirement 2: Offline Full Flow

**User Story:** As a user, I want every feature to work offline, so that going offline never breaks my hunt.

#### Acceptance Criteria

1. WHILE the browser has no network connection after at least one prior successful visit that fully loaded the App, WHEN the user opens the App, THE App SHALL load the main screen within 3 seconds without any browser network-error page.
2. WHILE the browser has no network connection after a prior successful visit, WHEN the user completes the Full_Flow (upload or pick a CSV, detect vampires, view the crypt, stake, spare or hang garlic on a vampire), THE App SHALL complete every step without displaying a network-error message.
3. WHILE the browser has no network connection, WHEN the user picks a Sample_File in the sample picker, THE App SHALL load the CSV from the cache and show the crypt within 3 seconds.
4. WHILE the browser has no network connection, THE App SHALL render the self-hosted fonts and all vampire avatar images with no broken-image icons and no fallback to system fonts caused by failed font requests.
5. WHILE the browser has no network connection, WHEN the user switches language between English and Spanish, THE App SHALL show 100% of UI strings in the selected language within 500 milliseconds.
6. WHILE the browser has no network connection, WHEN the user downloads a garlic reminder, THE App SHALL generate the `.ics` file locally from an object URL created in the browser and start the download without any network request.
7. IF the browser has no network connection and a required asset is missing from the cache, THEN THE App SHALL show an error message indicating the asset is unavailable offline, and THE App SHALL keep the current screen and the user's saved decisions unchanged.
8. IF a Sample_File fails to load in the sample picker, THEN THE SamplePicker SHALL show a friendly error message in the active UI language (English or Spanish, same spooky-but-clear tone as the existing errors) taken from the i18n key `errors.assetUnavailableOffline` present in both `en.json` and `es.json`, SHALL keep the current screen, and SHALL leave the user's saved decisions unchanged.

### Requirement 3: CSP Compatibility

**User Story:** As a privacy-minded user, I want offline support to add no new ways for data to leave my device, so that the privacy guarantee stays as strong as before.

#### Acceptance Criteria

1. THE CSP SHALL keep the directives `connect-src 'self'`, `default-src 'self'`, `script-src 'self'`, `object-src 'none'` and `frame-ancestors 'none'` with values identical to those present before this feature, character for character.
2. THE App SHALL deliver the Service_Worker as a separate same-origin script file containing zero inline `<script>` blocks and zero calls to `eval` or `new Function`.
3. THE App SHALL deliver the Web_Manifest as a same-origin file, referenced by a URL whose origin equals the App origin.
4. WHEN the Service_Worker is registered and the Web_Manifest is loaded in a browser enforcing the CSP, THE App SHALL complete both without any CSP violation report in the browser console.
5. IF the existing CSP already allows the Service_Worker and the Web_Manifest through its `default-src 'self'` fallback, THEN THE CSP SHALL receive zero new directives and zero widened directive values.
6. IF a CSP directive must change for the feature to work, THEN THE CSP SHALL limit the change to a single added source expression restricted to the App origin (`'self'`), with no wildcard (`*`), no `data:` or `blob:` scheme source, no `'unsafe-inline'` and no `'unsafe-eval'`, AND THE `customHttp.yml` file SHALL document the change in a comment that states the directive name and the reason.
7. THE `customHttp.yml` file SHALL contain a comment immediately above each header or directive added by this feature, written in the same comment style as the existing CSP comments and stating the purpose of that header or directive.
8. THE Preview_Server SHALL send, for every response, the same header names and header values that `customHttp.yml` defines for the request path of that response, including every header added by this feature.
9. THE Header_Reader SHALL apply Header_Rules per path pattern, by matching each request path against every path pattern in `customHttp.yml`, so that `npm run preview` returns the same headers per Path_Class as Amplify Hosting would.
10. WHEN a request path matches more than one path pattern, THE Header_Reader SHALL merge the headers of all matching patterns, and a later or more specific pattern SHALL override an earlier pattern only for the header names that the later pattern sets, keeping every earlier header that the later pattern does not set.
11. IF a request path matches no path pattern, THEN THE Header_Reader SHALL send only the headers of the catch-all pattern, if `customHttp.yml` defines one.

### Requirement 4: Updates Without Stale Versions

**User Story:** As a user, I want to get new versions on my next load, so that I am never stuck on an old version.

#### Acceptance Criteria

1. WHEN the build runs, THE build SHALL generate a Cache_Version that differs from the Cache_Version of any earlier build whose Precache content differs in at least one file, and that is identical for two builds with byte-identical Precache content.
2. WHEN the build runs, THE build SHALL generate the Precache file list automatically from the build output, with one content hash per file, so that no file list is maintained by hand.
3. WHEN a Service_Worker with a new Cache_Version installs, THE Service_Worker SHALL create a new cache named with that Cache_Version and store every file in the Precache list in it.
4. IF the Service_Worker fails to store any Precache file during install, THEN THE Service_Worker SHALL abort the install, delete the partially filled new cache, and keep the previously active Service_Worker and its cache in control.
5. WHEN a new Service_Worker activates, THE Service_Worker SHALL delete every cache created by an earlier Cache_Version and keep the cache of the current Cache_Version.
6. WHEN a new Service_Worker finishes installing, THE Service_Worker SHALL take control of all open pages without waiting for any tab to close.
7. WHEN the App loads, THE App SHALL ask the browser to check for a new Service_Worker script.
8. WHEN a new Service_Worker replaces a Previous_Controller and takes control of an open page, and the user has not loaded a file in the current session, THE App SHALL reload that page exactly once.
9. WHILE the user has a loaded statement in the current session, THE App SHALL keep the page from reloading when a new Service_Worker replaces a Previous_Controller, SHALL keep the loaded statement in memory, and SHALL use the new version on the next page load.
10. THE `customHttp.yml` file SHALL define Header_Rules with a separate path pattern for each of: the Service_Worker script, the Web_Manifest, `index.html`, and the content-hashed files under `/assets/*`.
11. THE hosting configuration SHALL serve the Service_Worker script, the Web_Manifest and `index.html` with a `Cache-Control` header that forces revalidation on every load.
12. THE hosting configuration SHALL serve content-hashed files under `/assets/*` with a `Cache-Control` header of `max-age` at least 31536000 seconds (1 year) and `immutable`.
13. FOR ALL pairs of builds with different Precache content, THE Service_Worker scripts SHALL have byte-different content (so the browser detects the update).
14. WHEN the Service_Worker takes control through `clients.claim()` on the very first visit, when the page has no Previous_Controller, THE App SHALL NOT reload the page (first visit: no reload).
15. THE Reload_Decision SHALL return "reload" only when a Previous_Controller exists and the user has not loaded a file in the current session, and SHALL return "no reload" in every other case.

### Requirement 5: Web Manifest

**User Story:** As a user, I want to install the app on my device, so that it opens like a normal app.

#### Acceptance Criteria

1. THE Web_Manifest SHALL declare a non-empty App name of at most 45 characters, a non-empty short name of at most 12 characters, `start_url`, `scope`, a `display` value of `standalone`, `theme_color`, `background_color` and an `icons` array.
2. THE Web_Manifest SHALL include an `icons` entry of 192x192 pixels and an entry of 512x512 pixels, each in PNG format with a purpose of `any`, plus at least one entry that declares a purpose of `maskable`.
3. WHEN `index.html` is loaded, THE `index.html` file SHALL contain exactly one `link` element with `rel="manifest"` that resolves to the Web_Manifest, and exactly one `meta` element named `theme-color`.
4. THE `theme_color` and `background_color` values in the Web_Manifest SHALL each equal, as a case-insensitive hex string, the corresponding dark crypt color token defined in `src/styles`, and THE `theme-color` meta tag content SHALL equal the Web_Manifest `theme_color`.
5. THE Web_Manifest SHALL use a `start_url` and a `scope` that resolve to Own_Origin, with `start_url` located within `scope`.
6. IF an icon file referenced by the Web_Manifest does not exist at its declared path or does not match its declared size, THEN THE build verification SHALL fail and report the icon entry that is invalid.

### Requirement 6: Sample Files Unchanged

**User Story:** As a maintainer, I want the 5 sample statements to remain exactly as they are, so that demos and tests stay reproducible.

#### Acceptance Criteria

1. THE feature SHALL leave each of the 5 Sample_Files byte-for-byte unchanged, in both `public/samples/` and `samples/`.
2. WHEN the build completes successfully, THE build SHALL produce a copy of each of the 5 Sample_Files in `dist/samples/` whose bytes are identical to the corresponding file in `public/samples/`.
3. WHEN the test suite runs, THE test suite SHALL compute the SHA-256 digest of each of the 5 Sample_Files in both `public/samples/` and `samples/` and compare each digest against the digest recorded from the repository state before this feature, so that 10 file comparisons are made.
4. IF any Sample_File digest differs from the recorded digest, THEN THE test suite SHALL fail, and the failure output SHALL name each differing file by its directory and file name.
5. WHEN the test suite runs, THE test suite SHALL compare the bytes of `public/samples/<name>` with the bytes of `samples/<name>` for each of the 5 Sample_Files, and SHALL fail with a message naming the file if the lengths or any byte differ.
6. IF a Sample_File is missing from `public/samples/`, `samples/`, or `dist/samples/` when the test suite checks it, THEN THE test suite SHALL fail and name the missing file and its directory, rather than skipping the check.

### Requirement 7: Connection Counting Logic

**User Story:** As a user, I want an honest count of requests to other servers, so that the number I see can be trusted.

#### Acceptance Criteria

1. THE Connection_Counter SHALL be pure TypeScript in `src/engine/` with no React import and no access to `window`, `document` or `performance`.
2. THE Connection_Counter SHALL receive a list of Resource_Entry URLs (0 to 10,000 entries) and Own_Origin as arguments, and SHALL return the External_Request count and the `unparseable` count as non-negative integers.
3. WHEN a URL resolves to an `http:` or `https:` origin with scheme, host and port equal to Own_Origin, THE Connection_Counter SHALL classify the URL as same-origin and exclude it from the External_Request count.
4. WHEN a URL resolves to an `http:` or `https:` origin different from Own_Origin, THE Connection_Counter SHALL classify the URL as an External_Request and include it in the External_Request count.
5. WHEN a URL has the `data:` scheme, THE Connection_Counter SHALL exclude it from the External_Request count and from the `unparseable` count.
6. WHEN a URL has the `blob:` scheme, THE Connection_Counter SHALL exclude it from the External_Request count and from the `unparseable` count.
7. WHEN a URL is relative, THE Connection_Counter SHALL resolve it against Own_Origin, classify it as same-origin and exclude it from the External_Request count.
8. WHEN a URL differs from Own_Origin in scheme, host or port (including a differing subdomain or an explicit non-default port), THE Connection_Counter SHALL classify it as an External_Request and include it in the External_Request count.
9. WHEN a URL has a scheme other than `http:`, `https:`, `data:` or `blob:` (for example `ws:` or `wss:`) and its origin differs from Own_Origin, THE Connection_Counter SHALL classify it as an External_Request and include it in the External_Request count.
10. IF a URL cannot be parsed, THEN THE Connection_Counter SHALL exclude it from the External_Request count, increment the `unparseable` count by 1, and continue processing the remaining URLs without throwing an error.
11. WHEN the same Resource_Entry URL appears more than once in the input or in successive incremental updates, THE Connection_Counter SHALL count it once, so that an incremental update containing only already-counted entries leaves the External_Request count and the `unparseable` count unchanged.
12. IF the input list is empty, THEN THE Connection_Counter SHALL return an External_Request count of 0 and an `unparseable` count of 0.
13. FOR ALL lists of URLs, the External_Request count SHALL be between 0 and the list length inclusive (invariant).
14. FOR ALL lists of URLs with no entry shared between them, THE External_Request count of the concatenation of two lists SHALL equal the sum of the External_Request counts of each list (metamorphic property).
15. FOR ALL lists of URLs, THE External_Request count and the `unparseable` count SHALL be unchanged by reordering the list (confluence).
16. FOR ALL lists of only same-origin, `data:` and `blob:` URLs, THE External_Request count SHALL equal 0.
17. FOR ALL lists that contain `n` distinct generated URLs with an `http:` or `https:` origin different from Own_Origin, THE External_Request count SHALL be at least `n`.
18. FOR ALL lists of URLs, applying the same list twice through the incremental update SHALL produce the same External_Request count and `unparseable` count as applying it once (idempotence).
19. THE Connection_Counter SHALL count a `ws:` or `wss:` URL with an origin different from Own_Origin as an External_Request only when that URL is passed to the Connection_Counter; because Resource Timing does not report WebSocket connections, the browser never supplies such URLs, and the CSP (`connect-src 'self'`) is what restricts WebSocket connections.

### Requirement 8: Live Measurement in the Browser

**User Story:** As a user, I want the number to update while I use the app, so that I see what the page really does.

#### Acceptance Criteria

1. WHEN the Privacy_Seal mounts, THE App SHALL read the existing Resource_Entry list from `performance.getEntriesByType('resource')` and pass the URL of every entry in that list to the Connection_Counter before the first count is displayed.
2. WHEN the browser reports a new Resource_Entry, THE App SHALL pass its URL to the Connection_Counter through a `PerformanceObserver` and update the Privacy_Seal.
3. THE App SHALL register the `PerformanceObserver` with the `buffered` option set to true, and SHALL raise the resource timing buffer size to at least 1000 entries, so that entries beyond the browser default buffer size of 250 are still counted.
4. IF `PerformanceObserver` or the Resource Timing API is unavailable, THEN THE Privacy_Seal SHALL show the text "not measurable in this browser" in the current UI language (English or Spanish) in place of a number, SHALL NOT show the number 0, and SHALL keep the rest of the app functional.
5. WHEN the count changes, THE Privacy_Seal SHALL show the updated count within 1 second.
6. THE App SHALL send no measurement result over the network.
7. IF the `PerformanceObserver` throws an error during registration or while delivering entries, THEN THE Privacy_Seal SHALL show the text "not measurable in this browser" instead of a number, and SHALL NOT show a stale count as current.
8. THE App SHALL treat the count as a measure of the entries in the Resource Timing list only; because Resource Timing does not report WebSocket connections, the count of `ws:` and `wss:` URLs applies only to URLs passed to the Connection_Counter (Requirement 7 criterion 19), and the CSP (`connect-src 'self'`) is what restricts WebSocket connections.

### Requirement 9: Privacy Seal Display

**User Story:** As a user, I want a small badge with facts I can check, so that the privacy promise is visible without getting in the way.

#### Acceptance Criteria

1. THE Privacy_Seal SHALL show a visible Compact_Label containing the current count of External_Request entries as a non-negative integer (0 to 999,999), starting at 0 when the app loads, and SHALL include the Full_Status_Text sentence "Connections to other servers: N" (Spanish: "Conexiones a otros servidores: N") in the Accessible_Name, after the exact Compact_Label text and the separator ". ", and in the Seal_Panel.
2. WHEN the count of External_Request entries changes, THE Privacy_Seal SHALL display the updated count in the Compact_Label and in the Accessible_Name (both the Compact_Label part and the Full_Status_Text part) within 1000 ms.
3. WHILE Offline_Status is `ready`, THE Privacy_Seal SHALL show the compact status "offline ready" (Spanish: "listo sin conexión") in the Compact_Label, and SHALL include "Works offline: ready" (Spanish: "Funciona sin conexión: listo") in the Full_Status_Text part of the Accessible_Name.
4. WHILE Offline_Status is `checking`, THE Privacy_Seal SHALL show the compact status "offline preparing" (Spanish: "preparando sin conexión") in the Compact_Label, and SHALL include "Works offline: preparing" (Spanish: "Funciona sin conexión: preparando") in the Full_Status_Text part of the Accessible_Name.
5. WHILE `navigator.onLine` is false, THE Privacy_Seal SHALL show the compact status "offline · still working" (Spanish: "sin conexión · sigue funcionando") in the Compact_Label, and SHALL include "You're offline — still working" (Spanish: "Sin conexión — sigue funcionando") in the Full_Status_Text part of the Accessible_Name in place of the "Works offline" sentence.
6. WHEN the browser fires the `online` or `offline` event, THE Privacy_Seal SHALL update the displayed status within 1000 ms to match the current value of `navigator.onLine`.
7. WHEN a Service_Worker becomes active, THE Privacy_Seal SHALL change Offline_Status from `checking` to `ready`.
8. IF service workers are unsupported or registration fails AND `navigator.onLine` is true, THEN THE Privacy_Seal SHALL set Offline_Status to `unavailable`, show the compact status "offline not available" (Spanish: "sin conexión no disponible") in the Compact_Label, include "Works offline: not available" (Spanish: "Funciona sin conexión: no disponible") in the Full_Status_Text part of the Accessible_Name, SHALL NOT show `ready`, and SHALL keep the External_Request count visible and the rest of the app usable.
9. WHEN the user switches the UI language, THE Privacy_Seal SHALL display the Compact_Label, the Accessible_Name (still starting with the exact visible Compact_Label text) and the Seal_Panel text in the selected language within 1000 ms, without losing the current count or Offline_Status.
10. THE Privacy_Seal SHALL appear on the landing screen, the sample picker, and the crypt screen.
11. WHILE the Privacy_Seal is collapsed on a viewport 360 px wide, THE Privacy_Seal SHALL be exactly one interactive control and SHALL show at most two lines of visible text, using the Compact_Label as its visible text, in both English and Spanish.
12. WHILE the viewport is 360 px wide or narrower, THE Privacy_Seal SHALL remain fully within the visible viewport and SHALL NOT overlap the crypt content, the language switch or the Burn button.
13. THE Privacy_Seal SHALL determine the displayed status with this precedence: WHILE `navigator.onLine` is false, THE Privacy_Seal SHALL show the offline status (criterion 5) regardless of whether Offline_Status is `checking`, `ready` or `unavailable`, including when service workers are unavailable; the `unavailable` status of criterion 8 SHALL show only while `navigator.onLine` is true.
14. WHEN `navigator.onLine` changes from false to true, THE Privacy_Seal SHALL show the status that matches the current Offline_Status (`checking`, `ready` or `unavailable`) within 1000 ms.

### Requirement 10: "How Do We Know?" Explanation

**User Story:** As a curious user, I want a short, honest explanation of how the page knows, so that I can verify the claim myself.

#### Acceptance Criteria

1. WHEN the user activates the Privacy_Seal control by click, tap, or pressing Enter or Space while it has focus, THE App SHALL open the Seal_Panel within 200 ms and SHALL NOT move keyboard focus automatically (non-modal disclosure, consistent with Requirement 11 criterion 6).
2. WHEN the user presses Escape or activates the close control while the Seal_Panel is open, THE App SHALL close the Seal_Panel within 200 ms and return keyboard focus to the Privacy_Seal button.
3. WHEN the Seal_Panel is open, THE Seal_Panel SHALL state that the page's CSP tells the browser to allow connections only to the App's own address.
4. WHEN the Seal_Panel is open, THE Seal_Panel SHALL state that the count is measured by the page from the requests the browser reports for this page.
5. WHEN the Seal_Panel is open, THE Seal_Panel SHALL state that the browser blocks requests the CSP forbids and that blocked requests may not appear in the count.
6. WHEN the Seal_Panel is open, THE Seal_Panel SHALL give the user a sequence of steps to inspect the CSP in the Network tab of the browser developer tools, naming the tab and the response header to look for.
7. THE Seal_Panel SHALL contain no claim about third-party systems, including Amplify, the network provider, and browser extensions.
8. THE Seal_Panel SHALL contain none of the absolute-claim terms "100% safe", "unhackable", "impossible to leak", "guaranteed", or their Spanish equivalents.
9. THE Seal_Panel SHALL contain at most 80 words in English and at most 80 words in Spanish, excluding the panel title and control labels.
10. WHERE the Seal_Panel uses the product vocabulary terms vampire, bite, or stake, THE Seal_Panel SHALL use each term only in a sentence whose meaning remains unchanged when the term is replaced by its plain equivalent (recurring charge, one charge, cancel).
11. WHEN the user switches the UI language while the Seal_Panel is open, THE App SHALL show the Seal_Panel text in the selected language within 200 ms and keep the Seal_Panel open.
12. THE Seal_Panel SHALL NOT claim that WebSocket connections are monitored or measured.
13. WHEN the Seal_Panel is open, THE Seal_Panel SHALL state briefly, within the word limit of criterion 9, that the count comes from the browser's resource timing list.

### Requirement 11: Accessibility and Localization

**User Story:** As any user, I want the seal to be readable in my language and usable with keyboard and screen reader, so that nobody is left out.

#### Acceptance Criteria

1. THE `en.json` and `es.json` files SHALL contain an identical set of keys for every string added by this feature, with zero keys present in one file and missing from the other.
2. WHEN the user switches language, THE Privacy_Seal and Seal_Panel SHALL display all of their text in the newly selected language within 100 ms and without a page reload.
3. THE Privacy_Seal control SHALL be a native `button` element whose Accessible_Name starts with the exact visible Compact_Label text, in English and in Spanish, in every status (`checking`, `ready`, `offline`, `unavailable`), followed by ". " and the Full_Status_Text sentences (the full count sentence and the full Offline_Status sentence) in the active language (WCAG 2.5.3 Label in Name), and whose `aria-expanded` attribute equals `true` while the Seal_Panel is open and `false` while it is closed.
4. WHEN the count or Offline_Status changes, THE Privacy_Seal SHALL announce the new Full_Status_Text sentences (without repeating the Compact_Label) through a live region with `aria-live` set to `polite`, exactly once per change.
5. WHILE the Seal_Panel is open, THE App SHALL close the Seal_Panel when the Escape key is pressed or the close control is activated, and SHALL return keyboard focus to the Privacy_Seal button on close.
6. WHILE the Seal_Panel is open as a non-modal disclosure, THE App SHALL leave the keyboard focus order unchanged and SHALL NOT move focus automatically.
7. THE Privacy_Seal and Seal_Panel text SHALL have a Contrast_Ratio of at least 4.5:1 against its background in every state (default, hover, focus, expanded, offline, online).
8. THE Privacy_Seal control SHALL have a touch target of at least 44 by 44 CSS pixels.
9. WHILE `prefers-reduced-motion: reduce` is set, THE Privacy_Seal SHALL apply state changes with no animated transitions (0 ms duration).
10. THE Privacy_Seal SHALL convey Offline_Status and the count as visible text in the Compact_Label, and SHALL NOT rely on color alone to convey either.
11. THE Contrast_Function SHALL be pure TypeScript in `src/engine/` with no React import and no access to the DOM, and SHALL return the WCAG Contrast_Ratio of two colors.
12. THE test suite SHALL read the design-token values from `src/styles` and SHALL assert a Contrast_Ratio of at least 4.5:1 for each text/background design-token pair of the Privacy_Seal and Seal_Panel in every state (default, hover, focus, expanded, offline, online).
13. IF any token pair has a Contrast_Ratio below 4.5:1 in any state, THEN THE test suite SHALL fail and the failure output SHALL name the state, the token pair and the measured ratio.

### Requirement 12: No Data Over the Network

**User Story:** As a user, I want proof that this feature adds no network traffic with my data, so that the core promise stays intact.

#### Acceptance Criteria

1. THE App SHALL make zero `fetch`, XHR, beacon or WebSocket calls whose URL, headers or body contain transaction data, CSV content, vampire names or user decisions (stake, spare, garlic).
2. WHEN the Service_Worker receives a request, THE Service_Worker SHALL handle the request only if its method is GET and its URL origin equals Own_Origin, and SHALL leave every other request to the browser unmodified.
3. THE App SHALL include zero analytics, telemetry or error-reporting services, and SHALL send zero requests to any origin other than Own_Origin during a full session of upload, detection, decision and wipe.
4. THE App SHALL declare zero runtime dependencies that make network requests with user data, and a test SHALL verify this by scanning the production build output for `fetch`, XHR, beacon and WebSocket calls and matching each against an allowlist of Own_Origin static asset loads.
5. WHEN the user activates the "wipe everything" control, THE App SHALL remove all `localStorage` keys written by the App, so that zero App keys remain after the action completes.
6. THE Precache SHALL contain only build files and Sample_Files, and SHALL contain zero entries derived from user uploads, CSV content or user decisions.
7. IF a network request from the App fails or is blocked, THEN THE App SHALL continue to run detection and display results without error, and SHALL retain all `localStorage` data unchanged.

### Requirement 13: Playwright Verification on the Real CSP

**User Story:** As a maintainer, I want an end-to-end check that runs against the real headers, so that regressions in offline support or the seal are caught.

#### Acceptance Criteria

1. THE test setup SHALL add Playwright as a dev dependency pinned to an exact version (no `^` or `~` range) and SHALL provide one npm script that runs the Playwright check and exits with code 0 on pass and a non-zero code on any failed assertion.
2. WHEN the npm script for the Playwright check is run, THE Playwright check SHALL run `npm run build`, start the Preview_Server on the built output, and run all assertions against the Preview_Server so that the real CSP from `customHttp.yml` applies.
3. WHEN the Playwright check loads the main document from the Preview_Server, THE check SHALL assert that the `Content-Security-Policy` response header value is byte-for-byte identical to the `Content-Security-Policy` value defined in `customHttp.yml`.
4. WHEN the Playwright check loads the App while online, THE check SHALL wait up to 30 seconds until the Privacy_Seal Accessible_Name contains "Works offline: ready" (and the Compact_Label shows "offline ready", with the Accessible_Name starting with the visible Compact_Label text), and SHALL fail the check if that state is not reached within that time.
5. WHEN the Playwright check calls `context.setOffline(true)` and reloads the page, THE App SHALL load from the Service_Worker cache and render the main screen within 10 seconds with zero failed document or asset requests.
6. WHILE the context is offline, THE Playwright check SHALL run the Full_Flow in this order and assert each step's visible result: load a Sample_File, view the crypt with at least one VampireCard, stake a vampire, download a garlic `.ics` file whose content starts with `BEGIN:VCALENDAR`, upload a CSV file, toggle sound, switch language between English and Spanish, and burn the crypt.
7. WHILE the context is offline, THE Playwright check SHALL assert that the Accessible_Name of the Privacy_Seal button and the Seal_Panel text (after the panel is opened) contain "Connections to other servers: 0" and "You're offline — still working", SHALL assert that the visible Compact_Label shows "0 external connections · offline · still working", and SHALL assert that the Accessible_Name starts with that visible Compact_Label text followed by ". ".
8. THE Playwright check SHALL record every request the page makes, online and offline, and SHALL fail if any request targets an origin other than the Preview_Server origin.
9. IF a console message of type `error` containing a CSP violation message appears at any time during the Full_Flow, THEN THE Playwright check SHALL fail and report the message text.
10. WHEN the Playwright check performs a second build with a changed asset and reloads the page, THE check SHALL assert that the page serves the changed asset and that the Service_Worker cache from the previous version no longer exists in the list of cache names.
11. THE Playwright check SHALL run in Chromium and SHALL pass in Chromium as the minimum required browser.
12. WHEN `npm test` is run, THE Vitest command SHALL exclude the Playwright check files and SHALL complete without launching a browser.
13. WHEN the Playwright check performs the first load of the App in a fresh browser context with no Service_Worker installed, THE check SHALL assert that the page does not navigate twice (first visit: no reload), by counting main-frame navigations until the Privacy_Seal Accessible_Name contains "Works offline: ready".
15. WHEN the Playwright check loads the collapsed Privacy_Seal at a 360 px wide viewport, THE check SHALL measure the rendered height of the Privacy_Seal button and its rendered line count (rendered height divided by computed line height, or the number of client rects of its text), in both English and Spanish, and SHALL fail if the line count exceeds 2 or if the page contains more than one interactive control inside the Privacy_Seal, rather than relying on estimates.
14. WHEN the Playwright check requests each Path_Class (`/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, and one `/assets/<hashed>` file) from the Preview_Server, THE check SHALL assert that each response carries the header names and values that `customHttp.yml` defines for that Path_Class.

### Requirement 14: Unit and Property Tests for the Seal

**User Story:** As a maintainer, I want automated tests for the counting logic and status logic, so that the numbers shown stay correct.

#### Acceptance Criteria

1. THE test suite SHALL include Vitest unit tests for the Connection_Counter with at least one case for each of these URL categories: same-origin, cross-origin, `data:`, `blob:`, relative, unparseable, different port, different scheme and `ws:`, where each case asserts the exact expected classification (counted or not counted).
2. THE test suite SHALL include one fast-check property test for each property in Requirement 7 acceptance criteria 11 and 13 to 18, so that seven property tests exist, each running at least 100 generated cases.
3. THE fast-check generators SHALL produce URLs for the same-origin, cross-origin, `data:` and `blob:` categories, where each generated URL carries a known expected classification determined by its category and not by the Connection_Counter under test.
4. THE test suite SHALL include Vitest unit tests for the Offline_Status logic with at least one case for each of the `checking`, `ready`, `offline` and `unavailable` states, where each case asserts the exact resulting status value.
5. THE test suite SHALL include component tests that render the Privacy_Seal once in English and once in Spanish, and each test SHALL, for all four statuses (`checking`, `ready`, `offline`, `unavailable`), assert that the Accessible_Name starts with the visible Compact_Label text followed by ". " and then the Full_Status_Text sentences, and SHALL assert the `aria-expanded` value (`false` when collapsed, `true` after the user opens the Seal_Panel), all against the strings in `en.json` and `es.json`.
6. IF `en.json` and `es.json` differ in the set of keys added by this feature, THEN THE test suite SHALL fail and the failure output SHALL list each missing key and the file it is missing from.
7. IF the text length of the Seal_Panel exceeds the limit in Requirement 10 acceptance criterion 9 in either English or Spanish, THEN THE test suite SHALL fail and the failure output SHALL report the measured length and the limit.
8. WHEN the build-output test runs against `dist/`, THE test suite SHALL assert that `dist/` contains the Service_Worker file, the Web_Manifest file, and every Sample_File listed in the Precache, and SHALL fail with the name of each missing file otherwise.
9. THE test files for the Connection_Counter SHALL live in the `tests/` directory, in line with the project structure rules.
10. THE test suite SHALL include Vitest unit tests for the Contrast_Function with known color pairs (black on white returns 21, identical colors return 1), plus the token-pair assertions of Requirement 11 criteria 12 and 13.
11. THE test suite SHALL include Vitest unit tests for the Reload_Decision with at least these cases, each asserting the exact result: first visit with no Previous_Controller returns "no reload" (first visit: no reload); Previous_Controller present and no loaded statement returns "reload"; Previous_Controller present and a loaded statement returns "no reload".
12. THE test suite SHALL include Vitest tests for the Header_Reader that parse the real `customHttp.yml` and assert, for each Path_Class (`/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/assets/<hashed>`), the exact header set expected, including that a later pattern does not drop earlier headers it does not set (Requirement 3 criteria 9 and 10).
