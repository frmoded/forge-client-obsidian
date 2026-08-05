// Piano keyboard widget. Drain 2026-08-05-1500.
//
// Rendered against happy-dom, so the click tests dispatch REAL events
// through the listener production attaches — not a call to the toggle
// helper with the listener assumed. That distinction is the whole
// reason to use a DOM here rather than structural stubs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  buildKeyboard,
  centerXOf,
  initialScrollLeft,
  isBlackKey,
  keyboardWidth,
  midiToPitchName,
  pianoWidget,
  HIGHEST_MIDI,
  LOWEST_MIDI,
} from './input-widget-piano.ts';
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

function keysIn(container: HTMLElement) {
  return [...container.querySelectorAll('[data-forge-piano-key]')];
}

function keyFor(container: HTMLElement, pitch: string) {
  const el = container.querySelector(`[data-pitch="${pitch}"]`);
  assert.ok(el, `expected a key for ${pitch}`);
  return el as Element;
}

function click(window: Window, el: Element) {
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}

// ------------------------------------------------ naming + geometry

test('midiToPitchName: the three anchors', () => {
  assert.equal(midiToPitchName(21), 'A0');   // lowest key
  assert.equal(midiToPitchName(60), 'C4');   // middle C
  assert.equal(midiToPitchName(108), 'C8');  // highest key
});

test('midiToPitchName: accidentals spell as sharps, never flats', () => {
  // One spelling per key, so a round-trip through the widget is stable.
  assert.equal(midiToPitchName(61), 'C#4');
  assert.equal(midiToPitchName(78), 'F#5');
});

test('isBlackKey: the five accidentals of an octave, and only those', () => {
  const blacks = [];
  for (let m = 60; m < 72; m++) if (isBlackKey(m)) blacks.push(midiToPitchName(m));
  assert.deepEqual(blacks, ['C#4', 'D#4', 'F#4', 'G#4', 'A#4']);
});

test('buildKeyboard: black keys straddle the white-key boundary', () => {
  // Not evenly spaced. C#4 must sit over the C4/D4 seam, which is what
  // computing from the running white count buys over a fixed stride.
  const keys = buildKeyboard();
  const c4 = keys.find(k => k.pitch === 'C4')!;
  const d4 = keys.find(k => k.pitch === 'D4')!;
  const cs4 = keys.find(k => k.pitch === 'C#4')!;
  const seam = c4.x + c4.width;
  assert.equal(d4.x, seam);
  assert.equal(cs4.x + cs4.width / 2, seam);
});

test('buildKeyboard: black keys are shorter and narrower than whites', () => {
  const keys = buildKeyboard();
  const white = keys.find(k => !k.black)!;
  const black = keys.find(k => k.black)!;
  assert.ok(black.width < white.width);
  assert.ok(black.height < white.height);
});

// ------------------------------------------------ render

test('test_pianoWidget_renders_88_keys', () => {
  const { container } = makeDom();
  pianoWidget.render(container, []);

  const els = keysIn(container);
  assert.equal(els.length, 88, '88 keys total');
  assert.equal(HIGHEST_MIDI - LOWEST_MIDI + 1, 88);

  const white = els.filter(e => e.getAttribute('class')?.includes('forge-piano-key-white'));
  const black = els.filter(e => e.getAttribute('class')?.includes('forge-piano-key-black'));
  assert.equal(white.length, 52, '52 white keys');
  assert.equal(black.length, 36, '36 black keys');
});

test('render: the range runs A0 to C8 inclusive', () => {
  const { container } = makeDom();
  pianoWidget.render(container, []);
  const els = keysIn(container);
  const pitches = els.map(e => e.getAttribute('data-pitch'));
  assert.ok(pitches.includes('A0'));
  assert.ok(pitches.includes('C8'));
  assert.ok(!pitches.includes('G#0'), 'nothing below A0');
  assert.ok(!pitches.includes('C#8'), 'nothing above C8');
});

test('render: black keys paint after whites, so they stack on top', () => {
  // SVG has no z-index — paint order IS the stacking order. If whites
  // were emitted last they would cover the accidentals.
  const { container } = makeDom();
  pianoWidget.render(container, []);
  const classes = keysIn(container).map(e => e.getAttribute('class') ?? '');
  const lastWhite = classes.map(c => c.includes('white')).lastIndexOf(true);
  const firstBlack = classes.map(c => c.includes('black')).indexOf(true);
  assert.ok(firstBlack > lastWhite, 'every black key is emitted after every white');
});

