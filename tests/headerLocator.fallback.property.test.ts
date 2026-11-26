import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { locateHeader } from '../src/engine/headerLocator';

// Cells use only digits and the letters x/y/z, so no header keyword can match.
const safeCell = fc.oneof(
  fc.constant(''),
  fc.constant('  '),
  fc.stringMatching(/^[xyz0-9]{1,6}$/),
);

// Rows with fewer than 3 non-empty cells may hold a date keyword and still not qualify.
const shortKeywordRow = fc
  .tuple(
    fc.constantFrom('Date', 'Fecha', 'Amount', 'Description'),
    fc.option(fc.stringMatching(/^[xyz0-9]{1,6}$/), { nil: '' }),
    fc.array(fc.constant(''), { maxLength: 3 }),
  )
  .map(([k, other, blanks]) => [k, other, ...blanks]);

const rowArb = fc.oneof(
  { weight: 4, arbitrary: fc.array(safeCell, { maxLength: 8 }) },
  { weight: 1, arbitrary: shortKeywordRow },
);

const gridArb = fc.array(rowArb, { maxLength: 30 });

describe('Property 9: Header_Locator falls back to the first non-empty row when no row qualifies', () => {
  /**
   * **Validates: Requirements 9.4**
   */
  it('returns the first non-empty row as the header row', () => {
    fc.assert(
      fc.property(gridArb, (grid) => {
        const firstNonEmpty = grid.findIndex((r) => r.some((c) => c.trim() !== ''));
        fc.pre(firstNonEmpty !== -1);

        const loc = locateHeader(grid);
        expect(loc.headerRowIndex).toBe(firstNonEmpty);
        expect(loc.headers).toEqual(grid[firstNonEmpty]);
        expect(loc.rows).toEqual(grid.slice(firstNonEmpty + 1));
      }),
      { numRuns: 200 },
    );
  });
});
