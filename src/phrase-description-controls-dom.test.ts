// 2026-10-30-1050 (M15b) - the CONTROLS WRITE THE DESCRIPTION, on the real phrase tab (mountPhrase, plain DOM): move the Weight slider of a mix and the note on disk now says the new sentence (the Score follows, as it always did); a Description
// somebody edited by hand is NOT overwritten: the control is put back and the person reads the one sentence, the note untouched. The write is the plugin's own (`applyPhraseWrite` with the note's name, exactly as phrase-view.ts calls it).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';

const PATH = 'phrases/phrase_002.md';
const MIX: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false };
const bar = (tempo: number) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function rig(text: string) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, text], ['bars/bar_005.md', bar(100)], ['bars/bar_006.md', bar(120)]]);
  const drawn: string[] = [];
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_002', plan: 'score', initial: text,
    listBars: () => ['bar_005', 'bar_006'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      const w = applyPhraseWrite(files.get(PATH)!, params, 'phrase_002');          // as phrase-view.ts does, inside vault.process
      if (w.ok === false) return w;
      files.set(PATH, w.text);
      queueMicrotask(() => handle.noteModified(PATH));
      return { ok: true };
    },
    compute: async (_data, params) => ({ type: 'musicxml', content: `<score-partwise>${params.kind === 'mix' ? params.weight : '?'}</score-partwise>` }),
    renderInto: (host, payload) => { drawn.push(payload.content as string); host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn) => { fn(); return 0; }, clearTimer: () => {},
  };
  handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const fire = async (sel: string, value: string) => { const el = q(sel); el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); await flush(); };
  return { handle, files, drawn, q, fire };
}

test('moving the Weight slider rewrites the Description sentence (and the Recipe, the Python, the cache and the stamps with it) and the Score follows', async () => {
  const r = rig(noteContentFor('phrase_002', MIX));
  await r.handle.load(); await flush();
  assert.equal(extractDescription(r.files.get(PATH)!), 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.');
  await r.fire('.forge-mix-weight', '0.35');
  const after = r.files.get(PATH)!;
  assert.equal(extractDescription(after), 'Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(after, noteContentFor('phrase_002', { ...MIX, weight: 0.35 }), 'the note the control wrote is the note a new mix of that weight would be');
  assert.match(r.drawn.at(-1)!, /0\.35/, 'the Score was drawn for it');
});

test('a Description edited by hand is never overwritten by a control: the slider goes back, the one sentence is on the status line, the note is untouched', async () => {
  const note = noteContentFor('phrase_002', MIX);
  const r = rig(note);
  await r.handle.load(); await flush();
  const edited = note.replace('50 percent [[bar_005]]', '80 percent [[bar_005]]');
  r.files.set(PATH, edited);
  await r.fire('.forge-mix-weight', '0.2');
  assert.equal(r.q('.forge-phrase-status').textContent, 'Not saved: the Description was edited by hand; press Update from Description first or revert it.');
  assert.equal(r.files.get(PATH), edited, 'not a byte of the hand-edited note changed');
  assert.equal(r.q('.forge-mix-weight').value, '0.5', 'the control is put back');
});