test('render: each octave carries a C label so a musician can find their register', () => {
  const { container } = makeDom();
  pianoWidget.render(container, []);
  const labels = [...container.querySelectorAll('.forge-piano-label')]
    .map(e => e.textContent);
  assert.deepEqual(labels, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
});

test('render: an initial selection opens pre-selected', () => {
  const { container } = makeDom();
  pianoWidget.render(container, ['C4', 'G4']);
  assert.deepEqual(pianoWidget.getSelection(container), ['C4', 'G4']);
  assert.ok(keyFor(container, 'C4').getAttribute('class')?.includes('is-selected'));
});

// ------------------------------------------------ interaction

test('test_pianoWidget_click_toggles_selection', () => {
  const { window, container } = makeDom();
  pianoWidget.render(container, []);

  const e4 = keyFor(container, 'E4');
  assert.equal(e4.getAttribute('data-selected'), 'false');

  click(window, e4);
  assert.equal(e4.getAttribute('data-selected'), 'true');
  assert.ok(e4.getAttribute('class')?.includes('is-selected'), 'visual state follows');
  assert.deepEqual(pianoWidget.getSelection(container), ['E4']);

  click(window, e4);
  assert.equal(e4.getAttribute('data-selected'), 'false');
  assert.ok(!e4.getAttribute('class')?.includes('is-selected'));
  assert.deepEqual(pianoWidget.getSelection(container), []);
});

test('click: a black key selects like any other', () => {
  const { window, container } = makeDom();
  pianoWidget.render(container, []);
  click(window, keyFor(container, 'F#5'));
  assert.deepEqual(pianoWidget.getSelection(container), ['F#5']);
});

test('getSelection: returns ascending pitch order, not click order', () => {
  const { window, container } = makeDom();
  pianoWidget.render(container, []);
  click(window, keyFor(container, 'G4'));
  click(window, keyFor(container, 'C4'));
  click(window, keyFor(container, 'E4'));
  assert.deepEqual(pianoWidget.getSelection(container), ['C4', 'E4', 'G4']);
});

// ------------------------------------------------ serialization

test('test_pianoWidget_serialize_returns_selected_pitches', () => {
  assert.equal(pianoWidget.serialize(['C4', 'E4', 'G4']), '["C4","E4","G4"]');
});

test('test_pianoWidget_serialize_empty_selection', () => {
  assert.equal(pianoWidget.serialize([]), '[]');
  // And it survives the coercion the modal runs, as an empty list —
  // not as the string "[]", and not as undefined.
  assert.deepEqual(coerceRunInputValues({ p: pianoWidget.serialize([]) }).p, []);
});

test('serialize: sorts by pitch even when handed an out-of-order selection', () => {
  assert.equal(pianoWidget.serialize(['G4', 'C4', 'F#4']), '["C4","F#4","G4"]');
});

test('deserialize: round-trips its own output', () => {
  const sel = ['C4', 'E4', 'G4'];
  assert.deepEqual(pianoWidget.deserialize(pianoWidget.serialize(sel)), sel);
});

test('deserialize: a stale or foreign cached value opens the keyboard blank', () => {
  // The same input may have been a text box before the note declared a
  // widget. Unreadable cache must not throw inside modal construction.
  assert.deepEqual(pianoWidget.deserialize(undefined), []);
  assert.deepEqual(pianoWidget.deserialize(''), []);
  assert.deepEqual(pianoWidget.deserialize('major'), []);
  assert.deepEqual(pianoWidget.deserialize('{"a":1}'), []);
  assert.deepEqual(pianoWidget.deserialize('[1,2,3]'), []);
  assert.deepEqual(pianoWidget.deserialize('["C4","H9"]'), ['C4']);  // drops the unknown
});

// ------------------------------------------------ scroll

test('test_pianoWidget_scroll_default_centers_on_C4', () => {
  const keys = buildKeyboard();
  const c4Center = centerXOf(keys, 60);
  const total = keyboardWidth(keys);

  // The math, at a realistic modal width: C4 lands in the middle.
  assert.equal(initialScrollLeft(c4Center, 600, total), c4Center - 300);

  // Clamped at both ends — never negative, never past the last key.
  assert.equal(initialScrollLeft(c4Center, 4000, total), 0);
  assert.equal(initialScrollLeft(total, 600, total), total - 600);

  // And the render actually applies it. happy-dom reports clientWidth
  // as 0 (nothing is laid out), so the expected value here is the
  // degenerate case: C4 at the left edge rather than centered. The
  // point being asserted is that the scroller is positioned AT C4 at
  // all, instead of being left at 0 showing A0.
  const { container } = makeDom();
  pianoWidget.render(container, []);
  const scroller = container.querySelector('.forge-piano-scroller') as HTMLElement;
  assert.ok(scroller, 'the keyboard renders inside a scroller');
  assert.equal(scroller.scrollLeft, initialScrollLeft(c4Center, 0, total));
  assert.ok(scroller.scrollLeft > 0, 'not parked at A0');
});

// ------------------------------------------------ end-to-end

test('test_inputPanel_widget_serialized_flows_to_run_recipe', () => {
  // The production chain from click to kwargs, minus only Obsidian's
  // Setting wrapper: registry -> renderWidget -> real click events ->
  // collectWidgetInput -> coerceRunInputValues (which IS what
  // ForgeRunModal.submit calls).
  resetWidgetRegistry();
  registerWidget(pianoWidget);

  const { window, container } = makeDom();
  const outcome = renderWidget('piano', 'chord_tones', container, undefined);
  assert.equal(outcome.rendered, 'widget');

  click(window, keyFor(container, 'C4'));
  click(window, keyFor(container, 'E4'));
  click(window, keyFor(container, 'G4'));

  const raw = collectWidgetInput('chord_tones', container);
  assert.equal(raw, '["C4","E4","G4"]');

  const kwargs = coerceRunInputValues({ chord_tones: raw });
  assert.deepEqual(kwargs.chord_tones, ['C4', 'E4', 'G4']);
  assert.ok(Array.isArray(kwargs.chord_tones), 'the Recipe receives a list, not a string');
});

test('end-to-end: a cached selection re-opens selected', () => {
  resetWidgetRegistry();
  registerWidget(pianoWidget);
  const { container } = makeDom();
  renderWidget('piano', 'chord_tones', container, '["C4","G4"]');
  assert.equal(collectWidgetInput('chord_tones', container), '["C4","G4"]');
});
