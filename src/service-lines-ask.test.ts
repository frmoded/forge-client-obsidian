// 2026-11-20-1003 - the ASKING half of service-lines-core (askLinesNote, askLinesBar), driven directly (no controller): what is sent, what is read, what is remembered. The controller wiring is pinned in service-lines-wiring.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { askLinesBar, askLinesNote, droppedNoticeOf, LINES_SERVICE_VERSION, type AskBarIo, type AskLinesIo } from './service-lines-core.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const noteWith = (lines: string[]) => emptyPhraseNote('x').replace(/# Description[\s\S]*?(?=\n# |\n```|$)/, `# Description\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n`);
const paneWith = (bars: number) => { const el = win.document.createElement('div'); el.innerHTML = `<div class="forge-rhythm-score-host"><svg>${'<g class="measure"></g>'.repeat(bars)}</svg></div>`; return el as HTMLElement; };

function io(over: Partial<AskLinesIo<string>> & { answer?: unknown; status?: number } = {}) {
  const sent: unknown[] = []; let legacyCalls = 0;
  const base: AskLinesIo<string> = {
    payload: { sentence: 'swap the second and third bars', bars: ['bar_005'], phrases: [] },
    askPlan: async (p) => { sent.push(JSON.parse(JSON.stringify(p))); return { status: over.status ?? 200, json: over.answer ?? { ok: true, lines: ['Move bar 3 one bar left.'] } }; },
    fromBox: true, family: 'phrase', previous: undefined, readNote: async () => noteWith([EXTEND]), pane: paneWith(4), vault: PHRASE_VAULT as never, ctx: { vault: PHRASE_VAULT as never }, draw: () => 7,
    legacy: async () => { legacyCalls++; return 'legacy'; },
  };
  return { io: { ...base, ...over }, sent, legacyCalls: () => legacyCalls };
}

test('a composer sentence is asked with the lines fields: the table, the note\'s list, the DRAWN bar count and numbers; the original payload is kept', async () => {
  const r = io(); const out = await askLinesNote(r.io);
  const q = r.sent[0] as Record<string, unknown>;
  assert.equal(q.sentence, 'swap the second and third bars'); assert.deepEqual(q.bars, ['bar_005']); assert.equal(q.mode, 'lines'); assert.equal(q.note_kind, 'phrase');
  assert.deepEqual(q.list, [EXTEND]); assert.equal(q.bar_count, 4); assert.deepEqual(q.bar_numbers, [1, 2, 3, 4]); assert.ok(Array.isArray(q.grammar));
  assert.equal('previous' in q, false);
  assert.equal((out as { ok: boolean }).ok, true); assert.deepEqual((out as { lines: string[] }).lines, ['Move bar 3 one bar left.']); assert.ok((out as { params: unknown }).params !== null);
  assert.equal('droppedNotice' in (out as object), false); assert.equal(r.legacyCalls(), 0);
});

test('no Score drawn (no pane, no host, no measure): bar_count is null; the previous question rides along when there was one', async () => {
  for (const pane of [undefined, win.document.createElement('div') as HTMLElement, paneWith(0)]) {
    const r = io({ pane, previous: { sentence: 'swap them', question: 'Which?' } }); await askLinesNote(r.io);
    const q = r.sent[0] as Record<string, unknown>; assert.equal(q.bar_count, null); assert.deepEqual(q.bar_numbers, []); assert.deepEqual(q.previous, { sentence: 'swap them', question: 'Which?' });
  }
});

test('exactly ONE drawn bar is a bar count of 1 (not "no Score")', async () => {
  const r = io({ pane: paneWith(1) }); await askLinesNote(r.io);
  assert.equal((r.sent[0] as { bar_count: number }).bar_count, 1); assert.deepEqual((r.sent[0] as { bar_numbers: number[] }).bar_numbers, [1]);
});

test('a throwing askPlan for a LIST note is the controller\'s to say (its own try/catch, unchanged): the core does not swallow it', async () => {
  const t = io({ askPlan: async () => { throw new Error('offline'); } });
  await assert.rejects(askLinesNote(t.io), /offline/, 'the controller\'s own try/catch says it (the old behaviour): the core does not swallow it');
});

test('not from the composer, or a bar family: the OLD request (no lines fields) and the old answer path', async () => {
  for (const over of [{ fromBox: false }, { family: 'bar' as const }]) {
    const r = io(over as never); const out = await askLinesNote(r.io);
    assert.equal(out, 'legacy'); assert.deepEqual(r.sent[0], { sentence: 'swap the second and third bars', bars: ['bar_005'], phrases: [] });
  }
});

test('an answer with neither lines nor a question is LEGACY (the old plan); a refusal keeps the words; a question rides on a refusal', async () => {
  const r1 = io({ answer: { ok: true, parsed_ok: true, plan: { kind: 'extend' } } }); assert.equal(await askLinesNote(r1.io), 'legacy'); assert.equal(r1.legacyCalls(), 1);
  const bad = await askLinesNote(io({ answer: { ok: true, lines: ['Make it sparkle.'] } }).io) as { ok: boolean; message: string };
  assert.equal(bad.ok, false); assert.match(bad.message, /^The service answered, but I could not use any line of it: "Make it sparkle\." \(.+\)\.$/);
  assert.deepEqual(await askLinesNote(io({ answer: { ok: true, question: 'Which bars?' } }).io), { ok: false, message: 'Which bars?', question: 'Which bars?' });
});

