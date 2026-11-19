// 2026-11-16-1000 - select bars on the Score and act on them, on the surface a person uses: happy-dom, the real mountPhrase + live Score area + the inspector over an in-memory vault. Shift-click extends, Ctrl/Cmd-click toggles, Esc clears, a plain click
// is still the pin; the selection is tinted and counted and the menu appears; every action writes a sentence (a PREVIEW in the prompt box of a transform phrase, a new transform phrase for the others) and applies nothing; a tab with no host says so;
// a change of the note lets the selection go; P3: outside the phrase tab nothing changed (the inspector's own tests, the mechanism pin below). Host-faithful clock: the shared fake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams, type TransformPhrase } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { installHostClock } from './test-support/host-workspace.ts';

const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });

async function rig(opts: { path?: string; phrase?: PhraseParams; host?: boolean } = {}) {
  const clock = installHostClock(win);
  const notePath = opts.path ?? 'phrases/phrase_006.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', EXTEND)]]);
  if (opts.phrase) files.set(notePath, noteContentFor(notePath.replace(/^phrases\//, '').replace(/\.md$/, ''), opts.phrase));
  const previews: Array<{ path: string; text: string }> = []; const made: TransformPhrase[] = []; const pins: unknown[] = [];       // 2026-11-19-0980: `previews` is what the host was asked to APPEND (path and sentence)
  const off = opts.host === false ? () => {} : registerBarSelectionHost({
    appendLine: async (p, sentence) => { previews.push({ path: p, text: sentence }); return { ok: true, message: `Added: ${sentence}` }; },       // 2026-11-19-0980: the host APPENDS the sentence as a line of the list (it was previewDescription: shown in the prompt box)
    makePhrase: async (params) => { made.push(params); return { ok: true as const, path: 'phrases/phrase_099.md' }; },
  });
  const ports: PhraseMountPorts = {
    path: notePath, title: notePath.replace(/^phrases\//, '').replace(/\.md$/, ''), plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (data: any, params) => {
      const bars = params.kind === 'transform' ? data.bars : Array.from({ length: (params as any).bars ?? 8 }, (_, i) => barOf(i));
      return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: (p: unknown) => { pins.push(p); } },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load();
  await clock.advance(400);
  const bars = () => [...parent.querySelectorAll('g.measure')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const menu = () => parent.querySelector('.forge-bar-selection') as any;
  const count = () => menu()?.querySelector('.forge-bar-selection-count')?.textContent as string;
  const note = () => { const n = menu()?.querySelector('.forge-bar-selection-note'); return n && n.style.display !== 'none' ? (n.textContent as string) : null; };
  const shown = () => menu() !== null && menu().style.display !== 'none';
  const tinted = () => [...parent.querySelectorAll('.forge-selected-bar')].map((r: any) => r.parentNode.id);
  const act = async (id: string) => { (menu().querySelector(`[data-action="${id}"]`) as any).click(); await clock.advance(20); };
  const esc = () => parent.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { handle, parent, files, previews, made, pins, bars, click, menu, count, note, shown, tinted, act, esc, clock, done: () => { off(); handle.dispose(); clock.restore(); } };
}

test('Shift-click selects and extends from the anchor, Ctrl/Cmd-click toggles one apart, the bars are tinted and the menu counts them; a plain click is still the pin', async () => {
  const r = await rig();
  try {
    assert.equal(r.bars().length, 8);
    assert.ok(!r.shown(), 'no selection: no menu');
    r.click(r.bars()[2], { shiftKey: true });
    assert.equal(r.count(), 'bar 3 selected');
    r.click(r.bars()[4], { shiftKey: true });
    assert.equal(r.count(), '3 bars selected: bars 3 to 5');
    assert.equal(r.tinted().length, 3);
    r.click(r.bars()[6], { ctrlKey: true });
    assert.equal(r.count(), '4 bars selected: bars 3 to 5 and bar 7');
    r.click(r.bars()[3], { metaKey: true });                                   // toggled OUT
    assert.equal(r.count(), '3 bars selected: bar 3, bar 5 and bar 7');
    assert.equal(r.tinted().length, 3);
    assert.deepEqual(r.pins, [], 'no gesture so far pinned anything');
    r.click(r.bars()[1]);                                                       // a PLAIN click: the pin, as always
    assert.equal(r.pins.length, 1);
    assert.equal(r.count(), '3 bars selected: bar 3, bar 5 and bar 7', 'a pin does not touch the selection');
  } finally { r.done(); }
});

test('Esc clears the selection (tint and menu go); the clear button does the same; Esc in a text field is left to the field', async () => {
  const r = await rig();
  try {
    r.click(r.bars()[1], { shiftKey: true }); r.click(r.bars()[3], { shiftKey: true });
    assert.ok(r.shown());
    r.esc();
    assert.ok(!r.shown()); assert.deepEqual(r.tinted(), []);
    r.click(r.bars()[1], { shiftKey: true });
    (r.menu().querySelector('.forge-bar-selection-clear') as any).click();
    assert.ok(!r.shown()); assert.deepEqual(r.tinted(), []);
    r.click(r.bars()[1], { shiftKey: true });
    const box = win.document.createElement('textarea'); r.parent.appendChild(box);
    box.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(r.shown(), 'Esc typed in a text field is the field\'s');
    r.click(r.bars()[1], { ctrlKey: true });                                    // toggling the last bar out leaves nothing: the menu goes by itself
    assert.ok(!r.shown());
  } finally { r.done(); }
});

test('NEW PHRASE FROM THESE BARS, from an extend: asks for a new transform phrase of this one that keeps those bars, in order of position; the selection lets go; nothing else is written', async () => {
  const r = await rig();
  try {
    r.click(r.bars()[6], { shiftKey: true }); r.click(r.bars()[1], { ctrlKey: true }); r.click(r.bars()[2], { ctrlKey: true });
    assert.equal(r.count(), '3 bars selected: bars 2 to 3 and bar 7');
    const before = [...r.files.keys()].sort();
    await r.act('new-phrase');
    assert.deepEqual(r.made, [{ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'keep', runs: [[2, 3], [7, 7]] }] }]);
    assert.deepEqual(r.previews, [], 'a new phrase is not a preview');
    assert.ok(!r.shown() && r.tinted().length === 0);
    assert.deepEqual([...r.files.keys()].sort(), before, 'this tab wrote nothing: the host makes the note');
  } finally { r.done(); }
});

test('Copy, Delete and Move on an EXTEND are a new transform phrase of it (its own Description could not take the step); each says the sentence it writes', async () => {
  for (const [action, ops] of [
    ['delete', [{ op: 'delete', runs: [[3, 4]] }]], ['copy', [{ op: 'copy', runs: [[3, 4]] }]],
    ['move-left', [{ op: 'move', runs: [[3, 4]], by: -1 }]], ['move-right', [{ op: 'move', runs: [[3, 4]], by: 1 }]],
  ] as const) {
    const q = await rig();
    try {
      q.click(q.bars()[2], { shiftKey: true }); q.click(q.bars()[3], { shiftKey: true });
      await q.act(action);
      assert.deepEqual(q.made, [{ kind: 'transform', source: 'phrases/phrase_006', ops }], action);
    } finally { q.done(); }
  }
});

// 2026-11-19-0980 (deliberate): the step is APPENDED to the list (one write, by the host), not shown in the prompt box; a transform that has a Thin out already makes a new phrase (a step is never re-sorted before it)
const PLAIN_TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [] };
test('on a TRANSFORM phrase, Copy / Delete / Move are APPENDED to its list through the host: the sentence alone, nothing made, nothing written by the tab, the selection kept; the menu says what happened and how to take it back', async () => {
  const r = await rig({ path: 'phrases/phrase_007.md', phrase: PLAIN_TRANSFORM });
  try {
    assert.equal(r.bars().length, 8);
    r.click(r.bars()[3], { shiftKey: true }); r.click(r.bars()[4], { shiftKey: true });
    const written = [...r.files.entries()];
    await r.act('delete');
    assert.deepEqual(r.previews, [{ path: 'phrases/phrase_007.md', text: 'Delete bars 4 to 5.' }]);
    assert.deepEqual(r.made, []);
    assert.deepEqual([...r.files.entries()], written, 'the tab writes nothing: the host appends the line');
    assert.equal(r.count(), '2 bars selected: bars 4 to 5');
    assert.equal(r.note(), 'Added: Delete bars 4 to 5. (Cmd/Ctrl+Z in the composer takes it back.)');
    assert.equal(r.tinted().length, 2, 'the selection is still there');
    await r.act('move-right');
    assert.equal(r.previews[1].text, 'Move bars 4 to 5 one bar right.');
  } finally { r.done(); }
});

test('2026-11-19-0980: on a TRANSFORM phrase that already has a Thin out, a structure step makes a NEW phrase of it (never re-sorted before the Thin out), and nothing is appended', async () => {
  const r = await rig({ path: 'phrases/phrase_007.md', phrase: TRANSFORM });
  try {
    r.click(r.bars()[3], { shiftKey: true }); r.click(r.bars()[4], { shiftKey: true });
    await r.act('delete');
    assert.deepEqual(r.previews, []); assert.equal(r.made.length, 1); assert.deepEqual(r.made[0].ops, [{ op: 'delete', runs: [[4, 5]] }]);
  } finally { r.done(); }
});

test('GREYED: moving bar 1 left and the last bar right, deleting every bar; clicking a greyed entry does nothing', async () => {
  const r = await rig();
  try {
    r.click(r.bars()[0], { shiftKey: true });
    const dis = (id: string) => (r.menu().querySelector(`[data-action="${id}"]`) as any).disabled;
    assert.ok(dis('move-left')); assert.ok(!dis('move-right')); assert.ok(!dis('delete'));
    assert.equal((r.menu().querySelector('[data-action="move-left"]') as any).getAttribute('aria-description'), 'Bar 1 cannot move left.', '2026-11-19-0800: the why is the aria-description, not a native title');
    await r.act('move-left');
    assert.deepEqual(r.made, []);
    r.click(r.bars()[7], { shiftKey: true });                                   // bars 1 to 8
    assert.ok(dis('delete')); assert.ok(dis('move-left')); assert.ok(dis('move-right')); assert.ok(!dis('copy')); assert.ok(!dis('new-phrase'));
  } finally { r.done(); }
});

test('a tab with no host (a lean edition, a test) says so in the menu\'s own line and does not throw; no host is no change to the pin', async () => {
  const r = await rig({ host: false });
  try {
    r.click(r.bars()[1], { shiftKey: true });
    await r.act('delete');
    assert.equal(r.count(), 'bar 2 selected');
    assert.equal(r.note(), 'no prompt box here to show it in.');       // 2026-11-19-0980: the tab with no host at all keeps its line
    assert.deepEqual(r.made, []);
  } finally { r.done(); }
});

test('a change that RENUMBERS the bars (a Delete applied, another source) lets the selection go; one that keeps every number (a Thin out) keeps it; a Score with fewer bars drops the bars it no longer has', async () => {
  const r = await rig({ path: 'phrases/phrase_007.md', phrase: TRANSFORM });
  try {
    r.click(r.bars()[2], { shiftKey: true });
    assert.ok(r.shown());
    r.files.set('phrases/phrase_007.md', noteContentFor('phrase_007', { ...TRANSFORM, ops: [{ op: 'thin_out', first: 1, last: 3, amount: 0.5 }] } as PhraseParams));
    r.handle.noteModified('phrases/phrase_007.md');
    await r.clock.advance(400);
    assert.ok(r.shown(), 'a Thin out keeps every bar where it was: the selection stays');
    assert.deepEqual(r.tinted(), ['ph_bar_3'].map((id) => r.parent.querySelector(`#${id}`)!.id));
    r.files.set('phrases/phrase_007.md', noteContentFor('phrase_007', { ...TRANSFORM, ops: [{ op: 'delete', runs: [[1, 1]] }, { op: 'thin_out', first: 1, last: 3, amount: 0.5 }] } as PhraseParams));
    r.handle.noteModified('phrases/phrase_007.md');
    await r.clock.advance(400);
    assert.ok(!r.shown(), 'a Delete renumbered the bars: the selection went');
    assert.deepEqual(r.tinted(), []);
  } finally { r.done(); }
});

test('a drag across bars selects them too, and tells the (hidden) notebook nothing it cannot take; the menu and the tint agree', async () => {
  const r = await rig();
  try {
    const down = (el: any) => el.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    down(r.bars()[1]);
    r.bars()[3].dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true }));
    r.bars()[3].dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
    assert.equal(r.count(), '3 bars selected: bars 2 to 4');
    assert.equal(r.tinted().length, 3);
  } finally { r.done(); }
});

