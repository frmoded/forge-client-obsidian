// 2026-10-27-1015 (M7b (b), "a sentence becomes a phrase"): the pure core, offline, with the service stubbed. A sentence goes out as {sentence, bars, phrases, key?}; what comes back is ONE plan the plugin re-validates with its own
// validatePhrase and turns into a note through the SAME builders the controls use (phraseNoteContent / mixNoteContent / morphNoteContent: the tests compare the bytes). Every refusal is one plain sentence, and no refusal ever writes a note.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mixNoteContent, morphNoteContent, phraseNoteContent, validatePhrase } from './phrase-core.ts';
import {
  PLAN_COMMAND_ID, PLAN_COMMAND_NAME, SENTENCE_MAX, askedLine, buildPlanRequest, createSentencePlanner, createdLine, interpretPlanResponse, paramsFromPlan, planAvailable,
  type SentencePlannerPorts,
} from './sentence-plan-core.ts';

const BARS = ['bar_001', 'bar_005', 'bar_008', 'clave'];

// ---- availability (P3) --------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the command exists only in a score-first vault, with these words', () => {
  assert.equal(PLAN_COMMAND_ID, 'new-phrase-from-sentence');
  assert.equal(PLAN_COMMAND_NAME, 'New phrase from a sentence');
  assert.equal(planAvailable({ scoreFirst: true }), true);
  assert.equal(planAvailable({ scoreFirst: false }), false);
});

// ---- the request ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the request carries the sentence, the bar and phrase names (sorted, once each) and the key only when there is one', () => {
  const r = buildPlanRequest({ sentence: '  extend bar_005 to 8 bars ', barNames: ['bar_008', 'bar_005', 'bar_005'], phraseNames: ['phrase_002', 'phrase_001'], ownKey: undefined });
  assert.deepEqual(r, { ok: true, payload: { sentence: 'extend bar_005 to 8 bars', bars: ['bar_005', 'bar_008'], phrases: ['phrase_001', 'phrase_002'] } });
  const k = buildPlanRequest({ sentence: 'x', barNames: ['bar_001'], phraseNames: [], ownKey: 'sk-ant-1' });
  assert.deepEqual(k, { ok: true, payload: { sentence: 'x', bars: ['bar_001'], phrases: [], user_anthropic_key: 'sk-ant-1' } });
  const empty = buildPlanRequest({ sentence: 'x', barNames: ['bar_001'], phraseNames: [], ownKey: '' });
  assert.equal('user_anthropic_key' in (empty as { payload: object }).payload, false, 'an empty key is no key');
});

test('refused before any network: an empty sentence, a too long one (500 is fine, 501 is not), a vault with no bars', () => {
  assert.equal(SENTENCE_MAX, 500);
  const msg = (r: ReturnType<typeof buildPlanRequest>) => (r.ok ? null : r.message);
  assert.equal(msg(buildPlanRequest({ sentence: '', barNames: BARS, phraseNames: [] })), 'Say in a sentence what phrase you want, for example: extend bar_005 to 8 bars.');
  assert.equal(msg(buildPlanRequest({ sentence: ' \n ', barNames: BARS, phraseNames: [] })), 'Say in a sentence what phrase you want, for example: extend bar_005 to 8 bars.');
  assert.equal(buildPlanRequest({ sentence: 'a'.repeat(500), barNames: BARS, phraseNames: [] }).ok, true);
  assert.equal(msg(buildPlanRequest({ sentence: 'a'.repeat(501), barNames: BARS, phraseNames: [] })), 'That sentence is 501 characters; the limit is 500. Make it shorter.');
  assert.equal(msg(buildPlanRequest({ sentence: 'make it longer', barNames: [], phraseNames: [] })), 'This vault has no bars yet, so there is nothing to build a phrase from. Make a bar in the Beat Box first.');
});

