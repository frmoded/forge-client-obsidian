// score_first M9 (drain 2026-10-23-0330) — "Edit this bar" / "Revert to generated" on the surface a person uses: happy-dom, the real mountPhrase + live Score area + the reused bar inspector, a fake renderer
// that draws one g.measure per bar with the ids from the annotated MusicXML, a fake vault (notes, a bars/ listing, create), a fake engine that returns the generated bars as `bars_data`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, readPhraseNote, type ExtendPhrase, type PhraseParams } from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';

const PATH = 'phrases/phrase_001.md';
const phraseText = (p: Record<string, unknown> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const barNote = (kick: number[], tempo = 100) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array.from({ length: 16 }, (_, i) => kick.includes(i)) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const TEMPI = [100, 97, 94, 91, 89, 86, 83, 80];
const generatedBar = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: TEMPI[n - 1], channels: { kick: Array.from({ length: 16 }, (_, i) => i === n) } });   // bar n has its kick on step n: tells the bars apart

const xmlFor = (bars: number, tempi: number[]) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><direction><sound tempo="${tempi[i] ?? 100}"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};

function rig(opts: { phrase?: string; fork?: boolean; createThrows?: string; writeResult?: { ok: false; message: string }; noModify?: boolean; noBarsData?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, opts.phrase ?? phraseText()], ['bars/bar_005.md', barNote([0, 8])], ['bars/bar_006.md', barNote([0])]]);
  const opened: string[] = []; const notices: string[] = []; const created: string[] = []; const writes: ExtendPhrase[] = []; const computes: PhraseParams[] = [];
  let handle: ReturnType<typeof mountPhrase>;
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_001', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      writes.push(params as ExtendPhrase);
      if (opts.writeResult) return opts.writeResult;
      const w = applyPhraseWrite(files.get(PATH)!, params); if (w.ok === false) return w;
      files.set(PATH, w.text);
      if (!opts.noModify) queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async (_d, params) => {
      computes.push(params);
      const overrides = (params as ExtendPhrase).overrides ?? {};
      const tempi = TEMPI.map((t, i) => (overrides[String(i + 1)] ? 140 : t));
      const xml = xmlFor((params as ExtendPhrase).bars, tempi);
      return { type: 'musicxml', content: xml, multi_staff_content: xml, kit_content: xml.replace(/<part id="P2">[\s\S]*<\/part>/, ''), ...(opts.noBarsData ? {} : { bars_data: Array.from({ length: (params as ExtendPhrase).bars }, (_, i) => generatedBar(i + 1)) }) };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+"(?: id="([^"]+)")?>/g)].map((m) => m[1] ?? '');
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure"${id ? ` id="${id}"` : ''}><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    inspector: { openNote: (id) => { opened.push(id); } },
    fork: opts.fork === false ? undefined : {
      listBarBasenames: () => [...files.keys()].filter((k) => /^bars\/bar_\d+\.md$/.test(k)).map((k) => k.slice(5, -3)),
      exists: (p) => files.has(p),
      create: async (p, content) => { if (opts.createThrows) throw new Error(opts.createThrows); created.push(p); files.set(p, content); return { path: p }; },
      notify: (m) => { notices.push(m); },
      isAlreadyExists: (e) => /already exists/i.test(String((e as Error)?.message ?? e)),
    },
  };
  handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const qa = (sel: string) => [...parent.querySelectorAll(sel)] as any[];
  const fire = (el: any, type: string, init: any = {}) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, ...init }));
  const stack = () => qa('.forge-inspector-lineage > li').map((li) => (li.querySelector('span') ?? li.querySelector('button')).textContent);
  const settle = async () => { await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); };
  return { handle, files, opened, notices, created, writes, computes, q, qa, fire, stack, settle, advance };
}

const pinBar = (r: ReturnType<typeof rig>, n: number) => r.fire(r.q(`#n_ph_bar_${n}`), 'click');
const button = (r: ReturnType<typeof rig>) => r.q('.forge-inspector-action-button');

test('a pinned generated bar shows the M6 stack and an Edit this bar button (a hover preview shows no button)', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  r.fire(r.q('#n_ph_bar_3'), 'mouseover');                    // nothing pinned: the hover is only a preview
  assert.equal(button(r), null, 'no button in a preview');
  pinBar(r, 3);
  assert.deepEqual(r.stack(), ['bar 3 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 94', 'Edit this bar']);
  assert.equal(button(r).textContent, 'Edit this bar');
});

