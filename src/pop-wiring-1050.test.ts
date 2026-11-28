// 2026-11-27-1050 (prompt stack stage 2) - POP through the REAL controller, composer and dialog against a fake service (no network): every push is a group in `groups:`, `Pop.` / `Pop to N.` / the command / the Prompts block take groups off in ONE
// write with ONE undo entry, and nothing a group does not provably describe is ever removed or overwritten. The preview card says the bar order before and after.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, PH, BAR, rig, win, type Rig, type Svc } from './test-support/service-lines-rig.ts';
import { readGroups, writeGroups } from './group-note-core.ts';
import { popCommand } from './group-controller.ts';
import { extractDescription } from './v2-note-core.ts';
import { CUSTOM_BANNER } from './phrase-notes-core.ts';
import { customNoteText } from './description-apply-core.ts';
import { emptyPhraseNote, emptyArrangementNote } from './empty-note-core.ts';

const SAID = 'please throw bar two away';
const COPY = 'Copy bar 1 and put it at the end.', SLOW = 'Make it 20 percent slower.';
const FREE = `Delete bar 2. (you said: ${SAID})`;
const answer = (...l: string[]) => ({ status: 200, json: { ok: true, lines: l } });
const refusal = { status: 200, json: { ok: false, error: 'I cannot say that yet.', lines: null, question: null } };
const queue = (...a: unknown[]): Svc => async () => (a.length > 1 ? a.shift() : a[0]) as { status: number; json: unknown };

type R = Rig & { wrote: string[]; text(): string; groups(): ReturnType<typeof readGroups>['groups']; rows(): string[]; undo(): Promise<void>; redo(): Promise<void>; last(): string; esc(): Promise<void> };
function dress(r: Rig, path = PH): R {
  const wrote: string[] = []; const set = r.store.set.bind(r.store);
  r.store.set = (k, v) => { if (k === path && r.store.get(k) !== v) wrote.push(v); return set(k, v); };
  return Object.assign(r, {
    wrote, text: () => r.store.get(path)!, groups: () => readGroups(r.store.get(path)!).groups,
    rows: () => [...r.el.querySelectorAll('.forge-prompts-row')].map((x) => [...x.children].map((c) => c.textContent).join(' | ')),
    undo: () => r.press({ key: 'z', metaKey: true }), redo: () => r.press({ key: 'z', metaKey: true, shiftKey: true }),
    last: () => r.texts().at(-1) ?? '', esc: () => r.press({ key: 'Escape' }),
  });
}
const open = async (service: Svc, extra: { drawn?: number; note?: string; path?: string } = {}): Promise<R> => { const r = dress(rig({ service, ...extra }), extra.path); await r.ready(); return r; };
/** The driver's three pushes: the head, a free-word prompt answered by the service, a canonical one, and a tempo. */
async function pushed(service: Svc = queue(answer('Delete bar 2.')), extra: { drawn?: number } = {}): Promise<R> {
  const r = await open(service, extra);
  await r.say(EXTEND); await r.say(SAID); await r.enter(); await r.say(COPY); await r.say(SLOW);
  assert.deepEqual(r.list(), [EXTEND, FREE, COPY, SLOW]);
  return r;
}

test('every push is a group in front matter: typed canonical sentences with the sentence as the prompt, a service answer with the person\'s words', async () => {
  const r = await pushed();
  assert.deepEqual(r.groups().map((g) => [g.who, g.p, g.n, g.at]), [
    ['typed', 'Extend bar_005 to 4 bars, repeating with fills.', 1, 1], ['service', SAID, 1, 2], ['typed', COPY, 1, 3], ['typed', SLOW, 1, 4]]);
  assert.ok(r.groups().every((g) => typeof g.ts === 'number' && g.ts > 0));
  assert.deepEqual(r.rows(), [
    '1 | Extend bar_005 to 4 bars, repeating with fills. | 1 line | Pop to here', `2 | ${SAID} | 1 line | Pop to here`, `3 | ${COPY} | 1 line | Pop to here`, `4 | ${SLOW} | 1 line | Pop to here`]);
});

test('a bar-menu action (appendLine) is a group too (`menu`); a push that changes nothing and a refused one are none', async () => {
  const r = await open(queue(refusal)); await r.say(EXTEND);
  await r.ctl.appendLine(PH, 'Delete bar 2.');
  assert.deepEqual(r.groups().map((g) => [g.who, g.p]).at(-1), ['menu', 'Delete bar 2.']);
  await r.ctl.appendLine(PH, 'Move bar 2 two bars left.');          // read and refused
  await r.say(EXTEND);                                               // the note already says it
  assert.equal(r.groups().length, 2);
});

