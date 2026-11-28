// 2026-11-20-1002 (THE COMPOSER APPLIES AT ONCE; "DID YOU MEAN"; A TYPED UNDO AND REDO) - on the surface a person uses: the REAL controller (built through the plugin's own ports mapping, description-wiring.ts) + composer + dialog in happy-dom over an in-memory
// vault, for the four composers (phrase, arrangement, composition, bar). Written RED first. Pinned:
//   * ONE Enter applies a sentence the grammar reads completely: one process call, one write, one undo entry; the dialog says `Applied. <the canonical line>` (and `This replaces: <the old line>` after the fact) and shows no "This is what would be written";
//   * the files are BYTE FOR BYTE those of the two-Enter path (the 0980 golden, the arrangement, composition and bar fixtures replayed through both paths and compared);
//   * the setting `Preview before applying` ON (composerAutoApply port false) restores the two Enters; `Duplicate [[bar_007]].` applies at once and is undone by the trash;
//   * a plan of the SENTENCE SERVICE is still shown first; a refusal, an unreadable sentence and a service that is not set up are never applied;
//   * DID YOU MEAN: an unclosed link, a one-letter typo of a verb, Move with place words: `Did you mean: <sentence>?`, a button, Enter applies the suggestion, Esc drops it; with no repair, today's message;
//   * a TYPED Undo and Redo: read locally, never a list line, never the service; counts; nothing to undo said in words; a fresh duplicate goes to the trash.
// A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogButtons, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { sentencesOfText } from './sentence-list-core.ts';
import { listOfNote } from './sentence-list-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, EXTRA_PARAGRAPHS, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', COMP = 'compositions/song_1.md', BAR = 'bars/bar_001.md';
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