test('EDIT THIS BAR: bar 3\'s generated data is written as the next bar note, the phrase names it, and the fork opens in the Beat Box — in that order', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  button(r).dispatchEvent(new (r.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  await r.settle();
  assert.deepEqual(r.created, ['bars/bar_007.md']);
  const fork = readRhythmNote(r.files.get('bars/bar_007.md')!);
  assert.equal(fork.ok, true);
  if (fork.ok) { assert.equal(fork.value.data.channels.kick[3], true, 'bar 3\'s own data (its kick is on step 3)'); assert.equal(fork.value.data.tempo_bpm, 94); }
  assert.match(r.files.get('bars/bar_007.md')!, /\nforked_from: "\[\[phrase_001\]\]"\nforked_bar: 3\n/);
  assert.deepEqual(r.writes.map((w) => w.overrides), [{ '3': 'bars/bar_007' }]);
  assert.deepEqual(r.opened, ['bars/bar_007']);
  assert.deepEqual((readPhraseNote(r.files.get(PATH)!) as { value: ExtendPhrase }).value.overrides, { '3': 'bars/bar_007' });
});

test('after the fork the Score is asked again with the override, bar 3\'s stack says it is forked and offers Revert, bar 4 is still generated', async () => {
  const r = rig();
  await r.handle.load(); await r.settle();
  pinBar(r, 3); button(r).dispatchEvent(new (r.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true })); await r.settle();
  assert.deepEqual((r.computes.at(-1) as ExtendPhrase).overrides, { '3': 'bars/bar_007' });
  pinBar(r, 3);
  assert.deepEqual(r.stack(), ['bar 3 of 8', 'forked: edited in bar_007 (was made by phrase_001, repeat_with_fills)', 'tempo 140 (the fork\'s own)', 'Revert to generated']);
  const open = r.q('.forge-inspector-lineage button.forge-inspector-open');
  assert.equal(open.getAttribute('aria-label'), 'Open bar_007');
  open.dispatchEvent(new (open.ownerDocument.defaultView).MouseEvent('click', { bubbles: true }));
  assert.equal(r.opened.at(-1), 'bars/bar_007');
  pinBar(r, 4);
  assert.equal(r.stack().at(-1), 'Edit this bar');
});

test('REVERT TO GENERATED removes the override and nothing else; the fork note stays', async () => {
  const r = rig({ phrase: phraseText({ overrides: { '3': 'bars/bar_006' } }) });
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  assert.equal(button(r).textContent, 'Revert to generated');
  button(r).dispatchEvent(new (r.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  await r.settle();
  assert.equal(r.writes.length, 1);
  assert.equal(r.writes[0].overrides, undefined);
  assert.equal((readPhraseNote(r.files.get(PATH)!) as { value: ExtendPhrase }).value.overrides, undefined);
  assert.ok(r.files.has('bars/bar_006.md'), 'nothing is deleted');
  assert.deepEqual(r.created, []);
});

test('a change to a FORK note redraws the phrase (the modify watcher follows the override notes); a note that is not part of the phrase does not', async () => {
  const r = rig({ phrase: phraseText({ overrides: { '3': 'bars/bar_006' } }) });
  await r.handle.load(); await r.settle();
  const before = r.computes.length;
  r.files.set('bars/bar_006.md', barNote([0, 4]));
  r.handle.noteModified('bars/bar_006.md'); await r.settle();
  assert.equal(r.computes.length, before + 1);
  r.handle.noteModified('bars/bar_077.md'); await r.settle();
  assert.equal(r.computes.length, before + 1, 'bar_077 is not part of this phrase');
});

test('failures: a refused create writes nothing to the phrase and says why; a refused phrase write names the leftover note', async () => {
  const origErr = console.error; console.error = () => {};
  try {
    const a = rig({ createThrows: 'disk full' });
    await a.handle.load(); await a.settle();
    pinBar(a, 3); button(a).dispatchEvent(new (a.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true })); await a.settle();
    assert.equal(a.writes.length, 0);
    assert.match(a.notices.join('\n'), /Edit this bar: .*disk full/);
    const b = rig({ writeResult: { ok: false, message: 'Not saved: the note is read_only.' } });
    await b.handle.load(); await b.settle();
    pinBar(b, 3); button(b).dispatchEvent(new (b.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true })); await b.settle();
    assert.match(b.notices.join('\n'), /the phrase was not changed, but bars\/bar_007\.md was created \(use it or delete it\)/);
    assert.deepEqual(b.opened, [], 'nothing opens after a failure');
  } finally { console.error = origErr; }
});

test('without the fork port (any host that does not offer it) the extend inspector has no action line at all', async () => {
  const r = rig({ fork: false });
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  assert.equal(button(r), null);
  assert.deepEqual(r.stack(), ['bar 3 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 94']);
});

// ---- gaps found by the mutants ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('two forks in a row, before the vault\'s modify event has come back, keep BOTH overrides (the tab\'s own state moves with each fork)', async () => {
  const r = rig({ noModify: true });
  await r.handle.load(); await r.settle();
  const click = (el: any) => el.dispatchEvent(new (el.ownerDocument.defaultView).MouseEvent('click', { bubbles: true }));
  pinBar(r, 3); click(button(r)); await r.settle();
  pinBar(r, 4); click(button(r)); await r.settle();
  assert.deepEqual(r.writes.map((w) => w.overrides), [{ '3': 'bars/bar_007' }, { '3': 'bars/bar_007', '4': 'bars/bar_008' }]);
});

test('before the Score has drawn bar data (the engine returned none) Edit this bar says so and creates nothing', async () => {
  const r = rig({ noBarsData: true });
  await r.handle.load(); await r.settle();
  pinBar(r, 3);
  button(r).dispatchEvent(new (r.q('svg') as any).ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  await r.settle();
  assert.deepEqual(r.created, []);
  assert.deepEqual(r.writes, []);
  assert.match(r.notices.join('\n'), /Edit this bar: the Score has no data for bar 3 yet/);
});