test('`Pop.`: the last prompt and its line go at once, in ONE write; Cmd/Ctrl+Z gives it back with its group; redo pops it again', async () => {
  const r = await pushed(); const full = r.text(); const before = r.wrote.length;
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND, FREE, COPY]); assert.equal(r.wrote.length, before + 1); assert.equal(r.groups().length, 3); assert.equal(r.rows().length, 3);
  assert.equal(r.last(), `Popped prompt 4: "${SLOW}" (1 line). Cmd/Ctrl+Z gives it back.`);
  const popped = r.text();
  assert.equal((r.el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement).value, '', 'the composer is empty again');
  await r.undo();
  assert.equal(r.text(), full, 'byte for byte the note before the pop');
  assert.equal(r.wrote.length, before + 2);
  assert.match(r.last(), /^Put back: 4: /);
  await r.redo();
  assert.equal(r.text(), popped); assert.match(r.last(), /^Popped again: 4: /);
  assert.equal(r.requests.length, 1, 'Pop never asks the service');
});

test('`Pop to 1.` shows which prompts go and writes nothing; the second Enter pops them in one write; one Cmd/Ctrl+Z gives all of them back', async () => {
  const r = await pushed(); const full = r.text(); const before = r.wrote.length;
  await r.say('Pop to 1.');
  assert.equal(r.wrote.length, before, 'the card first');
  assert.equal(r.last(), 'Pop to 1. These prompts go:');
  assert.equal(r.suggestion(), `2: "${SAID}" (1 line). 3: "${COPY}" (1 line). 4: "${SLOW}" (1 line).`);
  assert.match(r.el.textContent!, /Press Enter to apply, Esc to discard/);
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND]); assert.equal(r.wrote.length, before + 1); assert.equal(r.groups().length, 1);
  await r.undo();
  assert.equal(r.text(), full); assert.equal(r.wrote.length, before + 2);
  await r.undo();
  assert.deepEqual(r.list(), [EXTEND, FREE, COPY], 'the next Cmd/Ctrl+Z is the push before the pop');
  assert.equal(r.groups().length, 3);
});

test('Esc on the card pops nothing, and a pop that was not confirmed is never applied', async () => {
  const r = await pushed(); const full = r.text(); const before = r.wrote.length;
  await r.say('Pop to 1.'); await r.esc();
  await r.ctl.applyFromBox(PH, 'Pop to 1.');
  assert.equal(r.last(), 'Say "Pop to 1." again and confirm it.');
  assert.equal(r.text(), full); assert.equal(r.wrote.length, before);
  await r.enter();
  assert.equal(r.last(), 'Pop to 1. These prompts go:', 'Enter on the same words shows the card again');
  assert.equal(r.wrote.length, before);
});

test('the note changed between the card and the confirm: nothing is popped, and it says so', async () => {
  const r = await pushed();
  await r.say('Pop to 1.');
  await r.ctl.appendLine(PH, 'Delete bar 1.');
  const now = r.text(); const before = r.wrote.length;
  await r.enter();
  assert.equal(r.text(), now); assert.equal(r.wrote.length, before);
  assert.ok(r.texts().includes('The note changed while you were looking; ask again.'), r.texts().join('\n'));
});

test('only the `groups:` changed between the card and the confirm: nothing is popped', async () => {
  const r = await pushed();
  await r.say('Pop to 1.');
  r.store.set(PH, writeGroups(r.text(), r.groups().slice(0, 3)));
  const now = r.text();
  await r.enter();
  assert.equal(r.text(), now);
});

