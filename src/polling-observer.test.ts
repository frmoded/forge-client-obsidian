// 2026-11-19-0998 - src/test-support/polling-observer.ts, the MutationObserver stand-in of the happy-dom tests that mount a module with an observer.
//   1. what it supports: childList (direct and subtree), attributes (with attributeFilter), characterData; records that carry the added / removed nodes; takeRecords; disconnect; a change made inside the callback is reported again, as a real observer would
//   2. MECHANISM PIN (0998): the cause is still there - happy-dom's own observer loses its delivery after a garbage collection (it hands the page only a WeakRef to its report function), and the polling observer does not; when happy-dom fixes it upstream the first
//      half goes red and says the helper can be retired
//   3. MECHANISM PIN (0998): the one helper is the only polling observer in the test tree (a second copy would drift)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import v8 from 'node:v8';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { PollingObserver, installPollingObserver, settle } from './test-support/polling-observer.ts';

function page() { const win: any = new Window({ url: 'http://localhost/' }); const doc = win.document; const host = doc.createElement('div'); doc.body.appendChild(host); return { win, doc, host: host as any }; }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 1. what it supports ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('installPollingObserver gives the window the polling observer (the page code reads doc.defaultView.MutationObserver)', () => {
  const { win, doc } = page();
  assert.notEqual(win.MutationObserver, PollingObserver);
  installPollingObserver(win);
  assert.equal(doc.defaultView.MutationObserver, PollingObserver);
});

test('childList: a child added to the observed node is reported ASYNCHRONOUSLY, once, with the added node in the record; a removal reports the removed node', async () => {
  const { host, doc } = page(); const seen: any[] = [];
  const o = new PollingObserver((records) => seen.push(...records)); o.observe(host, { childList: true });
  const p = doc.createElement('p'); host.appendChild(p);
  assert.equal(seen.length, 0, 'not synchronously');
  await settle(() => seen.length > 0);
  assert.equal(seen.length, 1); assert.equal(seen[0].type, 'childList'); assert.equal(seen[0].target, host); assert.deepEqual(seen[0].addedNodes, [p]); assert.deepEqual(seen[0].removedNodes, []);
  host.removeChild(p); await settle(() => seen.length > 1);
  assert.equal(seen.length, 2); assert.deepEqual(seen[1].removedNodes, [p]);
  await wait(15); assert.equal(seen.length, 2, 'nothing more without another change');
  o.disconnect();
});

test('childList without subtree ignores a grandchild; with subtree it reports it, and its record names the parent', async () => {
  const { host, doc } = page(); const child = doc.createElement('div'); host.appendChild(child);
  const flat: any[] = []; const deep: any[] = [];
  const a = new PollingObserver((r) => flat.push(...r)); a.observe(host, { childList: true });
  const b = new PollingObserver((r) => deep.push(...r)); b.observe(host, { childList: true, subtree: true });
  const grand = doc.createElement('span'); child.appendChild(grand);
  await settle(() => deep.length > 0); await wait(15);
  assert.equal(flat.length, 0, 'not subtree: a grandchild is not seen');
  assert.equal(deep.length, 1); assert.equal(deep[0].target, child); assert.deepEqual(deep[0].addedNodes, [grand]);
  a.disconnect(); b.disconnect();
});

test('a reorder of the children is a change too (the chat panel moves its panel to the end)', async () => {
  const { host, doc } = page(); const a = doc.createElement('i'), b = doc.createElement('b'); host.appendChild(a); host.appendChild(b);
  let n = 0; const o = new PollingObserver(() => { n++; }); o.observe(host, { childList: true });
  host.appendChild(a); await settle(() => n > 0);
  assert.equal(n, 1); o.disconnect();
});

test('attributes: a changed attribute is reported (on the target; on a descendant only with subtree); attributeFilter keeps the others quiet', async () => {
  const { host, doc } = page(); const child = doc.createElement('div'); host.appendChild(child); host.setAttribute('data-a', '1');
  const own: any[] = []; const deep: any[] = []; const filtered: any[] = [];
  const o1 = new PollingObserver((r) => own.push(...r)); o1.observe(host, { attributes: true });
  const o2 = new PollingObserver((r) => deep.push(...r)); o2.observe(host, { attributes: true, subtree: true });
  const o3 = new PollingObserver((r) => filtered.push(...r)); o3.observe(host, { attributeFilter: ['data-b'] });
  host.setAttribute('data-a', '2'); child.setAttribute('class', 'x');
  await settle(() => own.length > 0 && deep.length > 1); await wait(15);
  assert.equal(own.length, 1); assert.equal(own[0].type, 'attributes'); assert.equal(own[0].target, host);
  assert.deepEqual(deep.map((r) => r.target).sort((x, y) => (x === host ? -1 : y === host ? 1 : 0)), [host, child]);
  assert.equal(filtered.length, 0, 'data-a is not in the filter');
  host.setAttribute('data-b', 'y'); await settle(() => filtered.length > 0);
  assert.equal(filtered.length, 1);
  o1.disconnect(); o2.disconnect(); o3.disconnect();
});