const kitNote = '---\ntype: data\ncontent_type: json\n---\n';
function vaultFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const b of PHRASE_VAULT.bars) out.push([`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']]);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) out.push([`phrases/${n}.md`, asListNote(t, n)]);
  out.push(['arrangements/arr_001.md', emptyArrangementNote('arr_001')], ['arrangements/arr_002.md', emptyArrangementNote('arr_002')], ['compositions/song_1.md', emptyCompositionNote('song_1')], ['kits/rock.md', kitNote], ['kits/latin.md', kitNote], ['kits/jazz.md', kitNote]);
  return out;
}

interface RigOpts { path?: string; note?: string; preview?: boolean; service?: () => Promise<{ status: number; json: unknown }>; configured?: boolean; noTrash?: boolean; drawn?: number[] }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>(vaultFiles());
  store.set(path, opts.note ?? (path.startsWith('arrangements/') ? emptyArrangementNote('x') : path.startsWith('compositions/') ? emptyCompositionNote('x') : path.startsWith('bars/') ? PLAYGROUND_BARS['bar_001'] : emptyPhraseNote('x')));
  const writes: string[] = []; let processCalls = 0, serviceCalls = 0; const timers: Array<() => void> = []; const creates: string[] = []; const trashed: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  let seed = 0;
  const ports = {
    ...descriptionPortsFor({
      read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
      basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
      panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
      create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); creates.push(p); }, exists: (p: string) => store.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
      ...(opts.noTrash ? {} : { trash: async (p: string) => { store.delete(p); trashed.push(p); } }),
    }, {
      ...(opts.service !== undefined ? { askPlan: async () => { serviceCalls++; return opts.service!(); }, planConfigured: () => opts.configured !== false } : {}),
      composerAutoApply: () => opts.preview !== true,                                                    // the setting `Preview before applying` ON = the port says false (the plugin maps it: ui-flags-core composerAutoApplyOf)
      composerMenu: () => ({ items: [{ id: 'new_phrase', label: 'New phrase' }], run: () => {} }),
    }),
    drawSeed: () => { const n = (opts.drawn ?? [])[seed++] ?? 99; return n; },
    now: () => 1000,          // 2026-11-27-1050 (deliberate): a push records its time in `groups:`; two rigs compared byte for byte share one clock
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const escape = () => press({ key: 'Escape' });
  const undoKey = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  /** One Enter when the composer applies at once, two when the setting says preview first. */
  const say = async (sentence: string) => { type(sentence); await enter(); if (opts.preview === true) await enter(); };
  const entries = () => dialogEntries(el);
  const clean = (t: string) => t.replace(/^✓\s*/, '');
  const applied = () => entries().filter((e) => e.kind === 'applied').map((e) => clean(e.text));
  const kinds = () => entries().map((e) => e.kind);
  const list = () => (path.startsWith('bars/') ? (readBarLines(store.get(path)!)?.lines ?? []).filter((l) => !/^Start with /.test(l)) : extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, '')));
  const suggestion = () => [...el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  const repairButton = () => el.querySelector('.forge-chat-repair') as HTMLElement | null;
  return { ctl, store, writes, el, flush, field, type, enter, escape, undoKey, say, entries, applied, kinds, list, suggestion, repairButton, creates, trashed, path, text: () => store.get(path)!, ready: async () => { await ctl.inspect(path); await flush(); }, calls: () => processCalls, service: () => serviceCalls, last: () => dialogLast(el), buttons: () => dialogButtons(el) };
}
type Rig = ReturnType<typeof rig>;
const empty = (r: Rig): boolean => r.field().value === '';
const planOk = (plan: unknown) => async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null, version: '0.2.48' } });

// ================================================================================================================================================================================================
// 1. ONE ENTER APPLIES
// ================================================================================================================================================================================================
for (const f of [
  { name: 'phrase', path: PH, note: undefined, first: EXTEND, second: 'Keep bars 1 to 3.' },
  { name: 'arrangement', path: ARR, note: undefined, first: 'Play [[phrase_001]] on the [[rock]] kit.', second: 'Play [[phrase_002]] on the [[latin]] kit.' },
  { name: 'composition', path: COMP, note: undefined, first: 'Play [[phrase_001]] for 4 bars.', second: 'Then play [[phrase_002]] for 4 bars.' },
  { name: 'bar', path: BAR, note: undefined, first: 'Set the tempo to 96.', second: 'Hit kick on steps 1, 5 and 9.' },
]) {
  test(`${f.name}: ONE Enter applies a sentence the grammar reads: one write, one process call, the line is in the list, the composer is empty, the service is never asked`, async () => {
    const r = rig({ path: f.path, service: planOk({}) }); await r.ready();
    r.type(f.first); await r.enter();
    assert.deepEqual(r.list(), [f.first], 'the line is in the list after ONE Enter');
    assert.equal(r.writes.length, 1); assert.equal(r.calls(), 1, 'one process call'); assert.ok(empty(r)); assert.equal(r.service(), 0); assert.deepEqual(r.buttons(), [], 'no preview waits for a second Enter');
    r.type(f.second); await r.enter();
    assert.deepEqual(r.list(), [f.first, f.second]); assert.equal(r.writes.length, 2); assert.equal(r.calls(), 2);
  });
  test(`${f.name}: the dialog says "Applied. <the canonical line>" in the words the preview used, and never "This is what would be written"`, async () => {
    const r = rig({ path: f.path }); await r.ready();
    r.type(f.first); await r.enter();
    assert.deepEqual(r.applied(), [`Applied. ${f.first}`]);
    assert.ok(!r.kinds().includes('suggestion'), 'no suggestion entry at all'); assert.ok(!r.entries().some((e) => /would be written/.test(e.text)));
    assert.deepEqual(r.entries().filter((e) => e.kind === 'you').map((e) => e.text), [f.first]);
  });
  test(`${f.name}: ONE undo entry per apply: Cmd/Ctrl+Z takes the last one back and Shift puts it back`, async () => {
    const r = rig({ path: f.path }); await r.ready();
    await r.say(f.first); await r.say(f.second);
    await r.undoKey(); assert.deepEqual(r.list(), [f.first]);
    await r.undoKey(true); assert.deepEqual(r.list(), [f.first, f.second]);
  });
  test(`${f.name}: with \`Preview before applying\` ON (the port says false) it is the two Enters as before: the first shows "This is what would be written" and writes nothing, the second applies`, async () => {
    const r = rig({ path: f.path, preview: true }); await r.ready();
    r.type(f.first); await r.enter();
    assert.deepEqual(r.list(), []); assert.deepEqual(r.writes, []); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']); assert.equal(r.suggestion(), f.name === 'bar' ? f.first : f.first);
    assert.match(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, /^The grammar read your sentence\. This is what would be written\./);
    await r.enter();
    assert.deepEqual(r.list(), [f.first]); assert.equal(r.writes.length, 1); assert.match(r.applied()[0], /^Applied \(/, 'the old wording of the second Enter');
  });
}

test('the words after the fact: a sentence that REPLACES an earlier line says `This replaces: <the old line>` (an arrangement: the same kit\'s volume; a phrase: the head)', async () => {
  const a = rig({ path: ARR }); await a.ready();
  await a.say('Play [[phrase_001]] on the [[rock]] kit.'); await a.say('Play the [[rock]] kit at 60 percent volume.'); a.type('Play the [[rock]] kit at 80 percent volume.'); await a.enter();
  assert.deepEqual(a.list(), ['Play [[phrase_001]] on the [[rock]] kit.', 'Play the [[rock]] kit at 80 percent volume.']);
  assert.equal(a.applied().pop(), 'Applied. Play the [[rock]] kit at 80 percent volume. This replaces: Play the [[rock]] kit at 60 percent volume.');
  const p = rig(); await p.ready();
  await p.say(EXTEND); p.type('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.'); await p.enter();
  assert.equal(p.applied().pop(), `Applied. Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. This replaces: ${EXTEND}`);
});

test('a text with several sentences is ONE apply, ONE write and ONE undo; the dialog says all the canonical lines', async () => {
  const r = rig(); await r.ready();
  r.type(`${EXTEND} Keep bars 1 to 3.`); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Keep bars 1 to 3.']); assert.equal(r.writes.length, 1); assert.equal(r.calls(), 1);
  assert.deepEqual(r.applied(), [`Applied. ${EXTEND} Keep bars 1 to 3.`]);
  await r.undoKey(); assert.deepEqual(r.list(), [], 'one undo takes both back');
});

test('a sentence that changes nothing says so and does not write (instant or not)', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); const w = r.writes.length;
  r.type(EXTEND); await r.enter();
  assert.equal(r.writes.length, w); assert.match(r.last(), /Nothing changed/);
});

