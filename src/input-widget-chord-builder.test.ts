// Chord builder widget. Drain 2026-08-05-1600.
//
// The interval map and the inversion cycling carry the correctness
// weight — a wrong interval is a plausible-sounding chord in the wrong
// quality, silently. The inversion-disabled tests carry the state
// weight, per the prompt's §Don'ts: inversion validity depends on
// chord size, and the quality dropdown can change the size under a
// selected inversion.
//
// The compatibility test at the bottom is the drain's §Depends-on
// claim made executable: chord-builder OUTPUT is piano-widget INPUT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  chordBuilderWidget,
  chordFromPitches,
  chordPitches,
  clampInversion,
  maxInversion,
  previewText,
  DEFAULT_SELECTION,
  QUALITIES,
  ROOTS,
  type ChordSelection,
} from './input-widget-chord-builder.ts';
import { pianoWidget } from './input-widget-piano.ts';
import {
  coerceRunInputValues,
  collectWidgetInput,
  registerWidget,
  renderWidget,
  resetWidgetRegistry,
} from './input-widget-core.ts';

function makeDom() {
  const window = new Window();
  const doc = window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return { window, doc, container: container as unknown as HTMLElement };
}

function select(container: HTMLElement, cls: string) {
  const el = container.querySelector(`select.${cls}`);
  assert.ok(el, `expected select.${cls}`);
  return el as HTMLSelectElement;
}

