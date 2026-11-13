import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkWebManifest } from '../src/engine/webManifest';
import { readPngSize } from '../src/engine/pngSize';

const ctx = { themeColor: '#0b0a10', bgColor: '#0b0a10' };

type M = Record<string, unknown>;

function validManifest(name: string, shortName: string): M {
  return {
    name,
    short_name: shortName,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: ctx.themeColor,
    background_color: ctx.bgColor,
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512m.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

const nameArb = fc.string({ minLength: 1, maxLength: 45 }).filter((s) => s.length >= 1);
const shortArb = fc.string({ minLength: 1, maxLength: 12 });

// Each breaker returns a modified copy and the text the problem list must mention.
const breakers: Array<{ field: string; apply: (m: M) => M }> = [
  { field: 'name', apply: (m) => ({ ...m, name: undefined }) },
  { field: 'name', apply: (m) => ({ ...m, name: '' }) },
  { field: 'name', apply: (m) => ({ ...m, name: 'x'.repeat(46) }) },
  { field: 'short_name', apply: (m) => ({ ...m, short_name: undefined }) },
  { field: 'short_name', apply: (m) => ({ ...m, short_name: 'x'.repeat(13) }) },
  { field: 'start_url', apply: (m) => ({ ...m, start_url: undefined }) },
  { field: 'start_url', apply: (m) => ({ ...m, start_url: '' }) },
  { field: 'scope', apply: (m) => ({ ...m, scope: undefined }) },
  { field: 'scope', apply: (m) => ({ ...m, scope: '' }) },
  { field: 'start_url', apply: (m) => ({ ...m, scope: '/app/', start_url: '/other' }) },
  { field: 'display', apply: (m) => ({ ...m, display: undefined }) },
  { field: 'display', apply: (m) => ({ ...m, display: 'browser' }) },
  { field: 'theme_color', apply: (m) => ({ ...m, theme_color: undefined }) },
  { field: 'theme_color', apply: (m) => ({ ...m, theme_color: '#ffffff' }) },
  { field: 'background_color', apply: (m) => ({ ...m, background_color: undefined }) },
  { field: 'background_color', apply: (m) => ({ ...m, background_color: '#ffffff' }) },
  { field: 'icons', apply: (m) => ({ ...m, icons: undefined }) },
  { field: 'icons', apply: (m) => ({ ...m, icons: 'nope' }) },
  {
    field: '192x192',
    apply: (m) => ({ ...m, icons: (m.icons as M[]).filter((i) => i.sizes !== '192x192') }),
  },
  {
    field: '512x512',
    apply: (m) => ({
      ...m,
      icons: (m.icons as M[]).filter((i) => !(i.sizes === '512x512' && i.purpose === 'any')),
    }),
  },
  {
    field: 'maskable',
    apply: (m) => ({ ...m, icons: (m.icons as M[]).filter((i) => i.purpose !== 'maskable') }),
  },
];

describe('checkWebManifest', () => {
  // Feature: privacy-you-can-verify, Property 19: Manifest checker reports every missing field
  // **Validates: Requirements 5.1, 5.2, 5.5**
  it('returns [] for a valid manifest and names the broken field otherwise', () => {
    fc.assert(
      fc.property(
        nameArb,
        shortArb,
        fc.integer({ min: 0, max: breakers.length - 1 }),
        (name, shortName, idx) => {
          const valid = validManifest(name, shortName);
          expect(checkWebManifest(valid, ctx)).toEqual([]);

          const { field, apply } = breakers[idx];
          const problems = checkWebManifest(apply(valid), ctx);
          expect(problems.length).toBeGreaterThan(0);
          expect(problems.some((p) => p.includes(field))).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects non-object manifests', () => {
    expect(checkWebManifest(null, ctx).length).toBeGreaterThan(0);
    expect(checkWebManifest([], ctx).length).toBeGreaterThan(0);
  });
});

describe('real manifest and index.html', () => {
  const root = resolve(__dirname, '..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
  const tokens = read('src/styles/tokens.css');
  const bg = /--color-bg:\s*(#[0-9a-fA-F]{3,8})/.exec(tokens)?.[1].toLowerCase() ?? '';
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    theme_color: string;
    background_color: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  const html = read('index.html');

  it('--color-bg is found in tokens.css', () => {
    expect(bg).not.toBe('');
  });

  it('passes checkWebManifest with colors from --color-bg', () => {
    expect(checkWebManifest(manifest, { themeColor: bg, bgColor: bg })).toEqual([]);
    expect(manifest.theme_color.toLowerCase()).toBe(bg);
    expect(manifest.background_color.toLowerCase()).toBe(bg);
  });

  it('index.html has exactly one manifest link and one theme-color meta matching the manifest', () => {
    expect(html.match(/<link[^>]*\brel=["']manifest["'][^>]*>/gi)?.length).toBe(1);
    const metas = html.match(/<meta[^>]*\bname=["']theme-color["'][^>]*>/gi) ?? [];
    expect(metas.length).toBe(1);
    const content = /content=["']([^"']+)["']/i.exec(metas[0])?.[1].toLowerCase();
    expect(content).toBe(manifest.theme_color.toLowerCase());
  });

  it('icon files exist and match declared sizes', () => {
    for (const icon of manifest.icons) {
      const file = resolve(root, 'public', icon.src.replace(/^\//, ''));
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(readPngSize(new Uint8Array(readFileSync(file))), icon.src).toEqual({ width: w, height: h });
    }
  });
});