test('refusals in words, nothing written: no prompt, a number that is not there, the last prompt, 0, a sentence beside Pop, a bar', async () => {
  const empty = await open(queue(refusal));
  await empty.say('Pop.');
  assert.equal(empty.last(), 'There is no prompt to pop.'); assert.equal(empty.wrote.length, 0);
  const r = await pushed(); const before = r.wrote.length;
  for (const [said, words] of [['Pop to 9.', 'There is no prompt 9: the last one is 4.'], ['Pop to 4.', 'Prompt 4 is the last one: there is nothing above it to pop.'], ['Pop to 0.', 'Pop to takes a prompt number from 1 to 4.'], ['Pop. Delete bar 1.', 'Pop has to be on its own: empty the box, then write Pop. or Pop to N. by itself.']] as const) {
    await r.say(said);
    assert.ok(r.texts().some((t) => t.endsWith(words)), `${said}: ${r.last()}`);
  }
  assert.equal(r.wrote.length, before); assert.equal(r.requests.length, 1);
  const bar = await open(queue(refusal), { path: BAR }); const was = bar.text();
  await bar.say('Pop.');
  assert.equal(bar.text(), was); assert.ok(bar.last().endsWith('Pop is for a phrase, an arrangement or a composition.'), bar.last()); assert.equal(bar.requests.length, 0);
});

test('a sentence that only STARTS with pop is not the Pop command: it goes the way every sentence goes', async () => {
  const r = await open(queue(refusal)); await r.say(EXTEND);
  await r.say('pop the snare out of the last bar');
  assert.equal(r.requests.length, 1);
  assert.equal(r.list().length, 2, 'kept as a waiting line, nothing popped');
});

test('the command pops the last prompt in one write, undoable; it is offered for a list note that is not custom, and nowhere else', async () => {
  const r = await pushed(); const before = r.wrote.length;
  await r.ctl.popLast(PH);
  assert.deepEqual(r.list(), [EXTEND, FREE, COPY]); assert.equal(r.wrote.length, before + 1);
  await r.undo(); assert.deepEqual(r.list(), [EXTEND, FREE, COPY, SLOW]);
  const commands: any[] = []; const popped: string[] = []; let active: string | null = PH;
  popCommand({ addCommand: (c: unknown) => { commands.push(c); } }, { workspace: { getActiveFile: () => (active === null ? null : { path: active }) } }, { canDetach: (p) => p === PH, popLast: async (p) => { popped.push(p); return { ok: true, message: '' }; } });
  assert.deepEqual(commands.map((c) => [c.id, c.name]), [['pop-the-last-prompt', 'Pop the last prompt']]);
  assert.equal(commands[0].checkCallback(true), true); assert.deepEqual(popped, []);
  assert.equal(commands[0].checkCallback(false), true); assert.deepEqual(popped, [PH]);
  active = 'notes/x.md'; assert.equal(commands[0].checkCallback(false), false);
  active = null; assert.equal(commands[0].checkCallback(false), false);
});

test('the Prompts block: read only but for `Pop to here`, which shows the card; the last row\'s button is off; an unsent sentence is not overwritten', async () => {
  const flush = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
  const r = await pushed(); const before = r.wrote.length;
  const button = (i: number) => r.el.querySelectorAll('.forge-prompts-row button')[i] as HTMLButtonElement;
  const value = () => (r.el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement).value;
  assert.equal(r.el.querySelectorAll('.forge-prompts input, .forge-prompts textarea').length, 0);
  assert.equal(button(3).disabled, true); assert.equal(button(0).disabled, false);
  r.type('half a sentence'); button(0).click(); await flush();
  assert.equal(value(), 'half a sentence'); assert.equal(r.wrote.length, before); assert.equal(r.requests.length, 1);
  assert.equal(r.el.querySelector('.forge-composer-error')!.textContent, 'Empty the box first, then click Pop to here.');
  r.type('');
  button(1).click(); await flush();
  assert.equal(r.last(), 'Pop to 2. These prompts go:'); assert.equal(r.wrote.length, before, 'the card first');
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND, FREE]); assert.equal(r.rows().length, 2); assert.equal(r.wrote.length, before + 1);
});

test('a hand edit of the Description shortens the stack (in the block at once, in the note at the next write) and loses no line', async () => {
  const r = await pushed();
  r.store.set(PH, r.text().replace(`3. ${COPY}`, '3. Copy bar 3 and put it at the end.'));
  const edited = r.text(); const before = r.wrote.length;
  r.ctl.modified(PH); for (let i = 0; i < 400; i++) await Promise.resolve();
  assert.equal(r.rows().length, 2);
  assert.equal(r.wrote.length, before, 'looking writes nothing');
  assert.equal(r.text(), edited);
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND, 'Copy bar 3 and put it at the end.', SLOW], 'prompt 2 popped; the lines it did not write stay');
  assert.equal(r.groups().length, 1);
});

