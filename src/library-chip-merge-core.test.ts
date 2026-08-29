// Drain 2330 — mergeLibraryChipsIntoPalette pure-core tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  mergeLibraryChipsIntoPalette,
  libraryGroupName,
} from './library-chip-merge-core.ts';
import type { ChipPaletteGroup } from './chips-core.ts';
import type { LibraryNote } from './library-note-catalog-core.ts';

function note(
  name: string,
  inputs: string[] = [],
  description = '',
): LibraryNote {
  return { name, description, inputs, pythonSource: `def ${name}(...): pass` };
}

const LANGUAGE_GROUP: ChipPaletteGroup = {
  sourceName: 'Language',
  chips: [
    { label: 'print', insertion: 'Call [[print]] with text="<message>".' },
    { label: 'Let', insertion: 'Let <name> = <value>.' },
  ],
};
// Drain 2026-08-29-0810 §1 — renamed from NOTES_GROUP / sourceName:
// 'Notes'. The group's name was always incidental to what this file
// tests: mergeLibraryChipsIntoPalette's A4 shadow-check scans every
// vault group's chips by LABEL, never by group name, so any name here
// exercises the identical code path. Renamed rather than deleted —
// the assertions below are about library-merge/shadow behavior, not
// about a "Notes" section specifically.
const VAULT_GROUP: ChipPaletteGroup = {
  sourceName: 'My Vault',
  chips: [
    { label: 'twelve_bar_blues_progression', insertion: '[[twelve_bar_blues_progression]].' },
  ],
};

describe('mergeLibraryChipsIntoPalette (drain 2330)', () => {
  it('empty library index → vault groups unchanged', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP, VAULT_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, {});
    assert.equal(merged, vault); // same reference — fast-path no-op
  });

  it('all-empty domains → no-op', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, { music: [], moda: [] });
    assert.equal(merged, vault);
  });

  it('music-only library → appends "Music library" group after vault groups', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP, VAULT_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, {
      music: [note('walking_bass_line', ['harmony']), note('form')],
    });
    assert.equal(merged.length, 3);
    assert.equal(merged[0], LANGUAGE_GROUP);
    assert.equal(merged[1], VAULT_GROUP);
    assert.equal(merged[2].sourceName, 'Music library');
    assert.equal(merged[2].chips.length, 2);
    // Alphabetical: form before walking_bass_line.
    assert.equal(merged[2].chips[0].label, 'form');
    assert.equal(merged[2].chips[1].label, 'walking_bass_line');
  });

  it('multi-domain library → one group per domain, sorted alphabetically', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, {
      music: [note('form')],
      moda: [note('advance_positions', ['chamber', 'dt'])],
    });
    assert.equal(merged.length, 3);
    assert.equal(merged[1].sourceName, 'Moda library');   // 'moda' < 'music'
    assert.equal(merged[2].sourceName, 'Music library');
  });

  it('library group items use Call [[name]] with kwarg=<kwarg> shape', () => {
    const vault: ChipPaletteGroup[] = [];
    const merged = mergeLibraryChipsIntoPalette(vault, {
      music: [note('walking_bass_line', ['harmony'])],
    });
    assert.equal(merged.length, 1);
    assert.equal(
      merged[0].chips[0].insertion,
      'Call [[walking_bass_line]] with harmony=<harmony>.',
    );
    // insertionV2 mirrors insertion for V2 recipes.
    assert.equal(
      merged[0].chips[0].insertionV2,
      'Call [[walking_bass_line]] with harmony=<harmony>.',
    );
  });

  it('zero-arg library chip uses shorthand-call form', () => {
    const vault: ChipPaletteGroup[] = [];
    const merged = mergeLibraryChipsIntoPalette(vault, {
      music: [note('form')],
    });
    assert.equal(merged[0].chips[0].insertion, '[[form]].');
  });

  it('libraryGroupName title-cases correctly', () => {
    assert.equal(libraryGroupName('music'), 'Music library');
    assert.equal(libraryGroupName('moda'), 'Moda library');
    assert.equal(libraryGroupName(''), 'Library');
    assert.equal(libraryGroupName('X'), 'X library');
  });

  it('empty vault + library-only → returns just library groups', () => {
    const merged = mergeLibraryChipsIntoPalette([], {
      music: [note('form'), note('drum_chorus')],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sourceName, 'Music library');
    assert.equal(merged[0].chips.length, 2);
  });

  it('duplicate name across vault + library → vault wins, library entry dropped', () => {
    const vaultWithForm: ChipPaletteGroup[] = [{
      sourceName: 'My Vault',
      chips: [{ label: 'form', insertion: 'user shadow!' }],
    }];
    const merged = mergeLibraryChipsIntoPalette(vaultWithForm, {
      music: [note('form'), note('drum_chorus')],
    });
    assert.equal(merged.length, 2);
    // Vault group unchanged.
    assert.equal(merged[0].chips[0].insertion, 'user shadow!');
    // Library group only has drum_chorus, form was shadowed.
    assert.equal(merged[1].chips.length, 1);
    assert.equal(merged[1].chips[0].label, 'drum_chorus');
  });

  it('deterministic output — same input → same output shape', () => {
    const input: Record<string, LibraryNote[]> = {
      music: [note('walking_bass_line', ['harmony']), note('form'), note('drum_chorus')],
    };
    const a = mergeLibraryChipsIntoPalette([], input);
    const b = mergeLibraryChipsIntoPalette([], input);
    assert.deepEqual(a, b);
  });
});

