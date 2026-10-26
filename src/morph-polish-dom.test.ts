// score_first (drain 2026-10-26-1100) — the refusal trap on an EXTEND phrase (the same wording and the same escape as a morph's): a fork on a bar past Bars is a refusal naming the way out, the Bars field stays enabled,
// raising Bars brings the Score back and the fork is kept. Plain DOM (happy-dom), a fake vault and a fake engine; the morph's own flow (with its Inspector) is in morph-inspector.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, type PhraseParams } from './phrase-core.ts';

const PATH = 'phrases/phrase_001.md';
const note = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const barText = note({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } });
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function rig(phrase: object) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, note(phrase)], ['bars/bar_005.md', barText], ['bars/bar_009.md', barText]]);
  const computes: PhraseParams[] = [];
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_001', plan: 'score', initial: files.get(PATH),
    listBars: () => ['bar_005', 'bar_009'],
    inspector: { openNote: () => {} },
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      const w = applyPhraseWrite(files.get(PATH)!, params);
      if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async (_d, params) => { computes.push(params); return { type: 'musicxml', content: '<score-partwise/>', bars_data: [] }; },
    renderInto: (host) => { host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer: (h) => clearTimeout(h as never),
  };
  handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const change = async (sel: string, value: string) => { const el = q(sel); el.value = value; el.dispatchEvent(new win.Event('change', { bubbles: true })); await flush(); await new Promise((r) => setTimeout(r, 400)); await flush(); };
  return { handle, files, computes, q, change };
}
const status = (r: ReturnType<typeof rig>) => r.q('.forge-rhythm-edit-score-status').textContent as string;
const load = async (r: ReturnType<typeof rig>) => { await r.handle.load(); await flush(); await new Promise((x) => setTimeout(x, 400)); await flush(); };

test('an extend phrase with a fork past Bars: the refusal names the way out, the strip stays enabled showing the note\'s Bars, nothing is drawn, and raising Bars brings the Score back with the fork kept', async () => {
  const r = rig({ kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '9': 'bars/bar_009' } });
  await load(r);
  assert.match(status(r), /^Phrase: overrides: "9" is not a bar of this phrase \(bars 1 to 4\); raise Bars, or remove the override with Revert to generated\./);
  assert.equal(r.computes.length, 0, 'the engine was not asked for a phrase that is refused');
  for (const sel of ['.forge-phrase-bars', '.forge-phrase-style', '.forge-phrase-pct']) assert.equal(r.q(sel).disabled, false, `${sel} stays enabled`);
  assert.equal(r.q('.forge-phrase-bars').value, '4');
  assert.equal(r.q('.forge-phrase-bracket').style.display, 'none', 'the bracket over the bars is not shown for a refused phrase');
  await r.change('.forge-phrase-bars', '9');
  assert.equal(status(r), '', 'the refusal is gone');
  assert.match(r.files.get(PATH)!, /"bars": 9/);
  assert.match(r.files.get(PATH)!, /"9": "bars\/bar_009"/, 'the fork was carried through the write');
  assert.equal(r.computes.length, 1, 'the Score is asked for once the phrase is valid');
});

test('other refusals of an extend phrase are what they were: every control disabled (a source that is not a bar name is not something the strip can fix)', async () => {
  const r = rig({ kind: 'extend', source: 'not a bar', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
  await load(r);
  assert.match(status(r), /source must be the name of a bar/);
  assert.equal(r.q('.forge-phrase-bars').disabled, true);
});
