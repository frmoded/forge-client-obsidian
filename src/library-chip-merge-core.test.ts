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
const NOTES_GROUP: ChipPaletteGroup = {
  sourceName: 'Notes',
  chips: [
    { label: 'twelve_bar_blues_progression', insertion: '[[twelve_bar_blues_progression]].' },
  ],
};

describe('mergeLibraryChipsIntoPalette (drain 2330)', () => {
  it('empty library index → vault groups unchanged', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP, NOTES_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, {});
    assert.equal(merged, vault); // same reference — fast-path no-op
  });

  it('all-empty domains → no-op', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, { music: [], moda: [] });
    assert.equal(merged, vault);
  });

  it('music-only library → appends "Music library" group after vault groups', () => {
    const vault: ChipPaletteGroup[] = [LANGUAGE_GROUP, NOTES_GROUP];
    const merged = mergeLibraryChipsIntoPalette(vault, {
      music: [note('walking_bass_line', ['harmony']), note('form')],
    });
    assert.equal(merged.length, 3);
    assert.equal(merged[0], LANGUAGE_GROUP);
    assert.equal(merged[1], NOTES_GROUP);
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
      sourceName: 'Notes',
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