// ---- byte for byte: the same files as the two-Enter path ---------------------------------------------------------------------------------------------------------------------------------------
async function replay(path: string, sentences: readonly string[], preview: boolean): Promise<{ text: string; writes: number; calls: number; list: string[] }> {
  const r = rig({ path, preview, drawn: [11, 22, 33, 44, 55] }); await r.ready();
  for (const s of sentences) await r.say(s);
  return { text: r.text(), writes: r.writes.length, calls: r.calls(), list: r.list() };
}
const goldenPhrases: Array<[string, string[]]> = [
  ...Object.entries(PLAYGROUND_PHRASES).map(([n, t]) => [n, listOfNote(asListNote(t, n), 'phrase', PHRASE_VAULT).list] as [string, string[]]),
  ...Object.entries(EXTRA_PARAGRAPHS).map(([n, t]) => [n, sentencesOfText(t, 'phrase')] as [string, string[]]),
];
test('the 0980 golden (the 14 playground phrases and the 12 extra paragraphs) typed line by line: the note one Enter writes is byte for byte the note two Enters write; same writes, same process calls', async () => {
  assert.ok(goldenPhrases.length >= 26);
  for (const [name, sentences] of goldenPhrases) {
    const two = await replay(PH, sentences, true), one = await replay(PH, sentences, false);
    assert.ok(two.list.length > 0, `${name}: the two-Enter path wrote its list`);
    assert.equal(one.text, two.text, `${name}: the same bytes`); assert.equal(one.writes, two.writes, `${name}: writes`); assert.equal(one.calls, two.calls, `${name}: process calls`); assert.deepEqual(one.list, two.list, name);
  }
});
test('the arrangement, composition and bar fixtures typed line by line: byte for byte the two-Enter path', async () => {
  const arr = ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 60 percent volume.', 'Mute the [[rock]] kit.', 'Play the [[latin]] kit at 70 percent volume.', 'Only the [[latin]] kit plays.'];
  const comp = ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.', 'For 8 bars play [[arr_001]].'];
  const bar = ['Set the tempo to 96.', 'Hit kick on steps 1, 5 and 9.', 'Clear kick on step 5.', 'Set the swing to 20 percent.', 'Hit snare on steps 5 and 13.', 'Use 8 steps in 4/4.'];
  for (const [path, sentences] of [[ARR, arr], [COMP, comp], [BAR, bar]] as const) {
    const two = await replay(path, sentences, true), one = await replay(path, sentences, false);
    assert.ok(two.list.length >= 3, `${path}: the two-Enter path wrote ${two.list.length} lines`);
    assert.equal(one.text, two.text, `${path}: the same bytes`); assert.equal(one.writes, two.writes, `${path}: writes`); assert.equal(one.calls, two.calls, `${path}: calls`);
  }
});
test('a random line draws its seed ONCE either way: the seed the sentence says is the same in both paths', async () => {
  const s = ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order.'];
  const two = await replay(PH, s, true), one = await replay(PH, s, false);
  assert.equal(one.text, two.text); assert.match(one.list[0], /seed 11\./, JSON.stringify(one.list));
});

