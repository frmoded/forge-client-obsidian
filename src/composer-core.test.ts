// 2026-11-17-2001 - the composer's submit state machine and history (pure): a truth table of every phase x every event, the IME and Shift+Enter guards, the preview-then-apply flow with nothing written before the
// second Enter, Esc while working (the late answer is dropped), typing replaces the preview, errors, auto-apply (off by default), and Up recall.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMPOSER_LABELS, HISTORY_CAP, PREVIEW_HINT, WORKING_TEXT, announcement, canSubmit, errorLine, initComposer, isWorking, pushHistory, recallNewer, recallOlder, step, upRecalls,
  type ComposerEffect, type ComposerEvent, type ComposerState, type Proposal,
} from './composer-core.ts';

const P: Proposal = { description: 'Extend [[phrase_001]] to 8 bars.', via: 'grammar' };
const S: Proposal = { description: 'Mix [[bar_005]] and [[bar_006]].', via: 'service' };
const idle = (text = 'extend it', seq = 0): ComposerState => ({ phase: 'idle', text, seq });
const working = (text = 'extend it', seq = 1): ComposerState => ({ phase: 'working', text, seq });
const previewing = (text = 'extend it', seq = 1, proposal = P): ComposerState => ({ phase: 'previewing', text, seq, proposal });
const applying = (text = 'extend it', seq = 1, proposal = P): ComposerState => ({ phase: 'applying', text, seq, proposal });
const failed = (text = 'extend it', seq = 1, message = 'no'): ComposerState => ({ phase: 'error', text, seq, message });
const out = (s: ComposerState, ev: ComposerEvent): { phase: string; effect: string; text: string } => { const r = step(s, ev); return { phase: r.state.phase, effect: r.effect.do, text: r.state.text }; };

test('Enter: from idle with text it asks for a preview and goes to working (seq + 1); with an empty or blank field it does nothing', () => {
  const r = step(idle('extend it', 4), { type: 'enter' });
  assert.deepEqual(r.state, { phase: 'working', text: 'extend it', seq: 5 }); assert.deepEqual(r.effect, { do: 'preview', text: 'extend it', seq: 5 });
  for (const t of ['', '   ', '\n\n']) assert.deepEqual(out(idle(t), { type: 'enter' }), { phase: 'idle', effect: 'none', text: t });
});

test('Enter, the guards: Shift+Enter and an IME composition do nothing in every phase', () => {
  for (const s of [idle(), working(), previewing(), applying(), failed()]) {
    assert.deepEqual(out(s, { type: 'enter', shift: true }), { phase: s.phase, effect: 'none', text: s.text }, `shift in ${s.phase}`);
    assert.deepEqual(out(s, { type: 'enter', composing: true }), { phase: s.phase, effect: 'none', text: s.text }, `composing in ${s.phase}`);
  }
});

test('the second Enter applies the preview (nothing was written before it); a third Enter while it writes does nothing', () => {
  const r = step(previewing('extend it', 2, P), { type: 'enter' });
  assert.deepEqual(r.state, applying('extend it', 2, P)); assert.deepEqual(r.effect, { do: 'apply', text: 'extend it', proposal: P, seq: 2 });
  assert.deepEqual(out(working(), { type: 'enter' }), { phase: 'working', effect: 'none', text: 'extend it' }); assert.deepEqual(out(applying(), { type: 'enter' }), { phase: 'applying', effect: 'none', text: 'extend it' });
  // the effect 'apply' is the ONLY effect that writes: no other event produces it
  const writers: string[] = [];
  for (const s of [idle(), working(), previewing(), applying(), failed()]) for (const ev of [{ type: 'type', text: 'x' }, { type: 'escape' }, { type: 'enter', shift: true }, { type: 'failed', seq: 1, message: 'm' }, { type: 'resolved', seq: 1, proposal: P }, { type: 'externalText', text: 'y' }] as ComposerEvent[]) if (step(s, ev).effect.do === 'apply') writers.push(`${s.phase}/${ev.type}`);
  assert.deepEqual(writers, [], 'only Enter in the previewing phase applies (or an auto-apply answer)');
});

