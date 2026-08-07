// Run-input widget framework. Drain 2026-08-05-1500.
//
// The framework's job is narrow: read a sidecar frontmatter key, decide
// what each input renders as, dispatch to a registered renderer, and
// hand the result back as the string the Recipe receives. Most of the
// weight below is on the two places that decide something a cohort will
// notice — the enum-vs-widget conflict, and what an UNREGISTERED widget
// type does — because both are ways a note can be wrong and the cohort
// still has to be able to run it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  coerceRunInputValues,
  collectWidgetInput,
  parseInputWidgets,
  registerWidget,
  renderWidget,
  registeredWidgetTypes,
  resetWidgetRegistry,
  resolveInputRendering,
  stripWidgetSeededInputs,
  type WidgetRenderer,
} from './input-widget-core.ts';

function makeDom() {
  const window = new Window();
  const doc = window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return { window, doc, container: container as unknown as HTMLElement };
}

/** A trivial renderer, so registry behaviour is tested without dragging
 *  the piano's 88 keys into it. */
function stubRenderer(type = 'piano'): WidgetRenderer<string> {
  return {
    type: type as WidgetRenderer<string>['type'],
    render(container, initial) {
      const el = container.ownerDocument.createElement('span');
      el.className = 'stub';
      el.textContent = initial;
      container.appendChild(el);
    },
    getSelection(container) {
      return container.querySelector('.stub')?.textContent ?? '';
    },
    serialize(selection) { return `<<${selection}>>`; },
    deserialize(raw) { return raw ?? ''; },
  };
}

// ------------------------------------------------ parse (Part 1)

test('test_parseInputWidgets_valid', () => {
  assert.deepEqual(
    parseInputWidgets({ input_widgets: { p: 'piano' } }),
    { p: 'piano' },
  );
});

test('parseInputWidgets: several inputs, order preserved', () => {
  const got = parseInputWidgets({
    input_widgets: { a: 'piano', b: 'guitar_fretboard' },
  });
  assert.deepEqual(Object.keys(got), ['a', 'b']);
  assert.equal(got.b, 'guitar_fretboard');
});

test('parseInputWidgets: absent / null / wrong-shape frontmatter is {}', () => {
  // Every one of these is reachable from cohort-authored YAML, and none
  // of them may throw inside modal construction — there is nowhere to
  // report an exception from there.
  assert.deepEqual(parseInputWidgets(undefined), {});
  assert.deepEqual(parseInputWidgets(null), {});
  assert.deepEqual(parseInputWidgets('nonsense'), {});
  assert.deepEqual(parseInputWidgets({}), {});
  assert.deepEqual(parseInputWidgets({ input_widgets: null }), {});
  assert.deepEqual(parseInputWidgets({ input_widgets: 'piano' }), {});
  assert.deepEqual(parseInputWidgets({ input_widgets: ['piano'] }), {});
});

test('parseInputWidgets: empty / whitespace type is dropped, not kept blank', () => {
  // A blank type would render a widget with no type. Dropping it means
  // the input falls back to a text box, which is at least usable.
  assert.deepEqual(parseInputWidgets({ input_widgets: { p: '' } }), {});
  assert.deepEqual(parseInputWidgets({ input_widgets: { p: '   ' } }), {});
});

test('parseInputWidgets: nested map value is dropped, scalar is coerced', () => {
  assert.deepEqual(parseInputWidgets({ input_widgets: { p: { type: 'piano' } } }), {});
  assert.deepEqual(parseInputWidgets({ input_widgets: { p: 42 } }), { p: '42' });
});

test('parseInputWidgets: an unknown type survives parsing so it can be NAMED later', () => {
  // Narrowing to the known union here would turn a typo into a silent
  // drop; the render step needs the string to put in the Notice.
  assert.deepEqual(parseInputWidgets({ input_widgets: { p: 'pianno' } }), { p: 'pianno' });
});

// ------------------------------------------------ conflict (Part 1)

test('test_parseInputWidgets_conflict_prefers_widget_with_warning', () => {
  const got = resolveInputRendering(
    'p',
    { p: ['major', 'minor'] },
    { p: 'piano' },
  );
  assert.equal(got.kind, 'widget');
  assert.equal(got.kind === 'widget' && got.widget, 'piano');
  // The warning is data, not a console side-effect: the caller logs it.
  // Asserting on `console.warn` would test the logger, not the rule.
  assert.equal(got.kind === 'widget' && got.conflict, true);
});

test('resolveInputRendering: widget with no enum is not a conflict', () => {
  const got = resolveInputRendering('p', {}, { p: 'piano' });
  assert.equal(got.kind === 'widget' && got.conflict, false);
});

test('resolveInputRendering: enum-only still renders a dropdown', () => {
  const got = resolveInputRendering('q', { q: ['major'] }, {});
  assert.equal(got.kind, 'enum');
  assert.deepEqual(got.kind === 'enum' && got.allowed, ['major']);
});