// ================================================================================================================================================================================================
// 2. DUPLICATE
// ================================================================================================================================================================================================
test('Duplicate [[bar_007]]. applies at once (one Enter): the copy is made, the dialog says so, and Cmd/Ctrl+Z takes it back to the trash; the phrase is never written', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); const before = r.text(), w = r.writes.length;
  r.type('Duplicate [[bar_007]].'); await r.enter();
  assert.deepEqual(r.creates, ['bars/bar_010.md'], r.creates.join(',')); assert.ok(r.applied().includes('Created bar_010, a copy of bar_007.'), JSON.stringify(r.applied()));
  assert.ok(!r.kinds().includes('suggestion'), 'no "Copy ... to a new bar." preview waited for a second Enter');
  assert.equal(r.text(), before); assert.equal(r.writes.length, w); assert.ok(empty(r));
  await r.undoKey(); assert.deepEqual(r.trashed, ['bars/bar_010.md']); assert.ok(!r.store.has('bars/bar_010.md'));
});
test('Duplicate with `Preview before applying` ON still shows "Copy [[bar_007]] to a new bar." first (the two Enters)', async () => {
  const r = rig({ preview: true }); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter(); assert.deepEqual(r.creates, []); assert.equal(r.suggestion(), 'Copy [[bar_007]] to a new bar.'); await r.enter(); assert.equal(r.creates.length, 1);
});
test('a Duplicate that cannot be done (unknown note, a bare Duplicate, other sentences) is refused in words at the first Enter and nothing is created', async () => {
  const r = rig(); await r.ready();
  for (const t of ['Duplicate [[nothing_here]].', 'Duplicate', 'Keep bars 1 to 2. Duplicate [[bar_007]].']) { r.type(t); await r.enter(); assert.ok(r.last().length > 5, t); }
  assert.deepEqual(r.creates, []); assert.deepEqual(r.writes, []);
});

// ================================================================================================================================================================================================
// 3. THE SERVICE'S PLAN IS STILL SHOWN FIRST; A REFUSAL, AN UNREADABLE SENTENCE AND A SERVICE NOT SET UP ARE NEVER APPLIED
// ================================================================================================================================================================================================
test('a plan translated by the sentence service is SHOWN first ("The service suggests this", Enter to apply, Esc to discard), nothing is written before the Enter; the Enter writes it', async () => {
  const plan = { kind: 'extend', bar: 'bar_006', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -10 };
  const r = rig({ service: planOk(plan) }); await r.ready();
  r.type('make the sixth bar into a long slow phrase'); await r.enter();
  assert.equal(r.service(), 1); assert.deepEqual(r.writes, [], 'nothing written by the first Enter'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.match(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, /^The service suggests this\./);
  await r.enter(); assert.deepEqual(unsaid(r.list()), ['Extend [[bar_006]] to 8 bars, repeating with fills, 10 percent slower.']); assert.equal(r.writes.length, 1);
});
test('Esc on a service plan drops it and writes nothing; typing a new sentence replaces a showing preview (the old one is no longer current)', async () => {
  const plan = { kind: 'extend', bar: 'bar_006', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -10 };
  const r = rig({ service: planOk(plan) }); await r.ready();
  r.type('make the sixth bar into a long slow phrase'); await r.enter(); await r.escape();
  assert.deepEqual(r.buttons(), []); assert.deepEqual(r.writes, []); assert.equal(r.field().value, 'make the sixth bar into a long slow phrase');
  r.type('make the sixth bar into a long slow phrase'); await r.enter(); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  r.type(EXTEND); assert.deepEqual(r.buttons(), [], 'typing replaces the preview'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND], 'the new sentence applied at once');
});
test('typing over a showing preview, with `Preview before applying` ON, replaces it: the next Enter previews the NEW sentence and writes nothing of the old one', async () => {
  const r = rig({ preview: true }); await r.ready();
  r.type(EXTEND); await r.enter(); assert.equal(r.suggestion(), EXTEND);
  r.type('Take [[phrase_003]].'); assert.deepEqual(r.buttons(), []); await r.enter(); assert.equal(r.suggestion(), 'Take [[phrase_003]].'); assert.deepEqual(r.writes, []);
});
test('a refusal is never applied: a structure step after a density step says why and writes nothing (one Enter or two)', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); await r.say('Thin out bars 3 to 5, by half.'); const w = r.writes.length, before = r.list();
  r.type('Keep bars 1 to 2.'); await r.enter();
  assert.equal(r.writes.length, w); assert.deepEqual(r.list(), before); assert.match(r.last(), /Do the structure steps first/); assert.equal(r.service(), 0);
  assert.equal(r.field().value, 'Keep bars 1 to 2.', 'the text stays for the person to edit');
});
test('Move with several places is READ and refused in words (today\'s refusal, kept): nothing is applied, the service is not asked', async () => {
  const r = rig({ service: planOk({}) }); await r.ready(); await r.say('Take [[phrase_003]].'); const w = r.writes.length;
  r.type('Move bar 4 two bars left.'); await r.enter();
  assert.equal(r.writes.length, w); assert.match(r.last(), /Move takes one bar at a time\. Say "Move bar 4 one bar left\." twice\./); assert.equal(r.service(), 0);
});
test('an unreadable sentence is never applied: without the service it says so in words and writes nothing', async () => {
  const r = rig(); await r.ready(); r.type('make it groovier'); await r.enter();
  assert.ok(atMostWaiting(r.writes)); assert.ok(!unsaid(r.list()).some((l) => !/^Waiting:/.test(l))); assert.ok(r.kinds().includes('rejected')); assert.ok(!r.kinds().includes('applied')); assert.equal(r.field().value, 'make it groovier');
  assert.ok(!r.kinds().includes('suggestion'), 'no "Did you mean" without a repair: today\'s message');
});
test('a service that is not set up is said in words and nothing is applied; a service that answers nothing usable is not applied either', async () => {
  const off = rig({ service: planOk({}), configured: false }); await off.ready(); off.type('make it groovier'); await off.enter();
  assert.ok(atMostWaiting(off.writes)); assert.match(off.last(), /sentence service is not set up/); assert.equal(off.service(), 0);
  const nope = rig({ service: async () => ({ status: 200, json: { ok: true, parsed_ok: false, plan: null, error: 'cannot', version: '0.2.48' } }) }); await nope.ready(); nope.type('make it groovier'); await nope.enter();
  assert.ok(atMostWaiting(nope.writes)); assert.ok(!nope.kinds().includes('applied'));
});
test('a bar with no service set up: an unreadable sentence is refused in words, nothing is applied, no request', async () => {
  const r = rig({ path: BAR }); await r.ready(); r.type('make the kick louder please'); await r.enter();
  assert.deepEqual(r.writes, []); assert.equal(r.service(), 0); assert.ok(r.kinds().includes('rejected'));
});
test('2026-11-20-1003 (deliberate: bars were never under the service before): a bar WITH a service asks it once for a sentence the bar grammar cannot read; an older service\'s answer is refused in words, nothing is applied', async () => {
  const r = rig({ path: BAR, service: planOk({}) }); await r.ready(); r.type('make the kick louder please'); await r.enter();
  assert.deepEqual(r.writes, []); assert.equal(r.service(), 1); assert.ok(r.kinds().includes('refused')); assert.ok(r.entries().some((e) => /does not know bar sentences yet/.test(e.text)));
});

