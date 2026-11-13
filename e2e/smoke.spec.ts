import { test, expect } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { recordCspViolations, recordRequests } from './support/recorders.ts'
import { runFullFlow } from './support/flow.ts'

// Helper smoke check: server lifecycle + shared flow + recorders work together.
test('preview server serves dist and the shared Full_Flow passes', async ({ page, context }) => {
  test.setTimeout(120_000)
  let server: PreviewServer | undefined
  try {
    server = await startPreviewServer('dist')
    const requests = recordRequests(context, server.origin)
    const csp = recordCspViolations(page)
    await page.goto('/')
    const { ics } = await runFullFlow(page)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(requests.foreign()).toEqual([])
    expect(csp.violations).toEqual([])
  } finally {
    await server?.stop()
  }
})
