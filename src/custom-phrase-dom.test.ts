// 2026-11-02-1155 (score_first M16b) - a CUSTOM note on the real phrase tab (mountPhrase, plain DOM): the controls are OFF and the strip says why; the Score is what the note's own Python makes (the port that runs it, with the limit), drawn by the same
// glue as every phrase; a run that fails keeps the Score on screen, dimmed, with one sentence; the chips are the notes the Python calls. A note that is NOT custom is exactly what it was (P3 for the tab).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, PHRASE_DEFAULTS, type PhraseParams } from './phrase-core.ts';
import { asCustom } from './phrase-notes-core.ts';
import type { CustomRun } from './custom-note-core.ts';

const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', ...PHRASE_DEFAULTS, bars: 8 };
const BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => i === 0) } };
const barNote = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(BAR, null, 2)}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const customText = (): string => { const n = noteContentFor('phrase_001', EXTEND); const py = (n.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]; return asCustom(n.replace(py, "def compute(context):\n  a = bar_005()\n  b = phrase_003()\n  return [a, b]")); };

function rig(text: string, runs: CustomRun[] = [{ ok: true, bars: [BAR, BAR] }]) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, text], ['bars/bar_005.md', barNote]]);
  const log: string[] = [];
  let n = 0;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_001', plan: 'score', initial: text,
    listBars: () => ['bar_005'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => { log.push('write'); return { ok: true }; },
    compute: async (data, params) => { log.push(`compute ${JSON.stringify(params)} ${Array.isArray((data as { bars?: unknown[] }).bars) ? (data as { bars: unknown[] }).bars.length : '-'}`); return { type: 'musicxml', content: `<score-partwise>${params.kind}</score-partwise>` }; },
    runCustom: async (python, name, limit) => { log.push(`run ${name} ${limit} ${python.includes('phrase_003()')}`); return runs[Math.min(n++, runs.length - 1)]; },
    renderInto: (host, payload) => { log.push(`draw ${payload.content as string}`); host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn) => { queueMicrotask(fn); return 0; }, clearTimer: () => {},
    structure: { goto: async () => false, onNotesNavigated: () => () => {} },
  };
  const handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  return { handle, files, log, q, parent };
}

test('a custom note: the strip is OFF (every control disabled) and says why; the Score is what its Python makes (run with the 10 s limit, drawn as a custom kind); the chips are the notes it calls', async () => {
  const r = rig(customText());
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-phrase-status').textContent, '', 'the banner above the pane says why (the description bar), the strip does not repeat it in red');
  for (const sel of ['.forge-phrase-bars', '.forge-phrase-style']) assert.equal(r.q(sel).disabled, true, `${sel} is off`);
  assert.ok(r.log.includes('run phrase_001 10 true'), r.log.join(' | '));
  assert.ok(r.log.includes('compute {"kind":"custom"} 2'), r.log.join(' | '));
  assert.ok(r.log.includes('draw <score-partwise>custom</score-partwise>'), r.log.join(' | '));
  assert.ok(!r.log.includes('write'), 'nothing was written');
  const chips = [...r.parent.querySelectorAll('.forge-structure-chip')].map((c: any) => c.textContent as string);
  assert.ok(chips.some((t) => t.includes('bar_005')) && chips.some((t) => t.includes('phrase_003')), chips.join(' | '));
});

test('a run that fails keeps the Score that is on screen, dimmed, with the one sentence; the next good run draws it normally', async () => {
  const r = rig(customText(), [{ ok: true, bars: [BAR] }, { ok: false, timedOut: true, error: '', line: 0 }, { ok: true, bars: [BAR] }]);
  await r.handle.load(); await flush();
  assert.equal(r.log.filter((l) => l.startsWith('draw')).length, 1);
  r.handle.noteModified(PATH); await flush();
  const status = r.parent.querySelector('.forge-rhythm-score-status, .forge-score-status, [data-role="score-status"]');
  const text = r.parent.textContent as string;
  assert.match(text, /Custom Python: stopped after 10 seconds \(the time limit\); it may loop forever\. The last good Score is kept\./);
  assert.equal(r.log.filter((l) => l.startsWith('draw')).length, 1, 'nothing new was drawn, the old Score stays');
  void status;
  r.handle.noteModified(PATH); await flush();
  assert.equal(r.log.filter((l) => l.startsWith('draw')).length, 2);
  assert.doesNotMatch(r.parent.textContent as string, /time limit/);
});

test('P3 for the tab: a note that is NOT custom has live controls and is drawn by its json as always (the custom port is never asked)', async () => {
  const r = rig(noteContentFor('phrase_001', EXTEND));
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-phrase-bars').disabled, false);
  assert.equal(r.q('.forge-phrase-status').textContent, '');
  assert.ok(!r.log.some((l) => l.startsWith('run ')), 'no run');
  assert.ok(r.log.some((l) => l.startsWith('compute {"kind":"extend"')), r.log.join(' | '));
});