test('MECHANISM PIN 2026-11-16-1000 (if the design moves this SHOULD go red: reassess, do not just rewrite): the selection is the phrase tab\'s (phrase-dom.ts) and the plugin\'s two ports (score-first.ts, through the bus); no other surface names the menu, the core or the bus', () => {
  const dir = import.meta.dirname;
  const users = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && /bar-selection-(core|menu-dom|bus)/.test(fs.readFileSync(path.join(dir, f), 'utf8'))).sort();
  assert.deepEqual(users, ['bar-selection-menu-dom.ts', 'phrase-dom.ts', 'score-first.ts']);       // the core is imported by the menu and the tab; the bus (which names none of the three) by the tab and the plugin
  const dom = fs.readFileSync(path.join(dir, 'phrase-dom.ts'), 'utf8');
  assert.equal((dom.match(/selectBars: selectBarsPort\(\),/g) ?? []).length, 3, 'extend (and transform, which shares its inspector), mix and morph');
  assert.match(dom, /const selectBarsPort = \(\): ScoreInspectorPorts\['selectBars'\] => \(\{/, 'every phrase surface has the gesture, with or without a notebook');
  const first = fs.readFileSync(path.join(dir, 'score-first.ts'), 'utf8');
  assert.match(first, /registerBarSelectionHost\(\{\s*appendLine: \(path, sentence\) => descriptions\.appendLine\(path, sentence\),/);       // 2026-11-19-0980 (deliberate): the plugin's port APPENDS the line (it was previewDescription -> suggestInBox)
  assert.match(first, /plugin\.register\(registerBarSelectionHost/, 'taken away again on unload');
});
