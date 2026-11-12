// 2026-11-12-1206 - the sentence service learns ARRANGEMENTS and COMPOSITIONS (forge-transpile 0.2.48): the client's pure side (sentence-plan-families-core.ts). The request names the kind (`family`) and carries only the vault's names for it; the
// answer is read twice: the service's validators were the first boundary, the plugin's own validators and the vault's lists are the second (a name that is not in the vault, a kit that plays two tracks, a composition that would play itself
// or loop through the vault are refused HERE, in one sentence, whatever the service said). A service older than 0.2.48 cannot plan these kinds: it is told apart by the version its own answer carries, never guessed from its message.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_SERVICE_VERSION, OLD_FAMILY_SERVICE, buildFamilyPlanRequest, compositionLoopRefusal, familyRecipeSteps, interpretFamilyResponse,
} from './sentence-plan-families-core.ts';
import { COMPOSITION_DEPTH_MAX, type CompositionSection } from './composition-core.ts';

const KITS = ['rock', 'latin'], PHRASES = ['phrase_001', 'phrase_002', 'phrase_003'], ARRS = ['arr_001'], COMPS = ['song_1', 'song_2'];
// `version` null = the answer carries none (a service before 0.2.42)
const OK = (plan: unknown, version: string | null = '0.2.48') => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null, ...(version !== null ? { version } : {}) } });
const NO = (error: string, version: string | null = '0.2.48') => ({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error, ...(version !== null ? { version } : {}) } });
const ARR_PLAN = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 60 }] };
const COMP_PLAN = { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'arrangements/arr_001', length: 4, repeat: 2 }] };
const arrCtx = { family: 'arrangement' as const, kits: KITS, phrases: PHRASES };
const compCtx = { family: 'composition' as const, phrases: PHRASES, arrangements: ARRS, compositions: COMPS, note: 'compositions/song_1' };
const noReads = async (): Promise<CompositionSection[] | null> => { throw new Error('no read expected'); };

test('the gate is 0.2.48 and the old-service sentence names it', () => {
  assert.equal(FAMILY_SERVICE_VERSION, '0.2.48');
  assert.match(OLD_FAMILY_SERVICE('0.2.47'), /needs version 0\.2\.48 or newer/);
  assert.match(OLD_FAMILY_SERVICE('0.2.47'), /0\.2\.47/);
  assert.doesNotMatch(OLD_FAMILY_SERVICE(null), /null/);
});

test('request: an arrangement names the kind and sends the kits and phrases (sorted, README out), no bars, the BYOK key only when there is one', () => {
  const r = buildFamilyPlanRequest({ family: 'arrangement', sentence: '  rock plays one, latin plays two  ', kitNames: ['rock', 'README', 'latin', 'rock'], phraseNames: ['phrase_002', 'phrase_001'], arrangementNames: [], compositionNames: [], ownKey: undefined });
  assert.deepEqual(r, { ok: true, payload: { sentence: 'rock plays one, latin plays two', bars: [], phrases: ['phrase_001', 'phrase_002'], family: 'arrangement', kits: ['latin', 'rock'] } });
  const k = buildFamilyPlanRequest({ family: 'arrangement', sentence: 'x', kitNames: ['rock'], phraseNames: ['phrase_001'], arrangementNames: [], compositionNames: [], ownKey: 'sk-test' });
  assert.equal(k.ok && k.payload.user_anthropic_key, 'sk-test');
});

test('request: a composition sends the phrases, arrangements and compositions and the note being planned', () => {
  const r = buildFamilyPlanRequest({ family: 'composition', sentence: 'verse then chorus', kitNames: ['rock'], phraseNames: PHRASES, arrangementNames: ARRS, compositionNames: ['song_2', 'README', 'song_1'], note: 'compositions/song_1' });
  assert.deepEqual(r, { ok: true, payload: { sentence: 'verse then chorus', bars: [], phrases: PHRASES, family: 'composition', arrangements: ARRS, compositions: ['song_1', 'song_2'], note: 'compositions/song_1' } });
  assert.equal('kits' in (r as any).payload, false, 'a composition does not send the kits');
});