test('a Cmd/Ctrl+Z after a pop AND a hand edit takes nothing off the list', async () => {
  const r = await pushed();
  await r.say('Pop.');
  r.store.set(PH, r.text().replace(`3. ${COPY}`, '3. Copy bar 3 and put it at the end.'));
  const edited = r.text(); const before = r.wrote.length;
  await r.undo(); await r.undo();
  assert.equal(r.text(), edited); assert.equal(r.wrote.length, before);
  assert.ok(r.texts().includes('The note changed since the pop; there is nothing to take back here.'), r.texts().join('\n'));
});

test('the only prompt popped leaves an empty note, and Cmd/Ctrl+Z gives it back', async () => {
  const r = await open(queue(refusal)); await r.say(EXTEND); const one = r.text();
  await r.say('Pop.');
  assert.deepEqual(r.list(), []); assert.equal(readGroups(r.text()).state, 'none');
  await r.undo();
  assert.equal(r.text(), one);
});

test('undo of a push takes its group away; redo brings the line and the group back', async () => {
  const r = await pushed(); const full = r.text();
  await r.undo(); assert.equal(r.groups().length, 3);
  await r.redo(); assert.equal(r.text(), full);
});

test('a replaced line is put back by a pop (a second tempo over the first)', async () => {
  const r = await pushed();
  await r.say('Make it 30 percent slower.');
  assert.equal(r.list().length, 4);
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND, FREE, COPY, SLOW]);
});

test('Waiting line: a group of its own; Translate replaces it inside the group; Pop takes the translated lines; Cmd/Ctrl+Z walks back', async () => {
  const r = await open(queue(refusal, answer('Delete bar 2.', 'Delete bar 1.')), { drawn: 4 });
  await r.say(EXTEND); await r.say('lose two of them');
  assert.deepEqual(r.list(), [EXTEND, 'Waiting: lose two of them']);
  assert.deepEqual(r.groups().map((g) => [g.p, g.n]).at(-1), ['lose two of them', 1]);
  const waiting = r.text();
  await r.say('Translate line 2.'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Delete bar 2. (you said: lose two of them)', 'Delete bar 1.']);
  assert.deepEqual(r.groups().map((g) => [g.p, g.n]), [['Extend bar_005 to 4 bars, repeating with fills.', 1], ['lose two of them', 2]]);
  const done = r.text();
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND]);
  await r.undo(); assert.equal(r.text(), done);
  await r.undo(); assert.deepEqual(r.list(), [EXTEND, 'Waiting: lose two of them']);
  assert.deepEqual(r.groups(), readGroups(waiting).groups);
});

test('a Waiting line popped goes, its group with it', async () => {
  const r = await open(queue(refusal)); await r.say(EXTEND); await r.say('make it swing');
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND]);
});

test('a CUSTOM note has no stack: the command and the words are refused, nothing is written', async () => {
  const r = await pushed();
  r.store.set(PH, customNoteText(r.text(), 'phrase_001')); const custom = r.text(); const before = r.wrote.length;
  const done = await r.ctl.popLast(PH);
  assert.equal(done.ok, false); assert.equal(done.message, CUSTOM_BANNER);
  await r.say('Pop.');
  assert.equal(r.text(), custom); assert.equal(r.wrote.length, before);
});

test('a foreign `groups:` property is left to the letter: pushes apply and record nothing, Pop says why and writes nothing, no block', async () => {
  const note = emptyPhraseNote('x').replace(/^---\n/, '---\ngroups: [mine, yours]\n');
  const r = await open(queue(refusal), { note }); await r.say(EXTEND); await r.say(COPY);
  assert.deepEqual(r.list(), [EXTEND, COPY]); assert.ok(r.text().includes('groups: [mine, yours]\n')); assert.equal(r.rows().length, 0);
  const before = r.wrote.length;
  await r.say('Pop.');
  assert.equal(r.wrote.length, before);
  assert.ok(r.last().endsWith('This note\'s "groups" property is not one Forge wrote, so it is left as it is and there is no prompt to pop.'), r.last());
});

test('a service answer that comes back AFTER a pop is dropped: nothing more is written, no suggestion stays open, no waiting line', async () => {
  let release!: () => void; const hold = new Promise<void>((ok) => { release = ok; });
  const r = await open(async () => { await hold; return answer('Delete bar 1.'); });
  await r.say(EXTEND); await r.say(COPY);
  r.type('something free'); await r.enter();
  assert.equal(r.requests.length, 1);
  await r.ctl.popLast(PH);
  const popped = r.text(); const before = r.wrote.length;
  release(); for (let i = 0; i < 600; i++) await Promise.resolve();
  assert.equal(r.text(), popped); assert.equal(r.wrote.length, before);
  assert.equal(r.el.querySelectorAll('.forge-chat-msg[data-kind="suggestion"]').length, 0, r.texts().join('\n'));
  assert.deepEqual(r.list(), [EXTEND]);
});

