# Implementation Plan: Privacy You Can Verify

## Overview

Order of work: record baselines first, then pure engine modules with their tests (`src/engine/`, Vitest + fast-check), then the build pipeline and per-path headers, then the UI (Privacy Seal, SamplePicker error handling), then Playwright e2e. The last task is a manual post-deploy check against the live Amplify site.

All code is TypeScript (strict). Engine modules have no React imports. No task edits `public/samples/` or `samples/`. Code splitting is not part of this plan (documented limit in the design).

## Tasks

- [x] 1. Record baselines BEFORE any other change
  - [x] 1.1 Record the sample SHA-256 baseline
    - Before touching any other file, compute the SHA-256 of each of the 5 Sample_Files (`amex-positive-charges.csv`, `latam-bank-cop.csv`, `latam-bank-mxn.csv`, `messy-statement.csv`, `us-bank-usd.csv`) from the current repository state
    - Write them to `tests/baselines/sampleDigests.json` as `{ "<name>": "<hex>" }`
    - Confirm `public/samples/<name>` and `samples/<name>` produce the same digest, and that the values match the digests listed in the design
    - Do not modify any sample file
    - _Requirements: 6.1, 6.3_

  - [x] 1.2 Record the CSP baseline
    - Before any edit to `customHttp.yml`, extract the exact current `Content-Security-Policy` value and write it to `tests/baselines/csp.txt` (no trailing newline added to the value)
    - _Requirements: 3.1, 3.5_

  - [x] 1.3 Add baseline guard tests
    - `tests/sampleDigests.test.ts`: 10 digest comparisons (5 files in `public/samples` and `samples`) against the baseline; each case first fails with `missing: <dir>/<name>` if the file is absent; mismatch fails naming `<dir>/<name>`; plus 5 byte-for-byte comparisons of `public/samples/<name>` vs `samples/<name>` that name the file on failure
    - `tests/cspBaseline.test.ts`: the CSP value parsed from `customHttp.yml` equals `tests/baselines/csp.txt`; the directives `connect-src 'self'`, `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` are present character for character
    - _Requirements: 3.1, 3.5, 6.3, 6.4, 6.5, 6.6_

- [x] 2. Connection counter (pure engine)
  - [x] 2.1 Implement `src/engine/connectionCounter.ts`
    - Export `UrlClass`, `CounterState`, `emptyCounter`, `classifyUrl`, `applyEntries`, `countConnections`
    - `classifyUrl`: `new URL(url, ownOrigin)`; throw gives `unparseable`; `data:`/`blob:` gives `inline`; same origin gives `same-origin`; else `external` (covers relative, port, scheme, subdomain, `ws(s):`)
    - `applyEntries` deduplicates by raw URL via `seen`, never throws
    - No React, `window`, `document` or `performance` access
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.19_

  - [x] 2.2 Write unit tests for the counter
    - `tests/connectionCounter.test.ts`: one exact-classification case each for same-origin, cross-origin, `data:`, `blob:`, relative, unparseable, different port, different scheme, `ws:`
    - _Requirements: 14.1, 14.9_

  - [x] 2.3 Write property test for classification
    - Create `tests/connectionCounter.property.test.ts` with category-based generators (expected class comes from the category, not from the code under test); min 100 runs
    - **Property 1: Classification matches the generator's category**
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 14.3**

  - [x] 2.4 Write property test for robustness and bounds
    - **Property 2: Robustness and bounds**
    - **Validates: Requirements 7.2, 7.10, 7.12, 7.13**

  - [x] 2.5 Write property test for additivity
    - **Property 3: Additivity over disjoint lists**
    - **Validates: Requirements 7.14**

  - [x] 2.6 Write property test for order independence
    - **Property 4: Order independence**
    - **Validates: Requirements 7.15**

  - [x] 2.7 Write property test for internal-only lists
    - **Property 5: Internal-only lists never count**
    - **Validates: Requirements 7.16**

  - [x] 2.8 Write property test for the external lower bound
    - **Property 6: External lower bound**
    - **Validates: Requirements 7.17**

  - [x] 2.9 Write property test for already-counted entries
    - **Property 7: Already-counted entries change nothing**
    - **Validates: Requirements 7.11**

  - [x] 2.10 Write property test for incremental idempotence
    - **Property 8: Incremental application is idempotent**
    - **Validates: Requirements 7.18**