test('characterData: a changed text node is reported', async () => {
  const { host, doc } = page(); const t = doc.createTextNode('one'); host.appendChild(t);
  const seen: any[] = []; const o = new PollingObserver((r) => seen.push(...r)); o.observe(host, { characterData: true, subtree: true });
  t.data = 'two'; await settle(() => seen.length > 0);
  assert.equal(seen.length, 1); assert.equal(seen[0].type, 'characterData'); assert.equal(seen[0].target, t); o.disconnect();
});

test('observe() needs a target and at least one of childList, attributes, characterData (as the real one throws)', () => {
  const { host } = page(); const o = new PollingObserver(() => {});
  assert.throws(() => o.observe(null as any, { childList: true }), TypeError);
  assert.throws(() => o.observe(host, {}), TypeError);
  assert.throws(() => o.observe(host, { subtree: true }), TypeError);
});

test('takeRecords hands over what changed and not yet delivered (and the callback then has nothing); disconnect stops every report', async () => {
  const { host, doc } = page(); let n = 0; const o = new PollingObserver(() => { n++; }); o.observe(host, { childList: true });
  host.appendChild(doc.createElement('p'));
  const taken = o.takeRecords(); assert.equal(taken.length, 1); assert.equal(taken[0].type, 'childList');
  await wait(15); assert.equal(n, 0, 'taken records are not delivered again');
  o.takeRecords(); host.appendChild(doc.createElement('p')); o.disconnect(); await wait(15);
  assert.equal(n, 0, 'disconnected: no report'); assert.deepEqual(o.takeRecords(), []);
});

test('a change the callback itself makes is seen on the next look and reported again (as a real observer does); a callback that settles ends the loop', async () => {
  const { host, doc } = page(); let calls = 0;
  const o = new PollingObserver(() => { calls++; const last = host.lastChild; if (last && last.nodeName !== 'HR') host.appendChild(doc.createElement('hr')); });
  o.observe(host, { childList: true });
  host.appendChild(doc.createElement('p'));
  await settle(() => calls >= 2); await wait(20);
  assert.equal(calls, 2, 'the p, then the hr the callback added; then quiet');
  o.disconnect();
});

test('a fake clock in the page code does not freeze it: the observer runs on the REAL timers captured when the module loaded', async () => {
  const { host, doc } = page(); let n = 0; const o = new PollingObserver(() => { n++; }); o.observe(host, { childList: true });
  const saved = { si: globalThis.setInterval, st: globalThis.setTimeout };
  (globalThis as any).setInterval = () => 0; (globalThis as any).setTimeout = (fn: () => void) => 0;
  try { host.appendChild(doc.createElement('p')); await new Promise<void>((resolve) => { saved.st(resolve, 30); }); } finally { globalThis.setInterval = saved.si; globalThis.setTimeout = saved.st; }
  assert.equal(n, 1); o.disconnect();
});

// ---- 2. MECHANISM PIN: the cause ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('MECHANISM PIN (0998): happy-dom\'s own observer loses its delivery after a garbage collection (a WeakRef to its report function); the polling observer keeps it', async () => {
  v8.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc') as () => void;
  const src = fs.readFileSync(new URL('../node_modules/happy-dom/lib/mutation-observer/MutationObserverListener.js', import.meta.url), 'utf8');
  assert.match(src, /callback: new WeakRef\(\(record\) => this\.report\(record\)\)/, 'happy-dom still hands the page a WeakRef to its report function: the helper is still needed (if this fails, happy-dom changed: retire the helper and its installs)');
  const run = async (install: boolean): Promise<number> => {
    const { win, doc, host } = page(); if (install) installPollingObserver(win);
    let n = 0; const o = new win.MutationObserver(() => { n++; }); o.observe(host, { childList: true });
    await wait(5); gc(); await wait(5); gc();
    host.appendChild(doc.createElement('p')); await wait(30);
    o.disconnect(); return n;
  };
  assert.equal(await run(false), 0, 'happy-dom\'s observer: the change after the collection was never reported');
  assert.equal(await run(true), 1, 'the polling observer: reported');
});

// ---- 3. MECHANISM PIN: one helper ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('MECHANISM PIN (0998): the polling observer is defined ONCE (src/test-support/polling-observer.ts); no test file carries its own copy', () => {
  const dir = new URL('./', import.meta.url);
  const own = fs.readdirSync(dir).filter((f) => f.endsWith('.test.ts') && f !== 'polling-observer.test.ts').filter((f) => /class\s+\w*Polling\w*Observer|win\.MutationObserver\s*=/.test(fs.readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(own, [], 'a test file defines its own observer stand-in or assigns win.MutationObserver itself: use installPollingObserver(win) from src/test-support/polling-observer.ts');
  const helper = fs.readFileSync(new URL('./test-support/polling-observer.ts', dir), 'utf8');
  assert.equal((helper.match(/export class PollingObserver/g) ?? []).length, 1);
});
