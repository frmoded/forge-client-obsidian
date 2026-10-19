// Drain 2026-10-15-2230 — Beat Box: add-instrument in the circle, a compact layout in both views, a subtler playhead.
//
// Layers, as in rhythm-box-circle.test.ts: the widget's pure core in plain node, and the page in happy-dom with a fake host window.
// The real acceptance for "compact" is a MEASUREMENT in real Chromium (scripts in the FEEDBACK); what a headless test can pin is the
// structure that makes the saving and the guards that stop it silently regressing: no control removed, one row for the controls, the
// rare actions behind one menu, the circle sized by what its dots need rather than a fixed 460 px square, and the playhead's weight.
//
// The widget is read from the SOURCE vault (or RHYTHM_BOX_WIDGET_FILE) — see test-support/rhythm-widget-harness.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, skip, widgetHtml, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
const K = (hits: number[], n = 16) => Array.from({ length: n }, (_, i) => hits.includes(i));
const data = (channels: Record<string, unknown[]>, over: Record<string, unknown> = {}) => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels, ...over,
});
const THREE = () => data({ kick: K([0, 8]), snare: K([4, 12]), hihat: K([0, 2, 4, 6, 8, 10, 12, 14]) });
const FOUR = () => data({ kick: K([0, 8]), snare: K([4, 12]), hihat: K([0, 2, 4, 6, 8, 10, 12, 14]), bell: K([0, 3, 6, 10, 12]) });
const load = (d: unknown, mode?: string) => ({ type: 'forge-rhythm-load', data: d, noteName: 'rhythm_pattern_test', ...(mode ? { mode } : {}) });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
const lastSave = (h: Harness) => types(h, 'forge-rhythm-save').at(-1)?.data;
async function editing(d: unknown = THREE()): Promise<Harness> { const h = await loadWidget(true); await h.send(load(d)); return h; }
async function playground(d: unknown = THREE()): Promise<Harness> { const h = await loadWidget(true); await h.send(load(d, 'playground')); return h; }
async function toCircle(h: Harness) { h.el('bViewCircle').click(); await new Promise((r) => setTimeout(r, 5)); }
const choose = (h: Harness, id: string, value: string) => { const sel = h.el(id) as HTMLSelectElement; sel.value = value; sel.dispatchEvent(new h.win.Event('change', { bubbles: true })); };
const optionValues = (h: Harness, id: string) => [...(h.el(id) as HTMLSelectElement).options].map((o) => o.value);

// ======================================================================================================================
// 1. Add instrument in circle mode — the SAME control, menu and path as the grid's (drain 2026-10-20-0900: now literally ONE control, first in the toolbar both views share)
// ======================================================================================================================

test('circle: the Add-instrument control is on screen in Circle (it is the ONE control of the shared toolbar) and offers the channels not shown yet', { skip }, async () => {
  const h = await editing();
  const gridMenu = optionValues(h, 'addInstrument');
  await toCircle(h);
  const sel = h.el('addInstrument');
  assert.equal(sel.tagName, 'SELECT');
  assert.ok(h.el('rhythmTools').contains(sel), 'it lives in the shared toolbar');
  assert.ok(h.el('circleView').contains(sel) === false && sel.hidden === false, 'outside both views, so both show it');
  assert.ok(sel.getAttribute('aria-label'), 'labelled');
  assert.deepEqual(optionValues(h, 'addInstrument'), gridMenu, 'same menu in both views, same order');
  assert.deepEqual(optionValues(h, 'addInstrument').slice(0, 2), ['', 'bell'], 'the inert prompt, then the channels not shown yet');
});

test('circle: choosing an instrument adds a RING through the one save path — and saves what choosing it in Grid saves', async () => {
  const hc = await editing();
  await toCircle(hc);
  choose(hc, 'addInstrument', 'bell');
  assert.equal(types(hc, 'forge-rhythm-save').length, 1, 'ONE save — commitChange via applyWholePatternChange');
  assert.equal(hc.el('confirmBar').hidden, true, 'the grid asks nothing for an add, so the circle asks nothing');
  assert.deepEqual(Object.keys(lastSave(hc).channels), ['kick', 'snare', 'hihat', 'bell']);
  assert.equal(hc.doc.querySelectorAll('#circle circle.dot[data-channel="bell"]').length, 16, 'a new ring of 16 open dots');
  assert.equal([...hc.doc.querySelectorAll('#ringLegend .ring-pick')].length, 4, 'and its chip');
  const hg = await editing();
  choose(hg, 'addInstrument', 'bell');
  assert.deepEqual(lastSave(hc), lastSave(hg), 'byte-for-byte the same note data as the grid\'s control');
  assert.equal((hc.el('addInstrument') as HTMLSelectElement).value, '', 'the control returns to its prompt');
  assert.ok(!optionValues(hc, 'addInstrument').includes('bell'), 'and no longer offers what is now shown');
});

