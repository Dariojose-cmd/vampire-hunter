import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/engine/excelReader';

/**
 * Feature: excel-statement-support
 * Property 1: Sheet selection skips empty sheets and reads only the first non-empty one
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

type Row = [string, string];

function dataSheet(rows: Row[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([['Description', 'Amount'], ...rows]);
}

function build(sheets: XLSX.WorkSheet[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  sheets.forEach((ws, i) => XLSX.utils.book_append_sheet(wb, ws, `Sheet${i + 1}`));
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

async function csvOf(bytes: ArrayBuffer): Promise<string> {
  const res = await readWorkbook(bytes);
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}`);
  return res.csvText;
}

const word = fc.stringMatching(/^[a-z]{3,8}$/);
const rowsArb = (tag: string) =>
  fc
    .array(fc.tuple(word, word), { minLength: 1, maxLength: 5 })
    .map((rows) => rows.map(([a, b], i): Row => [`${tag}${i}${a}`, b]));

const emptyKindArb = fc.constantFrom('aoa-empty', 'aoa-empty-row');

function emptySheet(kind: string): XLSX.WorkSheet {
  return kind === 'aoa-empty' ? XLSX.utils.aoa_to_sheet([]) : XLSX.utils.aoa_to_sheet([[]]);
}

describe('Property 1: sheet selection', () => {
  it('reads only the first non-empty sheet, skipping empty ones and ignoring later sheets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(emptyKindArb, { minLength: 0, maxLength: 4 }),
        rowsArb('First'),
        fc.array(rowsArb('LaterA'), { minLength: 0, maxLength: 3 }),
        fc.array(rowsArb('LaterB'), { minLength: 0, maxLength: 3 }),
        async (emptyKinds, firstRows, laterA, laterB) => {
          const prefix = () => emptyKinds.map(emptySheet);

          const full = await csvOf(build([...prefix(), dataSheet(firstRows), ...laterA.map(dataSheet)]));
          const alone = await csvOf(build([dataSheet(firstRows)]));
          const changedLater = await csvOf(
            build([...prefix(), dataSheet(firstRows), ...laterB.map(dataSheet)]),
          );

          // Derived only from the first non-empty sheet.
          expect(full).toBe(alone);
          // Unchanged when later sheets change.
          expect(changedLater).toBe(full);
          // Content check: first sheet's rows present, later sheets' absent.
          for (const [d] of firstRows) expect(full).toContain(d);
          expect(full).not.toContain('Later');
        },
      ),
      { numRuns: 100 },
    );
  });
});
