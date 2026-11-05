/**
 * Unit tests for src/engine/catalogMatcher.ts
 *
 * Covers:
 *  - exact canonical-name match and alias match
 *  - case-insensitivity
 *  - word-boundary positive/negative (HBO MAX vs MAXI DESPENSA)
 *  - word-boundary positive/negative (APPLE.COM BILL vs SNAPPLE BEVERAGES)
 *  - special-char aliases matched literally, not as regex wildcards
 *  - real bank-alias forms loaded from the real src/data/catalog.json
 *  - undefined on no-match
 */

import { describe, expect, it } from 'vitest';
import { escapeRegex, matchCatalog } from '../src/engine/catalogMatcher';
import catalog from '../src/data/catalog.json';
import type { CatalogEntry } from '../src/engine/types';

const realCatalog = catalog as CatalogEntry[];

// Small hand-crafted catalog so matcher behavior is isolated from catalog data.
const fixture: CatalogEntry[] = [
  {
    id: 'max',
    canonicalName: 'Max',
    aliases: ['MAX', 'HBO MAX', 'HBOMAX'],
    cancelUrl: '',
    cancelSteps: ['a / b'],
  },
  {
    id: 'apple-music',
    canonicalName: 'Apple Music',
    aliases: ['APPLE MUSIC', 'APPLE.COM/BILL'],
    cancelUrl: '',
    cancelSteps: ['a / b'],
  },
  {
    id: 'netflix',
    canonicalName: 'Netflix',
    aliases: ['NETFLIX', 'NETFLIX.COM'],
    cancelUrl: '',
    cancelSteps: ['a / b'],
  },
];

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------

describe('escapeRegex', () => {
  it('escapes all regex special characters', () => {
    expect(escapeRegex('.*+?^${}()|[]\\/')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\\\/',
    );
  });

  it('leaves ordinary characters untouched', () => {
    expect(escapeRegex('APPLE MUSIC')).toBe('APPLE MUSIC');
  });
});

// ---------------------------------------------------------------------------
// matchCatalog — basic matching
// ---------------------------------------------------------------------------