test('the full happy path: type, Enter (preview), the answer arrives, Enter (apply), applied: the field shows what the note says now', () => {
  let s = initComposer(); s = step(s, { type: 'type', text: 'extend it to 8 bars' }).state; assert.equal(canSubmit(s), true);
  let r = step(s, { type: 'enter' }); assert.equal(r.effect.do, 'preview'); s = r.state; assert.equal(isWorking(s), true); assert.equal(canSubmit(s), false);
  s = step(s, { type: 'resolved', seq: 1, proposal: P }).state; assert.equal(s.phase, 'previewing');
  r = step(s, { type: 'enter' }); assert.equal(r.effect.do, 'apply'); s = r.state;
  s = step(s, { type: 'applied', seq: 1, disk: 'Extend [[phrase_001]] to 8 bars.' }).state; assert.deepEqual(s, { phase: 'idle', text: 'Extend [[phrase_001]] to 8 bars.', seq: 1 });
});

test('Esc: while working it cancels the request (the late answer then changes nothing); on a preview it discards it; on an error it clears it; idle and applying ignore it', () => {
  let r = step(working('extend it', 3), { type: 'escape' }); assert.deepEqual(r.state, idle('extend it', 3)); assert.deepEqual(r.effect, { do: 'cancel', seq: 3 });
  assert.deepEqual(out(r.state, { type: 'resolved', seq: 3, proposal: P } as ComposerEvent), { phase: 'idle', effect: 'none', text: 'extend it' }, 'the answer of the cancelled request is dropped');
  assert.deepEqual(out(r.state, { type: 'failed', seq: 3, message: 'late' } as ComposerEvent), { phase: 'idle', effect: 'none', text: 'extend it' });
  assert.deepEqual(out(previewing(), { type: 'escape' }), { phase: 'idle', effect: 'discard', text: 'extend it' }, 'the sentence stays in the field to edit');
  assert.deepEqual(out(failed(), { type: 'escape' }), { phase: 'idle', effect: 'none', text: 'extend it' });
  assert.deepEqual(out(idle(), { type: 'escape' }), { phase: 'idle', effect: 'none', text: 'extend it' }); assert.deepEqual(out(applying(), { type: 'escape' }), { phase: 'applying', effect: 'none', text: 'extend it' });
});

test('typing replaces the preview (and drops it), clears an error, is ignored while a request runs or a write is in flight', () => {
  assert.deepEqual(out(previewing(), { type: 'type', text: 'extend it to 9' }), { phase: 'idle', effect: 'discard', text: 'extend it to 9' });
  assert.deepEqual(out(failed(), { type: 'type', text: 'again' }), { phase: 'idle', effect: 'none', text: 'again' });
  assert.deepEqual(out(idle(), { type: 'type', text: 'a' }), { phase: 'idle', effect: 'none', text: 'a' });
  assert.deepEqual(out(working(), { type: 'type', text: 'a' }), { phase: 'working', effect: 'none', text: 'extend it' }); assert.deepEqual(out(applying(), { type: 'type', text: 'a' }), { phase: 'applying', effect: 'none', text: 'extend it' });
  assert.deepEqual(out(previewing(), { type: 'externalText', text: 'recalled' }), { phase: 'idle', effect: 'discard', text: 'recalled' }, 'a recalled sentence replaces the preview like typing');
});

