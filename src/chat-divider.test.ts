// 2026-11-18 (0935) - the draggable divider between the dialog (left) and the Score (right) of a music tab in the two-column layout. happy-dom: the handle (role, aria, keyboard, double-click, pointer events with capture stubbed), the CSS variable,
// the stacked layout without any trace of it, the saving on release only, and P3 (a tab that is not two columns is byte-for-byte what it was). The real-Chrome drag with a real Verovio Score: scripts/dev/measure-divider.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { memoryStore, settingsStore } from './dialog-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const win: any = new Window({ url: 'http://localhost/' });
const BOX = { placeholder: 'x', preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const mk = (width = 0): HTMLElement => { const h = win.document.createElement('div'); win.document.body.appendChild(h); if (width) Object.defineProperty(h, 'clientWidth', { configurable: true, get: () => width }); return h; };
const handleOf = (host: HTMLElement): HTMLElement | null => host.querySelector('.forge-chat-resizer');
const key = (el: HTMLElement, k: string): KeyboardEvent => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
const ptr = (el: HTMLElement, type: string, x: number, id = 1): Event => { const e = new win.MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true }); Object.defineProperty(e, 'pointerId', { value: id }); el.dispatchEvent(e); return e; };
const stubCapture = (el: HTMLElement): { captured: number[]; released: number[] } => { const log = { captured: [] as number[], released: [] as number[] }; (el as any).setPointerCapture = (id: number) => { log.captured.push(id); }; (el as any).releasePointerCapture = (id: number) => { log.released.push(id); }; return log; };
const left = (host: HTMLElement): string => host.style.getPropertyValue('--forge-chat-left');
const countingStore = (r?: number) => { const base = memoryStore(); let ratio = r ?? 0.4; const writes: number[] = []; return { writes, store: { ...base, ratio: () => ratio, setRatio: (n: number) => { ratio = n; writes.push(n); } } }; };

