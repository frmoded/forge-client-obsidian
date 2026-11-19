// 2026-11-19-0960 - (1) THE PROMPT LINE IS EMPTY before the person types (the placeholder is the empty string for every kind, no dim hint; the field keeps its accessible name through the hidden label) and (2) EVERY SENTENCE-DRIVEN
// "NEW" ACTION MAKES AN EMPTY NOTE (phrase, arrangement, composition: an empty Description, Recipe, Python and cache, no kind until the first applied sentence), opens it with the composer focused and nothing else on the tab, and
// opening, closing and reopening such a note writes NOTHING. Four layers: A the description controller with the composer on a pane (the placeholder, the focus, the first sentence, no write on open), B the three create flows on
// their ports, C the phrase tab (no strip for a note with no kind, the right strip after the first sentence), D the REAL plugin (the palette commands, the real views over an in-memory vault, an engine that is counted).
// Bars and rhythm notes are DATA notes, not sentence-driven: the "New bar" action is pinned UNCHANGED at the end of D.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote, isEmptyNote } from './empty-note-core.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import * as phraseCore from './phrase-core.ts';
import { PHRASE_DEFAULTS, PHRASE_VIEW_TYPE, noteContentFor, readPhraseKind, type PhraseParams } from './phrase-core.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote, readArrangementNote } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE, newCompositionNote, readCompositionNote } from './composition-core.ts';
import * as arrangementFlow from './kit-arrangement-flow-core.ts';
import * as compositionFlow from './composition-flow-core.ts';
import { newArrangementAvailable } from './kit-arrangement-flow-core.ts';
import { newCompositionAvailable } from './composition-flow-core.ts';
// the create flows are looked up on their modules (not imported by name) so that, before they exist, each test fails on its own assertion instead of the whole file failing to link
const createNewEmptyPhrase = (p: any): Promise<any> => (phraseCore as any).createNewEmptyPhrase(p);
const createEmptyArrangement = (p: any): Promise<any> => (arrangementFlow as any).createEmptyArrangement(p);
const createEmptyComposition = (p: any, c?: any): Promise<any> => (compositionFlow as any).createEmptyComposition(p, c);
import { describe } from './phrase-describe-core.ts';
import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';
import { accessibleName, visibleText } from './test-support/accessible-name.ts';
import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';
import { newMenuItems } from './new-menu-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const win: any = new Window({ url: 'http://localhost/' });
const settle = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < n; i++) await Promise.resolve(); };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', ...PHRASE_DEFAULTS, bars: 8 };
const MIX: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } as any;
const S_EXTEND = describe(EXTEND), S_MIX = describe(MIX);
const S_ARR = describe({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] } as any);
const S_COMP = describe({ kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] } as any);

// ===== A. the controller and the composer on a pane ===========================================================================================================================================
type Family = 'phrase' | 'arrangement' | 'composition';
const NOTES: Array<{ tag: string; family: Family; path: string; empty: string; full: string }> = [
  { tag: 'phrase (empty)', family: 'phrase', path: 'phrases/phrase_002.md', empty: emptyPhraseNote('phrase_002'), full: noteContentFor('phrase_002', EXTEND) },
  { tag: 'arrangement (empty)', family: 'arrangement', path: 'arrangements/arr_002.md', empty: emptyArrangementNote('arr_002'), full: newArrangementNote('arr_002', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] } as any) },
  { tag: 'composition (empty)', family: 'composition', path: 'compositions/comp_002.md', empty: emptyCompositionNote('comp_002'), full: newCompositionNote('comp_002', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] } as any) },
];
const NAMES: Record<string, string[]> = { bars: ['bar_005', 'bar_006'], rhythm_bars: ['bar_005', 'bar_006'], phrases: ['phrase_001', 'phrase_002'], arrangements: ['arr_001'], compositions: [], kits: ['rock'] };

