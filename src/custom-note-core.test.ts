// 2026-11-02-1155 (score_first M16b) - a custom note's Score: which notes a Python calls, the chain guard (a custom note that calls itself, directly or through the notes it calls, is refused; depth at most 6), the one-sentence errors with the
// line of the Python, the bars check, and the production of the Score with its ports (the host's run, the engine glue). Every failure KEEPS the Score on screen (`keep`), none throws.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CUSTOM_CHAIN_DEPTH, CUSTOM_RUN_LIMIT_S, barsShapeSentence, plainBarError, callsInPython, customChainGuard, customRunSentence, produceCustomScore, type CustomDeps, type CustomRun,
} from './custom-note-core.ts';
import { customChips } from './structure-strip-core.ts';
import { asCustom } from './phrase-notes-core.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';

const MORPH: PhraseParams = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 8, order: 'musical', seed: 0 };
const customNote = (python: string): string => {
  const n = noteContentFor('phrase_003', MORPH);
  const py = (n.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1];
  return asCustom(n.replace(py, python));
};
const BAR = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => i === 0) } };

test('the notes a Python calls: name() and globals()[...](), once each in the order they appear; comments, strings and calls with arguments are not notes', () => {
  assert.deepEqual(callsInPython("def compute(context):\n  a = phrase_001()\n  b = globals()['phrase-002']()\n  c = bar_005()\n  d = phrase_001()\n  return [a, b, c, d]"), ['phrase_001', 'phrase-002', 'bar_005']);
  assert.deepEqual(callsInPython("def compute(context):\n  # phrase_009() is not called\n  x = 'phrase_010()'\n  y = extend_rhythm(data=bar_005(), bars=4)\n  return y"), ['bar_005'], 'a call with arguments is an engine function (its argument is the note)');
  assert.deepEqual(callsInPython('def compute(context):\n  return obj.method()'), [], 'a method is not a note');
  assert.deepEqual(callsInPython(''), []);
});

test('the chain guard: a note that calls itself, a loop through two notes, a chain deeper than 6; a fine chain, bars and engine chips are followed no further', async () => {
  const notes = new Map<string, string>();
  const read = async (p: string): Promise<string> => { const t = notes.get(p); if (t === undefined) throw new Error('File not found'); return t; };
  const note = (python: string): string => customNote(python);
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return bar_005()', read), null, 'a bar is data: nothing to follow');
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return phrase_003()', read), 'Custom Python: phrase_003 calls phrase_003, which is a loop (a note may not call itself, directly or through the notes it calls).');
  notes.set('phrases/phrase_007.md', note('def compute(context):\n  return phrase_003()'));
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return phrase_007()', read), 'Custom Python: phrase_003 calls phrase_007 calls phrase_003, which is a loop (a note may not call itself, directly or through the notes it calls).');
  // a chain: n1 -> n2 -> ... -> n7 (the custom note is the first)
  for (let i = 1; i <= 7; i++) notes.set(`phrases/n${i}.md`, note(i < 7 ? `def compute(context):\n  return n${i + 1}()` : 'def compute(context):\n  return bar_001()'));
  const deep = await customChainGuard('phrase_003', 'def compute(context):\n  return n1()', read);
  assert.match(String(deep), /^Custom Python: phrase_003 calls n1 calls n2 calls n3 calls n4 calls n5 nests more than 6 notes deep \(the limit is 6\)\.$/);
  assert.equal(CUSTOM_CHAIN_DEPTH, 6);
  notes.clear();
  for (let i = 1; i <= 4; i++) notes.set(`phrases/n${i}.md`, note(i < 4 ? `def compute(context):\n  return n${i + 1}()` : 'def compute(context):\n  return bar_001()'));
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return n1()', read), null, 'a chain of 5 notes is fine');
  notes.set('compositions/piece.md', note('def compute(context):\n  return arr_001()'));
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return piece()', read), null, 'a composition note is followed too (and arr_001 is not there)');
});

test('the sentences: a run that failed says the line of the Python, the limit that killed it, or the reason; the last good Score is kept', () => {
  assert.equal(customRunSentence({ ok: false, timedOut: true, error: '', line: 0 }), 'Custom Python: stopped after 10 seconds (the time limit); it may loop forever. The last good Score is kept.');
  assert.equal(customRunSentence({ ok: false, timedOut: false, error: 'ZeroDivisionError: division by zero', line: 3 }), 'Custom Python, line 3: ZeroDivisionError: division by zero. The last good Score is kept.');
  assert.equal(customRunSentence({ ok: false, timedOut: false, error: 'NameError: name x is not defined\nmore', line: 0 }), 'Custom Python: NameError: name x is not defined. The last good Score is kept.', 'one line, no line number when it is not known');
  assert.equal(customRunSentence({ ok: false, timedOut: true, error: '', line: 0 }, 3), 'Custom Python: stopped after 3 seconds (the time limit); it may loop forever. The last good Score is kept.');
  assert.equal(CUSTOM_RUN_LIMIT_S, 10);
  assert.equal(barsShapeSentence([BAR, BAR]), null);
  assert.match(String(barsShapeSentence(5)), /^Custom Python: it must return a list of bars, but it returned a number\./);
  assert.match(String(barsShapeSentence({ a: 1 })), /but it returned a mapping\./);
  assert.match(String(barsShapeSentence(null)), /but it returned nothing\./);
  assert.match(String(barsShapeSentence([])), /^Custom Python: it returned a list with no bars\./);
  assert.match(String(barsShapeSentence([BAR, 'x'])), /^Custom Python: bar 2 of the list is not a bar/);
  assert.match(String(barsShapeSentence([[1]])), /bar 1 of the list is not a bar/);
});