test('the handle exists only in the two-column layout: role separator, vertical, focusable, a name through a hidden span (no aria-label, no title), aria-value* in percent of the left column', () => {
  const host = mk(1100); const h = mountChatPanel(host, { box: BOX, store: memoryStore() }, '');
  const el = handleOf(host)!; assert.ok(el, 'a handle in a wide tab');
  assert.equal(el.getAttribute('role'), 'separator'); assert.equal(el.getAttribute('aria-orientation'), 'vertical'); assert.equal(el.getAttribute('tabindex'), '0');
  assert.equal(el.getAttribute('aria-valuenow'), '40');
  assert.equal(el.getAttribute('aria-valuemin'), String(Math.ceil(28000 / 1100))); assert.equal(el.getAttribute('aria-valuemax'), String(Math.floor((1 - 320 / 1100) * 100)));
  assert.equal(el.getAttribute('aria-label'), null); assert.equal(el.getAttribute('title'), null);
  const name = win.document.getElementById(el.getAttribute('aria-labelledby')!); assert.match(name.textContent, /Resize the dialog and the Score/); assert.ok(name.classList.contains('forge-sr-only'));
  assert.equal(left(host), '40%', 'the variable the CSS reads');
  h.dispose(); assert.equal(handleOf(host), null);
});
test('keyboard: Right/Left move 2 points (stored, clamped by the pixel limits), Home resets to 40; aria-valuenow follows; the keys are consumed', () => {
  const host = mk(1100); const { store, writes } = countingStore(); const h = mountChatPanel(host, { box: BOX, store }, ''); const el = handleOf(host)!;
  assert.equal(key(el, 'ArrowRight').defaultPrevented, true);
  assert.equal(el.getAttribute('aria-valuenow'), '42'); assert.equal(left(host), '42%'); assert.deepEqual(writes.map((n) => Math.round(n * 100)), [42]);
  key(el, 'ArrowLeft'); key(el, 'ArrowLeft'); assert.equal(el.getAttribute('aria-valuenow'), '38');
  for (let i = 0; i < 30; i++) key(el, 'ArrowLeft');
  assert.equal(Math.round(parseFloat(left(host)) * 1100 / 100), 280, 'Left stops at 280 px'); assert.equal(el.getAttribute('aria-valuenow'), el.getAttribute('aria-valuemin'));
  for (let i = 0; i < 60; i++) key(el, 'ArrowRight');
  assert.equal(Math.round((100 - parseFloat(left(host))) * 1100 / 100), 320, 'Right leaves the Score 320 px'); assert.equal(el.getAttribute('aria-valuenow'), el.getAttribute('aria-valuemax'));
  assert.equal(key(el, 'Home').defaultPrevented, true); assert.equal(el.getAttribute('aria-valuenow'), '40'); assert.equal(left(host), '40%'); assert.equal(store.ratio(), 0.4);
  assert.equal(key(el, 'ArrowUp').defaultPrevented, false, 'other keys are left alone'); assert.equal(key(el, 'a').defaultPrevented, false);
  h.dispose();
});
test('double-click resets to the default 0.40 (stored too)', () => {
  const host = mk(1100); const { store } = countingStore(0.6); const h = mountChatPanel(host, { box: BOX, store }, ''); const el = handleOf(host)!;
  assert.equal(left(host), '60%');
  el.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(left(host), '40%'); assert.equal(store.ratio(), 0.4); assert.equal(el.getAttribute('aria-valuenow'), '40'); h.dispose();
});
test('drag with pointer events and capture: the variable follows every move LIVE, the store is written ONCE on release, the capture is taken and let go, a drag class marks the tab meanwhile', () => {
  const host = mk(1100); const { store, writes } = countingStore(); const h = mountChatPanel(host, { box: BOX, store }, ''); const el = handleOf(host)!; const cap = stubCapture(el);
  ptr(el, 'pointerdown', 440, 7);
  assert.deepEqual(cap.captured, [7]); assert.ok(host.classList.contains('forge-chat-dragging'));
  const seen: string[] = [];
  for (const x of [450, 470, 500, 540, 550]) { ptr(el, 'pointermove', x, 7); seen.push(left(host)); }
  assert.deepEqual(seen.map((s) => Math.round(parseFloat(s) * 100)), [10, 30, 60, 100, 110].map((dx) => Math.round((40 + dx / 11) * 100)), 'the left column grows with the pointer (11 px = 1 point of 1100)');
  assert.deepEqual(writes, [], 'nothing is stored while moving');
  ptr(el, 'pointermove', 9, 99); assert.equal(left(host), seen[4], 'another pointer id is ignored');
  ptr(el, 'pointerup', 550, 7);
  assert.deepEqual(writes.map((n) => Math.round(n * 1000)), [500], 'ONE write, at the release'); assert.deepEqual(cap.released, [7]); assert.equal(host.classList.contains('forge-chat-dragging'), false);
  ptr(el, 'pointermove', 700, 7); assert.equal(left(host), seen[4], 'a move after the release changes nothing'); h.dispose();
});
test('drag far left and far right: the pixel limits hold (280 and 320); a cancelled drag goes back to the stored ratio and stores nothing', () => {
  const host = mk(1100); const { store, writes } = countingStore(); const h = mountChatPanel(host, { box: BOX, store }, ''); const el = handleOf(host)!; stubCapture(el);
  ptr(el, 'pointerdown', 440); ptr(el, 'pointermove', -3000); assert.equal(Math.round(parseFloat(left(host)) * 11), 280); ptr(el, 'pointerup', -3000);
  assert.equal(Math.round(store.ratio() * 1100), 280);
  ptr(el, 'pointerdown', 280); ptr(el, 'pointermove', 9000); assert.equal(Math.round((100 - parseFloat(left(host))) * 11), 320); ptr(el, 'pointerup', 9000);
  assert.equal(Math.round((1 - store.ratio()) * 1100), 320);
  const before = writes.length; ptr(el, 'pointerdown', 780); ptr(el, 'pointermove', 400); ptr(el, 'pointercancel', 400);
  assert.equal(writes.length, before, 'cancel stores nothing'); assert.equal(Math.round((100 - parseFloat(left(host))) * 11), 320, 'back to the stored ratio'); assert.equal(host.classList.contains('forge-chat-dragging'), false); h.dispose();
});
test('the stored ratio is applied on open (restored per vault) and re-clamped for display on a narrower tab WITHOUT being overwritten; widening restores it', () => {
  const made: Array<{ cb: (e: unknown[]) => void; target: unknown }> = [];
  win.ResizeObserver = class { rec: any; constructor(cb: any) { this.rec = { cb, target: null }; made.push(this.rec); } observe(t: unknown) { this.rec.target = t; } unobserve() {} disconnect() {} };
  try {
    const host = mk(1400); const { store, writes } = countingStore(0.7); const h = mountChatPanel(host, { box: BOX, store }, ''); const el = handleOf(host)!; const mine = made.find((m) => m.target === host)!;
    assert.equal(left(host), '70%'); assert.equal(el.getAttribute('aria-valuenow'), '70');
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => 900 }); mine.cb([{ contentRect: { width: 900 } }]);
    assert.ok(Math.abs(parseFloat(left(host)) * 9 - 580) < 0.01, 'shown clamped: the Score keeps 320 px'); assert.equal(store.ratio(), 0.7, 'stored untouched'); assert.deepEqual(writes, []);
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => 1400 }); mine.cb([{ contentRect: { width: 1400 } }]);
    assert.equal(left(host), '70%', 'widening restores it'); h.dispose();
  } finally { delete win.ResizeObserver; }
});
test('the stacked layout ignores the ratio: no handle, no variable, no style attribute; wide again restores the handle and the stored ratio; narrow again removes both', () => {
  const made: Array<{ cb: (e: unknown[]) => void; target: unknown }> = [];
  win.ResizeObserver = class { rec: any; constructor(cb: any) { this.rec = { cb, target: null }; made.push(this.rec); } observe(t: unknown) { this.rec.target = t; } unobserve() {} disconnect() {} };
  try {
    const host = mk(700); const { store } = countingStore(0.55); const h = mountChatPanel(host, { box: BOX, store }, ''); const mine = made.find((m) => m.target === host)!;
    assert.equal(handleOf(host), null); assert.equal(left(host), ''); assert.equal(host.hasAttribute('style'), false);
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => 1000 }); mine.cb([{ contentRect: { width: 1000 } }]);
    assert.ok(handleOf(host)); assert.equal(left(host), '55%');
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => 700 }); mine.cb([{ contentRect: { width: 700 } }]);
    assert.equal(handleOf(host), null); assert.equal(left(host), ''); assert.equal(host.hasAttribute('style'), false, 'not even an empty style attribute is left'); assert.equal(store.ratio(), 0.55);
    h.dispose();
  } finally { delete win.ResizeObserver; }
});
test('P3: a stacked tab has byte-for-byte the same DOM with the feature as the panel had before it (same store without a ratio, same markup); dispose leaves the host as it found it', () => {
  const plain = (w: number, withRatio: boolean): { html: string; host: HTMLElement } => {
    const host = mk(w); host.innerHTML = '<div class="score">engraving</div>';
    const store = withRatio ? memoryStore() : (() => { const s: any = memoryStore(); delete s.ratio; delete s.setRatio; return s; })();
    const h = mountChatPanel(host, { box: BOX, store, setTimer: () => 0, clearTimer: () => {} }, '');
    const html = host.outerHTML.replace(/forge-sr-\d+/g, 'forge-sr-N'); h.dispose(); return { html, host };
  };
  const a = plain(700, true), b = plain(700, false);
  assert.equal(a.html, b.html, 'a store that knows the ratio changes nothing in a stacked tab'); assert.doesNotMatch(a.html, /resizer|forge-chat-left|dragging/);
  assert.equal(a.host.innerHTML, '<div class="score">engraving</div>', 'dispose gives the content back'); assert.equal(a.host.className, '');
});
test('the settings store: a new numeric field dialogRatio, default 0.40, sanitised when read (junk = default), written only when set, no other key touched', () => {
  const raw: any = { dialogHeight: 112 }; let saves = 0; const s = settingsStore(raw, () => { saves++; });
  assert.equal(s.ratio(), 0.4); assert.equal('dialogRatio' in raw, false, 'reading never writes');
  s.setRatio(0.55); assert.equal(raw.dialogRatio, 0.55); assert.equal(saves, 1); assert.equal(settingsStore(JSON.parse(JSON.stringify(raw)), () => {}).ratio(), 0.55, 'survives data.json');
  for (const bad of [NaN, 'x', 5, -1, null, 0.05, 0.95]) assert.equal(settingsStore({ dialogRatio: bad }, () => {}).ratio(), 0.4, String(bad));
  s.setRatio(7 as number); assert.equal(raw.dialogRatio, 0.4, 'a number out of range is stored as the default, never as junk');
  assert.equal(memoryStore({ ratio: 0.3 } as any).ratio(), 0.3); assert.equal(memoryStore().ratio(), 0.4); const m = memoryStore(); m.setRatio(0.6); assert.equal(m.ratio(), 0.6);
});
test('the plugin source: no setting in the Settings page, DEFAULT_SETTINGS has dialogRatio 0.4, the CSS reads the variable with the 40 % fallback and styles :focus-visible (no hover), the handle is col-resize', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'src/settings.ts'), 'utf8');
  assert.match(settings, /dialogRatio: 0\.4/); assert.doesNotMatch(settings, /setName\([^)]*(divider|ratio|column)/i);
  assert.match(CSS, /\.forge-chat-host\.forge-chat-wide\s*>\s*\.forge-chat-panel\s*\{[^}]*flex:\s*0 0 var\(--forge-chat-left,\s*40%\)/);
  assert.match(CSS, /\.forge-chat-resizer\s*\{[^}]*cursor:\s*col-resize/); assert.match(CSS, /\.forge-chat-resizer\s*\{[^}]*width:\s*6px/);
  assert.match(CSS, /\.forge-chat-resizer:focus-visible/); assert.doesNotMatch(CSS.slice(CSS.indexOf('.forge-chat-resizer')), /^[^\n]*\.forge-chat-resizer[^\n{]*:hover/m);
});