// ---- plan -> controls -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('an extend plan becomes the extend controls: bar is the source, what the plan does not say keeps the controls\' defaults', () => {
  assert.deepEqual(paramsFromPlan({ kind: 'extend', bar: 'bar_005' }), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  assert.deepEqual(paramsFromPlan({ kind: 'extend', bar: 'bar_005', bars: 8, style: 'building', tempo_change_pct: -20 }), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: -20 } });
});

test('a mix plan: a path mix at weight 1 like the "New mix" starter unless the plan says vote or gives its own numbers; a morph plan: the morph defaults with what the plan gives', () => {
  const mix = paramsFromPlan({ kind: 'mix', a: 'bar_001', b: 'bar_008' });
  assert.ok(mix.ok);
  assert.equal(mix.ok && mix.value.kind === 'mix' && mix.value.mode, 'path');
  assert.deepEqual(mix, { ok: true, value: { kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 1, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 } });
  const vote = paramsFromPlan({ kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 0.7, mode: 'vote' });
  assert.deepEqual(vote, { ok: true, value: { kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 0.7, threshold: 0.5, ghost: false, mode: 'vote' } });
  const pathSeeded = paramsFromPlan({ kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 0.25, mode: 'path', order: 'seeded', seed: 4 });
  assert.deepEqual(pathSeeded, { ok: true, value: { kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 0.25, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded', seed: 4 } });
  assert.deepEqual(paramsFromPlan({ kind: 'morph', a: 'bar_001', b: 'clave' }), { ok: true, value: { kind: 'morph', a: 'bar_001', b: 'clave', bars: 5, order: 'musical', seed: 0 } });
  assert.deepEqual(paramsFromPlan({ kind: 'morph', a: 'bar_001', b: 'clave', bars: 17, order: 'by_channel', seed: 3 }), { ok: true, value: { kind: 'morph', a: 'bar_001', b: 'clave', bars: 17, order: 'by_channel', seed: 3 } });
});

test('a plan the plugin\'s own validation refuses is refused with that reason, whatever the service said (the second boundary)', () => {
  const bad = (plan: unknown) => { const r = paramsFromPlan(plan); assert.equal(r.ok, false, JSON.stringify(plan)); return (r as { message: string }).message; };
  assert.match(bad({ kind: 'extend', bar: 'bar 5' }), /source must be the name of a bar/);
  assert.match(bad({ kind: 'extend', bar: 'bar_005', bars: 65 }), /bars must be a whole number from 1 to 64/);
  assert.match(bad({ kind: 'mix', a: 'bar_001', b: 'bar_008', weight: 2, mode: 'vote' }), /weight must be a number from 0 to 1/);
  assert.match(bad({ kind: 'morph', a: 'bar_001', b: 'bar_008', order: 'random' }), /order must be one of/);
  assert.equal(bad({ kind: 'remix' }), 'The planner\'s answer was not a phrase I know how to build: kind must be "extend", "mix" or "morph" (got "remix").');
  assert.equal(bad(null), 'The planner\'s answer was not a plan.');
  assert.equal(bad('extend'), 'The planner\'s answer was not a plan.');
  assert.equal(bad([]), 'The planner\'s answer was not a plan.');
});

// ---- the service's answer -------------------------------------------------------------------------------------------------------------------------------------------------------------

test('every way the service can answer, in one plain sentence; only a validated plan whose bars exist is a plan', () => {
  const ask = (status: number, json: unknown) => interpretPlanResponse({ status, json }, BARS);
  const said = (status: number, json: unknown) => { const r = ask(status, json); assert.equal(r.ok, false); return (r as { message: string }).message; };
  const ok = ask(200, { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 }, error: null });
  assert.deepEqual(ok, { ok: true, params: { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  assert.equal(said(0, { detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.' }), 'Set your transpile token in Settings → Forge → Transpile token before planning a phrase from a sentence.');
  assert.equal(said(0, { detail: 'something else' }), 'The transpile service could not be reached (something else).');
  assert.equal(said(0, {}), 'The transpile service could not be reached.');
  assert.equal(said(401, { detail: 'bad' }), 'The transpile service did not accept your token. Check Settings → Forge → Transpile token.');
  assert.equal(said(404, { detail: 'Not Found' }), 'This transpile service does not offer planning yet (it needs version 0.2.39 or newer). The person who runs it has to update it.');
  assert.equal(said(422, { detail: [] }), 'The service refused the request. A sentence can be at most 500 characters.');
  assert.equal(said(503, { detail: { error: 'Anthropic API: overloaded', retryable: true } }), 'The planner is busy right now. Try again in a moment.');
  assert.equal(said(429, {}), 'The planner is busy right now. Try again in a moment.');
  assert.equal(said(502, { detail: { error: 'Anthropic API: bad key', retryable: false } }), 'The planner could not answer: Anthropic API: bad key');
  assert.equal(said(502, { detail: 'ANTHROPIC_API_KEY not configured on the server' }), 'The planner could not answer: ANTHROPIC_API_KEY not configured on the server');
  assert.equal(said(500, null), 'The service answered 500.');
  assert.equal(said(200, { ok: false, parsed_ok: true, plan: null, error: 'I cannot tell which bar you mean.' }), 'I cannot tell which bar you mean.');
  assert.equal(said(200, { ok: false, parsed_ok: false, plan: null, error: 'I could not read a plan from the answer. Try saying it more simply.' }), 'I could not read a plan from the answer. Try saying it more simply.');
  assert.equal(said(200, { ok: false }), 'The planner did not say why it could not plan that. Try saying it differently.');
  assert.equal(said(200, 'not an object'), 'The service\'s answer could not be read.');
  assert.equal(said(200, { ok: true, plan: { kind: 'extend', bar: 'bar_999' } }), '"bar_999" is not a bar in this vault.');
  assert.equal(said(200, { ok: true, plan: { kind: 'morph', a: 'bar_001', b: 'ghost' } }), '"ghost" is not a bar in this vault.');
  assert.match(said(200, { ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 0 } }), /bars must be a whole number/);
});

// ---- the evidence lines ---------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the evidence lines: what was asked and what came of it; what was created', () => {
  assert.equal(askedLine('extend bar_005 to 8 bars', { ok: true, params: { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 } }), '[forge-plan] asked "extend bar_005 to 8 bars" -> extend');
  assert.equal(askedLine('x', { ok: false, message: 'I cannot tell which bar you mean.' }), '[forge-plan] asked "x" -> refused: I cannot tell which bar you mean.');
  assert.equal(askedLine('a'.repeat(100), { ok: false, message: 'm' }), `[forge-plan] asked "${'a'.repeat(80)}..." -> refused: m`, 'a long sentence is cut at 80 characters');
  assert.equal(askedLine('line one\nline two', { ok: false, message: 'm' }), '[forge-plan] asked "line one line two" -> refused: m', 'one line');
  assert.equal(createdLine('phrases/phrase_004.md', 'morph'), '[forge-plan] created phrases/phrase_004.md (morph)');
});

// ---- the planner: plan, then create ----------------------------------------------------------------------------------------------------------------------------------------------------

function world(over: { status?: number; json?: unknown; throws?: Error; taken?: string[]; ownKey?: string; phrases?: string[]; bars?: string[]; alreadyExistsOnce?: boolean; allTaken?: boolean } = {}) {
  const net = { status: over.status ?? 200, json: over.json ?? { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005' }, error: null } as unknown, throws: over.throws ?? null as Error | null };
  const lines: string[] = []; const notices: string[] = []; const created: Array<[string, string]> = []; const opened: string[] = []; const asked: unknown[] = [];
  let race = over.alreadyExistsOnce === true;
  const taken = new Set(over.taken ?? []);
  const ports: SentencePlannerPorts<string> = {
    activePath: () => null,
    folderExists: () => true, createFolder: async () => {},
    listPhraseBasenames: () => over.phrases ?? [...taken].map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    exists: (p) => over.allTaken === true || taken.has(p),
    create: async (p, c) => { if (race) { race = false; taken.add(p); throw new Error('File already exists.'); } created.push([p, c]); taken.add(p); return p; },
    open: async (f) => { opened.push(f); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: (e) => /already exists/.test(String((e as Error).message)),
    listBarBasenames: () => over.bars ?? BARS,
    ask: async (payload) => { asked.push(payload); if (net.throws) throw net.throws; return { status: net.status, json: net.json }; },
    ownKey: () => over.ownKey,
    trace: (l) => { lines.push(l); },
  };
  return { planner: createSentencePlanner(ports), lines, notices, created, opened, asked, net };
}

test('PLAN shows what Create would write (the Description and the Recipe, the name it would get), writes nothing, and says what it asked in one evidence line', async () => {
  const w = world({ taken: ['phrases/phrase_001.md'] });
  const view = await w.planner.plan('extend bar_005');
  assert.deepEqual(view, {
    ok: true, kind: 'extend', name: 'phrase_002', path: 'phrases/phrase_002.md',
    description: 'phrase_002 — [[bar_005]] extended to 4 bars: repeat with fills, no tempo change.',
    recipe: 'extend_rhythm([[bar_005]], bars=4, style="repeat_with_fills", tempo_change_pct=0)',
  });
  assert.deepEqual(w.created, [], 'Plan writes nothing');
  assert.deepEqual(w.lines, ['[forge-plan] asked "extend bar_005" -> extend']);
  assert.deepEqual(w.asked, [{ sentence: 'extend bar_005', bars: ['bar_001', 'bar_005', 'bar_008', 'clave'], phrases: ['phrase_001'] }]);
});

test('CREATE writes the SAME note the controls would write for that kind (byte for byte), opens it, says so; the key goes only inside the payload', async () => {
  const cases: Array<[unknown, (n: string) => string]> = [
    [{ kind: 'extend', bar: 'bar_005' }, (n) => phraseNoteContent(n, 'bar_005')],
    [{ kind: 'mix', a: 'bar_001', b: 'bar_008' }, (n) => mixNoteContent(n, 'bar_001', 'bar_008')],
    [{ kind: 'morph', a: 'bar_001', b: 'clave' }, (n) => morphNoteContent(n, 'bar_001', 'clave')],
  ];
  for (const [plan, expected] of cases) {
    const w = world({ json: { ok: true, parsed_ok: true, plan, error: null }, ownKey: 'sk-ant-mine' });
    const view = await w.planner.plan('a sentence');
    assert.ok(view.ok);
    const res = await w.planner.create();
    assert.deepEqual(res, { ok: true, path: 'phrases/phrase_001.md' });
    assert.deepEqual(w.created, [['phrases/phrase_001.md', expected('phrase_001')]], `the ${(plan as { kind: string }).kind} note is the controls' note`);
    assert.deepEqual(w.opened, ['phrases/phrase_001.md']);
    assert.equal(w.lines.at(-1), `[forge-plan] created phrases/phrase_001.md (${(plan as { kind: string }).kind})`);
    assert.equal((w.asked[0] as { user_anthropic_key?: string }).user_anthropic_key, 'sk-ant-mine');
    assert.ok(!w.lines.join('\n').includes('sk-ant-mine'), 'the key is never printed');
    assert.ok(!w.created[0][1].includes('sk-ant-mine'));
  }
  // the plan's own numbers land in the note, and the JSON still validates
  const w = world({ json: { ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'building', tempo_change_pct: -10 } } });
  await w.planner.plan('x'); await w.planner.create();
  const text = w.created[0][1];
  assert.match(text, /extend_rhythm\(\[\[bar_005\]\], bars=8, style="building", tempo_change_pct=-10\)/);
  const json = JSON.parse(text.slice(text.indexOf('```json') + 8, text.lastIndexOf('```')));
  assert.equal(validatePhrase(json).ok, true);
});

test('NO refusal ever writes a note: no token, service down, busy, 404, a refusal, a bad plan, an unknown bar; the person gets a sentence and Create has nothing to create', async () => {
  const cases: Array<[Parameters<typeof world>[0], RegExp]> = [
    [{ status: 0, json: { detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.' } }, /Set your transpile token/],
    [{ throws: new Error('getaddrinfo ENOTFOUND') }, /^Could not reach the transpile service \(getaddrinfo ENOTFOUND\)\. Check your connection and Settings → Forge → Transpile service URL\.$/],
    [{ status: 503, json: { detail: { retryable: true } } }, /busy/],
    [{ status: 404, json: { detail: 'Not Found' } }, /does not offer planning yet/],
    [{ json: { ok: false, parsed_ok: true, plan: null, error: 'No.' } }, /^No\.$/],
    [{ json: { ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 999 } } }, /bars must be/],
    [{ json: { ok: true, plan: { kind: 'extend', bar: 'bar_404' } } }, /not a bar in this vault/],
    [{ bars: [] }, /no bars yet/],
  ];
  for (const [over, re] of cases) {
    const w = world(over);
    const view = await w.planner.plan('some sentence');
    assert.equal(view.ok, false);
    assert.match((view as { message: string }).message, re);
    assert.match(w.lines[0], /^\[forge-plan\] asked "some sentence" -> refused: /);
    const res = await w.planner.create();
    assert.equal(res.ok, false, 'Create after a refusal creates nothing');
    assert.deepEqual(w.created, []);
    assert.deepEqual(w.opened, []);
  }
  const noAsk = world({ bars: [] });
  await noAsk.planner.plan('x');
  assert.deepEqual(noAsk.asked, [], 'a vault with no bars is refused before the network');
});

test('Create before any Plan says to plan first and writes nothing; a refused second Plan forgets the first plan', async () => {
  const w = world();
  assert.deepEqual(await w.planner.create(), { ok: false, message: 'Plan the sentence first.' });
  assert.deepEqual(w.notices, ['Plan the sentence first.']);
  await w.planner.plan('good');
  const w2 = world({ json: { ok: false, error: 'No.' } });
  assert.equal((await w2.planner.plan('bad')).ok, false);
  assert.deepEqual(await w2.planner.create(), { ok: false, message: 'Plan the sentence first.' });
});

test('a newer Plan replaces the plan: Create writes what the LAST successful Plan showed, and a slow older answer cannot overwrite it', async () => {
  const answers: Array<(v: { status: number; json: unknown }) => void> = [];
  const lines: string[] = [];
  const ports: SentencePlannerPorts<string> = {
    activePath: () => null, folderExists: () => true, createFolder: async () => {}, listPhraseBasenames: () => [], exists: () => false,
    create: async (p, c) => { lines.push(`${p}|${c.includes('morph_rhythm') ? 'morph' : 'extend'}`); return p; }, open: async () => {}, notify: () => {}, isAlreadyExists: () => false,
    listBarBasenames: () => BARS, trace: () => {}, ownKey: () => undefined,
    ask: () => new Promise((res) => { answers.push(res); }),
  };
  const p = createSentencePlanner(ports);
  const first = p.plan('first');
  const second = p.plan('second');
  answers[1]({ status: 200, json: { ok: true, plan: { kind: 'morph', a: 'bar_001', b: 'bar_008' } } });
  assert.equal((await second).ok, true);
  answers[0]({ status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_005' } } });
  const stale = await first;
  assert.equal(stale.ok, false);
  assert.equal((stale as { message: string }).message, 'A newer sentence was planned; this answer was dropped.');
  await p.create();
  assert.deepEqual(lines, ['phrases/phrase_001.md|morph']);
});

test('the name is picked when Create writes, from a fresh listing: a phrase made in between takes the next number; a name taken in a race is retried; the note is never written twice', async () => {
  const w = world({ alreadyExistsOnce: true });
  const view = await w.planner.plan('x');
  assert.ok(view.ok && view.name === 'phrase_001');
  const res = await w.planner.create();
  assert.deepEqual(res, { ok: true, path: 'phrases/phrase_002.md' });
  assert.equal(w.created.length, 1);
  assert.equal(w.created[0][0], 'phrases/phrase_002.md');
  assert.match(w.created[0][1], /^---\ntype: data\ncontent_type: json\ndescription: "phrase_002 — /);
});

test('a write that fails is a notice naming why, and no evidence line says "created"', async () => {
  const w = world();
  await w.planner.plan('x');
  const failing = createSentencePlanner({
    activePath: () => null, folderExists: () => true, createFolder: async () => {}, listPhraseBasenames: () => [], exists: () => false,
    create: async () => { throw new Error('disk full'); }, open: async () => {}, notify: (m) => { w.notices.push(m); }, isAlreadyExists: () => false,
    listBarBasenames: () => BARS, trace: (l) => { w.lines.push(l); }, ownKey: () => undefined,
    ask: async () => ({ status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_005' } } }),
  });
  await failing.plan('x');
  const before = w.lines.length;
  const res = await failing.create();
  assert.equal(res.ok, false);
  assert.match(w.notices.at(-1)!, /disk full/);
  assert.ok(!w.lines.slice(before).some((l) => /created/.test(l)));
});

test('names that are not bars or phrases (README) are never offered to the service; a vault with only a README has no bars', () => {
  const r = buildPlanRequest({ sentence: 'x', barNames: ['README', 'bar_001'], phraseNames: ['README', 'phrase_001'] });
  assert.deepEqual(r.ok && r.payload, { sentence: 'x', bars: ['bar_001'], phrases: ['phrase_001'] });
  assert.equal(buildPlanRequest({ sentence: 'x', barNames: ['README'], phraseNames: [] }).ok, false);
});

test('more service answers: a 502 with no detail, ok:true with no plan, ok:false carrying a plan, a plan that is null', () => {
  const said = (status: number, json: unknown) => { const r = interpretPlanResponse({ status, json }, BARS); assert.equal(r.ok, false, JSON.stringify(json)); return (r as { message: string }).message; };
  assert.equal(said(502, {}), 'The planner could not answer.');
  assert.equal(said(502, { detail: '' }), 'The planner could not answer.');
  const dunno = 'The planner did not say why it could not plan that. Try saying it differently.';
  assert.equal(said(200, { ok: true }), dunno);
  assert.equal(said(200, { ok: true, plan: null }), dunno);
  assert.equal(said(200, { ok: false, plan: { kind: 'extend', bar: 'bar_005' } }), dunno, 'ok:false is a refusal even if a plan came with it');
  assert.equal(said(200, { ok: false, error: '' }), dunno);
});

test('the evidence line cuts a sentence at exactly 80 characters: 80 whole, 81 cut', () => {
  assert.equal(askedLine('a'.repeat(80), { ok: false, message: 'm' }), `[forge-plan] asked "${'a'.repeat(80)}" -> refused: m`);
  assert.equal(askedLine('a'.repeat(81), { ok: false, message: 'm' }), `[forge-plan] asked "${'a'.repeat(80)}..." -> refused: m`);
});

test('a refused Plan after a good one withdraws the good one (Create has nothing to create); no free phrase name is a refusal, not a crash', async () => {
  const w = world();
  assert.equal((await w.planner.plan('good')).ok, true);
  w.net.json = { ok: false, error: 'No.' };
  assert.equal((await w.planner.plan('bad')).ok, false);
  assert.deepEqual(await w.planner.create(), { ok: false, message: 'Plan the sentence first.' });
  assert.deepEqual(w.created, []);
  const full = world({ allTaken: true });
  const view = await full.planner.plan('x');
  assert.deepEqual(view, { ok: false, message: 'Could not find a free phrase name in phrases/ — try again.' });
  assert.deepEqual(await full.planner.create(), { ok: false, message: 'Plan the sentence first.' });
});