test('stale answers: a resolved, failed, applied or applyFailed with another seq (or in another phase) changes nothing', () => {
  for (const ev of [{ type: 'resolved', seq: 9, proposal: P }, { type: 'failed', seq: 9, message: 'm' }] as ComposerEvent[]) assert.deepEqual(out(working('t', 2), ev), { phase: 'working', effect: 'none', text: 't' });
  for (const ev of [{ type: 'applied', seq: 9, disk: 'd' }, { type: 'applyFailed', seq: 9, message: 'm' }] as ComposerEvent[]) assert.deepEqual(out(applying('t', 2), ev), { phase: 'applying', effect: 'none', text: 't' });
  for (const s of [idle(), previewing(), failed()]) for (const ev of [{ type: 'resolved', seq: 1, proposal: P }, { type: 'failed', seq: 1, message: 'm' }, { type: 'applied', seq: 1, disk: 'd' }, { type: 'applyFailed', seq: 1, message: 'm' }] as ComposerEvent[]) assert.deepEqual(out(s, ev), { phase: s.phase, effect: 'none', text: s.text }, `${s.phase} / ${ev.type}`);
});

test('errors: a failed request or a failed write ends in the error phase with the text kept, one muted line, and Enter tries again', () => {
  const a = step(working('extend it', 2), { type: 'failed', seq: 2, message: 'The grammar did not accept this.' }).state; assert.deepEqual(a, failed('extend it', 2, 'The grammar did not accept this.'));
  const b = step(applying('extend it', 2), { type: 'applyFailed', seq: 2, message: 'Could not write the note.' }).state; assert.deepEqual(b, failed('extend it', 2, 'Could not write the note.'));
  assert.equal(errorLine(a), 'The grammar did not accept this.'); assert.equal(errorLine(idle()), ''); assert.equal(canSubmit(a), true);
  const again = step(a, { type: 'enter' }); assert.equal(again.effect.do, 'preview'); assert.equal(again.state.seq, 3, 'a new request, a new number');
});

// 2026-11-20-1002 (deliberate): the title said "OFF by default": the setting is now `Preview before applying` (default OFF = apply at once), the plugin supplies the flag; this pure machine still applies only when the event says autoApply, so the first lines are unchanged.
test('auto-apply (the event flag): only a sentence the GRAMMAR reads skips the preview; the service always previews; without the flag nothing skips', () => {
  assert.equal(step(working('x', 1), { type: 'resolved', seq: 1, proposal: P }).state.phase, 'previewing', 'no flag, no skip');
  const on = step(working('x', 1), { type: 'resolved', seq: 1, proposal: P, autoApply: true }); assert.equal(on.state.phase, 'applying'); assert.equal(on.effect.do, 'apply');
  assert.equal(step(working('x', 1), { type: 'resolved', seq: 1, proposal: S, autoApply: true }).state.phase, 'previewing', 'a service answer is never skipped');
});

// 2026-11-20-1002 (deliberate): an ACTION proposal (`Duplicate [[bar_007]].`) was never skipped by auto-apply (0992); the copy is undoable by the trash since 0992a, so it applies at once like the rest.
test('2026-11-20-1002 (deliberate): an action proposal (Duplicate) is applied at once when auto-apply is on, and still previews when it is off', () => {
  const D: Proposal = { description: 'Copy [[bar_007]] to a new bar.', via: 'grammar', action: true };
  assert.equal(step(working('x', 1), { type: 'resolved', seq: 1, proposal: D }).state.phase, 'previewing', 'off: the preview');
  const on = step(working('x', 1), { type: 'resolved', seq: 1, proposal: D, autoApply: true }); assert.equal(on.state.phase, 'applying'); assert.deepEqual(on.effect, { do: 'apply', text: 'x', proposal: D, seq: 1 });
});
test('2026-11-20-1002: a proposal that carries a sentence INSTEAD (a "did you mean") is never applied by auto-apply: the person says yes with Enter, and Enter applies the proposal (the suggestion, not the typed text)', () => {
  const R: Proposal = { description: 'Delete bar 2.', via: 'grammar', instead: 'Delete bar 2.' };
  const on = step(working('delet bar 2', 1), { type: 'resolved', seq: 1, proposal: R, autoApply: true }); assert.equal(on.state.phase, 'previewing'); assert.equal(on.effect.do, 'none');
  const yes = step(on.state, { type: 'enter' }); assert.equal(yes.state.phase, 'applying'); assert.deepEqual(yes.effect, { do: 'apply', text: 'delet bar 2', proposal: R, seq: 1 });
  assert.match(announcement(on.state), /Preview: Delete bar 2/);
});
test('2026-11-20-1002: a proposal marked `now` (a typed Undo or Redo) is applied at once whatever the setting says; one marked `instant` (the controller said nothing in the dialog because it expected to apply) is never left waiting', () => {
  const U: Proposal = { description: 'Undo', via: 'grammar', now: true };
  for (const flag of [undefined, false, true]) { const r = step(working('Undo', 1), { type: 'resolved', seq: 1, proposal: U, ...(flag === undefined ? {} : { autoApply: flag }) }); assert.equal(r.state.phase, 'applying', String(flag)); assert.equal(r.effect.do, 'apply'); }
  const I: Proposal = { description: 'Keep bars 1 to 2.', via: 'grammar', instant: true };
  assert.equal(step(working('x', 1), { type: 'resolved', seq: 1, proposal: I }).state.phase, 'applying', 'no preview was said, so none may wait');
});