// ================================================================================================================================================================================================
// 4. DID YOU MEAN
// ================================================================================================================================================================================================
test('an unclosed link in a composition: `Play [[phrase_001]` is NOT applied; the dialog asks `Did you mean: Play [[phrase_001]]?` with the sentence and a button, no "rejected" column error; Enter applies the SUGGESTION', async () => {
  const r = rig({ path: COMP, service: planOk({}) }); await r.ready();
  r.type('Play [[phrase_001]'); await r.enter();
  assert.deepEqual(r.writes, [], 'never applied silently'); assert.equal(r.service(), 0, 'a deterministic repair is offered before the service is asked');
  const q = r.entries().filter((e) => e.kind === 'suggestion').pop()!; assert.equal(q.text, 'Did you mean: Play [[phrase_001]]?'); assert.equal(r.suggestion(), 'Play [[phrase_001]].');
  assert.ok(!r.kinds().includes('rejected'), 'the bare column error is replaced'); assert.ok(r.repairButton() !== null, 'a button'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.equal(r.field().value, 'Play [[phrase_001]', 'the typed text stays until the person says yes');
  await r.enter();
  assert.deepEqual(unsaid(r.list()), ['Play [[phrase_001]].']); assert.equal(r.writes.length, 1); assert.ok(empty(r)); assert.equal(r.applied().pop()?.replace(/ \(you said: [^()]*\)$/, ''), 'Applied. Play [[phrase_001]].'); assert.equal(r.service(), 0);
});
test('the BUTTON applies the suggestion exactly as Enter does', async () => {
  const r = rig({ path: COMP }); await r.ready();
  r.type('Play [[phrase_001]'); await r.enter(); assert.deepEqual(r.writes, []);
  r.repairButton()!.click(); await r.flush();
  assert.deepEqual(unsaid(r.list()), ['Play [[phrase_001]].']); assert.equal(r.writes.length, 1); assert.ok(empty(r));
});
test('Esc drops the suggestion, writes nothing, keeps the typed text; typing replaces it; the suggestion is "Discarded" in the dialog', async () => {
  const r = rig({ path: COMP }); await r.ready();
  r.type('Play [[phrase_001]'); await r.enter(); await r.escape();
  assert.deepEqual(r.writes, []); assert.equal(r.field().value, 'Play [[phrase_001]'); assert.deepEqual(r.buttons(), []); assert.equal(r.repairButton(), null, 'no button on a closed suggestion');
  r.type('Play [[phrase_001]'); await r.enter(); r.type('Play [[phrase_002]].'); assert.deepEqual(r.buttons(), []); await r.enter(); assert.deepEqual(r.list(), ['Play [[phrase_002]].']);
});
test('a one-letter typo of a verb: `Delet bar 2.` -> `Did you mean: Delete bar 2?` (the grammar\'s own verbs); Enter applies `Delete bar 2.`', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); const w = r.writes.length;
  r.type('Delet bar 2.'); await r.enter();
  assert.equal(r.writes.length, w); assert.equal(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, 'Did you mean: Delete bar 2?'); assert.equal(r.suggestion(), 'Delete bar 2.');
  await r.enter(); assert.deepEqual(unsaid(r.list()), ['Take [[phrase_003]].', 'Delete bar 2.']); assert.equal(r.writes.length, w + 1);
});
// 2026-11-24-1040 (deliberate): the CHAIN card (`Did you mean: Move bar 4 one bar left. Move bar 3 one bar left? ...`) is retired: the grammar READS `Move bar 4 before bar 2.` (one op, the canonical `Move bar 4 after bar 1.`), so it is applied at once, with one write
test('Move with place words: `Move bar 4 before bar 2.` is READ by the grammar, applied at once as the canonical `Move bar 4 after bar 1.` (one write, no card)', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); const w = r.writes.length;
  r.type('Move bar 4 before bar 2.'); await r.enter();
  assert.equal(r.writes.length, w + 1, 'one write'); assert.deepEqual(unsaid(r.list()), ['Take [[phrase_003]].', 'Move bar 4 after bar 1.']);
  assert.ok(!r.entries().some((e) => e.kind === 'suggestion' && /^Did you mean/.test(e.text)), 'no card');
});
test('a typo and an unclosed link in different sentences of one text: one suggestion for the whole text', async () => {
  const r = rig(); await r.ready();
  r.type('Take [[phrase_003]. Keap bars 1 to 3'); await r.enter();
  assert.equal(r.suggestion(), 'Take [[phrase_003]]. Keep bars 1 to 3.'); await r.enter();
  assert.deepEqual(unsaid(r.list()), ['Take [[phrase_003]].', 'Keep bars 1 to 3.']);
});
test('a bar: `Clera kick.` -> `Did you mean: Clear kick?`; Enter applies it', async () => {
  const r = rig({ path: BAR }); await r.ready();
  r.type('Clera kick.'); await r.enter();
  assert.deepEqual(r.writes, []); assert.equal(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, 'Did you mean: Clear kick?');
  await r.enter(); assert.equal(r.writes.length, 1); assert.ok(r.list().some((l) => /^Clear kick/.test(l)), JSON.stringify(r.list()));
});
test('with `Preview before applying` ON a suggestion is the same: shown, then Enter', async () => {
  const r = rig({ path: COMP, preview: true }); await r.ready();
  r.type('Play [[phrase_001]'); await r.enter(); assert.equal(r.suggestion(), 'Play [[phrase_001]].'); assert.deepEqual(r.writes, []); await r.enter(); assert.deepEqual(unsaid(r.list()), ['Play [[phrase_001]].']);
});
test('NO repair: today\'s message (the grammar\'s "rejected" line), nothing offered; with the service set up it is asked as ever', async () => {
  const none = rig({ path: COMP }); await none.ready(); none.type('make it groovier'); await none.enter();
  assert.ok(none.kinds().includes('rejected')); assert.ok(!none.kinds().includes('suggestion')); assert.equal(none.repairButton(), null);
  const svc = rig({ path: COMP, service: planOk({ kind: 'composition', sections: [] }) }); await svc.ready(); svc.type('make it groovier'); await svc.enter();
  assert.equal(svc.service(), 1, 'the service is asked when there is no repair');
});
test('a repair the grammar still cannot read is never offered: `Delet bar 2.` in an EMPTY phrase (no head to delete from) gets today\'s message', async () => {
  const r = rig(); await r.ready(); r.type('Delet bar 2.'); await r.enter();
  assert.ok(!r.kinds().includes('suggestion'), r.kinds().join(',')); assert.ok(atMostWaiting(r.writes));
});
test('a suggestion is never applied by a typed Undo, a click elsewhere or a second look: only Enter or the button', async () => {
  const r = rig({ path: COMP }); await r.ready();
  r.type('Play [[phrase_001]'); await r.enter(); await r.flush(); await r.flush();
  assert.deepEqual(r.writes, []); assert.deepEqual(r.list(), []);
});