test('a service suggestion that is OPEN when the command pops is over: a second Enter writes nothing', async () => {
  const r = await open(queue(answer('Delete bar 1.'))); await r.say(EXTEND); await r.say(COPY);
  await r.say('something free');
  await r.ctl.popLast(PH);
  const popped = r.text(); const before = r.wrote.length;
  await r.enter();
  assert.equal(r.text(), popped); assert.equal(r.wrote.length, before);
});

test('an old note opens as before: no write, no `groups:`, no Prompts block; its first push starts the stack', async () => {
  const r = await open(queue(refusal), { note: emptyPhraseNote('x') });
  assert.equal(r.wrote.length, 0); assert.ok(r.el.querySelector('.forge-prompts') === null);          // 2026-11-27-1050 (mutation pass): a boolean, so a failure never prints the whole DOM
  await r.say(EXTEND);
  assert.equal(r.groups().length, 1);
});

test('opening a note whose stack is stale writes nothing', async () => {
  const first = await pushed();
  const note = first.text().replace(`3. ${COPY}`, '3. Delete bar 1.');
  const r = await open(queue(refusal), { note });
  assert.equal(r.wrote.length, 0); assert.equal(r.text().replace(/^notes_to_self.*\n/m, ''), note.replace(/^notes_to_self.*\n/m, ''));
  assert.equal(r.rows().length, 2);
});

test('an arrangement has a stack too: a volume said again is popped back to the first', async () => {
  const path = 'arrangements/arr_001.md';
  const r = await open(queue(refusal), { path, note: emptyArrangementNote('arr_001') });
  await r.say('Play [[phrase_001]] on the [[rock]] kit.'); await r.say('Play the [[rock]] kit at 60 percent volume.'); await r.say('Play the [[rock]] kit at 40 percent volume.');
  const three = r.list();
  assert.equal(three.length, 2);
  await r.say('Pop.');
  assert.deepEqual(r.list(), ['Play [[phrase_001]] on the [[rock]] kit.', 'Play the [[rock]] kit at 60 percent volume.']);
});

// ---- the preview line ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const bars = (r: Rig) => [...r.el.querySelectorAll('.forge-chat-suggestion-bars')].map((x) => x.textContent);

test('the card of a service answer says the bar order before and after, above the lines', async () => {
  const r = await open(queue(answer('Move bar 4 to the start.')), { drawn: 4 }); await r.say(EXTEND);
  await r.say('last bar first please');
  assert.deepEqual(bars(r), ['bars 1 2 3 4 become 4 1 2 3']);
  const card = r.el.querySelector('.forge-chat-suggestion-bars')!;
  assert.equal(card.nextElementSibling!.className, 'forge-chat-suggestion-description');
});

test('the card of a translated Waiting line says it too', async () => {
  const r = await open(queue(refusal, answer('Delete bar 1.')), { drawn: 4 }); await r.say(EXTEND); await r.say('lose the first');
  await r.say('Translate line 2.');
  assert.deepEqual(bars(r), ['bars 1 2 3 4 become 2 3 4']);
});

test('no line when it is not known: no Score, a Score with another count, a stale one, a hand edit waiting for Forge, an arrangement', async () => {
  for (const drawn of [undefined, 7]) {
    const r = await open(queue(answer('Move bar 4 to the start.')), drawn === undefined ? {} : { drawn }); await r.say(EXTEND);
    await r.say('last bar first please');
    assert.equal(r.suggestion(), 'Move bar 4 to the start.'); assert.deepEqual(bars(r), [], String(drawn));
  }
  const stale = await open(queue(answer('Move bar 4 to the start.')), { drawn: 4 }); await stale.say(EXTEND);
  stale.el.querySelector('.forge-rhythm-score-host')!.classList.add('forge-rhythm-score-host-stale');
  await stale.say('last bar first please');
  assert.deepEqual(bars(stale), []);
  const hand = await open(queue(answer('Move bar 4 to the start.')), { drawn: 4 }); await hand.say(EXTEND);
  hand.store.set(PH, hand.text().replace('1. Extend [[bar_005]]', '1. Extend [[bar_007]]'));          // the Score's count still fits: only the hand edit says it is behind
  await hand.say('last bar first please');
  assert.equal(extractDescription(hand.text()).includes('bar_007'), true);
  assert.equal(hand.suggestion(), 'Move bar 4 to the start.');
  assert.deepEqual(bars(hand), []);
  const arr = await open(queue(answer('Play [[phrase_001]] on the [[rock]] kit.')), { path: 'arrangements/arr_001.md', note: emptyArrangementNote('arr_001'), drawn: 4 });
  await arr.say('rock please');
  assert.deepEqual(bars(arr), []);
  assert.ok(win);
});

