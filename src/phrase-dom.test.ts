// score_first M5 (drain 2026-10-22-1850) — the phrase surface: a control strip over the live Score, in plain DOM (happy-dom), with a fake vault and a fake engine. What it writes, what it redraws
// and when, what it says when the phrase or its source is wrong. (The REAL engine renders the same surface in phrase-engine.test.ts.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { applyPhraseWrite, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { LEAN_SCORE_NOTE } from './score-first-core.ts';
import { LIVE_SCORE_DEBOUNCE_MS } from './live-score-core.ts';

const PHRASE_PATH = 'phrases/phrase_001.md';
const phraseText = (p: Partial<PhraseParams> = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function rig(opts: { plan?: 'score' | 'lean-note'; phrase?: string; bar?: string | null } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([[PHRASE_PATH, opts.phrase ?? phraseText()]]);
  if (opts.bar !== null) files.set('bars/bar_005.md', opts.bar ?? BAR);
  const computes: Array<{ data: any; params: PhraseParams; title: string }> = [];
  const drawn: string[] = [];
  const stopped: unknown[] = [];
  const writes: PhraseParams[] = [];
  let writeResult: { ok: true } | { ok: false; message: string } = { ok: true };
  let now = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = []; let nextId = 1;
  let handle: ReturnType<typeof mountPhrase>;
  const ports: PhraseMountPorts = {
    path: PHRASE_PATH,
    title: 'phrase_001',
    plan: opts.plan ?? 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (params) => {
      writes.push(params);
      if (!writeResult.ok) return writeResult;
      const w = applyPhraseWrite(files.get(PHRASE_PATH)!, params);
      if (w.ok === false) return w;
      files.set(PHRASE_PATH, w.text);
      queueMicrotask(() => handle.noteModified(PHRASE_PATH));      // Obsidian's vault `modify` event for our own write
      return { ok: true };
    },
    compute: async (data, params, title) => { computes.push({ data, params, title }); return { type: 'musicxml', content: `<score-partwise>${params.bars}x${params.tempo_change_pct}</score-partwise>` }; },
    renderInto: (host, payload) => { drawn.push(payload.content as string); host.textContent = 'engraved'; return true; },
    stopPlayers: (h) => { stopped.push(h); },
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  };
  handle = mountPhrase(parent, ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  const q = (sel: string) => parent.querySelector(sel) as any;
  const status = () => q('.forge-rhythm-edit-score-status').textContent as string;
  const set = async (sel: string, value: string) => { const el = q(sel); el.value = value; el.dispatchEvent(new win.Event('change', { bubbles: true })); await flush(); };
  return { handle, parent, files, computes, drawn, stopped, writes, q, status, set, advance, setWrite: (r: typeof writeResult) => { writeResult = r; }, timers };
}

test('load: the controls show the phrase\'s own values and the Score is drawn for them at once', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  assert.equal(r.q('.forge-phrase-bars').value, '8');
  assert.equal(r.q('.forge-phrase-style').value, 'repeat_with_fills');
  assert.equal(r.q('.forge-phrase-pct').value, '-20');
  assert.match(r.q('.forge-phrase-source').textContent, /bar_005/);
  assert.equal(r.computes.length, 1);
  assert.equal(r.computes[0].data.tempo_bpm, 100, 'the SOURCE bar\'s data went to the engine');
  assert.equal(r.computes[0].params.bars, 8);
  assert.deepEqual(r.drawn, ['<score-partwise>8x-20</score-partwise>']);
  assert.equal(r.status(), '');
  assert.equal(r.q('.forge-phrase-bars').disabled, false);
});

test('the controls offer exactly the three styles, bars 1-64 and -90..+100 %, each with an accessible name', async () => {
  const r = rig();
  await r.handle.load();
  const opts = [...r.q('.forge-phrase-style').querySelectorAll('option')].map((o: any) => o.value);
  assert.deepEqual(opts, ['repeat_with_fills', 'building', 'ghost_notes']);
  assert.equal(r.q('.forge-phrase-bars').min, '1'); assert.equal(r.q('.forge-phrase-bars').max, '64');
  assert.equal(r.q('.forge-phrase-pct').min, '-90'); assert.equal(r.q('.forge-phrase-pct').max, '100');
  for (const sel of ['.forge-phrase-bars', '.forge-phrase-style', '.forge-phrase-pct']) assert.ok(r.q(sel).getAttribute('aria-label'), `${sel} has an aria-label`);
  assert.equal(r.q('.forge-phrase-controls').getAttribute('role'), 'group');
});

test('editing a control WRITES the phrase JSON (clamped) and the Score follows the note\'s modify event, once, after the debounce', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  await r.set('.forge-phrase-bars', '12');
  assert.deepEqual(r.writes.map((w) => w.bars), [12]);
  assert.deepEqual(readPhraseNote(r.files.get(PHRASE_PATH)!), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 12, style: 'repeat_with_fills', tempo_change_pct: -20 } });
  assert.equal(r.computes.length, 1, 'not drawn before the debounce');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, 2);
  assert.equal(r.computes[1].params.bars, 12);
  await r.set('.forge-phrase-style', 'building');
  await r.set('.forge-phrase-pct', '-500');
  assert.equal(r.writes.at(-1)!.tempo_change_pct, -90, 'a percentage out of range is clamped before it is written');
  assert.equal(r.q('.forge-phrase-pct').value, '-90', 'and the field shows what was written');
  await r.set('.forge-phrase-bars', '999');
  assert.equal(r.writes.at(-1)!.bars, 64);
  assert.equal(r.writes.at(-1)!.style, 'building', 'a change keeps the other fields');
  const writtenSoFar = r.writes.length;
  await r.set('.forge-phrase-bars', 'abc');
  assert.equal(r.writes.length, writtenSoFar, 'junk writes nothing (never NaN in a note)');
  assert.equal(r.q('.forge-phrase-bars').value, '64', 'and the field goes back to what the note says');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.at(-1)!.params.style, 'building');
});