- [x] 3. Offline status and reload decision (pure engine)
  - [x] 3.1 Implement `src/engine/offlineStatus.ts`
    - `deriveOfflineStatus` with precedence: `!online` gives `offline`; then unsupported or failed gives `unavailable`; then `swActive` gives `ready`; else `checking`
    - _Requirements: 9.3, 9.4, 9.5, 9.7, 9.8, 9.13, 9.14_

  - [x] 3.2 Implement `src/engine/reloadDecision.ts`
    - `decideReload({ hadPreviousController, hasLoadedStatement })` returns `reload` only when a previous controller exists and no statement is loaded
    - _Requirements: 4.8, 4.9, 4.14, 4.15_

  - [x] 3.3 Write property test for offline status derivation
    - `tests/offlineStatus.test.ts`
    - **Property 13: Offline status derivation**
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.7, 9.8, 9.13, 14.4**

  - [x] 3.4 Write property test for reconnecting
    - **Property 20: Reconnecting restores the underlying status**
    - **Validates: Requirements 9.13, 9.14**

  - [x] 3.5 Write property test for the reload decision
    - `tests/reloadDecision.test.ts`
    - **Property 12: Reload decision**
    - **Validates: Requirements 4.8, 4.9, 4.14, 4.15**

  - [x] 3.6 Write unit tests for the reload decision
    - First visit with no Previous_Controller gives `no-reload`; controller and no statement gives `reload`; controller and statement gives `no-reload`
    - _Requirements: 14.11_

  - [x] 3.7 Write unit tests for offline status
    - Exact values: offline with unsupported, failed, active and checking inputs all give `offline`; online with unsupported or failed gives `unavailable`; online with active worker gives `ready`; online without active worker gives `checking`
    - _Requirements: 14.4, 9.13_

- [x] 4. Contrast function (pure engine)
  - [x] 4.1 Implement `src/engine/contrast.ts`
    - `parseHexColor` (`#rgb`, `#rrggbb`, opaque only) and `contrastRatio` (WCAG 2.x relative luminance)
    - _Requirements: 11.11_

  - [x] 4.2 Write property test for contrast laws
    - `tests/contrast.test.ts`
    - **Property 15: Contrast function laws**
    - **Validates: Requirements 11.7, 11.11, 14.10**

  - [x] 4.3 Write unit tests for contrast
    - Black on white is 21, identical colors are 1, a known mid-gray pair matches a published value
    - _Requirements: 14.10_

- [x] 5. Precache logic (pure engine)
  - [x] 5.1 Implement `src/engine/precache.ts`
    - `CACHE_PREFIX`, `computeCacheVersion` (sorted canonical `url\0hash\n`, first 16 hex of sha256), `cacheNameFor`, `staleCaches`, `routeRequest`
    - _Requirements: 1.4, 1.5, 1.9, 1.10, 4.1, 4.2, 4.5, 12.2, 12.6_

  - [x] 5.2 Write property test for Cache_Version
    - Create `tests/precache.property.test.ts`
    - **Property 9: Cache_Version is content-addressed**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 5.3 Write property test for stale cache selection
    - **Property 10: Stale cache selection**
    - **Validates: Requirements 4.5**

  - [x] 5.4 Write property test for request routing
    - **Property 11: Request routing**
    - **Validates: Requirements 1.4, 1.5, 1.9, 1.10, 12.2, 12.6**

  - [x] 5.5 Write unit tests for precache
    - `tests/precache.test.ts`: fixed-vector version, cache name, non-GET passes, cross-origin passes, navigation maps to `/index.html`
    - _Requirements: 1.4, 4.1, 12.2_

