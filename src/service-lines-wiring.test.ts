// 2026-11-20-1003 (THE SENTENCE SERVICE AS THE FLUENT FRONT END) - on the surface a person uses: the REAL controller (the plugin's own ports mapping, the real composer, dialog and bar list) against a FAKE service (no network):
//   * the request for a sentence the grammar cannot read carries the grammar table, the note's own lines, the Score's drawn bar count and numbers, the instruction, and nothing else of the vault (no body text, no token in the dialog);
//   * an answer of CANONICAL LINES is checked by the grammar line by line, shown as the plan (the suggestion in the dialog), applied by the second Enter under the usual replace-in-place rules; `Move bar 4 before bar 2.` and
//     `swap the second and third bars` are recorded answers; a line the grammar refuses is dropped and said; an answer with no usable line is refused in words;
//   * an unclear request gets ONE clarifying question (a notice in the dialog, nothing written) and the next typed sentence goes back WITH it, once;
//   * an older service (the old plan answer) is read exactly as before; bars are under the service too (the bar grammar checks every line), an older service says it does not know bar sentences yet;
//   * malicious answers (markup, an enormous answer, too many lines) never reach the list. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', BAR = 'bars/bar_001.md';
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const SECRET_BODY = 'SECRET-BODY-TEXT-DO-NOT-SEND';
const OWN_KEY = 'sk-ant-OWNKEY-0123456789abcdef0123456789abcdef';

type Req = Record<string, unknown>;
type Svc = (req: Req) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>;
function rig(opts: { path?: string; note?: string; service: Svc; drawn?: number; configured?: boolean }) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set('arrangements/arr_001.md', emptyArrangementNote('arr_001')); store.set('kits/rock.md', '---\ntype: data\ncontent_type: json\n---\n'); store.set('kits/latin.md', '---\ntype: data\ncontent_type: json\n---\n');
  store.set(path, opts.note ?? (path.startsWith('arrangements/') ? emptyArrangementNote('x') : path.startsWith('bars/') ? PLAYGROUND_BARS['bar_001'] : emptyPhraseNote('x')).replace(/^---\n/, `---\nnotes_to_self: ${SECRET_BODY}\n`));
  const requests: Req[] = []; const traces: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = {
    ...descriptionPortsFor({
      read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
      basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
      panes: () => panes, setTimer: () => 1, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    }, {
      askPlan: async (payload: unknown) => { requests.push(JSON.parse(JSON.stringify(payload))); return opts.service(payload as Req); },
      planConfigured: () => opts.configured !== false,
      composerAutoApply: () => true,
      ownKey: () => OWN_KEY,
    } as never),
    drawSeed: () => 7,
  };
  const ctl = createDescriptionController(ports as never);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  if (opts.drawn !== undefined) { const host = win.document.createElement('div'); host.className = 'forge-rhythm-score-host'; host.innerHTML = `<svg>${'<g class="measure"></g>'.repeat(opts.drawn)}</svg>`; el.appendChild(host); }
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const enter = () => press({ key: 'Enter' });
  const list = () => (path.startsWith('bars/') ? (readBarLines(store.get(path)!)?.lines ?? []).filter((l) => !/^Start with /.test(l)) : extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, '')));
  const texts = () => dialogEntries(el).map((e) => e.text);
  const kinds = () => dialogEntries(el).map((e) => e.kind);
  const suggestion = () => [...el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  return { ctl, el, store, requests, traces, type, enter, press, list, texts, kinds, suggestion, ready: async () => { await ctl.inspect(path); await flush(); }, writes: () => [...store.entries()].filter(([k]) => k === path).length,
    say: async (s: string) => { type(s); await enter(); } };
}
type Rig = ReturnType<typeof rig>;
const lines = (...l: string[]) => async () => ({ status: 200, json: { ok: true, lines: l } });
const phraseWithHead = async (svc: Svc, drawn = 4): Promise<Rig> => { const r = rig({ service: svc, drawn }); await r.ready(); r.type(EXTEND); await r.enter(); assert.deepEqual(r.list(), [EXTEND]); return r; };