test('a write the note refuses (read_only, not a data note) says so next to the controls and changes nothing on screen', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.setWrite({ ok: false, message: 'Not saved: This note is marked read_only: true, so it will not be edited (constitution D7). Remove that line to edit it.' });
  await r.set('.forge-phrase-bars', '6');
  assert.match(r.q('.forge-phrase-status').textContent, /read_only/);
  assert.equal(r.computes.length, 1);
  assert.equal(r.q('.forge-phrase-bars').value, '8', 'the field goes back to what the note says');
  r.setWrite({ ok: true });
  await r.set('.forge-phrase-bars', '6');
  assert.equal(r.q('.forge-phrase-status').textContent, '', 'the line clears with the next good write');
});

test('freshness: a modify of the phrase note reloads the controls and redraws; a modify of the SOURCE bar redraws; any other note does nothing', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  r.files.set(PHRASE_PATH, phraseText({ bars: 5, tempo_change_pct: 10 }));
  r.handle.noteModified(PHRASE_PATH);
  await flush();
  assert.equal(r.q('.forge-phrase-bars').value, '5', 'a hand edit of the JSON shows in the controls');
  assert.equal(r.q('.forge-phrase-pct').value, '10');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, 2);
  assert.equal(r.computes[1].params.bars, 5);
  r.files.set('bars/bar_005.md', BAR.replace('"tempo_bpm":100', '"tempo_bpm":120'));
  r.handle.noteModified('bars/bar_005.md');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, 3, 'the phrase follows an edit of its bar');
  assert.equal(r.computes[2].data.tempo_bpm, 120);
  const before = r.computes.length;
  r.handle.noteModified('bars/bar_002.md'); r.handle.noteModified('phrases/phrase_002.md'); r.handle.noteModified('forge.toml');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS * 3);
  assert.equal(r.computes.length, before, 'unrelated notes cost nothing');
});

