/**
 * Property: removing all accents from a description never changes which
 * catalog entry matches.
 */
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { matchCatalog, stripAccents } from '../src/engine/catalogMatcher';
import catalog from '../src/data/catalog.json';
import type { CatalogEntry } from '../src/engine/types';

const realCatalog = catalog as CatalogEntry[];
const accentedCatalog: CatalogEntry[] = [
  ...realCatalog,
  {
    id: 'accented-test',
    canonicalName: 'Suscripción Prueba',
    aliases: ['SUSCRIPCIÓN PRUEBA', 'CAFÉ CLUB'],
    cancelUrl: '',
    cancelSteps: { en: ['a'], es: ['b'] },
  },
];

const aliasPool = accentedCatalog.flatMap((e) => [e.canonicalName, ...e.aliases]);
const word = fc.constantFrom(
  'SUSCRIPCIÓN', 'SUSCRIPCION', 'CAFÉ', 'CAFE', 'AÑO', 'MÁX', 'ÁÉÍÓÚÜÑ', 'áéíóúñ', 'POS', 'STORE', 'X1',
);
const description = fc
  .array(fc.oneof(word, fc.constantFrom(...aliasPool), fc.string({ maxLength: 8 })), { maxLength: 5 })
  .map((parts) => parts.join(' '));

describe('Property: accent-insensitive catalog matching', () => {
  it('stripping accents from the description never changes the matched entry', () => {
    fc.assert(
      fc.property(description, (d) => {
        return matchCatalog(d, accentedCatalog)?.id === matchCatalog(stripAccents(d), accentedCatalog)?.id;
      }),
      { numRuns: 500 },
    );
  });
});
