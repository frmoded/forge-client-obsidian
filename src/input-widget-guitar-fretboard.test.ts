// Guitar fretboard widget. Drain 2026-08-05-1530.
//
// The pitch assertions are the load-bearing ones: every fret position
// resolves through integer MIDI arithmetic rather than music21 (see the
// module header), so if that arithmetic is wrong the cohort gets a
// plausible-looking chord that is silently in the wrong key. Fret 5 on
// the A string is D3 or the widget is broken.
//
// Tuning is state, and the prompt's §Don'ts calls out state-change bugs
// specifically — so the tuning-change path is tested through the real
// `<select>` change event, not by constructing a selection by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  buildFretboard,
  fingeringFor,
  fretPitch,
  fretboardWidth,
  guitarFretboardWidget,
  tuningById,
  DEFAULT_FRET_COUNT,
  STRING_COUNT,
  TUNINGS,
  type GuitarSelection,
} from './input-widget-guitar-fretboard.ts';
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

const EMPTY: GuitarSelection = { tuning: 'standard', frets: [] };

function cellFor(container: HTMLElement, stringIndex: number, fret: number) {
  const el = container.querySelector(
    `[data-forge-guitar-pos][data-string="${stringIndex}"][data-fret="${fret}"]`,
  );
  assert.ok(el, `expected a cell at string ${stringIndex} fret ${fret}`);
  return el as Element;
}

function click(window: Window, el: Element) {
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}

function tuningSelect(container: HTMLElement) {
  const el = container.querySelector('select.forge-guitar-tuning');
  assert.ok(el, 'expected the tuning dropdown');
  return el as HTMLSelectElement;
}

function setTuning(window: Window, container: HTMLElement, id: string) {
  const sel = tuningSelect(container);
  sel.value = id;
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
}

// ------------------------------------------------ pitch arithmetic

test('fretPitch: the anchors a guitarist would check first', () => {
  const std = tuningById('standard');
  assert.equal(fretPitch(std, 0, 0), 'E2');   // open low E
  assert.equal(fretPitch(std, 1, 5), 'D3');   // 5th fret A string
  assert.equal(fretPitch(std, 5, 0), 'E4');   // open high E
  assert.equal(fretPitch(std, 0, 12), 'E3');  // octave at the 12th
});

test('fretPitch: accidentals spell as sharps, same as the piano widget', () => {
  const std = tuningById('standard');
  assert.equal(fretPitch(std, 0, 1), 'F2');
  assert.equal(fretPitch(std, 0, 2), 'F#2');
});

test('every tuning has six strings, low to high, and a stable id', () => {
  for (const t of TUNINGS) {
    assert.equal(t.strings.length, STRING_COUNT, `${t.id} has 6 strings`);
    const ascending = [...t.strings].every(
      (m, i) => i === 0 || m >= t.strings[i - 1],
    );
    assert.ok(ascending, `${t.id} is ordered low to high`);
  }
  assert.deepEqual(TUNINGS.map(t => t.id), ['standard', 'drop_d', 'dadgad', 'open_g']);
});