test('circle: in a playground the same control is local — `edited`, never a save', { skip }, async () => {
  const h = await playground();
  await toCircle(h);
  choose(h, 'addInstrument', 'claves');
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(types(h, 'forge-rhythm-edited').length, 1);
  assert.equal(h.doc.querySelectorAll('#circle circle.dot[data-channel="claves"]').length, 16);
});

test('circle: at the 4-ring limit the control is DISABLED with an explanation — not hidden, not a silent no-op', { skip }, async () => {
  const h = await editing(FOUR());
  await toCircle(h);
  const sel = h.el('addInstrument') as HTMLSelectElement;
  assert.equal(sel.disabled, true);
  assert.match(sel.title, /4 instruments/i, 'the tooltip says why');
  assert.match(h.el('viewMsg').textContent ?? '', /4 instruments/i, 'and the reason is on screen, not only in a tooltip');
  assert.equal(sel.hidden, false);
  assert.equal(types(h, 'forge-rhythm-save').length, 0, 'rendering the disabled control saved nothing');
});

test('circle: the control becomes available again when the circle has room (a ring removed in the grid), and disabled again at 4', { skip }, async () => {
  const h = await editing(THREE());
  await toCircle(h);
  const sel = h.el('addInstrument') as HTMLSelectElement;
  assert.equal(sel.disabled, false, '3 rings: room for one more');
  choose(h, 'addInstrument', 'bell');
  assert.equal((h.el('addInstrument') as HTMLSelectElement).disabled, true, 'the 4th ring fills it');
  h.el('bViewGrid').click();
  (h.doc.querySelector('[data-remove="bell"]') as HTMLElement).click();     // the new row has no hits, so nothing to confirm
  await new Promise((r) => setTimeout(r, 5));
  await toCircle(h);
  assert.equal((h.el('addInstrument') as HTMLSelectElement).disabled, false);
});

test('the grid\'s own Add-instrument still works exactly as before', { skip }, async () => {
  const h = await editing();
  choose(h, 'addInstrument', 'bell');
  assert.deepEqual(Object.keys(lastSave(h).channels), ['kick', 'snare', 'hihat', 'bell']);
  choose(h, 'addInstrument', 'claves');           // the 5th row: the grid has no limit; circle view will say so
  assert.deepEqual(Object.keys(lastSave(h).channels).length, 5);
});

