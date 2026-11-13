/**
 * One-off: render the PWA icons (bat glyph on the crypt background) with
 * Playwright's Chromium. Runs fully offline, nothing is fetched.
 *
 * Usage: npx tsx scripts/generate-icons.ts
 * Output: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png
 *
 * The background color is read from --color-bg in src/styles/tokens.css so the
 * icons always match the manifest theme/background colors.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
  if (!match) throw new Error(`Token ${name} not found in tokens.css`);
  return match[1];
}

const bg = token('--color-bg');
const accent = token('--color-accent-light');

// Symmetric bat silhouette in a 100x100 box, centered on (50, 45).
const BAT =
  'M50 32 L45 22 L43 33 C36 28 26 28 14 36 C20 38 22 44 22 52 C28 46 36 46 41 54 ' +
  'C44 50 47 50 50 58 C53 50 56 50 59 54 C64 46 72 46 78 52 C78 44 80 38 86 36 ' +
  'C74 28 64 28 57 33 L55 22 Z';

/** `scale` is the glyph size as a fraction of the icon (maskable keeps the safe zone). */
function html(size: number, scale: number): string {
  const glyph = size * scale;
  return `<!doctype html><html><body style="margin:0;background:${bg}">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}"/>
  <g transform="translate(50 50) scale(${(glyph / size).toFixed(4)}) translate(-50 -45)">
    <path d="${BAT}" fill="${accent}"/>
    <circle cx="46" cy="38" r="1.4" fill="${bg}"/>
    <circle cx="54" cy="38" r="1.4" fill="${bg}"/>
  </g>
</svg></body></html>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.8 },
  { file: 'icon-512.png', size: 512, scale: 0.8 },
  // Maskable: glyph stays well inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.6 },
];

const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
    await page.setContent(html(t.size, t.scale));
    await page.screenshot({ path: resolve(outDir, t.file), type: 'png' });
    await page.close();
    console.log(`wrote public/icons/${t.file} (${t.size}x${t.size})`);
  }
} finally {
  await browser.close();
}
