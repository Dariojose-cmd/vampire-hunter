/**
 * Vampire Hunter — month-name and yearless dates
 * Pure TypeScript only. Zero React imports. Never throws.
 *
 * Some bank exports write dates as "15-oct." (day + abbreviated month, no
 * year), found in a real Ecuadorian HTML-as-.xls statement on Nov 25, 2026.
 * The year is taken from a full date elsewhere in the same document (the
 * statement's cut date); a date that would fall after that reference belongs
 * to the previous year (a December charge on a January statement).
 */

/** Month prefixes (accent-folded, lowercase) in ES, EN and PT. */
const MONTHS: Record<string, number> = {
  ene: 1, jan: 1,
  feb: 2, fev: 2,
  mar: 3,
  abr: 4, apr: 4,
  may: 5, mai: 5,
  jun: 6,
  jul: 7,
  ago: 8, aug: 8,
  sep: 9, set: 9,
  oct: 10, out: 10,
  nov: 11,
  dic: 12, dec: 12, dez: 12,
};

/** "15-oct.", "15 oct 2026", "15/Octubre/26", "5-SEPT-2026" (day first). */
const MONTH_NAME_DATE_RE = /^(\d{1,2})[-/. ]\s*([a-z]{3,10})\.?(?:[-/., ]\s*(\d{4}|\d{2}))?$/;

/** Full numeric dates used as the year reference (day-first unless impossible). */
const NUMERIC_DATE_RE = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/g;
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/g;

/** Days a yearless date may sit after the reference before it moves back a year. */
const FUTURE_SLACK_DAYS = 45;
const MS_PER_DAY = 86_400_000;

function fold(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function isValid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parsed month-name cell, or null when the cell is not one. */
export function parseMonthNameDate(cell: string): { day: number; month: number; year: number | null } | null {
  const m = MONTH_NAME_DATE_RE.exec(fold(cell));
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3)];
  if (month === undefined) return null;
  const day = parseInt(m[1], 10);
  let year: number | null = null;
  if (m[3] !== undefined) {
    year = parseInt(m[3], 10);
    if (m[3].length === 2) year += 2000;
  }
  if (!isValid(year ?? 2000, month, day)) return null;
  return { day, month, year };
}

/** Latest full date found in the given cells (UTC ms), or null. */
export function findReferenceDate(cells: string[]): number | null {
  let best: number | null = null;
  const consider = (y: number, mo: number, d: number) => {
    if (y < 1990 || y > 2100 || !isValid(y, mo, d)) return;
    const t = Date.UTC(y, mo - 1, d);
    if (best === null || t > best) best = t;
  };
  for (const cell of cells) {
    for (const m of (cell ?? '').matchAll(NUMERIC_DATE_RE)) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = parseInt(m[3], 10);
      // Day-first (Latin America/Europe) unless that is impossible.
      if (b <= 12) consider(y, b, a);
      else consider(y, a, b);
    }
    for (const m of (cell ?? '').matchAll(ISO_DATE_RE)) {
      consider(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    }
  }
  return best;
}

/**
 * Rewrites month-name dates in `dateCol` (rows below `headerRow`) as ISO
 * YYYY-MM-DD. Yearless dates take the year of `referenceMs`, or the previous
 * year when that would put them more than 45 days after the reference.
 * Other cells are returned unchanged.
 */
export function normalizeMonthNameDates(
  grid: string[][],
  headerRow: number,
  dateCol: number,
  referenceMs: number,
): string[][] {
  try {
    const ref = new Date(referenceMs);
    const refYear = ref.getUTCFullYear();
    return grid.map((row, r) => {
      if (r <= headerRow || dateCol < 0 || dateCol >= row.length) return row;
      const parsed = parseMonthNameDate(row[dateCol]);
      if (!parsed) return row;
      let year = parsed.year;
      if (year === null) {
        year = refYear;
        const candidate = Date.UTC(year, parsed.month - 1, parsed.day);
        if (candidate > referenceMs + FUTURE_SLACK_DAYS * MS_PER_DAY) year -= 1;
        if (!isValid(year, parsed.month, parsed.day)) return row; // 29-feb in a non-leap year
      }
      const out = row.slice();
      out[dateCol] = iso(year, parsed.month, parsed.day);
      return out;
    });
  } catch {
    return grid;
  }
}
