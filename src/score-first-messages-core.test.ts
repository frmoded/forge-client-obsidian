// score_first M4 (drain 2026-10-21-2010) — the message router and the shared delivery state, pure. The P3 half (no other vault changes) is the full product of kinds and sources
// below, and the audit of every shipped vault's real forge.toml at the bottom.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { BACKLOG_CAP, MessageDelivery, classifyMessageSource, routeMessage, type MessageKind, type MessageSource } from './score-first-messages-core.ts';
import { isScoreFirstToml } from './vault-profile-core.ts';

const KINDS: MessageKind[] = ['info', 'error', 'success'];
const SOURCES: MessageSource[] = ['notice', 'llm', 'stale'];
const ROOT = path.resolve(import.meta.dirname, '..');

test('P3: outside a score-first vault EVERY message, of every kind and source, is "panel-reveal" with nothing on the Score', () => {
  for (const kind of KINDS) for (const source of SOURCES) assert.deepEqual(routeMessage({ scoreFirst: false, kind, source }), { panel: 'panel-reveal', score: null }, `${kind}/${source}`);
});

test('score-first: the panel is always silent; an error goes on the Score until the next draw; success, LLM and out-of-date lines are transient; the rest stays panel-only', () => {
  const r = (kind: MessageKind, source: MessageSource) => routeMessage({ scoreFirst: true, kind, source });
  for (const kind of KINDS) for (const source of SOURCES) assert.equal(r(kind, source).panel, 'panel-silent', `${kind}/${source}`);
  for (const source of SOURCES) assert.deepEqual(r('error', source).score, { persistence: 'until-next-draw' }, `error/${source}`);
  for (const source of SOURCES) assert.deepEqual(r('success', source).score, { persistence: 'transient' }, `success/${source}`);
  assert.deepEqual(r('info', 'llm').score, { persistence: 'transient' });
  assert.deepEqual(r('info', 'stale').score, { persistence: 'transient' });
  assert.equal(r('info', 'notice').score, null, 'a plain info line is panel-only');
});

test('classifyMessageSource: LLM activity, out-of-date notes, everything else', () => {
  for (const t of ['Forge: /generate needed 3 attempts to produce parseable output.', 'Forge: generating a Recipe…', 'the LLM refused']) assert.equal(classifyMessageSource(t), 'llm', t);
  for (const t of ['bar_002 is out of date', 'the Python is stale', 'bar_003 changed because its parent changed']) assert.equal(classifyMessageSource(t), 'stale', t);
  for (const t of ['Forge: vault updated.', 'Copied!', 'Note creation failed: name is required.', '']) assert.equal(classifyMessageSource(t), 'notice', t);
});

test('the unread counter behind "Forge log (N)": bump counts, markOpened resets and tells listeners once, a reset at zero is silent, unsubscribe works', () => {
  const d = new MessageDelivery(); const seen: number[] = [];
  const off = d.onUnread((n) => seen.push(n));
  d.bump(); d.bump(); assert.equal(d.unreadCount(), 2);
  d.markOpened(); d.markOpened();
  assert.deepEqual(seen, [1, 2, 0], 'the second reset at zero told nobody');
  off(); d.bump(); assert.deepEqual(seen, [1, 2, 0]);
});

test('entries made while the panel does not exist are kept IN ORDER and replayed once into it; the replay empties the backlog', () => {
  const d = new MessageDelivery(); const calls: string[] = [];
  const sink = d.bufferedSink();
  sink.appendMessage('Forge', 'one', 'info'); sink.appendError('bar', 'two', 'stdout'); sink.previewDataSnippet('d', 'text/csv', 'a,b', 'x.md');
  assert.equal(d.backlogSize(), 3); assert.equal(d.unreadCount(), 3);
  const real: any = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => { calls.push(`${name}(${a.join(',')})`); } });
  assert.equal(d.drain(real), 3);
  assert.deepEqual(calls, ['appendMessage(Forge,one,info)', 'appendError(bar,two,stdout)', 'previewDataSnippet(d,text/csv,a,b,x.md)']);
  assert.equal(d.backlogSize(), 0); assert.equal(d.drain(real), 0, 'nothing is replayed twice');
});

test('the buffered sink answers to all eight methods the plugin\'s callers use', () => {
  const d = new MessageDelivery(); const sink: any = d.bufferedSink();
  for (const m of ['append', 'appendError', 'appendForgeError', 'appendMessage', 'appendLlmRecipeRejection', 'appendSlotCacheNotFound', 'previewBinarySnippet', 'previewDataSnippet']) {
    assert.equal(typeof sink[m], 'function', m); sink[m]('x');
  }
  assert.equal(d.backlogSize(), 8);
});

test('the backlog keeps the newest BACKLOG_CAP entries (a long session cannot grow it without bound); a failing replay does not stop the others', () => {
  const d = new MessageDelivery();
  for (let i = 0; i < BACKLOG_CAP + 5; i++) d.stash((s) => { s.appendMessage('Forge', String(i), 'info'); });
  assert.equal(d.backlogSize(), BACKLOG_CAP);
  const got: string[] = [];
  const real: any = { appendMessage: (_id: string, t: string) => { if (t === '5') throw new Error('boom'); got.push(t); } };
  const origErr = console.error; console.error = () => {};
  try { d.drain(real); } finally { console.error = origErr; }
  assert.equal(got[0], '6', 'the five oldest were dropped (0-4); entry 5 threw and was skipped');
  assert.equal(got.at(-1), String(BACKLOG_CAP + 4));
});

test('messages to the Score: listeners get them, unsubscribe stops them; "Forge log" calls whatever the plugin registered, and nothing when nothing was', () => {
  const d = new MessageDelivery(); const seen: string[] = []; let opened = 0;
  const off = d.onScoreMessage((m) => seen.push(m.text));
  d.postToScore({ text: 'a', kind: 'error', line: { persistence: 'until-next-draw' } }); off(); d.postToScore({ text: 'b', kind: 'info', line: { persistence: 'transient' } });
  assert.deepEqual(seen, ['a']);
  d.openForgeLog(); d.setOpenLog(() => { opened++; }); d.openForgeLog(); assert.equal(opened, 1);
});

test('P3 audit: for EVERY vault the plugin ships, the vault\'s real forge.toml yields scoreFirst=false and every message of every kind and source routes "panel-reveal"; non-vacuity: the playground\'s forge.toml flips it', () => {
  const vaultsDir = path.join(ROOT, 'assets/vaults');
  const vaults = fs.readdirSync(vaultsDir).filter((d) => fs.existsSync(path.join(vaultsDir, d, 'forge.toml')));
  assert.ok(vaults.length >= 3, `found the shipped vaults (${vaults.join(', ')})`);
  for (const v of vaults) {
    const scoreFirst = isScoreFirstToml(fs.readFileSync(path.join(vaultsDir, v, 'forge.toml'), 'utf8'));
    assert.equal(scoreFirst, false, v);
    for (const kind of KINDS) for (const source of SOURCES) assert.equal(routeMessage({ scoreFirst, kind, source }).panel, 'panel-reveal', `${v} ${kind}/${source}`);
  }
  const playground = isScoreFirstToml(fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8'));
  assert.equal(playground, true);
  assert.equal(routeMessage({ scoreFirst: playground, kind: 'info', source: 'notice' }).panel, 'panel-silent');
});