test('lines the grammar reads are the plan (seeds drawn by `draw`); the dropped ones are said in ONE notice; lines that change nothing are refused', async () => {
  const out = await askLinesNote(io({ answer: { ok: true, lines: ['Make it sparkle.', 'Move bar 3 one bar left.'] } }).io) as { ok: boolean; droppedNotice?: string; lines?: string[] };
  assert.equal(out.ok, true); assert.deepEqual(out.lines, ['Move bar 3 one bar left.']); assert.match(out.droppedNotice ?? '', /^Left out of the service's answer: "Make it sparkle\." \(.*\)\.$/);
  assert.equal(droppedNoticeOf([{ line: 'a', why: 'b' }, { line: 'c', why: 'd' }]), 'Left out of the service\'s answer: "a" (b); "c" (d).');
});

test('an unreadable note is asked with an empty list (the note could not be read, the sentence still goes)', async () => {
  const r = io({ readNote: async () => { throw new Error('gone'); } }); await askLinesNote(r.io);
  assert.deepEqual((r.sent[0] as { list: string[] }).list, []);
});

// ---- bars --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function barIo(over: Partial<AskBarIo> & { answer?: unknown; status?: number; throws?: boolean } = {}) {
  const sent: unknown[] = []; const remembered: unknown[] = []; const trace: string[] = []; let asking = 0;
  const base: AskBarIo = {
    askPlan: async (p) => { if (over.throws) throw new Error('offline'); sent.push(JSON.parse(JSON.stringify(p))); return { status: over.status ?? 200, json: over.answer ?? { ok: true, lines: ['Hit kick on steps 1, 5 and 9.'] } }; },
    configured: () => true, barNames: () => ['bar_001', 'bar_002'], ownKey: () => undefined, sentence: 'give me a four on the floor kick', list: ['Set the tempo to 96.'], check: async () => null, previous: undefined,
    remember: (q) => { remembered.push(q); }, asking: () => { asking++; }, trace: (o) => { trace.push(o); },
  };
  return { io: { ...base, ...over } as AskBarIo, sent, remembered, trace, asking: () => asking };
}

test('a bar is NOT offered the service when there is no port or it is not set up (null: the bar grammar\'s own refusal stands)', async () => {
  assert.equal(await askLinesBar(barIo({ askPlan: undefined }).io), null);
  assert.equal(await askLinesBar(barIo({ configured: () => false }).io), null);
  const r = barIo({ configured: undefined }); assert.equal((await askLinesBar(r.io))?.kind, 'lines'); assert.equal(r.sent.length, 1);
});

test('a bar request: the sentence, the vault\'s bar names, the bar table, the bar\'s own lines; "asking" is said once; the previous question rides along', async () => {
  const r = barIo({ previous: { sentence: 'make it groovier', question: 'Which channel?' } }); const out = await askLinesBar(r.io);
  const q = r.sent[0] as Record<string, unknown>;
  assert.equal(q.sentence, 'give me a four on the floor kick'); assert.deepEqual(q.bars, ['bar_001', 'bar_002']); assert.equal(q.mode, 'lines'); assert.equal(q.note_kind, 'bar');
  assert.deepEqual(q.list, ['Set the tempo to 96.']); assert.equal(q.bar_count, null); assert.deepEqual(q.previous, { sentence: 'make it groovier', question: 'Which channel?' });
  assert.deepEqual(out, { kind: 'lines', lines: ['Hit kick on steps 1, 5 and 9.'], dropped: [] });
  assert.equal(r.asking(), 1); assert.deepEqual(r.remembered, [null]); assert.deepEqual(r.trace, ['lines']);
});

test('a bar question is remembered with its sentence; any other answer forgets it', async () => {
  const q = barIo({ answer: { ok: true, question: 'Which channel?' } }); assert.deepEqual(await askLinesBar(q.io), { kind: 'question', question: 'Which channel?' });
  assert.deepEqual(q.remembered, [{ sentence: 'give me a four on the floor kick', question: 'Which channel?' }]); assert.deepEqual(q.trace, ['question']);
});

test('a bar and an OLDER service: the old plan is refused with the version it needs; a transport trouble says its own words; a throw says it could not reach the service; no sentence, no request', async () => {
  const old = barIo({ answer: { ok: true, plan: {} } }); const o = await askLinesBar(old.io);
  assert.equal(o?.kind, 'refused'); assert.equal((o as { message: string }).message, `This transpile service does not know bar sentences yet (it needs version ${LINES_SERVICE_VERSION} or newer). The person who runs it has to update it.`); assert.deepEqual(old.remembered, [null]);
  const t = await askLinesBar(barIo({ status: 401, answer: { detail: 'x' } }).io); assert.match((t as { message: string }).message, /did not accept your token/);
  const th = await askLinesBar(barIo({ throws: true }).io); assert.equal(th?.kind, 'refused'); assert.match((th as { message: string }).message, /Could not reach the transpile service \(offline\)/);
  const e = barIo({ sentence: '   ' }); const er = await askLinesBar(e.io); assert.equal(er?.kind, 'refused'); assert.equal(e.sent.length, 0); assert.equal(e.asking(), 0);
});