function rig(initial: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [], info: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    basenamesIn: (folder) => NAMES[folder] ?? [],
    panes: () => panes, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as any),
    trace: (l) => info.push(l), warn: (l) => info.push(l),
  }, {});
  const ctl = createDescriptionController(ports);
  const tab = (p: string): HTMLElement => {
    const el = win.document.createElement('div'); win.document.body.appendChild(el);
    const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
    panes.push({ path: p, contentEl: el, tab: true }); return el;
  };
  const close = (el: HTMLElement): void => { const i = panes.findIndex((x) => x.contentEl === el); if (i >= 0) panes.splice(i, 1); el.remove(); ctl.syncBars(); };
  return { ctl, store, writes, info, panes, tab, close };
}
const fieldOf = (el: HTMLElement) => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
const typeIn = (el: HTMLElement, text: string) => { const f = fieldOf(el); f.value = text; f.dispatchEvent(new win.Event('input', { bubbles: true })); };
const enter = async (el: HTMLElement) => { fieldOf(el).dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle(); };
/** The text a person can SEE inside `root`: no hidden spans, nothing in a `hidden` or `display: none` element, no text-area value. */
function seen(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const e of Array.from(clone.querySelectorAll('.forge-sr-only, .forge-composer-sr, [hidden], textarea, [aria-hidden="true"]'))) e.remove();
  for (const e of Array.from(clone.querySelectorAll('[style]'))) if (/display:\s*none/.test(e.getAttribute('style') ?? '')) e.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

test('A1 THE PROMPT LINE IS EMPTY for every kind of note: the textarea has no placeholder (the attribute is absent or empty), no dim hint, no example text, and nothing visible in the empty card; the field is still NAMED, by the hidden label, with no tooltip', async () => {
  const kinds: Array<[string, string, string]> = [
    ['phrase: extend', 'phrases/phrase_002.md', noteContentFor('phrase_002', EXTEND)],
    ['phrase: mix', 'phrases/phrase_002.md', noteContentFor('phrase_002', MIX)],
    ['phrase: morph', 'phrases/phrase_002.md', noteContentFor('phrase_002', { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 } as any)],
    ['phrase: no kind yet', 'phrases/phrase_002.md', emptyPhraseNote('phrase_002')],
    ['arrangement', 'arrangements/arr_002.md', NOTES[1].full], ['arrangement: empty', 'arrangements/arr_002.md', NOTES[1].empty],
    ['composition', 'compositions/comp_002.md', NOTES[2].full], ['composition: empty', 'compositions/comp_002.md', NOTES[2].empty],
  ];
  assert.ok(kinds.length >= 8);
  for (const [tag, p, text] of kinds) {
    const r = rig({ [p]: text }); const el = r.tab(p);
    r.ctl.syncBars(); await settle();
    const f = fieldOf(el); assert.ok(f, `${tag}: the composer is on the tab`);
    assert.equal(f.placeholder, '', `${tag}: placeholder property`);
    assert.ok(!f.hasAttribute('placeholder') || f.getAttribute('placeholder') === '', `${tag}: placeholder attribute`);
    assert.equal(f.hasAttribute('title'), false, `${tag}: no title tooltip`); assert.equal(f.hasAttribute('aria-label'), false, `${tag}: no aria-label tooltip`);
    assert.equal(accessibleName(f), 'Describe the next step in a sentence', `${tag}: the accessible name`);
    const labelId = f.getAttribute('aria-labelledby')!; const label = el.ownerDocument.getElementById(labelId)!;
    assert.ok(label.classList.contains('forge-sr-only') && label.textContent === 'Describe the next step in a sentence', `${tag}: the hidden label helper`);
    if (/empty|no kind/.test(tag)) assert.equal(seen(el.querySelector('.forge-prompt-box')!), '', `${tag}: nothing at all is visible in the empty card`);
    assert.doesNotMatch(el.textContent ?? '', /for example|Describe it in a sentence/i, `${tag}: no example text anywhere on the tab`);
  }
});