test('request: refusals are one sentence each and nothing is sent - empty, too long, no kits or phrases, nothing to play', () => {
  const base = { kitNames: KITS, phraseNames: PHRASES, arrangementNames: ARRS, compositionNames: COMPS };
  assert.deepEqual(buildFamilyPlanRequest({ ...base, family: 'arrangement', sentence: '   ' }), { ok: false, message: 'Say in a sentence which phrase plays on which kit, for example: play phrase_001 on the rock kit.' });
  assert.deepEqual(buildFamilyPlanRequest({ ...base, family: 'composition', sentence: '' }), { ok: false, message: 'Say in a sentence what the piece plays and in what order, for example: play phrase_001, then phrase_002 twice.' });
  const long = buildFamilyPlanRequest({ ...base, family: 'arrangement', sentence: 'x'.repeat(501) });
  assert.equal(long.ok, false); assert.match((long as any).message, /501 characters; the limit is 500/);
  assert.match((buildFamilyPlanRequest({ ...base, family: 'arrangement', sentence: 'a', kitNames: [] }) as any).message, /no kits or no phrases yet/);
  assert.match((buildFamilyPlanRequest({ ...base, family: 'arrangement', sentence: 'a', phraseNames: ['README'] }) as any).message, /no kits or no phrases yet/);
  assert.match((buildFamilyPlanRequest({ ...base, family: 'composition', sentence: 'a', phraseNames: [], arrangementNames: [], compositionNames: [] }) as any).message, /no phrases, arrangements or compositions yet/);
});

test('answer: a well-formed arrangement plan becomes the plugin\'s own params (and carries the version it came with)', () => {
  const o = interpretFamilyResponse(OK(ARR_PLAN), arrCtx);
  assert.deepEqual(o, { ok: true, params: { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 60 }] }, serviceVersion: '0.2.48' });
});

test('answer: a well-formed composition plan becomes the plugin\'s own params', () => {
  const o = interpretFamilyResponse(OK(COMP_PLAN), compCtx);
  assert.deepEqual(o, { ok: true, params: COMP_PLAN, serviceVersion: '0.2.48' });
});

test('second boundary (arrangement): a kit or phrase the vault does not have, a kit with two tracks and a bound the plugin refuses are refused here whatever the service said', () => {
  const bad = (tracks: unknown[]) => interpretFamilyResponse(OK({ kind: 'arrangement', tracks }), arrCtx) as { ok: false; message: string };
  assert.equal(bad([{ kit: 'jazz', phrase: 'phrase_001' }]).message, '"jazz" is not a kit in this vault.');
  assert.equal(bad([{ kit: 'rock', phrase: 'phrase_099' }]).message, '"phrase_099" is not a phrase in this vault.');
  assert.match(bad([{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'rock', phrase: 'phrase_002' }]).message, /The kit "rock" plays two tracks; a kit plays one phrase\./);
  assert.match(bad([{ kit: 'rock', phrase: 'phrase_001', volume: 101 }]).message, /volume must be a whole number from 0 to 100/);
  assert.match(bad([]).message, /needs at least one track/);
});

test('second boundary (composition): a source the vault does not have, a bound the plugin refuses, a section list that is too long', () => {
  const bad = (sections: unknown[], ctx = compCtx) => interpretFamilyResponse(OK({ kind: 'composition', sections }), ctx) as { ok: false; message: string };
  assert.equal(bad([{ source: 'phrases/phrase_099' }]).message, '"phrases/phrase_099" is not a phrase, an arrangement or a composition of this vault.');
  assert.equal(bad([{ source: 'arrangements/arr_009' }]).message, '"arrangements/arr_009" is not a phrase, an arrangement or a composition of this vault.');
  assert.match(bad([{ source: 'bars/bar_001' }]).message, /the source must be a phrase, an arrangement or a composition note/, 'a bar is not a source: the plugin\'s own validator says so');
  assert.match(bad([{ source: 'phrases/phrase_001', repeat: 17 }]).message, /repeat must be a whole number of times from 1 to 16/);
  assert.match(bad([{ source: 'phrases/phrase_001', length: 257 }]).message, /length must be a whole number of bars from 1 to 256/);
  assert.match(bad(Array.from({ length: 33 }, () => ({ source: 'phrases/phrase_001' }))).message, /at most 32 sections/);
});