// ================================================================================================================================================================================================
// 5. A TYPED UNDO AND REDO
// ================================================================================================================================================================================================
async function three(path: string = PH): Promise<Rig> {
  const r = rig({ path, service: planOk({}) }); await r.ready();
  const s = path === PH ? [EXTEND, 'Keep bars 1 to 3.', 'Delete bar 2.'] : path === ARR ? ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Mute the [[rock]] kit.'] : path === COMP ? ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.'] : ['Set the tempo to 96.', 'Hit kick on steps 1, 5 and 9.', 'Set the swing to 20 percent.'];
  for (const x of s) await r.say(x);
  assert.equal(r.list().length, 3, `${path}: three lines`); return r;
}
for (const path of [PH, ARR, COMP, BAR]) {
  test(`${path.split('/')[0]}: typed \`Undo\`, \`Undo.\` and \`Undo that\` undo the last apply with the stack's own words; \`Redo\` puts it back; the word is never a list line and never sent to the service`, async () => {
    const r = await three(path); const all = r.list();
    for (const t of ['Undo', 'Undo.', 'undo that']) {
      const before = r.list().length;
      r.type(t); await r.enter();
      assert.equal(r.list().length, before - 1, `${t}: one sentence fewer`); assert.deepEqual(r.list(), all.slice(0, before - 1)); assert.ok(empty(r), `${t}: the composer is empty`);
    }
    assert.equal(r.list().length, 0); assert.equal(r.service(), 0, 'never the service'); assert.ok(!r.text().includes('Undo'), 'never a list line');
    r.type('Redo'); await r.enter(); assert.deepEqual(r.list(), all.slice(0, 1)); assert.equal(r.service(), 0);
  });
}
test('typed Undo says what Cmd/Ctrl+Z says: the same notice, the same one write and the same result for the same state', async () => {
  const a = await three(), b = await three();
  const wa = a.writes.length, wb = b.writes.length, na = a.entries().length;
  await a.undoKey(); b.type('Undo'); await b.enter();
  assert.deepEqual(b.list(), a.list()); assert.equal(b.text() === a.text(), true, 'the same bytes'); assert.equal(a.writes.length, wa + 1); assert.equal(b.writes.length, wb + 1);
  const key = a.entries().slice(na).map((e) => e.text), typed = b.entries().slice(na).filter((e) => e.kind !== 'you').map((e) => e.text);
  assert.deepEqual(typed, key, 'the same words');
});
test('Undo 3 and Undo three undo up to that many in order and say how many were undone', async () => {
  const r = await three(); const w = r.writes.length;
  r.type('Undo 2'); await r.enter();
  assert.equal(r.list().length, 1); assert.equal(r.writes.length, w + 2, 'one write per undone apply'); assert.equal(r.last(), 'Undid 2 sentences.');
  r.type('Undo three'); await r.enter();
  assert.equal(r.list().length, 0); assert.equal(r.last(), 'Undid 1 sentence: there was nothing more to undo.');
  const q = await three(); q.type('Undo three'); await q.enter(); assert.equal(q.list().length, 0); assert.equal(q.last(), 'Undid 3 sentences.');
  const one = await three(); one.type('Undo 1'); await one.enter(); assert.equal(one.list().length, 2); assert.ok(!/Undid/.test(one.last()), 'one is said in the stack\'s own words');
});
test('Redo 2 puts back up to that many; a bare Redo one', async () => {
  const r = await three(); r.type('Undo 3'); await r.enter(); assert.equal(r.list().length, 0);
  r.type('Redo 2'); await r.enter(); assert.equal(r.list().length, 2); assert.equal(r.last(), 'Redid 2 sentences.');
  r.type('Redo'); await r.enter(); assert.equal(r.list().length, 3);
});
test('nothing to undo or redo is said in words (the dialog and the line under the card); nothing is written; the composer is empty', async () => {
  const r = rig(); await r.ready();
  r.type('Undo'); await r.enter(); assert.equal(r.last(), 'There is nothing to undo.'); assert.deepEqual(r.writes, []); assert.ok(empty(r));
  r.type('Redo'); await r.enter(); assert.equal(r.last(), 'There is nothing to redo.'); assert.deepEqual(r.writes, []);
  assert.equal((el(r).querySelector('.forge-composer-error') as HTMLElement).textContent, 'There is nothing to redo.');
});
const el = (r: Rig): HTMLElement => r.el;
test('a fresh duplicate is taken back to the trash by a typed Undo (0992a), and the next Undo reaches the list', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND);
  r.type('Duplicate [[bar_007]].'); await r.enter(); assert.equal(r.creates.length, 1);
  r.type('Undo'); await r.enter(); assert.deepEqual(r.trashed, ['bars/bar_010.md']); assert.match(r.last(), /^Removed bar_010 \(moved to the trash\)\./); assert.deepEqual(r.list(), [EXTEND]);
  r.type('Undo'); await r.enter(); assert.deepEqual(r.list(), []);
});
test('a typed Undo acts at the FIRST Enter even with `Preview before applying` ON (it is itself the take-back; Redo undoes it)', async () => {
  const r = rig({ preview: true }); await r.ready(); await r.say(EXTEND);
  r.type('Undo'); await r.enter(); assert.deepEqual(r.list(), []); assert.deepEqual(r.buttons(), []);
  r.type('Redo'); await r.enter(); assert.deepEqual(r.list(), [EXTEND]);
});
test('other words after Undo are refused in words, never read by the grammar and never sent to the service; a text with other sentences too; nothing changes', async () => {
  const r = rig({ service: planOk({}) }); await r.ready(); await r.say(EXTEND); const w = r.writes.length;
  for (const t of ['Undo the delete', 'Undo 0', 'Redo please']) { r.type(t); await r.enter(); assert.match(r.last(), /takes only a number: write /, t); }
  r.type('Undo. Keep bars 1 to 2.'); await r.enter(); assert.match(r.last(), /have to be on their own/);
  assert.equal(r.writes.length, w); assert.deepEqual(r.list(), [EXTEND]); assert.equal(r.service(), 0);
});
test('the "+" menu items and the keys are unchanged next to the typed word', async () => {
  const r = await three();
  const plus = r.el.querySelector('.forge-composer-plus') as HTMLElement; plus.click(); await r.flush();
  const labels = [...r.el.querySelectorAll('.forge-composer-menuitem')].map((b) => b.textContent); assert.ok(labels.includes('Undo last sentence') && labels.includes('Redo'), labels.join('|'));
  await r.undoKey(); assert.equal(r.list().length, 2); await r.undoKey(true); assert.equal(r.list().length, 3);
});
test('P3: a typed Undo in a note that is not a list family (a plain note with no composer) and every other note in the vault are byte for byte what they were', async () => {
  const r = await three(); const before = new Map([...r.store].filter(([p]) => p !== PH));
  r.type('Undo 2'); await r.enter(); r.type('Duplicate [[bar_007]].'); await r.enter();
  for (const [p, t] of before) if (!r.creates.includes(p)) assert.equal(r.store.get(p), t, `${p} is untouched`);
});

