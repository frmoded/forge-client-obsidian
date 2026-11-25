// 2026-11-24-1031 (pitch in bars, Stage 1b) - the mutation pass of the melody phrase answered (phrase-dom.ts): "Edit this bar" pressed on a bar of a MELODY phrase (happy-dom, the real mountPhrase and bar inspector, the engine stood in for). The button copies a bar of
// BEATS: on a melody phrase it says so in the one plain sentence, makes no note and writes nothing; on a rhythm phrase it is what it was (phrase-fork-dom.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';

const PATH = 'phrases/phrase_101.md';
const phraseText = (p: Record<string, unknown> = {}) => `---\ntype: data\ncontent_type: json\nmelody: true\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_101', bars: 4, style: 'repeat', tempo_change_pct: 0, ...p }, null, 2)}\n\`\`\`\n`;
const melodyBar = (): string => melodyNoteTemplate('bar_101').replace('"notes": []', '"notes": [{ "step": 1, "pitch": "G3", "length": 1 }]');
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const bar = { time_signature: '4/4', steps: 16, group_size: 4, tempo_bpm: 100, instrument: 'cello', notes: [{ step: 1, pitch: 'G3', length: 1 }] };
const xmlFor = (bars: number) => `<score-partwise><part id="P1">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><note><rest/><duration>16</duration></note></measure>`).join('')}</part></score-partwise>`;

function rig(phrase: string) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, phrase], ['bars/bar_101.md', melodyBar()]]);
  const notices: string[] = [], created: string[] = [], writes: unknown[] = [], opened: string[] = [];
  const timers: Array<{ id: number; at: number; fn: () => void }> = []; let now = 0, nextId = 1;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_101', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => { writes.push(params); return { ok: true }; },
    compute: async (_d, params) => { const n = (params as { bars: number }).bars; const xml = xmlFor(n); return { type: 'musicxml', content: xml, multi_staff_content: xml, bars_data: Array.from({ length: n }, () => bar) } as never; },
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
    fork: {
      listBarBasenames: () => [...files.keys()].filter((k) => /^bars\/bar_\d+\.md$/.test(k)).map((k) => k.slice(5, -3)),
      exists: (p) => files.has(p), create: async (p, c) => { created.push(p); files.set(p, c); return { path: p }; },
      notify: (m) => { notices.push(m); }, isAlreadyExists: () => false,
    },
  };
  const handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const settle = async () => { await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); await flush(); await advance(LIVE_SCORE_DEBOUNCE_MS); };
  return { handle, q, win, settle, notices, created, writes, opened, files };
}
const click = (r: ReturnType<typeof rig>, el: any) => el.dispatchEvent(new r.win.MouseEvent('click', { bubbles: true }));

test('EDIT THIS BAR on a bar of a melody phrase says in one plain sentence that it copies beats and tells what to do; no bar note is made, nothing is written, nothing is opened', async () => {
  const r = rig(phraseText());
  await r.handle.load(); await r.settle();
  click(r, r.q('#n_ph_bar_3')); await r.settle();
  const button = r.q('.forge-inspector-action-button');
  assert.ok(button, 'the bar offers its button');
  assert.equal(button.textContent, 'Edit this bar');
  click(r, button); await r.settle();
  assert.deepEqual(r.notices, ['Edit this bar: that button copies a bar of beats. For a melody phrase make a melody bar (New melody bar), say its notes, then say "Bar N is replaced by [[bar_NNN]]."']);
  assert.deepEqual(r.created, [], 'no bar note was made');
  assert.deepEqual(r.writes, [], 'the phrase was not written');
  assert.deepEqual(r.opened, [], 'nothing was opened');
});