// ---- the request ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the request for a sentence the grammar cannot read carries the table, the note\'s lines, the drawn bar count and numbers, the instruction; nothing else of the vault; the grammar is asked FIRST (a readable sentence never reaches the service)', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  assert.equal(r.requests.length, 0, 'the readable Extend never asked the service');
  await r.say('put bar 4 in front of bar 2');
  assert.equal(r.requests.length, 1);
  const q = r.requests[0];
  assert.equal(q.sentence, 'put bar 4 in front of bar 2'); assert.equal(q.mode, 'lines'); assert.equal(q.note_kind, 'phrase');
  assert.deepEqual(q.list, [EXTEND]); assert.equal(q.bar_count, 4); assert.deepEqual(q.bar_numbers, [1, 2, 3, 4]);
  assert.ok(Array.isArray(q.grammar) && (q.grammar as string[]).some((row) => row.startsWith('move: Move bars 3 to 5')));
  assert.match(String(q.instruction), /only with canonical sentences/i);
  assert.equal('previous' in q, false);
  const allowed = new Set(['sentence', 'bars', 'phrases', 'user_anthropic_key', 'mode', 'note_kind', 'grammar', 'list', 'bar_count', 'bar_numbers', 'instruction']);
  for (const k of Object.keys(q)) assert.ok(allowed.has(k), `an unexpected field in the request: ${k}`);
  assert.ok(!JSON.stringify(q).includes(SECRET_BODY), 'no body text of the note is sent');
  assert.ok(!r.texts().join('\n').includes(OWN_KEY) && !r.traces.join('\n').includes(OWN_KEY), 'the key is never in the dialog or the trace');
});

test('no Score drawn: bar_count is null and there are no bar numbers (the service is told it does not know)', async () => {
  const r = rig({ service: lines('Delete bar 2.'), drawn: undefined }); await r.ready();
  r.type(EXTEND); await r.enter(); await r.say('swap the second and third bars');
  assert.equal(r.requests[0].bar_count, null); assert.deepEqual(r.requests[0].bar_numbers, []);
});

// ---- the plan from lines ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('`put bar 4 in front of bar 2` (the grammar cannot read it) becomes two canonical lines, shown as the plan, applied by Enter', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say('put bar 4 in front of bar 2');
  assert.deepEqual(r.list(), [EXTEND], 'nothing is written by the first Enter');
  assert.ok(r.kinds().includes('suggestion'), 'the plan is in the dialog');
  assert.match(r.suggestion(), /Move bar 4 one bar left\./); assert.match(r.suggestion(), /Move bar 3 one bar left\./);
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Move bar 4 one bar left.', 'Move bar 3 one bar left.'], 'the lines are list lines, one write');
});

test('`Move bar 4 before bar 2.` is caught FIRST by the 1002 "did you mean" (a deterministic repair, one place), so the service is NOT asked; the person sees the repair, as before 1003', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say('Move bar 4 before bar 2.');
  assert.equal(r.requests.length, 0); assert.match(r.texts().join('\n'), /Did you mean: Move bar 4 one bar left/);
});

test('`swap the second and third bars` becomes the right move; Esc drops the plan and writes nothing', async () => {
  const r = await phraseWithHead(lines('Move bar 3 one bar left.'));
  await r.say('swap the second and third bars');
  assert.match(r.suggestion(), /Move bar 3 one bar left\./);
  await r.press({ key: 'Escape' });
  assert.deepEqual(r.list(), [EXTEND]);
});

test('a line the grammar refuses is DROPPED and said; the rest are the plan', async () => {
  const r = await phraseWithHead(lines('Make it sparkle.', 'Move bar 3 one bar left.'));
  await r.say('swap the second and third bars');
  const shown = r.texts().join('\n');
  assert.match(shown, /Make it sparkle\./, 'the dropped line is named'); assert.match(shown, /left out|could not use|dropped/i);
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Move bar 3 one bar left.'], 'only the readable line was applied');
});

test('an answer with no usable line is refused in plain words, nothing is written', async () => {
  const r = await phraseWithHead(lines('Make it sparkle.', 'Add some cowbell.'));
  await r.say('swap the second and third bars');
  assert.match(r.texts().join('\n'), /could not use any line/i);
  await r.enter(); assert.deepEqual(r.list(), [EXTEND]);
});

test('an arrangement is under the service too: a recorded answer of canonical lines is checked by the arrangement grammar', async () => {
  const r = rig({ path: ARR, service: lines('Play [[phrase_001]] on the [[rock]] kit.', 'Make it sparkle.'), configured: true }); await r.ready();
  await r.say('put the first phrase on rock please'); assert.equal(r.requests[0].note_kind, 'arrangement'); assert.ok((r.requests[0].grammar as string[]).some((x) => x.startsWith('mute: Mute the [[latin]] kit.')));
  await r.enter(); assert.deepEqual(r.list(), ['Play [[phrase_001]] on the [[rock]] kit.']);
});