function setSelect(window: Window, el: HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function preview(container: HTMLElement): string {
  return container.querySelector('.forge-chord-preview')?.textContent ?? '';
}

const sel = (over: Partial<ChordSelection>): ChordSelection =>
  ({ ...DEFAULT_SELECTION, ...over });

// ------------------------------------------------ chord arithmetic

test('chordPitches: the triad qualities at C4, spelled in sharps', () => {
  assert.deepEqual(chordPitches(sel({})), ['C4', 'E4', 'G4']);
  // The prompt's preview example writes 'Eb4' here; sharps are
  // deliberate — see the module header and FEEDBACK §5. D#4 IS the
  // minor third, in the one spelling all three widgets share.
  assert.deepEqual(chordPitches(sel({ quality: 'min' })), ['C4', 'D#4', 'G4']);
  assert.deepEqual(chordPitches(sel({ quality: 'dim' })), ['C4', 'D#4', 'F#4']);
  assert.deepEqual(chordPitches(sel({ quality: 'aug' })), ['C4', 'E4', 'G#4']);
  assert.deepEqual(chordPitches(sel({ quality: 'sus2' })), ['C4', 'D4', 'G4']);
  assert.deepEqual(chordPitches(sel({ quality: 'sus4' })), ['C4', 'F4', 'G4']);
});

test('chordPitches: the seventh qualities at C4', () => {
  assert.deepEqual(chordPitches(sel({ quality: 'dom7' })), ['C4', 'E4', 'G4', 'A#4']);
  assert.deepEqual(chordPitches(sel({ quality: 'maj7' })), ['C4', 'E4', 'G4', 'B4']);
  assert.deepEqual(chordPitches(sel({ quality: 'min7' })), ['C4', 'D#4', 'G4', 'A#4']);
  assert.deepEqual(chordPitches(sel({ quality: 'dim7' })), ['C4', 'D#4', 'F#4', 'A4']);
  assert.deepEqual(chordPitches(sel({ quality: 'half-dim7' })), ['C4', 'D#4', 'F#4', 'A#4']);
  assert.deepEqual(chordPitches(sel({ quality: 'aug7' })), ['C4', 'E4', 'G#4', 'A#4']);
});

test('chordPitches: a non-C root transposes the whole shape', () => {
  assert.deepEqual(chordPitches(sel({ root: 'G' })), ['G4', 'B4', 'D5']);
  assert.deepEqual(chordPitches(sel({ root: 'F#', quality: 'min' })), ['F#4', 'A4', 'C#5']);
});

test('test_chordBuilder_octave_change_shifts_all_pitches', () => {
  assert.deepEqual(chordPitches(sel({ octave: 3 })), ['C3', 'E3', 'G3']);
  assert.deepEqual(chordPitches(sel({ octave: 5, quality: 'dom7' })),
    ['C5', 'E5', 'G5', 'A#5']);
});

// ------------------------------------------------ inversion

test('test_chordBuilder_first_inversion', () => {
  assert.deepEqual(chordPitches(sel({ inversion: 1 })), ['E4', 'G4', 'C5']);
});

test('test_chordBuilder_second_inversion', () => {
  assert.deepEqual(chordPitches(sel({ inversion: 2 })), ['G4', 'C5', 'E5']);
});

test('test_chordBuilder_dominant_seventh_all_inversions', () => {
  const base = sel({ quality: 'dom7' });
  assert.equal(maxInversion('dom7'), 3, 'a 4-note chord reaches 3rd inversion');
  assert.deepEqual(chordPitches({ ...base, inversion: 1 }), ['E4', 'G4', 'A#4', 'C5']);
  assert.deepEqual(chordPitches({ ...base, inversion: 2 }), ['G4', 'A#4', 'C5', 'E5']);
  assert.deepEqual(chordPitches({ ...base, inversion: 3 }), ['A#4', 'C5', 'E5', 'G5']);
});

test('clampInversion: a triad asked for 3rd inversion falls to 2nd', () => {
  // The §Don'ts state-shape trap: dom7 in 3rd inversion, quality
  // switched to maj. The inversion index survives the switch; the
  // clamp is what keeps it meaning something.
  assert.equal(maxInversion('maj'), 2);
  const clamped = clampInversion(sel({ quality: 'maj', inversion: 3 }));
  assert.equal(clamped.inversion, 2);
  assert.deepEqual(chordPitches(sel({ quality: 'maj', inversion: 3 })),
    chordPitches(sel({ quality: 'maj', inversion: 2 })));
});

test('test_chordBuilder_serialize_sorted_low_to_high', () => {
  // Every quality x inversion: strictly ascending output. The cycling
  // construction implies it, but the sort ENFORCES it, and this test
  // enforces the sort.
  const parse = (p: string) => {
    const pc = p.replace(/\d+$/, '');
    const oct = Number(p.slice(pc.length));
    const idx = ROOTS.findIndex(r => r.value === pc);
    return 12 * (oct + 1) + idx;
  };
  for (const q of QUALITIES) {
    for (let inv = 0; inv <= maxInversion(q.id); inv++) {
      const midis = chordPitches(sel({ quality: q.id, inversion: inv })).map(parse);
      for (let i = 1; i < midis.length; i++) {
        assert.ok(midis[i] > midis[i - 1],
          `${q.id} inversion ${inv} ascending at position ${i}`);
      }
    }
  }
});

// ------------------------------------------------ render

test('test_chordBuilder_renders_4_dropdowns', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  assert.equal(container.querySelectorAll('select').length, 4);
  select(container, 'forge-chord-root');
  select(container, 'forge-chord-quality');
  select(container, 'forge-chord-inversion');
  select(container, 'forge-chord-octave');
  assert.ok(container.querySelector('.forge-chord-preview'), 'preview line present');
});

test('test_chordBuilder_root_options', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  const opts = [...select(container, 'forge-chord-root').querySelectorAll('option')];
  assert.equal(opts.length, 12, '12 pitch classes');
  // Values are the sharp spellings; labels carry both names.
  assert.deepEqual(opts.map(o => o.getAttribute('value')),
    ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  const csLabel = opts.find(o => o.getAttribute('value') === 'C#')?.textContent;
  assert.equal(csLabel, 'C♯/D♭', 'enharmonic label so flat-thinkers find their root');
});

test('test_chordBuilder_quality_options', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  const opts = [...select(container, 'forge-chord-quality').querySelectorAll('option')];
  assert.equal(opts.length, 12, '12 qualities');
  assert.deepEqual(opts.map(o => o.getAttribute('value')), QUALITIES.map(q => q.id));
});