function deps(over: Partial<CustomDeps> & { run?: CustomRun } = {}) {
  const log: string[] = [];
  const d: CustomDeps = {
    readNote: async () => { throw new Error('File not found'); },
    runCustom: over.runCustom ?? (async (python, name, limit) => { log.push(`run ${name} ${limit}: ${python.split('\n')[0]}`); return over.run ?? { ok: true, bars: [BAR] }; }),
    compute: over.compute ?? (async (data, params, title) => { log.push(`compute ${JSON.stringify(params)} ${(data as { bars: unknown[] }).bars.length} ${title}`); return { type: 'musicxml', content: '<score-partwise/>' }; }),
  };
  return { d, log };
}

test('a custom note\'s Score: its Python is run (with the limit) and the bars it returns are drawn by the engine glue as {kind: custom}', async () => {
  const { d, log } = deps();
  const out = await produceCustomScore(d, customNote('def compute(context):\n  return [bar_005()]'), 'phrase_003', 'phrase_003');
  assert.deepEqual(out, { kind: 'score', payload: { type: 'musicxml', content: '<score-partwise/>' } });
  assert.deepEqual(log, ['run phrase_003 10: def compute(context):', 'compute {"kind":"custom"} 1 phrase_003']);
});

test('every failure of a custom run is ONE sentence that KEEPS the Score on screen; none throws; an engine that is not there is said, not thrown', async () => {
  const note = customNote('def compute(context):\n  return [bar_005()]');
  const kept = (m: string) => ({ kind: 'error', message: m, keep: true });
  assert.deepEqual(await produceCustomScore(deps({ run: { ok: false, timedOut: true, error: '', line: 0 } }).d, note, 'phrase_003', 't'), kept('Custom Python: stopped after 10 seconds (the time limit); it may loop forever. The last good Score is kept.'));
  assert.deepEqual(await produceCustomScore(deps({ run: { ok: false, timedOut: false, error: 'ValueError: nope', line: 2 } }).d, note, 'phrase_003', 't'), kept('Custom Python, line 2: ValueError: nope. The last good Score is kept.'));
  assert.deepEqual(await produceCustomScore(deps({ run: { ok: true, bars: 5 } }).d, note, 'phrase_003', 't'), kept('Custom Python: it must return a list of bars, but it returned a number. The last good Score is kept.'));
  const bad = deps({ compute: async () => { throw new Error("Traceback (most recent call last):\n  File \"<exec>\", line 3\nValueError: rhythm_bars_to_stream: bar 1: rhythm_data_to_stream: channel 'kick' must be a list of 16 steps (each false/0, true, or an int velocity 1-127)"); } });
  assert.deepEqual(await produceCustomScore(bad.d, note, 'phrase_003', 't'), kept("Custom Python: bar 2: channel 'kick' must be a list of 16 steps (each false/0, true, or an int velocity 1-127). The last good Score is kept."), 'the engine\'s own bar (counted from 1, the engine counts from 0) and field; its Traceback and function names left out');
  assert.equal(plainBarError('ValueError: some other refusal.'), 'some other refusal', 'a message that is not the bars list\'s keeps its numbers');
  assert.equal(plainBarError('rhythm_bars_to_stream: bar 0: x'), 'bar 1: x');
  assert.equal(plainBarError('bar 5: y'), 'bar 5: y', 'only the bars list\'s own message is renumbered');
  assert.deepEqual(await produceCustomScore(deps({ runCustom: async () => { throw new Error('the engine is not available'); } }).d, note, 'phrase_003', 't'), kept('Custom Python: the engine could not run it (the engine is not available). The last good Score is kept.'));
  assert.deepEqual(await produceCustomScore({ readNote: async () => '', compute: async () => ({}) }, note, 'phrase_003', 't'), kept('Custom Python: this window cannot run it.'));
  assert.deepEqual(await produceCustomScore(deps({ compute: async () => null }).d, note, 'phrase_003', 't'), kept('Custom Python: the engine returned no score. The last good Score is kept.'));
  assert.deepEqual(await produceCustomScore(deps().d, noteContentFor('phrase_003', MORPH), 'phrase_003', 't'), { kind: 'error', message: 'Score: this note is not a custom note.' });
});