test('A2 THE DEAD EXAMPLE CODE IS GONE: prompt-box-core has no EXAMPLES table, no placeholderFor and no describe import; nothing else in src or scripts uses them', () => {
  const core = fs.readFileSync(path.join(ROOT, 'src/prompt-box-core.ts'), 'utf8');
  assert.doesNotMatch(core, /EXAMPLES|placeholderFor|phrase-describe-core/);
  const users: string[] = [];
  const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(f); } else if (/\.(ts|mjs)$/.test(e.name) && !/\.generated\.ts$/.test(e.name) && f !== import.meta.filename) { if (/\bplaceholderFor\b|Describe it in a sentence, for example/.test(fs.readFileSync(f, 'utf8'))) users.push(path.relative(ROOT, f)); } } };
  walk(path.join(ROOT, 'src')); walk(path.join(ROOT, 'scripts'));
  assert.deepEqual(users, []);
  const dom = fs.readFileSync(path.join(ROOT, 'src/prompt-box-dom.ts'), 'utf8');
  assert.doesNotMatch(dom, /\.placeholder\s*=/, 'the card never sets a placeholder');
  assert.doesNotMatch(dom, /^\s*placeholder\??:\s*string/m, 'and the ports carry none');
});

test('A3 AN EMPTY NOTE OPENS WITH THE COMPOSER FOCUSED (a note that has content does not take the focus)', async () => {
  for (const n of NOTES) {
    const r = rig({ [n.path]: n.empty }); const el = r.tab(n.path);
    r.ctl.syncBars(); await settle();
    assert.ok(win.document.activeElement === fieldOf(el), `${n.tag}: the composer has the focus`);
    const full = rig({ [n.path]: n.full }); const el2 = full.tab(n.path); (win.document.body.appendChild(win.document.createElement('input')) as HTMLElement).focus();
    full.ctl.syncBars(); await settle();
    assert.ok(win.document.activeElement !== fieldOf(el2), `${n.tag}: a note with content does not steal the focus`);
  }
});

test('A4 OPEN, CLOSE, REOPEN an empty note: NO file change at all (no write, no new text, the very same bytes), the dialog stays empty, no line about a failed Recipe or Python, in every family', async () => {
  for (const n of NOTES) {
    const r = rig({ [n.path]: n.empty });
    for (let round = 0; round < 3; round++) {
      const el = r.tab(n.path);
      r.ctl.syncBars(); await settle();
      await r.ctl.inspect(n.path); r.ctl.modified(n.path); await new Promise((x) => setTimeout(x, 700)); await settle();
      assert.equal(r.store.get(n.path), n.empty, `${n.tag}, round ${round}: the bytes are the same`);
      assert.deepEqual(r.writes, [], `${n.tag}, round ${round}: no write`);
      assert.equal(el.querySelector('.forge-description-bar'), null, `${n.tag}: no bar on the tab (nothing to update, revert or repair)`);
      assert.equal(el.querySelector('.forge-chat-log:not(.is-empty)'), null, `${n.tag}: the dialog is empty`);
      assert.deepEqual(r.info.filter((l) => /rejected|failed|error|refus|could not/i.test(l)), [], `${n.tag}: nothing failed`);
      r.close(el);
    }
    assert.equal(r.store.size, 1, `${n.tag}: no other note was made`);
  }
});