test('test_chordBuilder_default_C_major_root_position', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  assert.equal(preview(container), 'C4, E4, G4');
  assert.equal(
    chordBuilderWidget.serialize(chordBuilderWidget.getSelection(container)),
    '["C4","E4","G4"]',
  );
});

test('test_chordBuilder_change_quality_updates_preview', () => {
  const { window, container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  setSelect(window, select(container, 'forge-chord-quality'), 'min');
  // Prompt example says 'C4, Eb4, G4'; sharps by design — see header.
  assert.equal(preview(container), 'C4, D#4, G4');
});

test('preview follows inversion and octave changes through real change events', () => {
  const { window, container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  setSelect(window, select(container, 'forge-chord-inversion'), '1');
  assert.equal(preview(container), 'E4, G4, C5');
  setSelect(window, select(container, 'forge-chord-octave'), '3');
  assert.equal(preview(container), 'E3, G3, C4');
});

test('test_chordBuilder_inversion_disabled_on_triad_beyond_2nd', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);  // maj: a triad
  const opts = [...select(container, 'forge-chord-inversion').querySelectorAll('option')];
  assert.equal(opts.length, 4, 'root + three inversions listed');
  assert.equal(opts[0].hasAttribute('disabled'), false);
  assert.equal(opts[1].hasAttribute('disabled'), false);
  assert.equal(opts[2].hasAttribute('disabled'), false);
  assert.equal(opts[3].hasAttribute('disabled'), true, '3rd inversion grayed on a triad');
});