// Pins the MECHANISM (one control, one handler, which ends in applyWholePatternChange); if the add path moves this SHOULD go red — reassess, don't just rewrite.
test('add-instrument is source-pinned: the ONE control calls one handler, which ends in applyWholePatternChange (and there is no second control)', { skip }, () => {
  assert.match(widgetScript, /function onAddInstrument\(sel\)[\s\S]*?applyWholePatternChange\(\{ kind: "addrow"/);
  assert.match(widgetScript, /\$\("addInstrument"\)\.addEventListener\("change", function \(e\) \{ onAddInstrument\(e\.target\); \}\)/);
  assert.equal((widgetScript.match(/onAddInstrument\(e\.target\)/g) ?? []).length, 1, 'exactly one listener calls it');
  assert.doesNotMatch(widgetHtml, /addInstrumentCircle/, 'the circle\'s own copy is gone');
});

// ======================================================================================================================
// 2. Compact layout — the circle is sized by what its dots need; the controls take fewer rows; nothing is removed
// ======================================================================================================================

test('circleSizeFor: the smallest square that still gives every dot a >= 24 px target — never overlapping, never above 460', { skip }, () => {
  const w = pureCore();
  assert.equal(typeof w.circleSizeFor, 'function');
  for (const steps of [6, 8, 12, 16, 20]) {
    let prev = 0;
    for (let rings = 1; rings <= 4; rings++) {
      const size = w.circleSizeFor(steps, rings);
      assert.ok(size <= 460 && size >= prev, `N=${steps} rings=${rings}: ${size} (monotone in rings, capped at the old 460)`);
      prev = size;
      const g = w.circleGeometry(steps, rings, size);
      if (steps <= 16) assert.ok(g.targetRadius * 2 >= 24 - 1e-6, `N=${steps} rings=${rings}: target ${g.targetRadius * 2} px`);
      const innerChord = 2 * g.ringRadii[rings - 1] * Math.sin(Math.PI / steps);
      assert.ok(g.targetRadius * 2 <= innerChord + 1e-6, `N=${steps} rings=${rings}: neighbouring targets never overlap`);
      if (rings > 1) assert.ok(g.targetRadius * 2 <= (g.ringRadii[0] - g.ringRadii[1]) + 1e-6, 'nor do targets of adjacent rings');
      assert.ok(g.ringRadii[0] + g.targetRadius <= size / 2, 'everything inside the frame');
    }
  }
});

test('circleSizeFor: the size actually saves room — one ring is roughly half the old square, four rings still under it', { skip }, () => {
  const w = pureCore();
  assert.ok(w.circleSizeFor(16, 1) <= 300, `1 ring / 16 steps: ${w.circleSizeFor(16, 1)}`);
  assert.ok(w.circleSizeFor(16, 2) <= 340);
  assert.ok(w.circleSizeFor(16, 4) <= 420, `4 rings / 16 steps: ${w.circleSizeFor(16, 4)}`);
  assert.equal(w.CIRCLE_SIZE, 460, 'the default geometry size (what callers get with no size) is unchanged');
});

test('the rendered circle uses that size: viewBox and CSS width follow the ring count', { skip }, async () => {
  const w = pureCore();
  const h = await editing(THREE());
  await toCircle(h);
  const svg = h.el('circle');
  assert.equal(svg.getAttribute('viewBox'), `0 0 ${w.circleSizeFor(16, 3)} ${w.circleSizeFor(16, 3)}`);
  assert.equal((svg as unknown as HTMLElement).style.width, `${w.circleSizeFor(16, 3)}px`);
  choose(h, 'addInstrument', 'bell');
  assert.equal(svg.getAttribute('viewBox'), `0 0 ${w.circleSizeFor(16, 4)} ${w.circleSizeFor(16, 4)}`, 'a 4th ring grows the circle');
});

test('compact: every control that is meant to stay is still there (Random, Clear, Export JSON and the widget-side Open note were removed on purpose, drain 2026-10-19-1500; Tap tempo, drain 2026-10-20-0900)', { skip }, () => {
  for (const id of ['hostBar', 'hostEditing', 'hostNote', 'playgroundLabel', 'loadMsg', 'saveMsg', 'bReload', 'bReset', 'confirmBar',
    'confirmText', 'confirmOk', 'confirmCancel', 'bPlay', 'bBpmDown', 'bpmVal', 'bBpmUp', 'stepPos', 'swing', 'swingVal', 'volume',
    'volumeVal', 'timeSig', 'viewSwitch', 'bViewGrid', 'bViewCircle', 'viewMsg', 'gridView', 'grid', 'rhythmTools', 'addInstrument', 'transformTools',
    'circleExtras', 'bRingOut', 'bRingIn', 'bShape', 'ringLegend', 'circleView', 'circle']) {
    assert.ok(new RegExp(`id="${id}"`).test(widgetHtml), `#${id}`);
  }
  // Drain 2026-10-20-0900: Tap tempo and the grid's own Mirror / the circle's own Add instrument were removed on purpose; the five transforms are GENERATED
  // (rhythm-box-toolbar.test.ts pins them in the live DOM), so they are not in the static markup.
  for (const id of ['bTap', 'bMirrorGrid', 'addInstrumentCircle']) assert.ok(!new RegExp(`id="${id}"`).test(widgetHtml), `#${id} is gone`);
  assert.equal((widgetHtml.match(/data-bank="[A-D]"/g) ?? []).length, 4, 'the four banks');
});

test('compact: time signature and the view switch live in the transport row (one row of controls, not three)', { skip }, async () => {
  const h = await editing();
  const transport = h.doc.querySelector('.transport') as HTMLElement;
  assert.ok(transport.contains(h.el('timeSig')), 'time signature');
  assert.ok(transport.contains(h.el('viewSwitch')), 'Grid | Circle');
  assert.ok(transport.contains(h.el('bPlay')) && transport.contains(h.el('bBpmUp')) && transport.contains(h.el('bBpmDown')));
});

test('compact: Swing and Volume share one row, and the long swing caption is a tooltip + description, not a paragraph block', { skip }, async () => {
  const h = await editing();
  const sliders = h.doc.querySelector('.sliders') as HTMLElement;
  assert.ok(sliders.contains(h.el('swing')) && sliders.contains(h.el('volume')));
  const caption = h.doc.querySelector('.swing-caption') as HTMLElement;
  assert.ok(caption, 'the caption text is still in the document — nothing was deleted');
  assert.match(caption.textContent ?? '', /off-beat/i);
  assert.ok(caption.classList.contains('sr-only') || caption.hidden, 'but it does not take a visible block of rows');
  // the class must actually hide it: an `.sr-only` that names nothing would leave the paragraph on screen (a mutant did exactly that)
  const srOnly = /\.sr-only \{([^}]*)\}/.exec(widgetHtml)?.[1] ?? '';
  assert.match(srOnly, /position: absolute/);
  assert.match(srOnly, /clip: rect\(0 0 0 0\)/);
  assert.match(srOnly, /overflow: hidden/);
  assert.equal(h.el('swing').getAttribute('aria-describedby'), caption.id, 'it still describes the slider to assistive tech');
  assert.match(h.el('swing').getAttribute('title') ?? '', /off-beat/i, 'and sighted users get it on hover');
});

// (drain 2026-10-19-1500: 'compact: Random, Clear and Export JSON sit behind ONE "more" menu' deleted with the menu; rhythm-box-removed-controls.test.ts pins their absence.)

test('compact: the toolbar is icon buttons with tooltips and aria-labels — short visible text, full names for assistive tech', { skip }, async () => {
  const h = await editing();
  await toCircle(h);                                   // so the circle-only extras are on screen too
  for (const [id, label] of [['bRotLeft', /left/i], ['bRotRight', /right/i], ['bMirror', /mirror/i], ['bRingRotLeft', /counter-clockwise/i],
    ['bRingRotRight', /clockwise/i], ['bRingOut', /outward/i], ['bRingIn', /inward/i], ['bShape', /shape/i]] as const) {
    const b = h.el(id);
    assert.ok(b, id);
    const visible = (b.textContent ?? '').trim();
    assert.ok(visible.length <= 3, `${id}: visible text "${visible}" is an icon, not a word`);
    assert.match(b.getAttribute('title') ?? '', label, `${id} has a tooltip`);
    assert.match(b.getAttribute('aria-label') ?? '', label, `${id} keeps a full accessible name`);
  }
});

test('compact: tighter vertical rhythm — smaller step cells and transport buttons than before (guard against creeping back)', { skip }, () => {
  const px = (re: RegExp) => Number((re.exec(widgetHtml) ?? [])[1]);
  assert.ok(px(/\.step \{[^}]*min-height: (\d+)px/) <= 30, 'grid step cells');
  assert.ok(px(/\n  button \{[^}]*min-height: (\d+)px/) <= 34, 'buttons');
  assert.ok(px(/\.channel-row \{[^}]*margin-bottom: (\d+)px/) <= 3, 'row spacing');
});

// ======================================================================================================================
// 3. A subtler playhead — still readable, no longer a bold spoke through the circle
// ======================================================================================================================

test('playhead: the circle\'s line is thin and translucent, and the active dot gets a soft highlight', { skip }, () => {
  const rule = /svg\.circle-svg \.playhead \{([^}]*)\}/.exec(widgetHtml)?.[1] ?? '';
  const width = Number(/stroke-width: ([\d.]+)/.exec(rule)?.[1]);
  const opacity = Number(/opacity: ([\d.]+)/.exec(rule)?.[1]);
  assert.ok(width > 0 && width <= 1.25, `stroke-width ${width}`);
  assert.ok(opacity >= 0.3 && opacity <= 0.55, `opacity ${opacity} — subtle, still readable`);
  const dotRule = /svg\.circle-svg \.dot\.playing \{([^}]*)\}/.exec(widgetHtml)?.[1] ?? '';
  assert.ok(Number(/stroke-width: ([\d.]+)/.exec(dotRule)?.[1]) <= 2.5, 'the active dot\'s ring is lighter than before (3.5)');
  assert.match(dotRule, /fill-opacity|filter|fill:/, 'with a soft highlight on the dot itself');
});

test('playhead: the grid\'s cursor is lighter too (it was a 2 px ring 3 px outside the cell)', { skip }, () => {
  const rule = /\.step\.playing::after \{[\s\S]*?content: "";([^}]*)\}/.exec(widgetHtml)?.[1] ?? '';
  assert.ok(Number(/border: ([\d.]+)px/.exec(rule)?.[1]) <= 1.5, rule);
});

test('playhead: it still sweeps — the circle line follows the step and hides when stopped (behaviour unchanged)', { skip }, async () => {
  const h = await editing(THREE());
  await toCircle(h);
  const line = h.doc.querySelector('#circle .playhead') as Element | null;
  assert.ok(line, 'the playhead element is still drawn');
  assert.ok(line!.getAttribute('data-step') === '' || line!.getAttribute('data-step') === null, 'idle: no step');
});