test('A5 THE FIRST SENTENCE, typed in the composer (Enter previews, Enter applies), gives the note its kind and fills every facet; the composer is then empty (the list of a phrase, an arrangement or a composition is in the note: 2026-11-19-0980 for a phrase)', async () => {
  const cases: Array<[typeof NOTES[number], string, (t: string) => unknown]> = [
    [NOTES[0], S_EXTEND, (t) => readPhraseKind(t)], [NOTES[0], S_MIX, (t) => readPhraseKind(t)],
    [NOTES[1], S_ARR, (t) => (readArrangementNote(t).ok ? 'arrangement' : null)], [NOTES[2], S_COMP, (t) => (readCompositionNote(t).ok ? 'composition' : null)],
  ];
  const got: unknown[] = [];
  for (const [n, sentence, kindOf] of cases) {
    const r = rig({ [n.path]: n.empty }); const el = r.tab(n.path);
    r.ctl.syncBars(); await settle();
    typeIn(el, sentence); await enter(el); await enter(el);
    const text = r.store.get(n.path)!;
    assert.equal(isEmptyNote(text), false, `${n.tag}: "${sentence}" made the note`);
    got.push(kindOf(text));
    assert.ok(/\S/.test(text.slice(text.indexOf('# Recipe'), text.indexOf('# Python'))), `${n.tag}: the Recipe is filled`);
    assert.ok(/def compute/.test(text), `${n.tag}: the Python is filled`);
    // 2026-11-19-0970 (the list model): a phrase's composer shows its sentence as ever; an arrangement's and a composition's Description is a LIST and the prompt line is for the next sentence: empty
    // 2026-11-19-0980 (deliberate): a phrase's Description is a list too (line 1 is its head): the composer shows nothing of it, for every kind
    assert.equal(fieldOf(el).value, '', `${n.tag}: the composer shows nothing of the list`);
    assert.equal(r.writes.length, 1, `${n.tag}: one write, by the sentence`);
  }
  assert.deepEqual(got, ['extend', 'mix', 'arrangement', 'composition']);
});

test('A6 P3: NOTHING THAT EXISTS IS EMPTY - no note of the bundled vaults and no note of the test fixtures reads as an empty note (so no existing note changes how it opens, what its Score says or what its composer does); the empty rule is the json cache being `{}`, nothing looser', () => {
  let n = 0; const hit: string[] = [];
  const walk = (d: string): void => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(f); } else if (/\.md$/.test(e.name)) { n++; if (isEmptyNote(fs.readFileSync(f, 'utf8'))) hit.push(path.relative(ROOT, f)); } } };
  walk(path.join(ROOT, 'assets/vaults')); walk(path.join(ROOT, 'test/fixtures'));
  assert.ok(n > 200, `non-vacuity: read ${n} notes`);
  assert.deepEqual(hit, []);
  // and the rule is exactly the empty object: these json caches are NOT empty
  for (const json of ['{"kind":"extend"}', '{"a":null}', '[]', '""', '0', 'null', '']) assert.equal(isEmptyNote(emptyPhraseNote('p').replace('{}', json)), false, JSON.stringify(json));
});

// ===== B. the create flows ====================================================================================================================================================================
function flowPorts(existing: string[] = [], over: { preflight?: any } = {}) {
  const taken = new Set(existing); const created: Array<{ path: string; content: string }> = []; const folders: string[] = []; const notes: string[] = []; const opened: string[] = []; let preflightCalls = 0;
  const base = {
    folderExists: (f?: string) => (f === undefined ? false : folders.includes(f) || existing.some((p) => p.startsWith(`${f}/`))),
    createFolder: async (f?: string) => { folders.push(f ?? 'phrases'); },
    exists: (p: string) => taken.has(p), listPhraseBasenames: () => [...taken].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^.*\//, '').replace(/\.md$/, '')),
    create: async (p: string, content: string) => { if (taken.has(p)) throw new Error('File already exists.'); taken.add(p); created.push({ path: p, content }); return { path: p }; },
    open: async (f: { path: string }) => { opened.push(f.path); }, notify: (m: string) => { notes.push(m); }, trace: () => {}, activePath: () => null,
    isAlreadyExists: (e: unknown) => /already exists/.test(String((e as Error)?.message)),
    preflight: over.preflight ?? (async () => { preflightCalls++; return null; }),
  };
  return { ports: base as any, created, folders, notes, opened, preflightCalls: () => preflightCalls };
}