test('inversion options re-enable on a seventh, and re-disable back on a triad', () => {
  const { window, container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  const qualitySel = select(container, 'forge-chord-quality');
  const invOpts = () =>
    [...select(container, 'forge-chord-inversion').querySelectorAll('option')]
      .map(o => o.hasAttribute('disabled'));

  setSelect(window, qualitySel, 'dom7');
  assert.deepEqual(invOpts(), [false, false, false, false], 'all four live on dom7');

  setSelect(window, qualitySel, 'maj');
  assert.deepEqual(invOpts(), [false, false, false, true], '3rd grayed again on maj');
});

test('switching a 3rd-inversion dom7 to a triad clamps the LIVE selection, not just the option', () => {
  // The full state-shape trap through the real DOM: select dom7, pick
  // 3rd inversion, switch to maj. The selection must land on 2nd —
  // both in the dropdown and in what serialize emits.
  const { window, container } = makeDom();
  chordBuilderWidget.render(container, DEFAULT_SELECTION);
  setSelect(window, select(container, 'forge-chord-quality'), 'dom7');
  setSelect(window, select(container, 'forge-chord-inversion'), '3');
  assert.equal(preview(container), 'A#4, C5, E5, G5');

  setSelect(window, select(container, 'forge-chord-quality'), 'maj');
  assert.equal(select(container, 'forge-chord-inversion').value, '2', 'dropdown clamped');
  assert.equal(preview(container), 'G4, C5, E5', '2nd-inversion C major');
  assert.equal(
    chordBuilderWidget.serialize(chordBuilderWidget.getSelection(container)),
    '["G4","C5","E5"]',
  );
});

test('render: an initial selection opens on that chord', () => {
  const { container } = makeDom();
  chordBuilderWidget.render(container, sel({ root: 'G', quality: 'dom7', inversion: 1 }));
  assert.equal(preview(container), 'B4, D5, F5, G5');
});

// ------------------------------------------------ round-trip

test('previewText and serialize agree on the pitches', () => {
  const s = sel({ root: 'A', quality: 'min7', inversion: 2, octave: 3 });
  assert.equal(previewText(s), JSON.parse(chordBuilderWidget.serialize(s)).join(', '));
});

test('deserialize: a cached chord re-opens as itself, inversion and octave included', () => {
  const original = sel({ root: 'F#', quality: 'min7', inversion: 2, octave: 3 });
  const raw = chordBuilderWidget.serialize(original);
  const got = chordBuilderWidget.deserialize(raw);
  assert.deepEqual(got, original);
});

test('chordFromPitches: unrecognizable input is null, and deserialize defaults instead of throwing', () => {
  assert.equal(chordFromPitches(['C4', 'C#4', 'D4']), null, 'a cluster is no Tier-1 chord');
  for (const raw of [undefined, '', 'major', '{"a":1}', '[1,2,3]', '["C4","C#4","D4"]']) {
    assert.deepEqual(chordBuilderWidget.deserialize(raw), DEFAULT_SELECTION);
  }
});

// ------------------------------------------------ end-to-end

test('end-to-end: chord selection reaches the Recipe as a list of pitches', () => {
  resetWidgetRegistry();
  registerWidget(chordBuilderWidget);

  const { window, container } = makeDom();
  const outcome = renderWidget('chord_builder', 'chord_tones', container, undefined);
  assert.equal(outcome.rendered, 'widget');

  setSelect(window, select(container, 'forge-chord-root'), 'G');
  setSelect(window, select(container, 'forge-chord-quality'), 'dom7');

  const raw = collectWidgetInput('chord_tones', container);
  assert.equal(raw, '["G4","B4","D5","F5"]');

  const kwargs = coerceRunInputValues({ chord_tones: raw });
  assert.ok(Array.isArray(kwargs.chord_tones), 'the Recipe receives a list');
  assert.deepEqual(kwargs.chord_tones, ['G4', 'B4', 'D5', 'F5']);
});

test('compatibility: chord-builder OUTPUT is piano-widget INPUT (the §Depends-on claim)', () => {
  // This is why the spelling is sharps. The piano's deserialize
  // filters against its own key names — sharp spellings — so an Eb4
  // would be silently dropped here and the "compose in the chord
  // builder, visualize on the keyboard" flow would lose a note.
  const chord = sel({ quality: 'min7', inversion: 1 });     // D#4 in it
  const raw = chordBuilderWidget.serialize(chord);
  const onPiano = pianoWidget.deserialize(raw);
  assert.deepEqual(onPiano, JSON.parse(raw), 'every chord tone lands on a piano key');
  assert.ok(onPiano.includes('G4'));
  assert.equal(pianoWidget.serialize(onPiano), raw, 'and the piano re-emits it unchanged');
});

// --- [2026-08-06-1930] serialize ↔ preview parity pin ----------------
//
// CCQA v0.2.331 Smoke C saw `chord = {}` reach the Recipe while the
// preview showed the right pitches. Investigation REFUTED the
// serialize-returns-state-dict hypothesis: serialize() has returned
// the computed pitch list since drain 1600. The actual cause was the
// engine input-shadowing bug (drain 1230(d): the `chord` input
// shadowed by the injected music21.chord MODULE, which serializes as
// {}), fixed at forge ee71125 and first bundled in v0.2.332 — one
// release after the smoked v0.2.331. This test pins the plugin-side
// invariant the prompt demanded anyway: what the preview SHOWS is
// byte-for-byte what serialize SENDS, across the selection space.
test('test_chordBuilder_serialize_matches_preview (parity across selections)', () => {
  const cases: ChordSelection[] = [
    { root: 'C', quality: 'maj', inversion: 0, octave: 4 },
    { root: 'C', quality: 'min', inversion: 0, octave: 4 },
    { root: 'C', quality: 'maj', inversion: 1, octave: 4 },
    { root: 'D', quality: 'maj', inversion: 0, octave: 3 },
    { root: 'A', quality: 'min7', inversion: 2, octave: 5 },
  ];
  for (const sel of cases) {
    const serialized: unknown = JSON.parse(chordBuilderWidget.serialize(sel));
    assert.ok(Array.isArray(serialized), 'serialize returns a JSON list, never a state dict');
    assert.equal(
      (serialized as string[]).join(', '),
      previewText(sel),
      `preview and serialize disagree for ${JSON.stringify(sel)}`,
    );
  }
});