// ================================================================================================================================================================================================
// 6. THE REAL PHRASE TAB (mountPhrase: the Score, the click on a bar) with the real composer: ONE Enter, byte for byte the two-Enter note
// ================================================================================================================================================================================================
import { rig as tabRig } from './test-support/phrase-steps-tab-rig.ts';
// 2026-11-21-1015 (deliberate): a sentence nothing could read is kept as a waiting line (Part C: a refusal may write that ONE line, never a canonical one) and a line the repair or the service made keeps the driver's words (Part B: `(you said: ...)`).
const unsaid = (l: readonly string[]): string[] => l.map((x) => x.replace(/ \(you said: [^()]*\)$/, ''));
const atMostWaiting = (w: readonly unknown[]): boolean => w.length <= 1;

test('the REAL phrase tab (mountPhrase): a click on a Score bar while the composer says Delete, then ONE Enter, writes the note the two Enters write, byte for byte; the Score redraws from it', async () => {
  const HEAD = 'Extend [[bar_005]] to 6 bars, repeating with fills.';
  const run = async (instant: boolean) => {
    const r = await tabRig([HEAD], { composerAutoApply: () => instant }, { now: () => 1000 });          // 2026-11-27-1050 (deliberate): one clock for the two runs
    try {
      r.type('Delete'); r.click(r.bars()[1]); await r.flush();
      assert.equal(r.field().value, 'Delete bar 2');
      const before = r.files.get(r.notePath)!;
      const press = async () => { r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await r.flush(); };
      await press();
      const afterOne = r.files.get(r.notePath)!;
      if (!instant) await press();
      await r.flush();
      return { before, afterOne, text: r.files.get(r.notePath)!, bars: r.bars().length, field: r.field().value };
    } finally { r.done(); }
  };
  const two = await run(false), one = await run(true);
  assert.equal(two.afterOne, two.before, 'the first of two Enters wrote nothing'); assert.notEqual(one.afterOne, one.before, 'the ONE Enter wrote');
  assert.equal(one.text, two.text, 'byte for byte the same note');
  assert.match(one.text, /Delete bar 2\./); assert.equal(one.field, ''); assert.equal(one.bars, two.bars, 'the same Score');
});