// ---- a question ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an unclear request gets ONE clarifying question: a notice in the dialog, nothing written; the next typed sentence goes back with it, once', async () => {
  let n = 0;
  const r = await phraseWithHead(async () => (++n === 1 ? { status: 200, json: { ok: true, lines: [], question: 'Which two bars do you want to swap?' } } : { status: 200, json: { ok: true, lines: ['Move bar 3 one bar left.'] } }));
  await r.say('swap them');
  assert.ok(r.texts().some((t) => t === 'The service asks: Which two bars do you want to swap?'), 'the question is in the dialog');
  assert.deepEqual(r.list(), [EXTEND]); assert.ok(!r.kinds().includes('suggestion'));
  await r.say('the second and the third');
  assert.deepEqual(r.requests[1].previous, { sentence: 'swap them', question: 'Which two bars do you want to swap?' });
  await r.enter(); assert.deepEqual(r.list(), [EXTEND, 'Move bar 3 one bar left.']);
  await r.say('swap those again'); // a later request carries no stale question
  assert.equal('previous' in r.requests[2], false);
});

test('a typed sentence the GRAMMAR reads after a question is applied locally (the service is not asked) and clears the question', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: true, question: 'Which bars?' } }));
  await r.say('swap them');
  await r.say('Keep bars 1 to 3.'); assert.equal(r.requests.length, 1, 'the grammar read it: no second request');
  assert.deepEqual(r.list(), [EXTEND, 'Keep bars 1 to 3.']);
  await r.say('swap them'); assert.equal('previous' in r.requests[1], false);
});

// ---- the older service ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an OLDER service answers the old plan: read exactly as before (a plan of an Extend is the lines of an Extend)', async () => {
  const r = rig({ service: async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills' }, error: null, version: '0.2.48' } }), drawn: 4 }); await r.ready();
  await r.say('make me eight bars from bar five please');
  assert.ok(r.kinds().includes('suggestion')); await r.enter();
  assert.match(r.list()[0], /^Extend \[\[bar_005\]\] to 8 bars/);
});

test('the old refusals are unchanged: no token (status 0), 401, 404 (an old service) are said in the old words', async () => {
  for (const [status, re] of [[401, /did not accept your token/], [404, /does not offer planning yet/], [0, /could not be reached/]] as const) {
    const r = rig({ service: async () => ({ status, json: { detail: 'x' } }), drawn: 4 }); await r.ready();
    await r.say('make me eight bars from bar five please');
    assert.match(r.texts().join('\n'), re, `status ${status}`);
  }
});

// ---- malicious answers -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('malicious answers never reach the list: markup, an enormous answer, more than 12 lines', async () => {
  const r1 = await phraseWithHead(lines('<script>alert(1)</script>', 'Delete `bar 2`.'));
  await r1.say('swap the second and third bars'); await r1.enter(); assert.deepEqual(r1.list(), [EXTEND]);
  const r2 = await phraseWithHead(async () => ({ status: 200, json: { ok: true, lines: ['Delete bar 2.'], padding: 'z'.repeat(5000) } }));
  await r2.say('swap the second and third bars'); assert.match(r2.texts().join('\n'), /too long to trust/); await r2.enter(); assert.deepEqual(r2.list(), [EXTEND]);
  const r3 = await phraseWithHead(lines(...Array.from({ length: 30 }, () => 'Delete bar 2.')));
  await r3.say('swap the second and third bars'); await r3.enter();
  assert.ok(r3.list().length <= 1 + 12, 'at most 12 lines of an answer are taken');
});

// ---- bars ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('BARS are under the service: an unreadable sentence is asked (the bar grammar table, the bar\'s own lines); a canonical answer is the plan and is applied by Enter', async () => {
  const r = rig({ path: BAR, service: lines('Hit kick on steps 1, 5 and 9.', 'Make it funky.'), drawn: undefined }); await r.ready();
  await r.say('give me a four on the floor kick please');
  assert.equal(r.requests.length, 1); assert.equal(r.requests[0].note_kind, 'bar');
  assert.ok((r.requests[0].grammar as string[]).some((x) => x.includes('Hit kick on steps 1, 5 and 9.')));
  assert.ok(!JSON.stringify(r.requests[0]).includes(SECRET_BODY));
  assert.match(r.texts().join('\n'), /Make it funky\./, 'the dropped line is said');
  assert.deepEqual(r.list(), [], 'nothing written yet');
  await r.enter();
  assert.deepEqual(r.list(), ['Hit kick on steps 1, 5 and 9.']);
});