test('B1 "NEW PHRASE" makes an EMPTY phrase: no bar is needed (an empty vault is fine), no bar is made first, the note has no kind, it is opened, and the next one takes the next free name', async () => {
  const f = flowPorts();
  const r = await createNewEmptyPhrase(f.ports);
  assert.deepEqual(r, { ok: true, path: 'phrases/phrase_001.md' });
  assert.equal(f.created.length, 1); assert.equal(f.created[0].content, emptyPhraseNote('phrase_001'));
  assert.equal(isEmptyNote(f.created[0].content), true); assert.equal(readPhraseKind(f.created[0].content), null);
  assert.deepEqual(f.opened, ['phrases/phrase_001.md']);
  assert.ok(f.folders.length === 1, 'the folder is made when it is missing');
  const again = flowPorts(['phrases/phrase_001.md', 'phrases/phrase_002.md', 'bars/bar_001.md']);
  assert.deepEqual(await createNewEmptyPhrase(again.ports), { ok: true, path: 'phrases/phrase_003.md' });
  assert.equal(again.created.filter((c) => c.path.startsWith('bars/')).length, 0, 'it never makes a bar');
  const taken = flowPorts(); let first = true; const orig = taken.ports.create; taken.ports.create = async (p: string, c: string) => { if (first) { first = false; throw new Error('File already exists.'); } return orig(p, c); };
  assert.equal((await createNewEmptyPhrase(taken.ports)).ok, true, 'a name taken between the check and the write: the retry works');
});

test('B2 "NEW ARRANGEMENT" and "NEW COMPOSITION" make EMPTY notes with no dialog and no prerequisite (no kit, no phrase needed), and are offered in every music vault', async () => {
  const a = flowPorts();
  assert.deepEqual(await createEmptyArrangement(a.ports), { ok: true, path: 'arrangements/arr_001.md' });
  assert.equal(a.created[0].content, emptyArrangementNote('arr_001')); assert.deepEqual(a.opened, ['arrangements/arr_001.md']);
  const c = flowPorts();
  assert.deepEqual(await createEmptyComposition(c.ports), { ok: true, path: 'compositions/comp_001.md', name: 'comp_001' });
  assert.equal(c.created[0].content, emptyCompositionNote('comp_001')); assert.doesNotMatch(c.created[0].content, /root:/, 'a composition that is not the root has no root mark');
  const root = flowPorts(); await createEmptyComposition(root.ports, { root: true });
  assert.equal(root.created[0].content, emptyCompositionNote('comp_001', ['root: true']), 'the first composition of a vault is the root of its piece (as the old dialog ticked it)');
  assert.equal(isEmptyNote(root.created[0].content), true);
  assert.equal(newArrangementAvailable({ scoreFirst: true, kitCount: 0, phraseCount: 0 } as any), true);
  assert.equal(newCompositionAvailable({ scoreFirst: true, phraseCount: 0, arrangementCount: 0 } as any), true);
  assert.equal(newArrangementAvailable({ scoreFirst: false } as any), false); assert.equal(newCompositionAvailable({ scoreFirst: false } as any), false);
  const next = flowPorts(['arrangements/arr_001.md', 'compositions/comp_001.md', 'compositions/comp_002.md']);
  assert.equal((await createEmptyArrangement(next.ports) as any).path, 'arrangements/arr_002.md'); assert.equal((await createEmptyComposition(next.ports) as any).path, 'compositions/comp_003.md');
});

test('B3 A REFUSING PREFLIGHT CANNOT STOP AN EMPTY PHRASE (there is nothing to draw, so the check is not asked), and the three flows still say one plain sentence when the vault fails', async () => {
  const refusing = async () => 'the engine would refuse this';
  const asked = flowPorts([], { preflight: refusing });
  assert.equal((await createNewEmptyPhrase(asked.ports)).ok, true);
  const broken = flowPorts(); broken.ports.create = async () => { throw new Error('disk full'); };
  const saved = console.error; console.error = () => {};
  try {
    for (const [make, tag] of [[() => createNewEmptyPhrase(broken.ports), 'phrase'], [() => createEmptyArrangement(broken.ports), 'arrangement'], [() => createEmptyComposition(broken.ports), 'composition']] as const) {
      const out = await make(); assert.equal(out.ok, false, tag); assert.match((out as { message: string }).message, /disk full/, tag);
    }
  } finally { console.error = saved; }
});