// ---- 2026-11-27-1050 (mutation pass) -------------------------------------------------------------------------------------------------------------------------------------------------------------

const settle = async () => { for (let i = 0; i < 600; i++) await Promise.resolve(); };
const cardLine = (r: Rig) => r.el.querySelector('.forge-composer-error')!.textContent;

test('2026-11-27-1050 (mutation pass): a pop writes the earlier lines AS THEY WERE, not reworded, and so does its redo', async () => {
  const HAND = 'extend [[bar_005]] to 4 bars, repeating with fills';          // read by the grammar, which would write it another way
  const first = await open(queue(refusal)); await first.say(EXTEND);
  const note = writeGroups(first.text(), []).replace(`1. ${EXTEND}`, `1. ${HAND}`);
  const r = await open(queue(refusal), { note });
  assert.deepEqual(r.list(), [HAND]);
  await r.say(COPY);
  assert.deepEqual(r.list(), [EXTEND, COPY], 'the push rewords the line it keeps, and its group remembers the old one');
  const before = r.wrote.length;
  await r.say('Pop.');
  assert.deepEqual(r.list(), [HAND], r.texts().join('\n')); assert.equal(r.wrote.length, before + 1);
  const popped = r.text();
  await r.undo(); assert.deepEqual(r.list(), [EXTEND, COPY]);
  await r.redo(); assert.equal(r.text(), popped);
});

test('2026-11-27-1050 (mutation pass): a card is spent by the confirm it got: when the note is the same again, nothing pops without a new card', async () => {
  const r = await pushed(); const full = r.text();
  await r.say('Pop to 1.'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND]);
  await r.undo();
  assert.equal(r.text(), full, 'the note is again what the card was made of');
  const before = r.wrote.length;
  await r.ctl.applyFromBox(PH, 'Pop to 1.');
  assert.equal(r.text(), full); assert.equal(r.wrote.length, before);
  assert.equal(r.last(), 'Say "Pop to 1." again and confirm it.');
});

test('2026-11-27-1050 (mutation pass): a card whose confirm was refused is gone too, also when the note goes back to what it showed', async () => {
  const r = await pushed(); const full = r.text();
  await r.say('Pop to 1.');
  r.store.set(PH, writeGroups(full, r.groups().slice(0, 3)));
  await r.ctl.applyFromBox(PH, 'Pop to 1.');
  assert.equal(r.last(), 'The note changed while you were looking; ask again.');
  r.store.set(PH, full);
  const before = r.wrote.length;
  await r.ctl.applyFromBox(PH, 'Pop to 1.');
  assert.equal(r.text(), full); assert.equal(r.wrote.length, before);
  assert.equal(r.last(), 'Say "Pop to 1." again and confirm it.');
});

test('2026-11-27-1050 (mutation pass): a pop the plugin refuses is said as the plugin\'s refusal, never as the service\'s', async () => {
  const r = await pushed();
  await r.say('Pop to 9.');
  assert.equal(r.last(), 'Refused: There is no prompt 9: the last one is 4.');
  assert.equal(r.kinds().at(-1), 'refused');
});

test('2026-11-27-1050 (mutation pass): a pop whose write is turned away (the Description moved under it) says FAILED, and the note keeps the newer lines', async () => {
  const r = await pushed();
  const edited = r.text().replace(`4. ${SLOW}`, '4. Make it 30 percent slower.');
  const get = r.store.get.bind(r.store); let reads = -1;
  r.store.get = (k) => { if (k === PH && reads >= 0 && ++reads === 2) Map.prototype.set.call(r.store, PH, edited); return get(k); };          // read 1 = the pop's plan, read 2 = inside its write
  const before = r.wrote.length; reads = 0;
  const done = await r.ctl.popLast(PH);
  assert.equal(done.ok, false); assert.equal(done.message, 'The Description changed while you were looking; ask again.');
  assert.equal(r.kinds().at(-1), 'failed'); assert.equal(r.last(), 'Apply failed: The Description changed while you were looking; ask again.');
  assert.equal(r.text(), edited); assert.equal(r.wrote.length, before);
});