// ---------------------------------------------------------------------
// Drain 2026-08-29-0810 §2 (R4) / §3 (R5) — gate MODA/Music Library
// chips on forge.toml's declared `domains`.
//
// Filters libraryNotesByDomain BEFORE it reaches
// mergeLibraryChipsIntoPalette — NOT inside loadLibraryNoteCatalog.
// this.libraryNotesByDomain also feeds /generate's callable-resolution
// inventory (main.ts:2424, getLibraryNotesByDomain) — the comment at
// loadLibraryNoteCatalog itself says as much ("how random_float, nth,
// pick_indices and mcq stayed out of the model's vocabulary"). Gating
// the catalog's own population would have silently narrowed what the
// LLM can call too, which neither R4 nor R5 asked for. Filtering only
// the copy passed into the chip-palette path keeps the two concerns
// separate.

import { filterActiveDomainNotes } from './library-chip-merge-core.ts';

describe('filterActiveDomainNotes', () => {
  it('THE CASE: an inactive domain is dropped entirely', () => {
    const input = { music: [note('form')], moda: [note('advance_positions')] };
    const out = filterActiveDomainNotes(input, (d) => d === 'music');
    assert.deepEqual(Object.keys(out), ['music']);
  });

  it('NON-VACUITY: an active domain keeps its full note list', () => {
    const input = { music: [note('form'), note('drum_chorus')] };
    const out = filterActiveDomainNotes(input, () => true);
    assert.deepEqual(out, input);
  });

  it('null-default case (no forge.toml domains line): everything active, unchanged from today', () => {
    // isDomainActive() returns true for every domain when
    // activeDomains is null (no domains= line) — the predicate here
    // mirrors that by always returning true.
    const input = { core: [note('random_float')], music: [note('form')], moda: [note('advance_positions')] };
    const out = filterActiveDomainNotes(input, () => true);
    assert.deepEqual(out, input);
  });

  it("'core' stays visible even when the predicate excludes it — the call site's job, not this function's", () => {
    // This pure function has no opinion about 'core' being special;
    // the exemption is a caller-supplied predicate decision
    // (main.ts: domain === 'core' || this.isDomainActive(domain)).
    // Pinning here that the function itself applies whatever
    // predicate it's given, with no hidden domain-name special-casing.
    const input = { core: [note('x')] };
    const out = filterActiveDomainNotes(input, (d) => d !== 'core');
    assert.deepEqual(out, {});
  });

  it('does not mutate the input map', () => {
    const input = { music: [note('form')], moda: [note('advance_positions')] };
    const before = JSON.stringify(input);
    filterActiveDomainNotes(input, () => false);
    assert.equal(JSON.stringify(input), before);
  });

  it('empty input → empty output', () => {
    assert.deepEqual(filterActiveDomainNotes({}, () => true), {});
  });
});

// ---------------------------------------------------------------------
// WIRING — main.ts's reloadChipPalette must filter a COPY for the chip
// path only, never narrow this.libraryNotesByDomain itself (which
// also feeds /generate's callable-resolution inventory).

import { readFileSync } from 'node:fs';

describe('drain 0810 §2/§3 wiring', () => {
  it("filters a copy before loadPaletteForActiveVault, exempts 'core', never reassigns the source field", () => {
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    const fn = main.slice(
      main.indexOf('private async reloadChipPalette('),
      main.indexOf('private async reloadChipPalette(')
        + main.slice(main.indexOf('private async reloadChipPalette(')).indexOf('\n  }\n') + 4,
    );
    assert.match(fn, /filterActiveDomainNotes\(/, 'the domain filter is never called');
    assert.match(fn, /domain === 'core'/, "'core' is not exempted from the gate");
    assert.match(fn, /this\.isDomainActive\(domain\)/, 'the real isDomainActive check is not consulted');
    assert.doesNotMatch(
      fn, /this\.libraryNotesByDomain\s*=/,
      'this.libraryNotesByDomain itself was reassigned — this would also narrow /generate callables',
    );
  });
});
