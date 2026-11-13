import { test, expect, type Page } from '@playwright/test'
import { startPreviewServer, type PreviewServer } from './support/previewServer.ts'
import { sealButton, str, pickSample, expectCrypt, switchLanguage, type Lang } from './support/flow.ts'

let server: PreviewServer | undefined

test.beforeAll(async () => {
  server = await startPreviewServer('dist')
})

test.afterAll(async () => {
  await server?.stop()
})

test.use({ viewport: { width: 360, height: 740 } })

type Status = 'ready' | 'offline'

interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

interface Measurement {
  height: number
  width: number
  lineHeight: number
  lineHeightRaw: string
  lines: number
  heightLines: number
  interactive: number
  clipped: boolean
  ellipsis: boolean
  seal: Rect
  viewport: { width: number; height: number }
  langSwitch: Rect | null
  burn: Rect | null
  content: Rect[]
}

const intersects = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Measures the collapsed seal inside the page (rects are viewport coordinates). */
async function measure(page: Page, burnName: string, langName: string): Promise<Measurement> {
  const button = sealButton(page)
  await button.scrollIntoViewIfNeeded()
  return button.evaluate(
    (btn, names) => {
      const toRect = (r: DOMRect) => ({
        left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
      })
      const label = btn.querySelector('span:last-of-type') as HTMLElement
      const cs = getComputedStyle(label)
      const lineHeight = parseFloat(cs.lineHeight)
      const range = document.createRange()
      range.selectNodeContents(label)
      const tops = new Set<number>()
      for (const r of Array.from(range.getClientRects())) tops.add(Math.round(r.top))
      const container = btn.parentElement as HTMLElement
      // The closed panel is `hidden`, so its Close button is not an interactive control.
      const interactive = Array.from(
        container.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]',
        ),
      ).filter((el) => !el.closest('[hidden]')).length
      const byName = (n: string) => {
        const el = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === n)
        return el ? toRect(el.getBoundingClientRect()) : null
      }
      const content = Array.from(document.querySelectorAll('main article, main h1, main h2')).map((e) =>
        toRect(e.getBoundingClientRect()),
      )
      return {
        height: btn.getBoundingClientRect().height,
        width: btn.getBoundingClientRect().width,
        lineHeight,
        lineHeightRaw: cs.lineHeight,
        lines: tops.size,
        heightLines: Math.round(label.getBoundingClientRect().height / lineHeight),
        interactive,
        clipped: label.scrollHeight > label.clientHeight || btn.scrollHeight > btn.clientHeight,
        ellipsis: cs.textOverflow === 'ellipsis' || getComputedStyle(btn).textOverflow === 'ellipsis',
        seal: toRect(btn.getBoundingClientRect()),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        langSwitch: byName(names.lang),
        burn: byName(names.burn),
        content,
      }
    },
    { burn: burnName, lang: langName },
  )
}

/** Reads the visible label from the DOM and checks the accessible name starts with it. */
async function expectLabelInName(page: Page): Promise<void> {
  const seal = sealButton(page)
  const visible = (await seal.innerText()).trim()
  expect(visible.length).toBeGreaterThan(0)
  const name = (await seal.getAttribute('aria-label')) ?? ''
  expect(name.startsWith(`${visible}. `), `aria-label "${name}" must start with "${visible}. "`).toBe(true)
}

async function check(
  page: Page,
  testInfo: { annotations: { type: string; description?: string }[] },
  lang: Lang,
  status: Status,
  view: 'landing' | 'crypt',
): Promise<void> {
  await expectLabelInName(page)

  const m = await measure(page, str(lang, 'burn.buttonAriaLabel'), str(lang, 'nav.languageSwitchAriaLabel'))
  const tag = `${lang}/${status}/${view}`

  testInfo.annotations.push({
    type: `seal ${tag}`,
    description: JSON.stringify({
      language: lang, status, height: m.height, lineHeight: m.lineHeight, lines: m.lines,
    }),
  })

  expect(m.lineHeightRaw, `${tag} line-height must resolve to px`).toMatch(/px$/)
  expect(Number.isFinite(m.lineHeight) && m.lineHeight > 0, tag).toBe(true)
  expect(m.lines, `${tag} lines`).toBeLessThanOrEqual(2)
  expect(m.lines, `${tag} lines vs height/lineHeight`).toBe(m.heightLines)
  expect(m.interactive, `${tag} interactive`).toBe(1)
  expect(m.clipped, `${tag} clipped`).toBe(false)
  expect(m.ellipsis, `${tag} ellipsis`).toBe(false)

  // Fully inside the viewport and at least 44x44.
  expect(m.seal.left, tag).toBeGreaterThanOrEqual(0)
  expect(m.seal.top, tag).toBeGreaterThanOrEqual(0)
  expect(m.seal.right, tag).toBeLessThanOrEqual(m.viewport.width)
  expect(m.seal.bottom, tag).toBeLessThanOrEqual(m.viewport.height)
  expect(m.width, tag).toBeGreaterThanOrEqual(44)
  expect(m.height, tag).toBeGreaterThanOrEqual(44)

  // No overlap with the language switch, Burn button or crypt content.
  expect(m.langSwitch, `${tag} language switch present`).not.toBeNull()
  expect(intersects(m.seal, m.langSwitch!), `${tag} overlaps language switch`).toBe(false)
  if (view === 'crypt') {
    expect(m.burn, `${tag} burn button present`).not.toBeNull()
    expect(intersects(m.seal, m.burn!), `${tag} overlaps burn button`).toBe(false)
    expect(m.content.length, `${tag} crypt content present`).toBeGreaterThan(0)
  }
  for (const c of m.content) expect(intersects(m.seal, c), `${tag} overlaps content`).toBe(false)
}

for (const status of ['ready', 'offline'] as const) {
  test(`seal fits at 360 px: ${status}`, async ({ page, context }, testInfo) => {
    test.setTimeout(120_000)
    await page.goto('/')
    // Wait for the precache so the offline case is real and "ready" is the online status.
    await expect(sealButton(page)).toHaveAttribute('aria-label', /Works offline: ready/, { timeout: 30_000 })

    if (status === 'offline') {
      await context.setOffline(true)
      await expect(sealButton(page)).toHaveAttribute('aria-label', /You're offline/, { timeout: 10_000 })
    }

    // Landing, English then Spanish (re-read the label after the switch).
    await check(page, testInfo, 'en', status, 'landing')
    await switchLanguage(page, 'en', 'es')
    await expect(sealButton(page)).toHaveAttribute(
      'aria-label',
      status === 'offline' ? /Sin conexión/ : /Funciona sin conexión: listo/,
    )
    await check(page, testInfo, 'es', status, 'landing')

    // Crypt screen with the Burn button visible, Spanish then English.
    await pickSample(page, 'es')
    await expectCrypt(page, 'es')
    await check(page, testInfo, 'es', status, 'crypt')
    await switchLanguage(page, 'es', 'en')
    await expect(sealButton(page)).toHaveAttribute(
      'aria-label',
      status === 'offline' ? /You're offline/ : /Works offline: ready/,
    )
    await check(page, testInfo, 'en', status, 'crypt')
  })
}
