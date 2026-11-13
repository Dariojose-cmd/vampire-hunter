/**
 * Web manifest validation. Pure TypeScript: no React, no DOM.
 * Returns a list of human-readable problems; an empty list means valid.
 */

const BASE = 'https://app.invalid';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkLength(
  m: Record<string, unknown>,
  key: string,
  max: number,
  problems: string[],
): void {
  const v = m[key];
  if (typeof v !== 'string' || v.length < 1 || v.length > max) {
    problems.push(`${key} must be a string of 1 to ${max} characters`);
  }
}

function checkColor(
  m: Record<string, unknown>,
  key: string,
  expected: string,
  problems: string[],
): void {
  const v = m[key];
  if (typeof v !== 'string' || v.trim().toLowerCase() !== expected.trim().toLowerCase()) {
    problems.push(`${key} must equal ${expected} (case-insensitive)`);
  }
}

function resolve(value: unknown): URL | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const u = new URL(value, BASE);
    return u.origin === BASE ? u : null;
  } catch {
    return null;
  }
}

function tokens(v: unknown): string[] {
  return typeof v === 'string' ? v.toLowerCase().split(/\s+/).filter(Boolean) : [];
}

function isPngIcon(icon: Record<string, unknown>, size: string): boolean {
  return tokens(icon.sizes).includes(size) && String(icon.type).toLowerCase() === 'image/png';
}

function purposes(icon: Record<string, unknown>): string[] {
  const p = tokens(icon.purpose);
  return p.length === 0 ? ['any'] : p; // purpose defaults to "any"
}

export function checkWebManifest(
  m: unknown,
  ctx: { themeColor: string; bgColor: string },
): string[] {
  if (!isObject(m)) return ['manifest must be a JSON object'];
  const problems: string[] = [];

  checkLength(m, 'name', 45, problems);
  checkLength(m, 'short_name', 12, problems);

  const start = resolve(m.start_url);
  const scope = resolve(m.scope);
  if (!start) problems.push('start_url must be a non-empty URL on the app origin');
  if (!scope) problems.push('scope must be a non-empty URL on the app origin');
  if (start && scope) {
    const dir = scope.pathname.endsWith('/') ? scope.pathname : scope.pathname + '/';
    if (!(start.pathname === scope.pathname || start.pathname.startsWith(dir))) {
      problems.push('start_url must be inside scope');
    }
  }

  if (m.display !== 'standalone') problems.push("display must be 'standalone'");

  checkColor(m, 'theme_color', ctx.themeColor, problems);
  checkColor(m, 'background_color', ctx.bgColor, problems);

  if (!Array.isArray(m.icons)) {
    problems.push('icons must be an array');
    return problems;
  }
  const icons = m.icons.filter(isObject);
  if (!icons.some((i) => isPngIcon(i, '192x192') && purposes(i).includes('any'))) {
    problems.push('icons needs a 192x192 PNG with purpose any');
  }
  if (!icons.some((i) => isPngIcon(i, '512x512') && purposes(i).includes('any'))) {
    problems.push('icons needs a 512x512 PNG with purpose any');
  }
  if (!icons.some((i) => purposes(i).includes('maskable'))) {
    problems.push('icons needs at least one entry with purpose maskable');
  }
  return problems;
}