test('a source that moves: editing the phrase to name another bar makes THAT bar the one watched', async () => {
  const r = rig();
  r.files.set('bars/bar_007.md', BAR.replace('"tempo_bpm":100', '"tempo_bpm":77'));
  await r.handle.load(); await flush();
  r.files.set(PHRASE_PATH, phraseText({ source: 'bar_007' }));
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.at(-1)!.data.tempo_bpm, 77);
  const n = r.computes.length;
  r.handle.noteModified('bars/bar_005.md'); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, n, 'the old source no longer matters');
  r.handle.noteModified('bars/bar_007.md'); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.computes.length, n + 1);
});

test('a missing source bar is a refusal LINE on the phrase\'s Score (no engine call, no panel); the stale score goes; the phrase recovers when the bar returns', async () => {
  const bumps = messageDelivery.unreadCount(); const backlog = messageDelivery.backlogSize();
  const r = rig({ bar: null });
  await r.handle.load(); await flush();
  assert.match(r.status(), /^Phrase: the source bar bar_005 .*not found/);
  assert.equal(r.computes.length, 0);
  assert.equal(r.drawn.length, 0);
  r.files.set('bars/bar_005.md', BAR);
  r.handle.noteModified('bars/bar_005.md'); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.status(), '');
  assert.equal(r.drawn.length, 1);
  r.files.delete('bars/bar_005.md');
  r.handle.noteModified('bars/bar_005.md'); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.match(r.status(), /not found/);
  assert.equal(r.parent.querySelectorAll('.forge-rhythm-score-host').length, 0, 'never a stale score that looks current');
  assert.equal(messageDelivery.unreadCount(), bumps, 'nothing reached the Forge output panel');
  assert.equal(messageDelivery.backlogSize(), backlog);
});

test('an invalid phrase (hand-edited): the controls are disabled, the refusal names the field, nothing is computed; fixing the JSON brings it all back', async () => {
  const r = rig({ phrase: phraseText({ bars: 99 }) });
  await r.handle.load(); await flush();
  assert.match(r.status(), /^Phrase: .*bars/);
  assert.equal(r.q('.forge-phrase-bars').disabled, true);
  assert.equal(r.q('.forge-phrase-style').disabled, true);
  assert.equal(r.q('.forge-phrase-pct').disabled, true);
  assert.equal(r.computes.length, 0);
  r.files.set(PHRASE_PATH, phraseText({ bars: 6 }));
  r.handle.noteModified(PHRASE_PATH); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.status(), '');
  assert.equal(r.q('.forge-phrase-bars').disabled, false);
  assert.equal(r.q('.forge-phrase-bars').value, '6');
  assert.equal(r.computes.length, 1);
});

test('a phrase note that cannot be read is a refusal line too', async () => {
  const r = rig();
  r.files.delete(PHRASE_PATH);
  await r.handle.load(); await flush();
  assert.match(r.status(), /^Phrase: the phrase note could not be read/);
  assert.equal(r.q('.forge-phrase-bars').disabled, true);
});

test('lean edition: the controls and one line saying the score needs the music edition; the engine is never asked', async () => {
  const r = rig({ plan: 'lean-note' });
  await r.handle.load(); await flush(); await r.advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(r.parent.querySelector('.forge-rhythm-edit-score-lean')?.textContent, LEAN_SCORE_NOTE);
  assert.equal(r.computes.length, 0);
  assert.equal(r.q('.forge-phrase-bars').value, '8');
});

test('dispose: the Score and the controls go, any player is silenced, and a late render draws nothing', async () => {
  const r = rig();
  await r.handle.load(); await flush();
  const before = r.drawn.length;
  r.handle.noteModified('bars/bar_005.md');
  r.handle.dispose();
  assert.equal(r.parent.children.length, 0, 'nothing of the phrase is left in the tab');
  assert.ok(r.stopped.length >= 1, 'the player was silenced');
  await r.advance(LIVE_SCORE_DEBOUNCE_MS * 2);
  assert.equal(r.drawn.length, before);
  r.handle.noteModified('bars/bar_005.md');           // after dispose: ignored, never throws
});