test('2026-11-27-1050 (mutation pass): the line under the card says what happened after a pop', async () => {
  const r = await pushed();
  await r.ctl.popLast(PH);
  assert.equal(cardLine(r), 'Popped.');
});

test('2026-11-27-1050 (mutation pass): `Pop to here` over an unsent sentence puts the cursor back in the box', async () => {
  const r = await pushed();
  const field = r.el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const button = r.el.querySelector('.forge-prompts-row button') as HTMLButtonElement;
  r.type('half a sentence'); button.focus();
  assert.ok(win.document.activeElement !== field);
  button.click(); await settle();
  assert.ok(win.document.activeElement === field); assert.equal(field.value, 'half a sentence');
});

test('2026-11-27-1050 (mutation pass): the Prompts block is a group named by its heading, and its buttons are plain buttons', async () => {
  const r = await pushed();
  const block = r.el.querySelector('.forge-prompts')!;
  assert.equal(block.getAttribute('role'), 'group');
  const title = block.querySelector('.forge-prompts-title')!;
  assert.equal(title.textContent, 'Prompts'); assert.equal(block.getAttribute('aria-labelledby'), title.id);
  assert.deepEqual([...block.querySelectorAll('button')].map((b) => b.getAttribute('type')), ['button', 'button', 'button', 'button']);
});

test('2026-11-27-1050 (mutation pass): a write draws the Prompts block into the panels of ITS note only', async () => {
  const r = await open(queue(refusal));
  const other = 'phrases/phrase_002.md', el = win.document.createElement('div'); win.document.body.appendChild(el);
  r.panes.push({ path: other, contentEl: el, tab: true }); await r.ctl.inspect(other); await settle();
  assert.ok(el.querySelector('.forge-prompt-box-text'), 'the second note has its composer');
  await r.say(EXTEND);
  assert.equal(r.rows().length, 1);
  assert.ok(el.querySelector('.forge-prompts') === null, 'the other note has no stack');          // (a boolean: a failing assert.equal on a DOM node prints gigabytes)
});

test('2026-11-27-1050 (mutation pass): an Undo that finds the note changed since the pop is NOT a step taken', async () => {
  const r = await pushed();
  await r.say('Pop.');
  r.store.set(PH, r.text().replace(`3. ${COPY}`, '3. Copy bar 3 and put it at the end.'));
  const edited = r.text(); const before = r.wrote.length;
  assert.deepEqual(await r.ctl.undoLast(PH), { ok: false, message: 'The note changed since the pop; there is nothing to take back here.' });
  await r.say('Undo 2');
  assert.equal(r.text(), edited); assert.equal(r.wrote.length, before);
  assert.ok(!r.texts().some((t) => t.startsWith('Undid')), r.texts().join('\n'));
});

test('2026-11-27-1050 (mutation pass): a translated Waiting line says under the card that the suggestion is in the dialog', async () => {
  const r = await open(queue(refusal, answer('Delete bar 1.'))); await r.say(EXTEND); await r.say('lose the first');
  await r.say('Translate line 2.');
  assert.equal(cardLine(r), 'The service answered: the suggestion is in the dialog.');
});

test('2026-11-27-1050 (mutation pass): a bar-menu line whose bar vanishes while it is being written empties nothing: refused, no write', async () => {
  const r = await open(queue(refusal)); await r.say(EXTEND);
  const now = r.text(); const before = r.wrote.length;
  const vault = r.ports.vault; let reads = 0;
  r.ports.vault = () => { const v = vault(); return ++reads > 2 ? { ...v, bars: v.bars.filter((b) => b !== 'bar_005') } : v; };          // read 1 = the list on disk, read 2 = the plan, then the write's own
  const done = await r.ctl.appendLine(PH, 'Delete bar 2.');
  assert.equal(done.ok, false); assert.match(done.message, /^Line 1 is not a sentence I can read; the note shows nothing yet\./);
  assert.equal(r.text(), now); assert.equal(r.wrote.length, before);
});