test('the chain guard runs BEFORE the run: a custom note that calls itself is refused and its Python is never executed', async () => {
  const note = customNote('def compute(context):\n  return phrase_003()');
  const { d, log } = deps();
  const out = await produceCustomScore(d, note, 'phrase_003', 'phrase_003');
  assert.deepEqual(out, { kind: 'error', message: 'Custom Python: phrase_003 calls phrase_003, which is a loop (a note may not call itself, directly or through the notes it calls).', keep: true });
  assert.deepEqual(log, [], 'nothing was run, nothing was drawn');
});

test('the structure strip of a custom note: the note, then the notes its Python calls and its Recipe links, once each (the cache is not asked)', () => {
  const chips = customChips('phrase_003', "def compute(context):\n  a = bar_005()\n  b = phrase_001()\n  c = arr_002()\n  d = bar_005()\n  return [a]", 'Take [[bar_005]] and [[bar_009]] then [[phrase_001]].');
  assert.deepEqual(chips.map((c) => [c.text, c.noteId, c.kind]), [
    ['phrase_003 custom', 'phrases/phrase_003', 'custom'], ['bar_005', 'bars/bar_005', 'bar'], ['phrase_001', 'phrases/phrase_001', 'phrase'], ['arr_002', 'arrangements/arr_002', 'phrase'], ['bar_009', 'bars/bar_009', 'bar'],
  ]);
});

// ---- added by the 1155 mutation pass: the gaps it found in this file's own tests ----------------------------------------------------------------------------------------------------------------------------------------------------

test('callsInPython reads each LINE alone: a name at the end of one line is not glued to the start of the next', () => {
  assert.deepEqual(callsInPython('x = a\nphrase_001()'), ['phrase_001']);
});

test('the chain guard follows an ARRANGEMENT and a COMPOSITION too (a loop through either is a loop), reads on after a callee that is fine, and a callee that has no Python is skipped without a throw', async () => {
  const notes = new Map<string, string>();
  const read = async (p: string): Promise<string> => { const t = notes.get(p); if (t === undefined) throw new Error('File not found'); return t; };
  notes.set('arrangements/arr_001.md', customNote('def compute(context):\n  return phrase_003()'));
  assert.match(String(await customChainGuard('phrase_003', 'def compute(context):\n  return arr_001()', read)), /^Custom Python: phrase_003 calls arr_001 calls phrase_003, which is a loop/);
  notes.clear();
  notes.set('compositions/piece.md', customNote('def compute(context):\n  return phrase_003()'));
  assert.match(String(await customChainGuard('phrase_003', 'def compute(context):\n  return piece()', read)), /^Custom Python: phrase_003 calls piece calls phrase_003, which is a loop/);
  // the first callee is fine; the loop is the SECOND: the guard does not stop at the first answer
  notes.clear();
  notes.set('phrases/phrase_009.md', customNote('def compute(context):\n  return bar_001()'));
  notes.set('phrases/phrase_010.md', customNote('def compute(context):\n  return phrase_003()'));
  assert.match(String(await customChainGuard('phrase_003', 'def compute(context):\n  a = phrase_009()\n  b = phrase_010()\n  return [a, b]', read)), /phrase_003 calls phrase_010 calls phrase_003, which is a loop/);
  // a callee that is a note with no Python section (a plain text, a data note): nothing to follow, nothing thrown
  notes.clear();
  notes.set('phrases/phrase_009.md', 'just some text, no Python heading');
  assert.equal(await customChainGuard('phrase_003', 'def compute(context):\n  return phrase_009()', read), null);
});

test('the sentences at their edges: an error with no text, a failure on line 1, an engine message with nothing in it; a custom note with no Python is said and never run', async () => {
  assert.equal(customRunSentence({ ok: false, timedOut: false, error: '', line: 0 }), 'Custom Python: it could not be run. The last good Score is kept.');
  assert.equal(customRunSentence({ ok: false, timedOut: false, error: 'NameError: x', line: 1 }), 'Custom Python, line 1: NameError: x. The last good Score is kept.');
  assert.equal(plainBarError(''), 'it could not be drawn');
  assert.equal(plainBarError('  \n  '), 'it could not be drawn');
  const empty = customNote('');
  const { d, log } = deps();
  assert.deepEqual(await produceCustomScore(d, empty, 'phrase_003', 't'), { kind: 'error', message: 'Custom Python: the note has no Python to run.', keep: true });
  assert.deepEqual(log, [], 'nothing was run');
  const blank = customNote('   \n  ');
  assert.deepEqual(await produceCustomScore(d, blank, 'phrase_003', 't'), { kind: 'error', message: 'Custom Python: the note has no Python to run.', keep: true });
  assert.deepEqual(log, []);
});