test('second boundary: a composition that is the note being planned is refused (the direct loop), and a plan of the wrong kind is refused', () => {
  const loop = interpretFamilyResponse(OK({ kind: 'composition', sections: [{ source: 'compositions/song_1' }] }), compCtx) as { ok: false; message: string };
  assert.equal(loop.message, 'The composition "song_1" cannot play itself; that would loop.');
  const other = interpretFamilyResponse(OK({ kind: 'composition', sections: [{ source: 'compositions/song_2' }] }), compCtx);
  assert.equal(other.ok, true, 'another composition is a legal section');
  const wrong = interpretFamilyResponse(OK({ kind: 'extend', bar: 'bar_001', bars: 8 }), arrCtx) as { ok: false; message: string };
  assert.equal(wrong.ok, false); assert.match(wrong.message, /not an arrangement/);
  const wrong2 = interpretFamilyResponse(OK(ARR_PLAN), compCtx) as { ok: false; message: string };
  assert.equal(wrong2.ok, false); assert.match(wrong2.message, /not a composition/);
  assert.equal(interpretFamilyResponse(OK('nonsense'), arrCtx).ok, false);
});

test('the service\'s own reason is passed on when it did not plan, and a plan the service left out is a refusal', () => {
  assert.deepEqual(interpretFamilyResponse(NO('That does not describe an arrangement.'), arrCtx), { ok: false, message: 'That does not describe an arrangement.', suspectOld: false, serviceVersion: '0.2.48' });
  const empty = interpretFamilyResponse({ status: 200, json: { ok: true, plan: null, version: '0.2.48' } }, arrCtx) as { ok: false; message: string };
  assert.match(empty.message, /did not say why/);
});

test('THE VERSION GATE: an answer from a service older than 0.2.48 is the old-service sentence - even when it carries a plan, and even when its message is about bars', () => {
  const old = '0.2.47';
  for (const res of [OK(ARR_PLAN, old), NO('This vault has no bars yet, so there is nothing to build a phrase from. Make a bar in the Beat Box first.', old), OK({ kind: 'extend', bar: 'bar_001', bars: 8 }, old)]) {
    const o = interpretFamilyResponse(res, arrCtx) as { ok: false; message: string; suspectOld: boolean };
    assert.equal(o.ok, false);
    assert.equal(o.message, OLD_FAMILY_SERVICE(old));
  }
  assert.equal((interpretFamilyResponse(OK(COMP_PLAN, '0.2.41'), compCtx) as any).message, OLD_FAMILY_SERVICE('0.2.41'));
  assert.equal(interpretFamilyResponse(OK(ARR_PLAN, '0.2.48'), arrCtx).ok, true, 'exactly the gate passes');
  assert.equal(interpretFamilyResponse(OK(ARR_PLAN, '0.3.0'), arrCtx).ok, true);
  assert.equal(interpretFamilyResponse(OK(ARR_PLAN, '1.0.0'), arrCtx).ok, true);
});

test('no version in the answer (a service before 0.2.42): a refusal is "suspect old" so the caller asks /health; a plan that passes both validators is accepted (only a new service can answer this kind)', () => {
  const refused = interpretFamilyResponse(NO('This vault has no bars yet.', null), arrCtx) as { ok: false; message: string; suspectOld: boolean; serviceVersion?: string | null };
  assert.equal(refused.ok, false); assert.equal(refused.suspectOld, true); assert.equal(refused.serviceVersion, undefined);
  for (const bad of [{ status: 200, json: { ok: false, plan: null, error: 'x', version: 48 } }, { status: 200, json: { ok: false, plan: null, error: 'x', version: '' } }]) assert.equal((interpretFamilyResponse(bad, arrCtx) as any).suspectOld, true, 'a number or an empty string is "no version"');
  assert.equal(interpretFamilyResponse(OK(ARR_PLAN, null), arrCtx).ok, true);
});

test('transport troubles read as they do for every other planner call: no token, unreachable, 401, an old service with no /plan (404 names 0.2.48), 422, busy, 502', () => {
  assert.match((interpretFamilyResponse({ status: 0, json: { detail: 'Set your transpile token in settings' } }, arrCtx) as any).message, /Set your transpile token in Settings/);
  assert.match((interpretFamilyResponse({ status: 401, json: {} }, arrCtx) as any).message, /did not accept your token/);
  assert.match((interpretFamilyResponse({ status: 404, json: {} }, arrCtx) as any).message, /needs version 0\.2\.48 or newer/);
  assert.match((interpretFamilyResponse({ status: 422, json: {} }, arrCtx) as any).message, /refused the request/);
  assert.match((interpretFamilyResponse({ status: 503, json: {} }, arrCtx) as any).message, /busy/);
  assert.match((interpretFamilyResponse({ status: 502, json: { detail: 'upstream' } }, arrCtx) as any).message, /could not answer: upstream/);
  assert.equal((interpretFamilyResponse({ status: 200, json: 'text' }, arrCtx) as any).ok, false);
});