- [x] 6. Header rules reader (pure engine)
  - [x] 6.1 Implement `build/headerRules.ts`
    - Line-based `parseHeaderRules` (ignores `#` comments, single or double quotes, throws with line number on a `key` without `value` or a header before a pattern), `matchesPattern` (`**` any chars, `*` no `/`, strips query and hash), `headersForPath` (merge in file order, later rule overrides only names it sets, case-insensitive)
    - _Requirements: 3.8, 3.9, 3.10, 3.11_

  - [x] 6.2 Write property test for header merge
    - `tests/headerRules.test.ts`
    - **Property 16: Header merge by path**
    - **Validates: Requirements 3.8, 3.9, 3.10, 3.11**

  - [x] 6.3 Write property test for glob matching
    - **Property 17: Glob matching**
    - **Validates: Requirements 3.9**

- [x] 7. Web manifest and PNG checks (pure engine)
  - [x] 7.1 Implement `src/engine/webManifest.ts` and `src/engine/pngSize.ts`
    - `checkWebManifest(m, { themeColor, bgColor })` returns a problem list; `readPngSize(bytes)` reads the IHDR width and height or returns `null`
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [x] 7.2 Write property test for PNG size round trip
    - `tests/pngSize.test.ts`
    - **Property 18: PNG size round trip**
    - **Validates: Requirements 5.6**

  - [x] 7.3 Write property test for the manifest checker
    - `tests/webManifest.test.ts`
    - **Property 19: Manifest checker reports every missing field**
    - **Validates: Requirements 5.1, 5.2, 5.5**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Build pipeline, service worker and per-path headers
  - [x] 9.1 Add manifest, icons, Playwright dependency and `index.html` tags
    - Install `@playwright/test` pinned exactly (`npm i -D -E @playwright/test`) and `npx playwright install chromium`
    - Create `public/manifest.webmanifest` per the design (name 37 chars, short name 11, standalone, `#0d0d1a`, 3 icons)
    - Create `scripts/generate-icons.ts` (renders the bat glyph on `--color-bg` through Chromium), run it, commit `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
    - Edit `index.html`: exactly one `<link rel="manifest" href="/manifest.webmanifest">` and one `<meta name="theme-color" content="#0d0d1a">`
    - Do not touch `public/samples/`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 13.1_

  - [x] 9.2 Write the service worker `build/sw/sw.ts` and `tsconfig.sw.json`
    - `install`: delete same-named cache, fetch every entry with `cache: 'reload'`, require `res.ok`, `cache.put`; on any failure delete the cache and rethrow; then `skipWaiting()`
    - `activate`: delete `staleCaches(...)`, then `clients.claim()`
    - `fetch`: use `routeRequest`; `pass` does not call `respondWith`; `cache` answers with `ignoreSearch: true`, miss falls back to network
    - Only GET same-origin; no `eval`, no inline scripts, no logging, no reading of user data
    - Add `tsconfig.sw.json` (lib `WebWorker`) and reference it from `tsconfig.json`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.10, 3.2, 4.3, 4.4, 4.5, 4.6, 12.2, 12.6_

  - [x] 9.3 Implement the precache plugin and second build
    - `build/precachePlugin.ts`: scan `dist/` recursively (skip `sw.js`, dotfiles), sha256 per file, `computeCacheVersion`, `define __PRECACHE__`, and `buildStart` validation with `checkWebManifest` and `readPngSize` for every icon (throw naming the invalid entry)
    - `build/vite.sw.config.ts`: `publicDir: false`, `emptyOutDir: false`, IIFE lib, output `dist/sw.js`
    - `package.json` scripts: `build` = `tsc -b && vite build && vite build --config build/vite.sw.config.ts`; add `test:build`
    - Add `vitest.build.config.ts` (runs `tests/build/**`); update `vitest.config.ts` with `exclude: ['e2e/**', 'tests/build/**']`; add `build/**/*.ts` to `tsconfig.node.json`
    - _Requirements: 4.1, 4.2, 4.13, 5.6, 6.2, 13.12_

  - [x] 9.4 Implement per-path preview headers
    - `build/previewHeaders.ts` using `configurePreviewServer`: read and parse `customHttp.yml` once, compute `headersForPath` per request, wrap `res.writeHead` so rule headers replace same-named keys (case-insensitive) just before flush
    - Replace `preview.headers` in `vite.config.ts` with the plugin
    - _Requirements: 3.8, 3.9, 3.10, 3.11_

  - [x] 9.5 Update `customHttp.yml` with per-path rules
    - Keep the `**` rule unchanged (CSP value identical to `tests/baselines/csp.txt`); no `Cache-Control` in it
    - Add rules for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` (`Cache-Control: no-cache`) and `/assets/*` (`public, max-age=31536000, immutable`)
    - Add a comment immediately above each added header or directive, in the existing comment style, stating its purpose
    - Add no new CSP directive (contingency in the design applies only if a violation appears)
    - _Requirements: 3.1, 3.5, 3.7, 4.10, 4.11, 4.12_

  - [x] 9.6 Write per-path header tests against the real `customHttp.yml`
    - Extend `tests/headerRules.test.ts`: assert the exact header set for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` and `/assets/index-abc123.js`, including that `/assets/*` keeps the catch-all security headers and CSP
    - Add a synthetic case proving a later rule does not drop earlier headers it does not set
    - _Requirements: 3.9, 3.10, 14.12_

  - [x] 9.7 Write unit tests for the preview middleware
    - `tests/previewHeaders.test.ts`: fake response whose `writeHead` passes its own `Cache-Control`; assert the rule value wins and other headers are preserved
    - _Requirements: 3.8, 3.9_

  - [x] 9.8 Write manifest and `index.html` file tests
    - Extend `tests/webManifest.test.ts`: real `public/manifest.webmanifest` passes `checkWebManifest`; `index.html` has exactly one manifest link and one `theme-color`; colors equal `--color-bg` in `src/styles/tokens.css` (case-insensitive); icon files exist and match declared sizes via `readPngSize`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 9.9 Write the dist build test
    - `tests/build/dist.build.test.ts`: `sw.js`, `manifest.webmanifest`, icons and all 5 samples exist (fail naming each missing file); embedded manifest hashes match the files on disk; `sw.js` has no `eval(` or `new Function`; `index.html` has no inline script; `dist/samples/<name>` is byte-identical to `public/samples/<name>`
    - _Requirements: 3.2, 6.2, 6.6, 14.8_

  - [x] 9.10 Write the static network scan test
    - `tests/noNetworkScan.test.ts`: scan `src/**` and, when present, `dist/assets/*.js` for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`; match each hit against an allowlist (same-origin sample fetch in `SamplePicker` and existing built-ins); any new hit fails
    - Add a test that Burn leaves no `vampire-hunter:*` key in `localStorage`
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Privacy Seal UI and SamplePicker error handling
  - [x] 11.1 Add i18n strings to `src/i18n/en.json` and `es.json`
    - Add all `seal.full.*`, `seal.compact.*`, `seal.panelTitle`, `seal.panelClose`, `seal.panelCsp`, `seal.panelMeasured`, `seal.panelBlocked`, `seal.panelHowTo` and `errors.assetUnavailableOffline` with identical key sets in both files
    - Panel copy: no third-party names, no absolute-claim terms, no WebSocket mention, no vampire/bite/stake, at most 80 words including the status lines (full sentences) shown in the panel; the Compact_Label and Accessible_Name are not part of the panel and are outside this budget
    - _Requirements: 2.8, 9.1, 9.3, 9.4, 9.5, 9.8, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.12, 10.13, 11.1_

  - [x] 11.2 Add seal design tokens to `src/styles/tokens.css`
    - `--seal-bg`, `--seal-text`, `--seal-bg-hover`, `--seal-bg-expanded`, `--seal-offline-text`, `--seal-panel-bg`, `--seal-panel-text` as `var()` aliases of existing colors; `--seal-transition` that is `0ms` under `prefers-reduced-motion: reduce`; explicit `line-height` token for the label
    - _Requirements: 11.7, 11.9, 11.12_

  - [x] 11.3 Implement `src/components/sealText.ts`
    - Pure `buildSealText({ t, count, measurable, status })` returning `{ compact, fullSentences, accessibleName }`
    - `compact` = compact count part + ` · ` + compact status; it is the exact visible text of the button
    - `fullSentences` = full count sentence + `. ` + full status sentence + `.` (for example "Connections to other servers: 0. Works offline: ready."); it is the live region content and the panel status lines
    - `accessibleName` = `compact` + `. ` + `fullSentences`, built by concatenation from the same `compact` value; assert `accessibleName.startsWith(compact)` before returning (throw if it fails, so a refactor cannot silently break WCAG 2.5.3 Label in Name)
    - Not-measurable variants show no count digits in `compact`, `fullSentences` or `accessibleName`
    - _Requirements: 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8, 9.9, 11.3, 11.4_

  - [x] 11.4 Implement measurement and service worker hooks
    - `src/components/resourceTiming.ts`: `raiseResourceTimingBuffer()` calling `performance.setResourceTimingBufferSize(1000)`
    - `src/components/usePrivacySeal.ts`: read `getEntriesByType('resource')` on mount, `PerformanceObserver` with `buffered: true`, `applyEntries`, `online`/`offline` events, `measurable=false` on missing API or any throw (disconnect observer, no stale count), derive status with `deriveOfflineStatus`; count clamped to 999,999 for display
    - `src/components/useServiceWorker.ts`: PROD only; no registration when unsupported (no console output); register `/sw.js` with `{ scope: '/', updateViaCache: 'none' }` on `load` (or immediately if complete); silent catch sets `registrationFailed`; call `registration.update()`; `ready` sets `swActive`; on `controllerchange` use `decideReload` once per page and `location.reload()` only on `reload`
    - _Requirements: 1.1, 1.7, 1.8, 4.7, 4.8, 4.9, 4.14, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.6, 9.7, 9.8, 9.14_

  - [x] 11.5 Implement `PrivacySeal` and `SealPanel` components
    - `PrivacySeal.tsx` + `.module.css`: one native `<button type="button">` (min 44x44), visible text = `compact` (Compact_Label; wraps to at most 2 lines at 360 px, no ellipsis), `aria-label` = `accessibleName` (starts with the exact visible Compact_Label, then `. `, then the full sentences), `aria-expanded`, `aria-controls`; the only interactive element in the seal container when collapsed; icon has `aria-hidden` and changes shape per state; hidden `role="status" aria-live="polite"` region carries only `fullSentences` (never the Compact_Label) and is updated only when `fullSentences` changes (silent on first render)
    - `SealPanel.tsx` + `.module.css`: non-modal `role="region"` with `hidden` when closed, no focus trap, no autofocus; Close button; capture-phase Escape handler on `document` that stops propagation and returns focus to the seal button; shows status lines (`fullSentences`) plus the four explanation keys; stays open on language switch
    - All colors use `--seal-*` tokens only; normal flow (not fixed)
    - _Requirements: 9.1, 9.2, 9.9, 9.11, 9.12, 10.1, 10.2, 10.11, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10_

  - [x] 11.6 Add SamplePicker error handling
    - Wrap the sample load (`fetch`, `res.text()`) in `try/catch` and treat `!res.ok` as an error; on error call a new `onError('errors.assetUnavailableOffline')` prop, do not call the success callback, do not change the view, do not read or write `localStorage`
    - Forward the key through a new optional `Uploader` prop into the existing `errorKey` display; the message resolves via `t()` at render so a language switch updates it
    - Add the optional `sealSlot` prop to `Uploader` and `SamplePicker` and render it at the bottom of the picker dialog
    - _Requirements: 2.7, 2.8, 12.7_

  - [x] 11.7 Wire the seal into the app
    - `main.tsx`: call `raiseResourceTimingBuffer()` before `createRoot`
    - `App.tsx`: call `usePrivacySeal` and `useServiceWorker` once, with `getHasStatement = () => viewRef.current !== 'upload'`; render `<PrivacySeal>` in a footer after `<main>` (live region) and a second `<PrivacySeal announce={false}>` through `sealSlot` for the sample picker; show the `onError` message in the Uploader error slot; the seal appears on landing, picker and crypt
    - _Requirements: 4.9, 9.9, 9.10, 9.12, 2.8_

  - [x] 11.8 Write property test for seal text
    - `tests/sealText.property.test.ts`
    - **Property 14: Seal text carries the count and the status**
    - Extended: for any count, status, measurable flag and language, `accessibleName.startsWith(compact)`; `accessibleName.slice(compact.length)` equals `". " + fullSentences`; `compact` and `fullSentences` carry the count and status strings of that language; the live region content equals `fullSentences` and does not contain the Compact_Label; not-measurable cases contain no count digits
    - **Validates: Requirements 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8, 9.9, 11.3, 11.4**

  - [x] 11.9 Write i18n tests for the seal
    - `tests/sealI18n.test.ts`: key parity for `seal.*` and `errors.assetUnavailableOffline` (list each missing key and file); compact and full strings per status match Requirement 9 texts; panel word count at most 80 per language, counting the status lines (`fullSentences`, longest status case) plus the explanation keys, excluding title, controls, Compact_Label and Accessible_Name (report measured length and limit); banned absolute-claim terms, third-party names and WebSocket words absent; no vampire/bite/stake in panel text
    - _Requirements: 10.7, 10.8, 10.9, 10.10, 10.12, 11.1, 14.6, 14.7_

  - [x] 11.10 Write contrast tests for seal tokens
    - `tests/sealTokens.contrast.test.ts`: read `src/styles/tokens.css`, resolve `var()` chains, assert at least 4.5 for default, hover, focus, expanded, offline, online and panel pairs; failure message format `state=hover pair=--seal-text on --seal-bg-hover ratio=3.91 (min 4.5)`; non-opaque-hex values fail; scan `PrivacySeal.module.css` and `SealPanel.module.css` and fail on any `color`/`background` not using `--seal-*`, `transparent`, `inherit` or `currentColor`
    - _Requirements: 11.7, 11.12, 11.13_

  - [x] 11.11 Write component tests for the Privacy Seal
    - `tests/privacySeal.test.tsx` (Testing Library): render in English and Spanish, for each of `ready`, `checking`, `offline`, `unavailable` and the not-measurable case, and assert: the visible button text equals the Compact_Label from `en.json`/`es.json`; `aria-label` starts with that visible text followed by `". "`, and the remainder equals the full sentences; `aria-expanded` is false, then true after click; exactly one interactive element; the live region equals the full sentences only (no Compact_Label) and changes once per change; offline with service workers unsupported shows the offline label, and after the `online` event shows "offline not available"; focus does not move on open; Escape and Close return focus to the button; language switch keeps the panel open and the count; stubbed `PerformanceObserver` cases (existing entries counted on mount, `buffered` passed, missing API and throwing observer show "not measurable")
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 9.1, 9.5, 9.6, 9.9, 9.11, 9.13, 9.14, 10.1, 10.2, 10.11, 11.3, 11.4, 11.5, 11.6, 14.5_

  - [x] 11.12 Write SamplePicker error tests
    - `tests/samplePicker.test.tsx` (`fetch` stubbed): a rejected fetch and a 404 each call `onError('errors.assetUnavailableOffline')`, never call the success callback, and leave a pre-seeded `localStorage` crypt entry byte-identical; the rendered message equals the `en.json` and `es.json` string in each language
    - _Requirements: 2.7, 2.8, 12.7_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Playwright end-to-end checks (Chromium, real build and headers)
  - [x] 13.1 Set up Playwright config, server helper and shared flow
    - `playwright.config.ts`: `testDir: 'e2e'`, `workers: 1`, `fullyParallel: false`, one `chromium` project, `baseURL: http://localhost:4173`, no `webServer`
    - `e2e/support/previewServer.ts` (spawn `vite preview --port 4173 --strictPort --outDir <dir>`, wait for port, return `stop()`), `e2e/support/flow.ts` (Full_Flow steps), request-origin and CSP-console recorders
    - Add `"test:e2e": "npm run build && playwright test"` to `package.json`; add `dist-e2e-b` to `.gitignore`
    - _Requirements: 13.1, 13.2, 13.11, 13.12_

  - [x] 13.2 Write the first-visit spec (no reload)
    - `e2e/firstVisit.spec.ts`: fresh context; count main-frame `framenavigated` events until the seal accessible name contains "Works offline: ready" (within 30 s); read the visible Compact_Label from the DOM (button `innerText`, not a hard-coded string), assert it shows "offline ready", and assert the accessible name (`aria-label`) starts with that visible text followed by ". "; assert exactly one navigation
    - _Requirements: 4.14, 9.3, 11.3, 13.4, 13.13_

  - [x] 13.3 Write the per-path header spec
    - `e2e/headers.spec.ts`: main document CSP equals the value in `customHttp.yml` byte for byte; for `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` and one hashed `/assets/*` file (found in `index.html`) compare response headers to `headersForPath(parseHeaderRules(yaml), path)`; assert `sw.js` has a JavaScript content type
    - _Requirements: 3.8, 3.9, 13.3, 13.14_

  - [x] 13.4 Write the offline Full_Flow spec
    - `e2e/offline.spec.ts`: after "ready", `context.setOffline(true)` and reload; main screen within 10 s with zero failed requests; run the Full_Flow in order (pick sample, at least one VampireCard, stake, download garlic `.ics` starting `BEGIN:VCALENDAR`, upload CSV from `samples/`, toggle sound, switch en/es, burn); read the visible Compact_Label from the DOM and assert it is "0 external connections · offline · still working"; assert the seal accessible name starts with that visible text followed by ". " and, together with the opened panel, contains "Connections to other servers: 0" and "You're offline — still working"; after the language switch to Spanish, re-read the visible label from the DOM and repeat the starts-with check (and that the name contains "Conexiones a otros servidores: 0" and "Sin conexión — sigue funcionando"), then switch back and repeat; fail on any request to a non-preview origin and on any console `error` containing a CSP violation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4, 9.5, 9.9, 11.3, 12.3, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [x] 13.5 Write the update-path spec
    - `e2e/update.spec.ts`: serve build A, wait for "ready", record `caches.keys()`; stop server; build B with `VH_E2E_MARKER=v2` into `dist-e2e-b` (plus the service worker build); serve it on the same port; reload; assert `/marker.txt` returns `v2` and the build A cache name is gone
    - Add the test-only marker plugin to `vite.config.ts`, active only when `VH_E2E_MARKER` is set, emitting `marker.txt`
    - _Requirements: 4.3, 4.5, 4.6, 4.8, 13.10_

  - [x] 13.6 Write the 360 px seal measurement spec (English and Spanish)
    - `e2e/narrowViewport.spec.ts`: viewport 360 px wide; for each of English and Spanish and each of statuses `ready` (online) and `offline` (`setOffline(true)`), collapsed panel, measure with `page.evaluate`: button height, label computed line height (resolved px, never `normal`), line count from distinct rounded `top` values of the label `Range` client rects, cross-checked with `round(labelHeight / lineHeight)`, and the count of interactive elements inside the seal container
    - Fail if `lines > 2`, interactive count is not 1, or the label is clipped (`scrollHeight > clientHeight` or ellipsis); attach `{ language, status, height, lineHeight, lines }` through `testInfo.annotations`
    - Also assert the seal is fully inside the viewport, does not intersect the language switch, Burn button or crypt content, and is at least 44x44
    - In every measured case (each language and status), read the visible Compact_Label from the DOM (button `innerText`) and assert the button's accessible name (`aria-label`) starts with it followed by ". "; after switching language, re-read the visible label and repeat the check, so a stale label or name after the switch fails
    - _Requirements: 9.9, 9.11, 9.12, 11.3, 11.8, 13.15_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Post-deploy verification checklist (MANUAL, cannot be automated before deploy)
  - [x] 15.1 MANUAL: verify headers on the live Amplify site with `curl -sI`
    - **Done 2026-11-12 after deploy of e04e634** (reviewer, Claude Code). All five paths: HTTP 200; CSP present and byte-equal to `tests/baselines/csp.txt`; nosniff, Referrer-Policy and Permissions-Policy present. `Cache-Control: no-cache` on `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`; `public, max-age=31536000, immutable` on `/assets/index-DOD8gklk.js`. `/sw.js` is `text/javascript`. So Amplify merges overlapping patterns (`**` + per-path); the fallback was not needed.
    - Live offline check (Chrome, playwright-core): seal ready → `setOffline(true)` → reload served `fromServiceWorker: true` (200) → seal "0 external connections · offline · still working" → sample loaded, 10 vampires; only the app's own host contacted; 0 console errors. Playwright's `waitForFunction` was itself blocked by the live CSP (no `unsafe-eval`).
    - This is a manual step to run after the deploy finishes. A coding agent must not mark it done without the actual curl output. It is not part of `npm test` or `npm run test:e2e`
    - Replace `<domain>` with the deployed domain and `<hashed>` with one real file name from `dist/assets/` (for example from the `<script src>` in the live `index.html`). Run each command and read `HTTP`, `Cache-Control` and `Content-Security-Policy` in the output:
      - `curl -sI https://<domain>/ | grep -iE '^(HTTP|cache-control|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)'`
      - `curl -sI https://<domain>/index.html | grep -iE '^(HTTP|cache-control|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)'`
      - `curl -sI https://<domain>/sw.js | grep -iE '^(HTTP|content-type|cache-control|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)'`
      - `curl -sI https://<domain>/manifest.webmanifest | grep -iE '^(HTTP|cache-control|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)'`
      - `curl -sI https://<domain>/assets/<hashed>.js | grep -iE '^(HTTP|cache-control|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)'`
    - Expected `Cache-Control`: `no-cache` on `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`; `public, max-age=31536000, immutable` on the `/assets/*` file
    - Expected `Content-Security-Policy`: present on all five paths and equal to the contents of `tests/baselines/csp.txt`
    - Expected on `/sw.js`: a JavaScript `content-type` (not HTML)
    - Amplify's behavior for overlapping patterns (for example `**` with `/assets/*`, whether matching rules merge or one wins) is unverified. Do not assume it works; this check is what confirms it
    - Fallback: if any path lacks the CSP (or the security headers), repeat the catch-all headers inside each path rule in `customHttp.yml` (the overlap is then deliberate; the preview reader already handles it), redeploy, and run all five checks again
    - Record the results in the deployment notes
    - _Requirements: 3.1, 3.9, 3.10, 4.10, 4.11, 4.12_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, except that the baseline guard tests in 1.3 are required because they protect the sample files and the CSP
- Task 1 must run before any other change so the baselines reflect the untouched repository state
- Property tests that share a file are chained in different waves to avoid write conflicts
- Each property test carries the tag comment `// Feature: privacy-you-can-verify, Property <n>: <title>` and runs at least 100 cases
- No task adds code splitting; it is a documented limit in the design
- Task 15.1 is manual and is listed in the last wave only to keep the graph complete; it must be done by a person after deploy

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "3.2", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.3", "3.5", "4.2", "5.2", "6.2", "7.2", "7.3", "9.1", "9.2"] },
    { "id": 3, "tasks": ["2.4", "3.4", "3.6", "4.3", "5.3", "6.3", "9.3", "9.5"] },
    { "id": 4, "tasks": ["2.5", "3.7", "5.4", "9.4"] },
    { "id": 5, "tasks": ["2.6", "5.5", "9.6", "9.7", "9.8", "9.9", "9.10"] },
    { "id": 6, "tasks": ["2.7"] },
    { "id": 7, "tasks": ["2.8"] },
    { "id": 8, "tasks": ["2.9"] },
    { "id": 9, "tasks": ["2.10"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["11.3", "11.4", "11.6", "11.9", "11.10"] },
    { "id": 12, "tasks": ["11.5", "11.8", "11.12"] },
    { "id": 13, "tasks": ["11.7"] },
    { "id": 14, "tasks": ["11.11"] },
    { "id": 15, "tasks": ["13.1"] },
    { "id": 16, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 17, "tasks": ["15.1"] }
  ]
}
```
