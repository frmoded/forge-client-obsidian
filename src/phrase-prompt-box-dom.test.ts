// 2026-11-12-1203 - the prompt box and the controls on the REAL phrase tab (mountPhrase, plain DOM) with the description controller beside it, the way the plugin wires them: a control write reaches the box through the vault's `modify`,
// and an apply from the box makes the controls show the new values (the tab re-reads the parsed note on the same `modify`). The note on disk is the only source of truth in both directions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { createDescriptionController } from './description-apply.ts';
import { applyPhraseWrite, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';

const PATH = 'phrases/phrase_002.md';
const MIX: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false };
const bar = (tempo: number) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

function rig() {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PATH, noteContentFor('phrase_002', MIX)], ['bars/bar_005.md', bar(100)], ['bars/bar_006.md', bar(120)]]);
  const timers: Array<() => void> = [];
  let handle: ReturnType<typeof mountPhrase>;
  const modified = (p: string) => { queueMicrotask(() => { handle.noteModified(p); ctl.modified(p); }); };   // Obsidian's vault `modify`, heard by the tab and by the controller
  const ctl = createDescriptionController({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = files.get(p)!; const next = fn(cur); if (next !== cur) { files.set(p, next); modified(p); } },
    vault: () => ({ bars: ['bar_005', 'bar_006'], phrases: ['phrase_002'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_005', 'bar_006'], phraseNames: () => ['phrase_002'],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
    trace: () => {}, panes: () => [{ path: PATH, contentEl: parent, tab: true }],
  });
  const ports: PhraseMountPorts = {
    path: PATH, title: 'phrase_002', plan: 'score', initial: files.get(PATH)!,
    listBars: () => ['bar_005', 'bar_006'],
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => { const w = applyPhraseWrite(files.get(PATH)!, params, 'phrase_002'); if (w.ok === false) return w; files.set(PATH, w.text); modified(PATH); return { ok: true }; },
    compute: async (_d, params) => ({ type: 'musicxml', content: `<score-partwise>${params.kind === 'mix' ? params.weight : '?'}</score-partwise>` }),
    renderInto: (host) => { host.textContent = 'engraved'; return true; },
    stopPlayers: () => {},
    setTimer: (fn) => { fn(); return 0; }, clearTimer: () => {},
  };
  handle = mountPhrase(parent, ports);
  const q = (sel: string) => parent.querySelector(sel) as any;
  return { win, parent, files, ctl, handle, q, timers };
}

test('on the real phrase tab: moving the Weight slider changes the box text; applying a sentence typed in the box moves the slider and the Score; typing is never overwritten by the controls', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  await r.ctl.inspect(PATH); await flush();
  assert.ok(r.q('.forge-prompt-box'), 'the box is on the tab');
  assert.equal(r.parent.lastElementChild, r.q('.forge-prompt-box'), 'at the bottom of the tab, after the strip and the Score');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.');
  // a control change -> the box
  r.q('.forge-mix-weight').value = '0.35'; r.q('.forge-mix-weight').dispatchEvent(new r.win.Event('input', { bubbles: true })); await flush();
  assert.equal(extractDescription(r.files.get(PATH)!), 'Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 35 percent [[bar_005]], as a vote.', 'the box shows what the control wrote');
  assert.equal(r.q('.forge-prompt-box.is-edited'), null);
  // the box -> the controls
  const f = r.q('.forge-prompt-box-text');
  f.value = 'Mix [[bar_005]] and [[bar_006]], 80 percent [[bar_005]], as a vote. Threshold 65 percent.'; f.dispatchEvent(new r.win.Event('input', { bubbles: true }));
  f.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush();
  assert.equal(r.q('.forge-mix-weight').value, '0.8', 'the Weight slider shows the new value');
  assert.equal(r.q('.forge-mix-threshold').value, '0.65', 'and the Threshold');
  assert.equal(extractDescription(r.files.get(PATH)!), 'Mix [[bar_005]] and [[bar_006]], 80 percent [[bar_005]], as a vote. Threshold 65 percent.');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Mix [[bar_005]] and [[bar_006]], 80 percent [[bar_005]], as a vote. Threshold 65 percent.');
  // typing in the box, then a control moves: the typing stays
  f.value = 'half-typed'; f.dispatchEvent(new r.win.Event('input', { bubbles: true }));
  r.q('.forge-mix-weight').value = '0.2'; r.q('.forge-mix-weight').dispatchEvent(new r.win.Event('input', { bubbles: true })); await flush();
  assert.equal(r.q('.forge-prompt-box-text').value, 'half-typed');
  assert.ok(r.q('.forge-prompt-box-conflict') && r.q('.forge-prompt-box-conflict').style.display !== 'none');
});

test('the Path switch of a mix writes the path sentence and the box follows; a vote sentence typed in the box switches the controls back to Vote', async () => {
  const r = rig();
  await r.handle.load(); await flush(); await r.ctl.inspect(PATH); await flush();
  r.q('.forge-mix-mode').value = 'path'; r.q('.forge-mix-mode').dispatchEvent(new r.win.Event('change', { bubbles: true })); await flush();
  assert.match(r.q('.forge-prompt-box-text').value, /as a path, in musical order/);
  const f = r.q('.forge-prompt-box-text');
  f.value = 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.'; f.dispatchEvent(new r.win.Event('input', { bubbles: true }));
  f.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush();
  assert.equal(r.q('.forge-mix-mode').value, 'vote', 'the Mode select shows Vote again');
});

test('a tab that rebuilds itself for a new kind of note (a mix hand-edited into a morph) puts its new strip AFTER the box and the box goes back to being last', async () => {
  const r = rig();
  await r.handle.load(); await flush(); await r.ctl.inspect(PATH); await flush();
  r.files.set(PATH, noteContentFor('phrase_002', { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 }));
  r.handle.noteModified(PATH); r.ctl.modified(PATH); await flush(); await flush();
  assert.ok(r.q('.forge-morph-controls'), 'the premise: the tab now shows a morph strip');
  assert.equal(r.parent.querySelectorAll('.forge-prompt-box').length, 1, 'one box');
  assert.equal(r.parent.lastElementChild, r.q('.forge-prompt-box'), 'and it is the last thing in the tab');
  assert.equal(r.q('.forge-prompt-box-text').value, 'Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.');
});