test('a bar sentence the bar grammar reads never reaches the service; an older service (the old plan answer) says it does not know bar sentences yet', async () => {
  const r = rig({ path: BAR, service: async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend' } } }), drawn: undefined }); await r.ready();
  await r.say('Set the tempo to 96.'); assert.equal(r.requests.length, 0);
  await r.say('give me a four on the floor kick please');
  assert.equal(r.requests.length, 1); assert.match(r.texts().join('\n'), /does not know bar sentences yet.*0\.2\.49/s);
  assert.deepEqual(r.list(), ['Set the tempo to 96.']);
});

test('with no service set up a bar sentence is refused as before (no request, the bar grammar\'s own words)', async () => {
  const r = rig({ path: BAR, service: lines('Hit kick on steps 1, 5 and 9.'), configured: false, drawn: undefined }); await r.ready();
  await r.say('give me a four on the floor kick please'); assert.equal(r.requests.length, 0);
  assert.ok(r.kinds().includes('rejected'));
});

// ---- bars: the other answers (the question, nothing changed, a replacement, the refused plan) --------------------------------------------------------------------------------------------------
test('a bar: an unclear request gets ONE clarifying question (a notice, nothing written); the next sentence goes back with it', async () => {
  let n = 0;
  const r = rig({ path: BAR, service: async () => (++n === 1 ? { status: 200, json: { ok: true, question: 'Which channel do you mean?' } } : { status: 200, json: { ok: true, lines: ['Hit kick on steps 1, 5 and 9.'] } }), drawn: undefined }); await r.ready();
  await r.say('make it groovier');
  assert.ok(r.texts().some((t) => t === 'The service asks: Which channel do you mean?')); assert.deepEqual(r.list(), []); assert.ok(!r.kinds().includes('suggestion'));
  await r.say('the kick please, on the beat');
  assert.deepEqual(r.requests[1].previous, { sentence: 'make it groovier', question: 'Which channel do you mean?' });
  await r.enter(); assert.deepEqual(r.list(), ['Hit kick on steps 1, 5 and 9.']);
});

test('a bar: lines the bar already says change nothing ("Nothing changed: the bar already says this."), and nothing is written', async () => {
  const r = rig({ path: BAR, service: lines('Set the tempo to 96.'), drawn: undefined }); await r.ready();
  await r.say('Set the tempo to 96.'); const before = r.list();
  await r.say('make the tempo ninety six');
  assert.ok(r.texts().some((t) => t === 'Nothing changed: the bar already says this.')); assert.deepEqual(r.list(), before); assert.ok(!r.kinds().includes('suggestion') || r.requests.length === 1);
});

test('a bar: a line that REPLACES an earlier one says so ("This replaces: ...") in the plan', async () => {
  const r = rig({ path: BAR, service: lines('Set the tempo to 120.'), drawn: undefined }); await r.ready();
  await r.say('Set the tempo to 96.');
  await r.say('make it a bit quicker');
  assert.match(r.el.textContent ?? '', /This replaces: Set the tempo to 96/);
  await r.enter(); assert.ok(r.list().includes('Set the tempo to 120.')); assert.ok(!r.list().includes('Set the tempo to 96.'));
});

test('a bar: a failing service (the request throws) is said in words, nothing is written; a too-long answer is refused', async () => {
  const r1 = rig({ path: BAR, service: async () => { throw new Error('offline'); }, drawn: undefined }); await r1.ready();
  await r1.say('make it groovier'); assert.match(r1.texts().join('\n'), /Could not reach the transpile service \(offline\)/); assert.deepEqual(r1.list(), []);
  const r2 = rig({ path: BAR, service: async () => ({ status: 200, json: { ok: true, lines: ['Set the tempo to 96.'], pad: 'z'.repeat(5000) } }), drawn: undefined }); await r2.ready();
  await r2.say('make it groovier'); assert.match(r2.texts().join('\n'), /too long to trust/); assert.deepEqual(r2.list(), []);
});
