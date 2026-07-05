// v0.2.258 drain 1300 — palette discovery tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  computePalette,
  LANGUAGE_PRIMITIVES,
  LANGUAGE_GROUP_NAME,
  NOTES_GROUP_NAME,
  type SnippetMetaForPalette,
} from './palette-discovery-core.ts';

describe('computePalette', () => {
  it('empty snippet inventory → language group only + empty notes group', () => {
    const palette = computePalette([]);
    assert.equal(palette.length, 2);
    assert.equal(palette[0].sourceName, LANGUAGE_GROUP_NAME);
    assert.equal(palette[0].chips.length, LANGUAGE_PRIMITIVES.length);
    assert.equal(palette[1].sourceName, NOTES_GROUP_NAME);
    assert.equal(palette[1].chips.length, 0);
  });

  it('single action snippet → 6 primitives + 1 chip', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'hello_world', basename: 'hello_world', type: 'action', inputs: [] },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 1);
    assert.equal(palette[1].chips[0].label, 'Hello world');
  });

  it('language primitives are stable in declared order', () => {
    const palette = computePalette([]);
    assert.deepEqual(
      palette[0].chips.map(c => c.label),
      ['print', 'Let', 'Return', 'If', 'Otherwise', 'For each'],
    );
  });

  it('notes group is alphabetical by label', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'zebra', basename: 'zebra', type: 'action', inputs: [] },
      { id: 'apple', basename: 'apple', type: 'action', inputs: [] },
      { id: 'mango', basename: 'mango', type: 'action', inputs: [] },
    ];
    const palette = computePalette(snippets);
    assert.deepEqual(
      palette[1].chips.map(c => c.label),
      ['Apple', 'Mango', 'Zebra'],
    );
  });

  it('library-note chip_insertion frontmatter overrides auto-derived', () => {
    const snippets: SnippetMetaForPalette[] = [
      {
        id: 'forge-music/drum_chorus',
        basename: 'drum_chorus',
        type: 'action',
        inputs: ['profile'],
        chip_insertion: 'Let X = Call [[drum_chorus]] with profile="{{profile}}".',
      },
    ];
    const palette = computePalette(snippets);
    const chip = palette[1].chips[0];
    assert.equal(
      chip.insertion,
      'Let X = Call [[drum_chorus]] with profile="{{profile}}".',
    );
    assert.equal(
      chip.insertionV2,
      'Let X = Call [[drum_chorus]] with profile="{{profile}}".',
    );
  });

  it('no chip_insertion → auto-derived V2 insertion (per deriveChip)', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'hello_world', basename: 'hello_world', type: 'action', inputs: [] },
    ];
    const palette = computePalette(snippets);
    const chip = palette[1].chips[0];
    // Zero-input action → shorthand call statement.
    assert.equal(chip.insertionV2, '[[hello_world]].');
  });

  it('S7 underscore-prefix snippet excluded from notes group', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: '_internal', basename: '_internal', type: 'action', inputs: [] },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 0);
  });

  it('chip: false snippet excluded', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'hidden', basename: 'hidden', type: 'action', inputs: [], chip: false },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 0);
  });

  it('snapshot type excluded', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'snap', basename: 'snap', type: 'snapshot' },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 0);
  });

  it('library wins on basename collision (A4 shadowing, driver Choice 4)', () => {
    // First snippet is the library note; second is a vault shadow.
    // Both have the same basename `hello_world`.
    const snippets: SnippetMetaForPalette[] = [
      {
        id: 'forge-tutorial/hello_world',
        basename: 'hello_world',
        type: 'action',
        inputs: ['name'],
        chip_insertion: 'Call [[hello_world]] with name="<name>".',
      },
      // Vault shadow — same basename, different id, no custom insertion.
      { id: 'hello_world', basename: 'hello_world', type: 'action', inputs: [] },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 1);
    // Library's custom insertion won.
    assert.equal(
      palette[1].chips[0].insertion,
      'Call [[hello_world]] with name="<name>".',
    );
  });

  it('data snippet produces a chip with data-shape insertion', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'colors', basename: 'colors', type: 'data' },
    ];
    const palette = computePalette(snippets);
    assert.equal(palette[1].chips.length, 1);
    assert.equal(palette[1].chips[0].label, 'Colors');
    // Data snippets emit `Let <name> = [[id]].` (V2 form).
    assert.equal(palette[1].chips[0].insertionV2, 'Let <name> = [[colors]].');
  });

  it('action snippet with inputs → V2 call statement with kwargs', () => {
    const snippets: SnippetMetaForPalette[] = [
      { id: 'greet', basename: 'greet', type: 'action', inputs: ['name'] },
    ];
    const palette = computePalette(snippets);
    assert.equal(
      palette[1].chips[0].insertionV2,
      'Let <result> = Call [[greet]] with name=<name>.',
    );
  });
});