describe('matchCatalog — canonical and alias matching', () => {
  it('matches on the canonical name', () => {
    expect(matchCatalog('NETFLIX', fixture)?.id).toBe('netflix');
  });

  it('matches on an alias', () => {
    expect(matchCatalog('HBO MAX', fixture)?.id).toBe('max');
  });

  it('is case-insensitive', () => {
    expect(matchCatalog('netflix.com', fixture)?.id).toBe('netflix');
    expect(matchCatalog('Apple Music', fixture)?.id).toBe('apple-music');
  });

  it('matches an alias embedded in a longer description', () => {
    expect(matchCatalog('RECURRING NETFLIX MONTHLY', fixture)?.id).toBe('netflix');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchCatalog('TOTALLY UNKNOWN MERCHANT', fixture)).toBeUndefined();
    expect(matchCatalog('', fixture)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// matchCatalog — word-boundary semantics
// ---------------------------------------------------------------------------

describe('matchCatalog — word-boundary semantics', () => {
  it('MAX matches "HBO MAX" (positive boundary)', () => {
    expect(matchCatalog('HBO MAX', fixture)?.id).toBe('max');
  });

  it('MAX does NOT match "MAXI DESPENSA" (negative boundary)', () => {
    expect(matchCatalog('MAXI DESPENSA', fixture)).toBeUndefined();
  });

  it('APPLE-ish alias matches "APPLE.COM BILL" (positive boundary)', () => {
    // "APPLE MUSIC" canonical won't match, but the APPLE.COM/BILL family is
    // covered in the real catalog; here we assert the APPLE word boundary via
    // the real catalog below. For the fixture we assert the generic boundary.
    expect(matchCatalog('APPLE MUSIC RENEWAL', fixture)?.id).toBe('apple-music');
  });

  it('does NOT match "SNAPPLE BEVERAGES" via an APPLE boundary', () => {
    const appleOnly: CatalogEntry[] = [
      {
        id: 'apple',
        canonicalName: 'Apple',
        aliases: ['APPLE'],
        cancelUrl: '',
        cancelSteps: ['a / b'],
      },
    ];
    expect(matchCatalog('APPLE.COM BILL', appleOnly)?.id).toBe('apple');
    expect(matchCatalog('SNAPPLE BEVERAGES', appleOnly)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// matchCatalog — special characters matched literally
// ---------------------------------------------------------------------------

describe('matchCatalog — special characters are literal, not wildcards', () => {
  it('matches "APPLE.COM/BILL" literally', () => {
    expect(matchCatalog('APPLE.COM/BILL', fixture)?.id).toBe('apple-music');
  });

  it('does NOT treat "." in an alias as a wildcard', () => {
    // "APPLE.COM/BILL" with "." as a literal dot must not match "APPLEXCOM/BILL".
    expect(matchCatalog('APPLEXCOM/BILL', fixture)).toBeUndefined();
  });

  it('does NOT treat "." in NETFLIX.COM as a wildcard', () => {
    // If "." were a wildcard, "NETFLIXXCOM" would match NETFLIX.COM — but the
    // canonical/alias "NETFLIX" still matches via its own word boundary, so use
    // a catalog that only carries the dotted alias.
    const dottedOnly: CatalogEntry[] = [
      {
        id: 'netflix-dotted',
        canonicalName: 'NetflixDotted',
        aliases: ['NETFLIXX.COM'],
        cancelUrl: '',
        cancelSteps: ['a / b'],
      },
    ];
    expect(matchCatalog('NETFLIXX.COM', dottedOnly)?.id).toBe('netflix-dotted');
    expect(matchCatalog('NETFLIXXYCOM', dottedOnly)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// matchCatalog — against the real catalog.json
// ---------------------------------------------------------------------------

describe('matchCatalog — real src/data/catalog.json', () => {
  it('has at least 60 unique entries', () => {
    expect(realCatalog.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(realCatalog.map((e) => e.id));
    expect(ids.size).toBe(realCatalog.length);
  });

  it('matches "AMZN PRIME" to Amazon Prime', () => {
    expect(matchCatalog('AMZN PRIME', realCatalog)?.canonicalName).toBe('Amazon Prime');
  });

  it('matches "NETFLIX.COM" to Netflix', () => {
    expect(matchCatalog('NETFLIX.COM', realCatalog)?.canonicalName).toBe('Netflix');
  });

  it('matches "GOOGLE *YOUTUBE" to YouTube Premium', () => {
    expect(matchCatalog('GOOGLE *YOUTUBE', realCatalog)?.canonicalName).toBe('YouTube Premium');
  });

  it('matches "APPLE.COM/BILL" to an entry that carries that alias', () => {
    const entry = matchCatalog('APPLE.COM/BILL', realCatalog);
    expect(entry).toBeDefined();
    expect(entry?.aliases).toContain('APPLE.COM/BILL');
  });

  it('resolves "APPLE.COM/BILL" to iCloud (single owner of the shared descriptor)', () => {
    // The generic Apple billing descriptor is intentionally carried by exactly
    // one entry so first-match-wins is deterministic. iCloud is the owner.
    expect(matchCatalog('APPLE.COM/BILL', realCatalog)?.id).toBe('icloud');
    const owners = realCatalog.filter((e) => e.aliases.includes('APPLE.COM/BILL'));
    expect(owners.map((e) => e.id)).toEqual(['icloud']);
  });

  it('matches the bank-printed "DISNEY+" to Disney Plus', () => {
    // Regression guard: a trailing "+" alias cannot satisfy the closing \b, so
    // the entry must carry a bare companion ("DISNEY") that matches as a word.
    expect(matchCatalog('DISNEY+', realCatalog)?.id).toBe('disney-plus');
    expect(matchCatalog('DISNEY+ MONTHLY', realCatalog)?.id).toBe('disney-plus');
  });

  it('matches the bank-printed "MELI+" to Mercado Libre Meli Plus', () => {
    expect(matchCatalog('MELI+', realCatalog)?.id).toBe('mercado-libre-meli-plus');
    expect(matchCatalog('MELI*', realCatalog)?.id).toBe('mercado-libre-meli-plus');
  });

  it('matches the bank-printed "PARAMOUNT+" to Paramount Plus', () => {
    expect(matchCatalog('PARAMOUNT+', realCatalog)?.id).toBe('paramount-plus');
    expect(matchCatalog('PARAMOUNT +', realCatalog)?.id).toBe('paramount-plus');
  });

  it('matches the bank-printed "VIX+" to ViX Premium', () => {
    expect(matchCatalog('VIX+', realCatalog)?.id).toBe('vix-premium');
  });

  it('matches the bank-printed "ICLOUD+" to iCloud', () => {
    expect(matchCatalog('ICLOUD+', realCatalog)?.id).toBe('icloud');
  });

  it('matches the bank-printed "APPLE TV+" to Apple TV Plus', () => {
    expect(matchCatalog('APPLE TV+', realCatalog)?.id).toBe('apple-tv-plus');
  });

  it('carries no dead symbol-terminated aliases (each alias matches its own form)', () => {
    // Every alias must be matchable via the same \b…\b regex the matcher builds;
    // an alias ending in a non-word char (e.g. "DROPBOX*") would silently never
    // fire. This pins the catalog so the dead-alias class cannot creep back in.
    const dead: string[] = [];
    for (const entry of realCatalog) {
      for (const alias of entry.aliases) {
        const pattern = new RegExp('\\b' + escapeRegex(alias) + '\\b', 'i');
        if (!pattern.test(alias)) dead.push(`${entry.id}:${alias}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('does NOT match "APPLEXCOMYBILL" (dot/slash are literal in the real catalog)', () => {
    // Would only match if "." and "/" in APPLE.COM/BILL were treated as wildcards.
    // "APPLE" alone is not a standalone word here, so no Apple entry should match.
    expect(matchCatalog('APPLEXCOMYBILL', realCatalog)).toBeUndefined();
  });

  it('matches "HBO MAX" to Max', () => {
    expect(matchCatalog('HBO MAX', realCatalog)?.id).toBe('max');
  });

  it('does NOT match "MAXI DESPENSA" in the real catalog', () => {
    expect(matchCatalog('MAXI DESPENSA', realCatalog)).toBeUndefined();
  });

  it('returns undefined for an unknown merchant', () => {
    expect(matchCatalog('LOCAL CORNER STORE 1234', realCatalog)).toBeUndefined();
  });
});