// ---- the loop check: the draw-time rule (composition-core.ts barsOfSource), asked of the vault BEFORE anything is written ------------------------------------------------------------------

const sections = (...sources: string[]): CompositionSection[] => sources.map((source) => ({ source }));
const vaultOf = (notes: Record<string, CompositionSection[] | null>) => async (id: string) => (id in notes ? notes[id] : null);

test('loop check: a composition that plays only phrases and arrangements reads nothing and passes', async () => {
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('phrases/phrase_001', 'arrangements/arr_001') }, noReads), null);
});

test('loop check: the note itself (direct), and a chain that comes back to it through other compositions (indirect), are refused with the draw-time words', async () => {
  const read = vaultOf({ 'compositions/song_2': sections('phrases/phrase_001', 'compositions/song_3'), 'compositions/song_3': sections('compositions/song_1') });
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/song_1') }, read), 'The composition "song_1" cannot play itself; that would loop.');
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/song_2') }, read), 'The composition song_1 loops back to this composition or is nested more than 6 deep.');
  const twice = vaultOf({ 'compositions/song_2': sections('compositions/song_2') });
  assert.match(String(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/song_2') }, twice)), /^The composition song_2 loops back to this composition/);
});

test('loop check: a chain exactly at the limit passes and one deeper is refused (the same rule as drawing: chain.length >= COMPOSITION_DEPTH_MAX)', async () => {
  assert.equal(COMPOSITION_DEPTH_MAX, 6);
  const chainOf = (n: number): Record<string, CompositionSection[]> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`compositions/c${i + 1}`, i + 1 < n ? sections(`compositions/c${i + 2}`) : sections('phrases/phrase_001')]));
  // song_1 -> c1 -> c2 ...: a section of c_k is drawn with the chain [song_1, c1 .. c_k], k + 1 long, and drawing refuses a chain of 6 (any source, a phrase too). So c4 may hold a phrase (chain 5) and c5 may not (chain 6).
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/c1') }, vaultOf(chainOf(4))), null);
  const deep = await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/c1') }, vaultOf(chainOf(5)));
  assert.equal(deep, 'The phrase phrase_001 loops back to this composition or is nested more than 6 deep.');
  const deeper = await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('compositions/c1') }, vaultOf({ ...chainOf(5), 'compositions/c5': sections('compositions/c6'), 'compositions/c6': sections('phrases/phrase_001') }));
  assert.equal(deeper, 'The composition c6 loops back to this composition or is nested more than 6 deep.');
});

test('loop check: a composition the vault lists but cannot be read is a refusal in one sentence, an arrangement or phrase section is never read', async () => {
  const reads: string[] = [];
  const read = async (id: string) => { reads.push(id); return null; };
  const r = await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: sections('phrases/phrase_001', 'arrangements/arr_001', 'compositions/song_2') }, read);
  assert.match(String(r), /^The composition song_2 could not be read/);
  assert.deepEqual(reads, ['compositions/song_2']);
});

test('the loop check runs inside the answer: a plan that loops through the vault is refused from the vault\'s own sections', async () => {
  const read = vaultOf({ 'compositions/song_2': sections('compositions/song_1') });
  const o = interpretFamilyResponse(OK({ kind: 'composition', sections: [{ source: 'compositions/song_2' }] }), compCtx);
  assert.equal(o.ok, true, 'the answer alone cannot know: the vault is read next');
  assert.match(String(await compositionLoopRefusal('compositions/song_1', (o as any).params, read)), /loops back to this composition/);
});

test('the preview\'s recipe lines are the ones the note writes', () => {
  assert.deepEqual(familyRecipeSteps({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] }), ['Play [[phrase_001]] on the [[rock]] kit.', 'Together.']);
  assert.deepEqual(familyRecipeSteps({ kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'arrangements/arr_001', length: 4, repeat: 2 }] }).length > 0, true);
});
