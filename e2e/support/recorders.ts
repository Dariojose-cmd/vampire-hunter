import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test'

export interface RequestRecorder {
  /** Every request URL seen (page, service worker, subresources), online or offline. */
  urls: string[]
  /** URLs of requests that failed (e.g. while offline). */
  failed: string[]
  /** Requests whose origin differs from `origin` (data:, blob: and about: are not network). */
  foreign: () => string[]
}

/** Records every request made in the context, including service worker fetches. */
export function recordRequests(context: BrowserContext, origin: string): RequestRecorder {
  const urls: string[] = []
  const failed: string[] = []
  context.on('request', (r) => { urls.push(r.url()) })
  context.on('requestfailed', (r) => { failed.push(r.url()) })
  return {
    urls,
    failed,
    foreign: () =>
      urls.filter((u) => {
        if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return false
        try { return new URL(u).origin !== origin } catch { return true }
      }),
  }
}

export interface CspRecorder {
  /** Text of every console `error` that mentions a CSP violation. */
  violations: string[]
}

const CSP_RE = /content security policy|content-security-policy|violates the following/i

/** Collects console errors that report a CSP violation. */
export function recordCspViolations(page: Page): CspRecorder {
  const violations: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' && CSP_RE.test(m.text())) violations.push(m.text())
  })
  return { violations }
}