test('canSubmit, isWorking, the words and the announcements', () => {
  assert.equal(canSubmit(idle('')), false); assert.equal(canSubmit(idle('  ')), false); assert.equal(canSubmit(idle('a')), true); assert.equal(canSubmit(previewing()), false); assert.equal(canSubmit(working()), false); assert.equal(canSubmit(applying()), false);
  assert.equal(isWorking(working()), true); assert.equal(isWorking(applying()), true); assert.equal(isWorking(previewing()), false);
  assert.equal(PREVIEW_HINT, 'Press Enter to apply, Esc to discard'); assert.equal(WORKING_TEXT, 'Working... Esc cancels');
  assert.match(announcement(previewing()), /Preview: Extend \[\[phrase_001\]\] to 8 bars\. Press Enter to apply, Esc to discard\./); assert.match(announcement(working()), /Escape to cancel/); assert.equal(announcement(idle()), ''); assert.equal(announcement(failed('t', 1, 'Nope.')), 'Nope.');
  for (const v of Object.values(COMPOSER_LABELS)) assert.ok(v.length > 3 && !/apply/i.test(v), `no "Apply" in a label: ${v}`);
});

test('history: per note, oldest first, a repeated send is not added twice in a row, capped; Up recalls older ones from an EMPTY composer, Down walks back to empty', () => {
  let h: string[] = []; for (const s of ['a', 'b', 'b', '  c  ', '', '   ']) h = pushHistory(h, s); assert.deepEqual(h, ['a', 'b', 'c']);
  for (let i = 0; i < 40; i++) h = pushHistory(h, `s${i}`); assert.equal(h.length, HISTORY_CAP); assert.equal(h[h.length - 1], 's39');
  const hist = ['first', 'second', 'third'];
  let r = recallOlder(hist, -1)!; assert.deepEqual(r, { text: 'third', index: 2 }); r = recallOlder(hist, r.index)!; assert.deepEqual(r, { text: 'second', index: 1 }); r = recallOlder(hist, r.index)!; assert.deepEqual(r, { text: 'first', index: 0 }); assert.equal(recallOlder(hist, 0), null, 'nothing older');
  assert.deepEqual(recallNewer(hist, 0), { text: 'second', index: 1 }); assert.deepEqual(recallNewer(hist, 2), { text: '', index: -1 }, 'past the newest: the empty composer'); assert.deepEqual(recallNewer(hist, -1), { text: '', index: -1 });
  assert.equal(recallOlder([], -1), null);
  assert.equal(upRecalls('', false), true); assert.equal(upRecalls('some text', false), false, 'in a field with text Up is the caret'); assert.equal(upRecalls('recalled', true), true, 'while walking the history it keeps recalling');
});