test('B4 THE FOUR NEW ACTIONS are still the four (phrase, arrangement, composition, bar); the bar is a DATA note and is left exactly as it was (the rhythm starter)', () => {
  assert.deepEqual(newMenuItems().map((i) => i.commandId), ['new-phrase', 'new-arrangement', 'new-composition', 'new-bar']);
  for (const i of newMenuItems()) assert.doesNotMatch(i.unavailable, /needs at least one/, `${i.title}: no prerequisite is told any more`);
});

// ===== C. the phrase tab ======================================================================================================================================================================
const PATH = 'phrases/phrase_001.md';
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const xmlFor = (bars: number) => `<score-partwise><part id="P1">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><note><rest/><duration>16</duration></note></measure>`).join('')}</part></score-partwise>`;
function phraseRig(text: string) {
  const w: any = new Window({ url: 'http://localhost/' });
  const parent = w.document.createElement('div'); w.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, text], ['bars/bar_005.md', BAR], ['bars/bar_006.md', BAR]]);
  const computes: string[] = [], drawn: string[] = [];
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_001', plan: 'score', initial: text,
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (_d, params: any) => { computes.push(params.kind); return { type: 'musicxml', content: xmlFor(params.bars ?? 1), multi_staff_content: xmlFor(params.bars ?? 1), kit_content: xmlFor(1) }; },
    renderInto: (host, payload) => { drawn.push(String(payload.type)); host.innerHTML = '<svg><g class="measure" id="m1"></g></svg>'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; }, clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    inspector: { openNote: () => {} },
  };
  const handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await settle(); };
  const q = (s: string) => parent.querySelector(s) as any;
  return { handle, parent, files, computes, drawn, advance, q, status: () => (q('.forge-rhythm-edit-score-status')?.textContent ?? '') as string };
}

test('C1 THE PHRASE TAB OF AN EMPTY NOTE has NO strip (no controls, no source link, no chips, no notebook), an empty Score with nothing said, no kind, and asks the engine for nothing; the tab is the Score slot and the composer, nothing else', async () => {
  const r = phraseRig(emptyPhraseNote('phrase_001'));
  await r.handle.load(); await settle(); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.handle.kind(), null); assert.equal(r.handle.params(), null);
  for (const sel of ['.forge-phrase-controls', '.forge-mix-controls', '.forge-morph-controls', '.forge-transform-strip', '.forge-phrase-source', '.forge-phrase-bars', '.forge-structure-strip', '.forge-notebook', '.forge-inspector', '.forge-phrase-status:not(:empty)']) assert.ok(r.q(sel) === null, `${sel} is not on the tab`);
  assert.equal(r.status(), '', 'the Score says nothing: no refusal, no "Rendering score"');
  assert.equal(r.q('.forge-rhythm-score-host svg'), null, 'nothing is drawn');
  assert.deepEqual(r.computes, [], 'the engine is not asked'); assert.deepEqual(r.drawn, []);
  assert.deepEqual([...r.parent.children].map((c: any) => c.className), ['forge-rhythm-edit-score'], 'the only thing on the tab is the Score slot');
});

test('C2 AFTER THE FIRST APPLIED SENTENCE the tab builds the RIGHT strip for what the sentence made (extend: its controls; then a mix sentence on another note: the mix strip), draws the Score, and the old surface is gone', async () => {
  for (const [params, strip, gone] of [[EXTEND, '.forge-phrase-bars', '.forge-mix-weight'], [MIX, '.forge-mix-weight', '.forge-phrase-bars']] as const) {
    const r = phraseRig(emptyPhraseNote('phrase_001'));
    await r.handle.load(); await settle();
    assert.ok(r.q(strip) === null);
    r.files.set(PATH, noteContentFor('phrase_001', params));          // what the writers make from the first sentence
    r.handle.noteModified(PATH); await settle(); await r.advance(LIVE_SCORE_DEBOUNCE_MS); await r.advance(600);
    assert.equal(r.handle.kind(), params.kind); assert.ok(r.q(strip), `${params.kind}: its strip is on the tab`); assert.ok(r.q(gone) === null);
    assert.ok(r.computes.length >= 1 || r.drawn.length >= 1, `${params.kind}: the Score is asked for now`);
  }
});

// ===== D. the real plugin =====================================================================================================================================================================
let real: RealPlugin;
async function world(files: Record<string, string> = {}) {
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real ??= await bundleRealPlugin(ROOT, 'music');
  const clock = installHostClock(win);
  const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
  const store = new Map<string, string>(Object.entries({ 'bars/bar_005.md': BAR, 'bars/bar_006.md': BAR, ...files }));
  const log: string[] = [];
  const set = store.set.bind(store); store.set = (k: string, v: string) => { log.push(`set ${k}`); return set(k, v); };
  const handlers = new Map<string, Array<(f: any) => void>>(); const leaves: any[] = [];
  const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
  const leafStub: any = { setViewState: async () => {}, openFile: async () => {}, view: {} };
  const app: any = {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML }, on: (name: string, cb: (f: any) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
      getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
      getAbstractFileByPath: (p: string) => (store.has(p) || ['bars', 'phrases', 'arrangements', 'compositions', 'kits'].includes(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); },
      create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); log.push(`create ${p}`); store.set(p, c); return tf(p); }, createFolder: async (p: string) => { log.push(`folder ${p}`); },
    },
    workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null, getLeaf: () => leafStub, revealLeaf: () => {}, setActiveLeaf: () => {} },
    metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {}, commands: { executeCommandById: () => false },
  };
  const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
  console.info = () => {}; console.error = () => {}; console.debug = () => {};
  const HP = win.HTMLElement.prototype;
  const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
  HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
  HP.createDiv = function (o: any = {}) { return this.createEl('div', o); }; HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
  HP.setText = function (t: string) { this.textContent = t; }; HP.empty = function () { this.textContent = ''; };
  HP.addClass = function (c: string) { this.classList.add(c); }; HP.removeClass = function (c: string) { this.classList.remove(c); };
  const bases = [Object.getPrototypeOf(real.PhraseView.prototype)];
  const savedBases = bases.map((b: any) => ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [b, k, b[k]] as const));
  for (const b of bases) for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) b[m] = b[m] ?? (async function () {});
  (Object.prototype as any).addAction = function () { return { remove() {} }; };
  const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
  const plugin = await loadRealOnload(real, app);
  await clock.advance(60);
  const engine: string[] = [];
  real.setPyodideHostSingleton({ getInstance: async () => new Proxy({}, { get: (_t, k: any) => (k === 'then' ? undefined : (...a: unknown[]) => { engine.push(String(k)); return new Promise(() => {}); }) }) });
  const open = async (type: string, file: string) => {
    const leaf: any = { getViewState: () => ({ type, state: { file } }), getRoot: () => ({}) };
    const view: any = plugin.views.get(type)!(leaf);
    const el = win.document.createElement('div'); win.document.body.appendChild(el);
    view.app = app; view.file = tf(file); view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = el; leaf.view = view; leaves.push(leaf);
    await view.onOpen(); await view.onLoadFile(view.file); await clock.advance(20);
    return { view, el, reload: async () => { await view.onUnloadFile(view.file); await view.onLoadFile(view.file); await clock.advance(20); } };
  };
  const run = async (id: string) => { const c = plugin.commands.get(id); assert.ok(c, `the command ${id} is registered`); assert.equal(c!.checkCallback!(true), true, `${id} is offered`); c!.checkCallback!(false); await clock.advance(40); for (let i = 0; i < 40; i++) await Promise.resolve(); };
  return {
    open, run, store, log, engine, clock, plugin,
    done: () => {
      console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
      for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
      for (const list of savedBases) for (const [b, k, v] of list) { if (v === undefined) delete b[k]; }
      delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
    },
  };
}

test('D1 THE REAL PALETTE COMMANDS: New phrase, New arrangement and New composition each make ONE empty note (an empty vault: no bar, no kit, no phrase needed), make no other note, and ask the engine for nothing; New bar still makes the rhythm starter, a data note', async () => {
  const w = await world({});
  try {
    await w.run('new-phrase'); await w.run('new-arrangement'); await w.run('new-composition');
    const made = [...w.store.keys()].filter((k) => !k.startsWith('bars/bar_00'));
    assert.deepEqual(made.sort(), ['arrangements/arr_001.md', 'compositions/comp_001.md', 'phrases/phrase_001.md']);
    assert.equal(w.store.get('phrases/phrase_001.md'), emptyPhraseNote('phrase_001'));
    assert.equal(w.store.get('arrangements/arr_001.md'), emptyArrangementNote('arr_001'));
    assert.ok(isEmptyNote(w.store.get('compositions/comp_001.md')!), 'the composition is empty (the first one of a vault is the root of its piece)');
    assert.deepEqual(w.engine, [], 'the engine was never asked');
    await w.run('new-bar');
    const bar = [...w.store.keys()].find((k) => /^bars\/bar_\d+\.md$/.test(k) && !['bars/bar_005.md', 'bars/bar_006.md'].includes(k));
    assert.ok(bar, 'New bar made a bar'); const read = readRhythmNote(w.store.get(bar!)!);
    assert.ok(read.ok && JSON.stringify(read.value.data) === JSON.stringify(RHYTHM_STARTER), 'the bar is the rhythm starter, a data note, unchanged');
  } finally { w.done(); }
});

test('D2 THE ARRANGEMENT AND COMPOSITION TABS of an empty note show NOTHING but the composer slot: no header sentence, no refusal, no "could not", no Score text; the engine is never asked; open, close and reopen write nothing', async () => {
  const w = await world({ 'arrangements/arr_001.md': emptyArrangementNote('arr_001'), 'compositions/comp_001.md': emptyCompositionNote('comp_001'), 'phrases/phrase_001.md': emptyPhraseNote('phrase_001') });
  try {
    const before = new Map(w.store); w.log.length = 0;
    for (const [type, file] of [[ARRANGEMENT_VIEW_TYPE, 'arrangements/arr_001.md'], [COMPOSITION_VIEW_TYPE, 'compositions/comp_001.md'], [PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']] as const) {
      const t = await w.open(type, file);
      assert.equal(seen(t.el), '', `${file}: nothing is said on the tab (${JSON.stringify(seen(t.el))})`);
      assert.doesNotMatch(t.el.textContent ?? '', /could not|refus|kind|not a valid|json block|Rendering/i, `${file}: no sentence about a problem, even hidden`);
      await t.reload(); await t.reload();
      assert.equal(seen(t.el), '', `${file}: still nothing after two reopens`);
    }
    assert.deepEqual(w.log, [], 'not one write, create or folder');
    for (const [k, v] of before) assert.equal(w.store.get(k), v, `${k}: the same bytes`);
    assert.deepEqual(w.engine, [], 'the engine was never asked');
  } finally { w.done(); }
});

test('D3 MECHANISM PINS: the three New commands call the empty flows (no dialog, no bar made first); the two choose-dialogs and the flows that fed them are gone from the plugin', () => {
  const read = (f: string) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  assert.match(read('score-first.ts'), /createNewEmptyPhrase/); assert.doesNotMatch(read('score-first.ts'), /createPhraseAnywhere/);
  assert.match(read('kits-arrangements.ts'), /createEmptyArrangement/); assert.doesNotMatch(read('kits-arrangements.ts'), /mountArrangementDialog/);
  assert.match(read('compositions.ts'), /createEmptyComposition/); assert.doesNotMatch(read('compositions.ts'), /mountCompositionDialog/);
  for (const gone of ['arrangement-dom.ts', 'composition-dialog-dom.ts', 'new-phrase-anywhere-core.ts']) assert.equal(fs.existsSync(path.join(ROOT, 'src', gone)), false, `${gone} is deleted`);
  const all = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\.generated\.ts$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n') + fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.doesNotMatch(all, /forge-arr-dialog|forge-comp-dialog|forge-arr-tracks|forge-comp-sections|mountArrangementDialog|mountCompositionDialog|createPhraseAnywhere|pickSourceBar/, 'nothing of the dialogs or of the bar-first flow is left in the code or the styles');
});
