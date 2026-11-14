// 2026-11-13-1214 - the dialog's pure core: append, cap 50, ordering, no secrets, every event's entry, suggestions that are used or expire, the persisted shape checked and capped, the store over the settings object.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DIALOG_CAP, DIALOG_NOTES_CAP, DIALOG_HEIGHT_DEFAULT, DIALOG_HEIGHT_MAX, DIALOG_HEIGHT_MIN, append, clampDock, clampHeight, expireOpen, fromControlChange, fromOutcome, memoryStore, openSuggestion, redact, resolveSuggestion, sanitizeLoaded, sanitizeStore, settingsStore, type DialogEntry } from './dialog-core.ts';

const say = (list: DialogEntry[], text: string, at: number): DialogEntry[] => append(list, fromOutcome({ type: 'you', text }), at);

test('append keeps the order of time, gives each entry a fresh id, and never mutates the list it is given', () => {
  const a = say([], 'one', 1000); const b = say(a, 'two', 2000);
  assert.deepEqual(a.map((e) => e.text), ['one']);
  assert.deepEqual(b.map((e) => [e.id, e.at, e.text]), [[1, 1000, 'one'], [2, 2000, 'two']]);
});
test('the cap is 50: the 51st entry pushes the oldest out, ids keep rising', () => {
  let l: DialogEntry[] = [];
  for (let i = 1; i <= DIALOG_CAP + 5; i++) l = say(l, `s${i}`, i);
  assert.equal(l.length, DIALOG_CAP);
  assert.equal(l[0]!.text, 's6'); assert.equal(l[l.length - 1]!.text, `s${DIALOG_CAP + 5}`);
  assert.equal(l[l.length - 1]!.id, DIALOG_CAP + 5);
});
test('every event makes the entry the prompt names', () => {
  const k = (ev: Parameters<typeof fromOutcome>[0]) => fromOutcome(ev);
  assert.deepEqual(k({ type: 'you', text: 'make it longer' }), { kind: 'you', text: 'make it longer' });
  assert.equal(k({ type: 'applied', change: '8 -> 12 bars', description: 'Extend [[bar_007]] to 12 bars.' }).text, 'Applied (8 -> 12 bars): Extend [[bar_007]] to 12 bars.');
  assert.equal(k({ type: 'rejected', line: 1, column: 5, message: 'expected Extend' }).text, 'The grammar did not accept this sentence (line 1, column 5: expected Extend).');
  assert.equal(k({ type: 'asking' }).text, 'Asking the sentence service...');
  const s = k({ type: 'suggestion', description: 'Extend [[bar_007]] to 12 bars.', recipe: 'Take [[bar_007]].\nRepeat it for 12 bars.' });
  assert.equal(s.kind, 'suggestion'); assert.deepEqual(s.suggestion, { description: 'Extend [[bar_007]] to 12 bars.', recipe: 'Take [[bar_007]].\nRepeat it for 12 bars.', state: 'open' });
  assert.equal(k({ type: 'refused', message: 'I cannot plan that.' }).text, 'The service refused: I cannot plan that.');
  assert.equal(k({ type: 'dropped', message: 'the text changed while the service thought' }).text, 'Dropped: the text changed while the service thought');
  assert.equal(k({ type: 'failed', message: 'boom' }).text, 'Apply failed: boom');
  assert.equal(k({ type: 'notice', message: 'The sentence service is not set up.' }).kind, 'notice');
});
test('fromControlChange: "Controls: <summary>. The Description is now: <description>"', () => {
  assert.deepEqual(fromControlChange('weight 0.5 -> 0.35', 'Mix [[bar_005]] and [[bar_006]]\nby vote.'), { kind: 'control', text: 'Controls: weight 0.5 -> 0.35. The Description is now: Mix [[bar_005]] and [[bar_006]] by vote.' });
});
test('NO SECRETS: a URL and a token-looking run are cut from every text, and a long text is capped', () => {
  const token = 'sk-ant-' + 'a1B2c3D4'.repeat(6);
  for (const ev of [{ type: 'you', text: `see https://forge.example.com/plan?token=${token} please` }, { type: 'refused', message: `could not reach https://forge.example.com (${token})` }, { type: 'failed', message: token }] as const) {
    const e = fromOutcome(ev);
    assert.ok(!/https?:\/\//.test(e.text) && !e.text.includes(token) && !/forge\.example/.test(e.text), e.text);
  }
  assert.equal(redact('word '.repeat(2000)).length, 600); assert.equal(redact('x'.repeat(5000)), '[removed]', 'one long run is a token-looking thing');
  const s = fromOutcome({ type: 'suggestion', description: 'https://a.test/x', recipe: 'step '.repeat(300) });
  assert.ok(!/https?:\/\//.test(s.suggestion!.description) && s.suggestion!.recipe.length === 600);
});
test('a suggestion is used ONCE: resolve disables it, a second resolve and an expire change nothing, a newer one expires the older', () => {
  let l = append([], fromOutcome({ type: 'suggestion', description: 'd1', recipe: 'r1' }), 1);
  assert.equal(openSuggestion(l)!.id, 1);
  l = resolveSuggestion(l, 1, 'applied');
  assert.equal(l[0]!.suggestion!.state, 'applied'); assert.equal(openSuggestion(l), undefined);
  assert.equal(resolveSuggestion(l, 1, 'cancelled')[0]!.suggestion!.state, 'applied', 'a used suggestion stays what was chosen');
  l = append(l, fromOutcome({ type: 'suggestion', description: 'd2', recipe: 'r2' }), 2);
  l = append(expireOpen(l), fromOutcome({ type: 'suggestion', description: 'd3', recipe: 'r3' }), 3);
  assert.deepEqual(l.map((e) => e.suggestion?.state), ['applied', 'expired', 'open']);
});
test('the persisted history is CHECKED: junk is dropped, an open suggestion comes back expired, the text is redacted again, the list is capped', () => {
  const raw = [{ id: 1, at: 1, kind: 'you', text: 'ok' }, { id: 'x', at: 1, kind: 'you', text: 'bad id' }, { id: 2, at: 2, kind: 'nope', text: 'bad kind' }, null, 5,
    { id: 3, at: 3, kind: 'suggestion', text: 't', suggestion: { description: 'd https://a.test', recipe: 'r', state: 'open' } }, { id: 4, at: 4, kind: 'suggestion', text: 't', suggestion: { description: 'd', recipe: 'r', state: 'applied' } }];
  const out = sanitizeLoaded(raw);
  assert.deepEqual(out.map((e) => e.id), [1, 3, 4]);
  assert.deepEqual(out.map((e) => e.suggestion?.state), [undefined, 'expired', 'applied']);
  assert.ok(!/https?:/.test(out[1]!.suggestion!.description));
  assert.deepEqual(sanitizeLoaded('nope'), []);
  assert.equal(sanitizeLoaded(Array.from({ length: 80 }, (_, i) => ({ id: i + 1, at: i, kind: 'you', text: 't' }))).length, DIALOG_CAP);
});
test('the whole store keeps the DIALOG_NOTES_CAP most recent notes (by their last entry)', () => {
  const raw: Record<string, unknown> = {};
  for (let i = 0; i < DIALOG_NOTES_CAP + 7; i++) raw[`phrases/p${i}.md`] = [{ id: 1, at: 1000 + i, kind: 'you', text: 't' }];
  const out = sanitizeStore(raw);
  assert.equal(Object.keys(out).length, DIALOG_NOTES_CAP);
  assert.ok(`phrases/p${DIALOG_NOTES_CAP + 6}.md` in out && !('phrases/p0.md' in out));
  assert.deepEqual(sanitizeStore(null), {}); assert.deepEqual(sanitizeStore([1]), {});
});
test('height and dock are clamped: junk is the default', () => {
  assert.equal(clampHeight(undefined), DIALOG_HEIGHT_DEFAULT); assert.equal(clampHeight(NaN), DIALOG_HEIGHT_DEFAULT);
  assert.equal(clampHeight(1), DIALOG_HEIGHT_MIN); assert.equal(clampHeight(99999), DIALOG_HEIGHT_MAX); assert.equal(clampHeight(200.4), 200);
  assert.equal(clampDock('right'), 'right'); assert.equal(clampDock('left'), 'bottom'); assert.equal(clampDock(undefined), 'bottom');
});
test('the store over the settings object: a round trip per note, the save hook runs, height and dock are kept, and the object is the plugin\'s own (data.json shape)', () => {
  const settings: any = {}; let saves = 0;
  const s = settingsStore(settings, () => { saves++; });
  s.setEntries('phrases/phrase_001.md', say([], 'hello', 5)); s.setHeight(200); s.setDock('right');
  assert.equal(saves, 3);
  const again = settingsStore(JSON.parse(JSON.stringify(settings)), () => {});            // what data.json round-trips to
  assert.deepEqual(again.entries('phrases/phrase_001.md').map((e) => e.text), ['hello']);
  assert.deepEqual(again.entries('phrases/other.md'), []);
  assert.equal(again.height(), 200); assert.equal(again.dock(), 'right');
  assert.deepEqual(Object.keys(settings).sort(), ['dialogDock', 'dialogHeight', 'dialogHistory']);
  assert.ok(!JSON.stringify(settings).includes('Token'), 'no token key rides along');
});
test('memoryStore is a store too (the session\'s own history)', () => {
  const m = memoryStore(); m.setEntries('a.md', say([], 'x', 1)); m.setHeight(5); m.setDock('right');
  assert.deepEqual([m.entries('a.md').length, m.height(), m.dock()], [1, DIALOG_HEIGHT_MIN, 'right']);
});