test('the four presets spell the names they are called', () => {
  // Asserted as pitch names rather than MIDI numbers, because a reader
  // can check these against an actual guitar.
  const names = (id: string) => {
    const t = tuningById(id);
    return t.strings.map((_, i) => fretPitch(t, i, 0));
  };
  assert.deepEqual(names('standard'), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.deepEqual(names('drop_d'), ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.deepEqual(names('dadgad'), ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
  assert.deepEqual(names('open_g'), ['D2', 'G2', 'D3', 'G3', 'B3', 'D4']);
});

test('tuningById falls back to standard for an unknown id', () => {
  assert.equal(tuningById('sitar').id, 'standard');
});

// ------------------------------------------------ geometry

test('buildFretboard: fret count is parametrized, default 22', () => {
  assert.equal(buildFretboard().length, STRING_COUNT * DEFAULT_FRET_COUNT);
  assert.equal(buildFretboard(13).length, STRING_COUNT * 13);
  assert.ok(fretboardWidth(13) < fretboardWidth(22), 'a shorter neck is narrower');
});

test('buildFretboard: the low string renders at the BOTTOM, per tab convention', () => {
  const cells = buildFretboard();
  const low = cells.find(c => c.string === 0 && c.fret === 0)!;
  const high = cells.find(c => c.string === 5 && c.fret === 0)!;
  assert.ok(low.cy > high.cy, 'string 0 (low E) is below string 5 (high E)');
});

test('buildFretboard: the open column sits left of fret 1, and cells do not overlap', () => {
  const cells = buildFretboard().filter(c => c.string === 0);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(
      cells[i].x >= cells[i - 1].x + cells[i - 1].w - 0.001,
      `fret ${i} starts at or after fret ${i - 1} ends`,
    );
  }
});

// ------------------------------------------------ render

test('test_guitarWidget_renders_6_strings_22_frets', () => {
  const { container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);

  const strings = container.querySelectorAll('line.forge-guitar-string');
  assert.equal(strings.length, 6, '6 strings');

  const cells = container.querySelectorAll('[data-forge-guitar-pos]');
  assert.equal(cells.length, 6 * 22, '6 strings x 22 positions (fret 0 = open)');

  // Fret 0 exists on every string and fret 22 does not — the count is
  // positions, not fret wires.
  for (let s = 0; s < 6; s++) cellFor(container, s, 0);
  assert.equal(
    container.querySelector('[data-forge-guitar-pos][data-fret="22"]'),
    null,
  );
});

test('test_guitarWidget_renders_tuning_dropdown', () => {
  const { container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);

  const sel = tuningSelect(container);
  const values = [...sel.querySelectorAll('option')].map(o => o.getAttribute('value'));
  assert.deepEqual(values, ['standard', 'drop_d', 'dadgad', 'open_g'], '4 presets');
  assert.equal(sel.value, 'standard', 'standard is the default');
  assert.equal(container.getAttribute('data-forge-guitar-tuning'), 'standard');
});

test('render: open-string labels spell the tuning', () => {
  const { container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);
  const labels = [...container.querySelectorAll('[data-forge-guitar-open-label]')]
    .map(e => e.textContent);
  // Rendered low-to-high by string index (the DOM order), octaveless —
  // a fretboard diagram labels the string, not the register.
  assert.deepEqual(labels, ['E', 'A', 'D', 'G', 'B', 'E']);
});

test('render: nut, fret wires and inlays are present', () => {
  const { container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);
  assert.equal(container.querySelectorAll('line.forge-guitar-nut').length, 1);
  assert.equal(container.querySelectorAll('line.forge-guitar-fret').length, 21);
  // 8 single inlays + a double at the 12th.
  assert.equal(container.querySelectorAll('circle.forge-guitar-inlay').length, 10);
});

test('render: an initial selection opens pre-selected', () => {
  const { container } = makeDom();
  guitarFretboardWidget.render(container, {
    tuning: 'standard',
    frets: [{ string: 1, fret: 5 }],
  });
  assert.equal(cellFor(container, 1, 5).getAttribute('data-selected'), 'true');
  assert.deepEqual(guitarFretboardWidget.getSelection(container).frets, [
    { string: 1, fret: 5 },
  ]);
});

// ------------------------------------------------ interaction

test('test_guitarWidget_click_toggles_selection', () => {
  const { window, container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);

  const cell = cellFor(container, 1, 5);
  assert.equal(cell.getAttribute('data-selected'), 'false');

  click(window, cell);
  assert.equal(cell.getAttribute('data-selected'), 'true');
  assert.ok(cell.getAttribute('class')?.includes('is-selected'), 'visual state follows');
  assert.deepEqual(guitarFretboardWidget.getSelection(container).frets, [
    { string: 1, fret: 5 },
  ]);

  click(window, cell);
  assert.equal(cell.getAttribute('data-selected'), 'false');
  assert.deepEqual(guitarFretboardWidget.getSelection(container).frets, []);
});

test('click: open strings (fret 0) are selectable like any other position', () => {
  const { window, container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);
  click(window, cellFor(container, 0, 0));
  assert.equal(guitarFretboardWidget.serialize(
    guitarFretboardWidget.getSelection(container),
  ), '["E2"]');
});

test('click: arbitrary multi-string selection is allowed, including two on one string', () => {
  // The common case is one position per string, but the prompt is
  // explicit that the widget does not enforce it.
  const { window, container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);
  click(window, cellFor(container, 0, 3));
  click(window, cellFor(container, 0, 7));
  assert.equal(guitarFretboardWidget.getSelection(container).frets.length, 2);
});

// ------------------------------------------------ serialization

test('test_guitarWidget_serialize_standard_tuning', () => {
  const got = guitarFretboardWidget.serialize({
    tuning: 'standard',
    frets: [
      { string: 0, fret: 0 },   // E2
      { string: 1, fret: 5 },   // D3
      { string: 5, fret: 3 },   // G4
    ],
  });
  assert.equal(got, '["E2","D3","G4"]');
});

test('test_guitarWidget_serialize_drop_d', () => {
  // Same position, different string pitch: the low string is D2 now.
  const frets = [{ string: 0, fret: 0 }];
  assert.equal(guitarFretboardWidget.serialize({ tuning: 'standard', frets }), '["E2"]');
  assert.equal(guitarFretboardWidget.serialize({ tuning: 'drop_d', frets }), '["D2"]');
});

test('test_guitarWidget_serialize_sorts_low_to_high', () => {
  const got = guitarFretboardWidget.serialize({
    tuning: 'standard',
    frets: [
      { string: 5, fret: 3 },   // G4  — clicked first
      { string: 0, fret: 0 },   // E2
      { string: 1, fret: 5 },   // D3
    ],
  });
  assert.equal(got, '["E2","D3","G4"]', 'pitch order, not click order');
});

test('serialize: a unison across two strings collapses to one pitch', () => {
  // String 1 fret 5 and string 2 fret 0 are both D3 on a guitar. A
  // duplicate in the Recipe's input list is noise, not information.
  const got = guitarFretboardWidget.serialize({
    tuning: 'standard',
    frets: [{ string: 1, fret: 5 }, { string: 2, fret: 0 }],
  });
  assert.equal(got, '["D3"]');
});

test('serialize: empty selection is an empty list, and stays one through coercion', () => {
  assert.equal(guitarFretboardWidget.serialize(EMPTY), '[]');
  assert.deepEqual(
    coerceRunInputValues({ g: guitarFretboardWidget.serialize(EMPTY) }).g,
    [],
  );
});

test('test_guitarWidget_change_tuning_recomputes_serialization', () => {
  // Through the real `<select>` change event — tuning is state, and the
  // bug class here is "the dropdown moved but nothing else did".
  const { window, container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);

  click(window, cellFor(container, 0, 0));
  click(window, cellFor(container, 4, 0));
  assert.equal(collect(container), '["E2","B3"]');

  setTuning(window, container, 'dadgad');
  assert.equal(container.getAttribute('data-forge-guitar-tuning'), 'dadgad');

  // Identical fret positions, different pitches: low string D2, and the
  // B string is now A3.
  assert.equal(collect(container), '["D2","A3"]');

  // The positions themselves must NOT have moved — that is the contract
  // a tuning control implies.
  assert.deepEqual(guitarFretboardWidget.getSelection(container).frets, [
    { string: 0, fret: 0 },
    { string: 4, fret: 0 },
  ]);

  function collect(c: HTMLElement) {
    return guitarFretboardWidget.serialize(guitarFretboardWidget.getSelection(c));
  }
});

test('change tuning: the open-string labels repaint, so the change is visible', () => {
  const { window, container } = makeDom();
  guitarFretboardWidget.render(container, EMPTY);
  setTuning(window, container, 'open_g');
  const labels = [...container.querySelectorAll('[data-forge-guitar-open-label]')]
    .map(e => e.textContent);
  assert.deepEqual(labels, ['D', 'G', 'D', 'G', 'B', 'D']);
});

// ------------------------------------------------ deserialize

test('fingeringFor: picks the lowest fret, and the highest string on a tie', () => {
  const std = tuningById('standard');
  // E4 is open on the high E string, and also fret 12 on the low E.
  assert.deepEqual(fingeringFor(['E4'], std), [{ string: 5, fret: 0 }]);
  // D3 is fret 0 on the D string and fret 5 on the A string.
  assert.deepEqual(fingeringFor(['D3'], std), [{ string: 2, fret: 0 }]);
});

test('fingeringFor: a pitch the neck cannot reach is dropped, not faked', () => {
  assert.deepEqual(fingeringFor(['C1'], tuningById('standard')), []);
});

test('deserialize: a cached pitch list re-opens as a playable fingering', () => {
  const sel = guitarFretboardWidget.deserialize('["E2","D3","G4"]');
  assert.equal(sel.tuning, 'standard');
  assert.equal(sel.frets.length, 3);
  // Round-trips to the same PITCHES — which is what the Recipe sees,
  // even though the fingering may not be the one originally clicked.
  assert.equal(guitarFretboardWidget.serialize(sel), '["E2","D3","G4"]');
});

test('deserialize: a stale or foreign cached value opens blank, never throws', () => {
  for (const raw of [undefined, '', 'major', '{"a":1}', '[1,2,3]']) {
    const sel = guitarFretboardWidget.deserialize(raw);
    assert.equal(sel.tuning, 'standard');
    assert.deepEqual(sel.frets, []);
  }
});

// ------------------------------------------------ end-to-end

test('end-to-end: guitar selection reaches the Recipe as a list of pitches', () => {
  resetWidgetRegistry();
  registerWidget(guitarFretboardWidget);

  const { window, container } = makeDom();
  const outcome = renderWidget('guitar_fretboard', 'chord_tones', container, undefined);
  assert.equal(outcome.rendered, 'widget');

  // An open E-minor shape: E2 B2 E3 G3 B3 E4.
  click(window, cellFor(container, 0, 0));
  click(window, cellFor(container, 1, 2));
  click(window, cellFor(container, 2, 2));
  click(window, cellFor(container, 3, 0));
  click(window, cellFor(container, 4, 0));
  click(window, cellFor(container, 5, 0));

  const raw = collectWidgetInput('chord_tones', container);
  assert.equal(raw, '["E2","B2","E3","G3","B3","E4"]');

  const kwargs = coerceRunInputValues({ chord_tones: raw });
  assert.ok(Array.isArray(kwargs.chord_tones), 'the Recipe receives a list');
  assert.deepEqual(kwargs.chord_tones, ['E2', 'B2', 'E3', 'G3', 'B3', 'E4']);
});

test('end-to-end: the framework needed no changes to take a second widget', () => {
  // The point of drain 1500's framework. If this ever fails, the
  // framework grew a piano-shaped assumption.
  resetWidgetRegistry();
  registerWidget(guitarFretboardWidget);
  const { container } = makeDom();
  renderWidget('guitar_fretboard', 'g', container, '["E2","B3"]');
  assert.equal(collectWidgetInput('g', container), '["E2","B3"]');
});