test('resolveInputRendering: neither declared renders text (the unchanged default)', () => {
  assert.equal(resolveInputRendering('x', {}, {}).kind, 'text');
});

// ------------------------------------------------ registry (Part 2)

test('test_widget_registry_registers_and_dispatches', () => {
  resetWidgetRegistry();
  registerWidget(stubRenderer('piano'));
  assert.deepEqual(registeredWidgetTypes(), ['piano']);

  const { container } = makeDom();
  const outcome = renderWidget('piano', 'chord_tones', container, undefined);

  assert.equal(outcome.rendered, 'widget');
  assert.equal(container.getAttribute('data-forge-widget-input'), 'chord_tones');
  assert.equal(container.getAttribute('data-forge-widget-type'), 'piano');
  assert.ok(container.querySelector('.stub'), 'the renderer built its DOM');
});

test('registry: re-registering the same type overwrites (plugin reload is idempotent)', () => {
  resetWidgetRegistry();
  registerWidget(stubRenderer('piano'));
  registerWidget(stubRenderer('piano'));
  assert.deepEqual(registeredWidgetTypes(), ['piano']);
});

test('test_widget_registry_unknown_type_falls_back', () => {
  resetWidgetRegistry();
  const { container } = makeDom();

  const outcome = renderWidget('guitar_fretboard', 'frets', container, undefined);

  assert.equal(outcome.rendered, 'fallback-text');
  assert.match(outcome.message, /guitar_fretboard/);
  assert.match(outcome.message, /falling back to text input/);

  // Not silent, and not a dead end: the cohort can still type a value.
  const input = container.querySelector('input');
  assert.ok(input, 'fallback rendered a real text input');
  assert.equal(input?.getAttribute('type'), 'text');
});

test('unknown type: a cached value is preserved into the fallback box', () => {
  resetWidgetRegistry();
  const { container } = makeDom();
  renderWidget('chord_builder', 'chord', container, 'Cmaj7');
  assert.equal(collectWidgetInput('chord', container), 'Cmaj7');
});

test('collectWidgetInput: reads through the registered renderer', () => {
  resetWidgetRegistry();
  registerWidget(stubRenderer('piano'));
  const { container } = makeDom();
  renderWidget('piano', 'p', container, 'C4');
  assert.equal(collectWidgetInput('p', container), '<<C4>>');
});

test('collectWidgetInput: finds the widget from an ANCESTOR container too', () => {
  // The modal holds per-input hosts, but a caller with only the modal
  // root should not have to thread them through.
  resetWidgetRegistry();
  registerWidget(stubRenderer('piano'));
  const { doc, container } = makeDom();
  const host = doc.createElement('div');
  container.appendChild(host);
  renderWidget('piano', 'p', host as unknown as HTMLElement, 'E4');
  assert.equal(collectWidgetInput('p', container), '<<E4>>');
});

test('collectWidgetInput: an input with no widget rendered returns empty, not a throw', () => {
  resetWidgetRegistry();
  const { container } = makeDom();
  assert.equal(collectWidgetInput('missing', container), '');
});

// ------------------------------------------------ coercion (1.3)

test('coerceRunInputValues: JSON list becomes a real list', () => {
  // This is why the piano serializes to JSON. See input-widget-piano.ts.
  const got = coerceRunInputValues({ chord_tones: '["C4","E4","G4"]' });
  assert.deepEqual(got.chord_tones, ['C4', 'E4', 'G4']);
});

test('coerceRunInputValues: a bare word stays a string (unchanged pre-widget behaviour)', () => {
  const got = coerceRunInputValues({ quality: 'major', n: '3' });
  assert.equal(got.quality, 'major');
  assert.equal(got.n, 3);  // JSON.parse succeeds on a bare number
});

test('coerceRunInputValues: empty string stays an empty string', () => {
  assert.equal(coerceRunInputValues({ x: '' }).x, '');
});

// ---- [2026-08-06-0100 (A)] widget pre-fill stripping ----------------

test('stripWidgetSeededInputs: widget keys dropped, text keys kept', () => {
  const out = stripWidgetSeededInputs(
    { notes: '["C4","E4"]', tempo: '120' },
    { notes: 'piano' },
  );
  assert.deepEqual(out, { tempo: '120' });
});

test('stripWidgetSeededInputs: no widgets → cache untouched', () => {
  const cached = { a: '1', b: '2' };
  assert.deepEqual(stripWidgetSeededInputs(cached, {}), cached);
});

test('stripWidgetSeededInputs: all-widget cache → empty pre-fill', () => {
  assert.deepEqual(
    stripWidgetSeededInputs(
      { notes: '["C4"]' }, { notes: 'guitar_fretboard' }),
    {});
});

test('stripWidgetSeededInputs: empty cache stays empty', () => {
  assert.deepEqual(stripWidgetSeededInputs({}, { notes: 'piano' }), {});
});
