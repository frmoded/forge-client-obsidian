// 2026-11-18 (R1) - the music tab looks and feels like Claude's chat: (3) two columns from 900 px of the TAB and the stacked layout below, switching live; (4) a "minutes ago" under every entry, ONE timer per tab, a restored
// log keeps counting, an old entry without a time shows none; (2) your sentence is the gray bubble and nothing else is; (1) no red: both refusal kinds and the composer's error line are plain text with a neutral "!" (the
// computed colours come from the REAL styles.css, mounted in happy-dom; real Chrome numbers: scripts/dev/measure-music-tab-look.mjs); P3: the everywhere surface (the Forge output panel's error entry) is red as before.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { append, fromOutcome, memoryStore, type DialogEntry } from './dialog-core.ts';
import { renderForgeError } from './forge-error-core.ts';
import { installHostClock } from './test-support/host-workspace.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const win: any = new Window({ url: 'http://localhost/' });
const BOX = { placeholder: 'x', preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const T0 = 1_800_000_000_000;

// Obsidian's variables for a light theme (their defaults), and the same set with the error colour as pure red, so a stray `--text-error` would be caught as red
const VARS = ':root { --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#ff0000; --background-primary:#ffffff; --background-secondary:#f0f0f0; --background-modifier-border:#e0e0e0; --interactive-accent:#7b6cd9; }';
const style = win.document.createElement('style'); style.textContent = VARS + CSS; win.document.head.appendChild(style);
const mk = (width = 0): HTMLElement => { const h = win.document.createElement('div'); win.document.body.appendChild(h); if (width) Object.defineProperty(h, 'clientWidth', { configurable: true, get: () => width }); return h; };
const hex = (c: string): [number, number, number] => {
  const m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4), 16)];
  const r = c.match(/[\d.]+/g)?.map(Number); assert.ok(r && r.length >= 3, `a colour: ${c}`); return [r![0]!, r![1]!, r![2]!];
};
/** Is it a RED (hue within 20 degrees of red, clearly saturated)? */
const isRed = (c: string): boolean => {
  const [r, g, b] = hex(c).map((v) => v / 255) as [number, number, number]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.15 || mx < 0.25) return false;
  const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return h <= 20 || h >= 340;
};
const entries = (...evs: Array<[Parameters<typeof fromOutcome>[0], number]>): DialogEntry[] => evs.reduce((l: DialogEntry[], [ev, at]) => append(l, fromOutcome(ev), at), []);

// ---- the red-detector is itself checked (a control) ---------------------------------------------------------------------------------------------------------------------------------------------------
test('CONTROL: the red detector says red for the error colours of Obsidian and not for the greys, the accent or the text colours', () => {
  for (const red of ['#ff0000', '#d0312d', '#fb464c', '#d33333', 'rgb(220, 38, 38)']) assert.equal(isRed(red), true, red);
  for (const not of ['#222222', '#5c5c5c', '#dadada', '#f0f0f0', '#7b6cd9', '#1e1e1e', 'rgb(92, 92, 92)']) assert.equal(isRed(not), false, not);
});

// ---- (3) two columns from 900 px of the TAB -----------------------------------------------------------------------------------------------------------------------------------------------------------
test('(3) the tab width decides: 1100 px = wide (two columns), 700 px = stacked; the class is on the host; dispose takes it away', () => {
  const wide = mk(1100), narrow = mk(700), edge = mk(900), under = mk(899);
  const hs = [wide, narrow, edge, under].map((h) => mountChatPanel(h, { box: BOX, store: memoryStore() }, ''));
  assert.deepEqual(hs.map((h) => h.layout()), ['wide', 'narrow', 'wide', 'narrow']);
  assert.ok(wide.classList.contains('forge-chat-wide') && !wide.classList.contains('forge-chat-stacked'));
  assert.ok(narrow.classList.contains('forge-chat-stacked') && !narrow.classList.contains('forge-chat-wide'));
  hs.forEach((h) => h.dispose());
  for (const h of [wide, narrow, edge, under]) assert.equal(/forge-chat/.test(h.className), false, 'no class left behind');
});
test('(3) the layout follows the tab live, without a reload: a ResizeObserver tells the new width (900 and up = wide, below = stacked), and dispose disconnects it', () => {
  const made: Array<{ cb: (e: unknown[]) => void; target: unknown; gone: boolean }> = [];
  win.ResizeObserver = class { rec: any; constructor(cb: any) { this.rec = { cb, target: null, gone: false }; made.push(this.rec); } observe(t: unknown) { this.rec.target = t; } unobserve() {} disconnect() { this.rec.gone = true; } };
  try {
    const host = mk(1000); const h = mountChatPanel(host, { box: BOX, store: memoryStore() }, '');
    const mine = made.find((m) => m.target === host)!; assert.ok(mine, 'the host is observed');
    assert.equal(h.layout(), 'wide');
    mine.cb([{ contentRect: { width: 640 } }]); assert.equal(h.layout(), 'narrow'); assert.ok(host.classList.contains('forge-chat-stacked'));
    mine.cb([{ contentRect: { width: 899 } }]); assert.equal(h.layout(), 'narrow');
    mine.cb([{ contentRect: { width: 900 } }]); assert.equal(h.layout(), 'wide'); assert.ok(host.classList.contains('forge-chat-wide'));
    mine.cb([{ contentRect: { width: 0 } }]); assert.equal(h.layout(), 'wide', 'a hidden tab (width 0) keeps its layout');
    h.dispose(); assert.equal(mine.gone, true);
  } finally { delete win.ResizeObserver; }
});
test('(3) the dock switch is gone from the plugin: no setting, no dock class, no "Composer position" in the settings tab; the CSS has the two layouts', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'src/settings.ts'), 'utf8');
  assert.doesNotMatch(settings, /dialogDock|Composer position/);
  assert.doesNotMatch(CSS, /forge-chat-dock/);
  assert.match(CSS, /\.forge-chat-host\.forge-chat-wide\s*\{[^}]*flex-direction:\s*row/);
  assert.match(CSS, /\.forge-chat-host\.forge-chat-wide\s*>\s*\.forge-chat-panel\s*\{[^}]*order:\s*1[^}]*flex:\s*0 0 var\(--forge-chat-left,\s*40%\)/);
  assert.match(CSS, /\.forge-chat-host\.forge-chat-wide\s*>\s*\.forge-chat-body\s*\{[^}]*order:\s*2[^}]*flex:\s*1 1 60%/);
});

// ---- (4) "minutes ago" ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const timeOf = (h: HTMLElement): string[] => [...h.querySelectorAll('.forge-chat-time')].map((t: any) => (t.hidden ? '' : t.textContent));
test('(4) every entry (yours and the replies) shows its age under it; the time is stored with the entry; an entry without one shows none and still restores', () => {
  const host = mk(); const h = mountChatPanel(host, { box: BOX, store: memoryStore(), now: () => T0 }, '');
  const l = entries([{ type: 'you', text: 'make it longer' }, T0 - 7 * 60_000 - 5000], [{ type: 'applied', change: 'x', description: 'Longer.' }, T0 - 2 * 3_600_000], [{ type: 'notice', message: 'old' }, T0 - 30 * 3_600_000]);
  l.push({ id: 9, at: 0, kind: 'you', text: 'saved before the time was kept' });
  h.render(l, '');
  assert.deepEqual(timeOf(host), ['7 minutes ago', '2 hours ago', 'yesterday', '']);
  const msgs = [...host.querySelectorAll('.forge-chat-msg')] as HTMLElement[];
  assert.equal(msgs.length, 4); for (const m of msgs) assert.ok(m.querySelector('.forge-chat-meta .forge-chat-time'), 'a time under each entry');
  assert.equal(msgs[0]!.lastElementChild!.className, 'forge-chat-meta', 'the time is the LAST thing of the entry: under it');
  assert.equal(host.querySelector('[title]'), null, 'no native tooltip');
  h.dispose();
});
test('(4) ONE timer per open tab, every 30 s: the labels count on, no timer per entry, it is cleared when the tab closes (the host clock)', async () => {
  const clock = installHostClock(win);
  try {
    const armed: number[] = []; let cleared = 0;
    const host = mk();
    const real = { set: win.setTimeout, clear: win.clearTimeout };
    const h = mountChatPanel(host, { box: BOX, store: memoryStore(), setTimer: (fn, ms) => { armed.push(ms); return real.set(fn, ms); }, clearTimer: (x) => { cleared++; real.clear(x); } }, '');
    assert.deepEqual(armed, [30_000], 'one timer at mount');
    const start = Date.now();
    h.render(entries([{ type: 'you', text: 'a' }, start], [{ type: 'you', text: 'b' }, start], [{ type: 'you', text: 'c' }, start - 59_000]), '');
    assert.deepEqual(armed, [30_000], 'drawing entries starts no timer of its own');
    assert.deepEqual(timeOf(host), ['just now', 'just now', 'just now']);
    await clock.advance(30_000); assert.deepEqual(timeOf(host), ['just now', 'just now', '1 minute ago'], 'after 30 s');
    await clock.advance(30_000); assert.deepEqual(timeOf(host), ['1 minute ago', '1 minute ago', '1 minute ago']);
    await clock.advance(10 * 60_000); assert.deepEqual(timeOf(host), ['11 minutes ago', '11 minutes ago', '11 minutes ago']);
    assert.equal(armed.every((ms) => ms === 30_000), true); assert.equal(cleared, 0);
    const before = armed.length; h.dispose(); assert.equal(cleared, 1, 'the one timer is cleared on close');
    await clock.advance(5 * 60_000); assert.equal(armed.length, before, 'nothing re-arms after the tab closed');
  } finally { clock.restore(); }
});
test('(4) a restored log keeps counting: entries saved with their real time, drawn in a fresh tab 3 hours later, show the right age and then keep counting', async () => {
  const clock = installHostClock(win);
  try {
    const saved = Date.now(); const store = memoryStore({ entries: { 'p.md': entries([{ type: 'you', text: 'old sentence' }, saved], [{ type: 'applied', change: 'x', description: 'Done.' }, saved - 1000]) } });
    await clock.advance(3 * 3_600_000);
    const host = mk(); const h = mountChatPanel(host, { box: BOX, store }, '');
    h.render(store.entries('p.md'), '');
    assert.deepEqual(timeOf(host), ['3 hours ago', '3 hours ago']);
    await clock.advance(60 * 60_000); assert.deepEqual(timeOf(host), ['4 hours ago', '4 hours ago']);
    h.dispose();
  } finally { clock.restore(); }
});
test('(4) CONTROL: without a recount the labels do not move (refreshTimes is what the timer calls)', async () => {
  const clock = installHostClock(win);
  try {
    const host = mk(); const h = mountChatPanel(host, { box: BOX, store: memoryStore(), setTimer: () => 0, clearTimer: () => {} }, '');
    h.render(entries([{ type: 'you', text: 'a' }, Date.now()]), ''); assert.deepEqual(timeOf(host), ['just now']);
    await clock.advance(5 * 60_000); assert.deepEqual(timeOf(host), ['just now'], 'no timer: no recount');
    h.refreshTimes(); assert.deepEqual(timeOf(host), ['5 minutes ago']);
    h.dispose();
  } finally { clock.restore(); }
});

// ---- (2) the gray bubble: your sentence only ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('(2) your sentence is the gray bubble (the background-secondary tone, radius 18, 10 to 14 px padding, right-aligned, at most 80 %); replies and error lines are plain text with no bubble', () => {
  const host = mk(); const h = mountChatPanel(host, { box: BOX, store: memoryStore(), now: () => T0 }, '');
  h.render(entries([{ type: 'you', text: 'make bar_007 longer, a bit slower, and then a very long sentence that has to wrap inside its bubble' }, T0], [{ type: 'applied', change: 'x', description: 'ok' }, T0], [{ type: 'refused', message: 'no' }, T0], [{ type: 'rejected', line: 1, column: 2, message: 'm' }, T0]), '');
  const bg = (el: Element) => win.getComputedStyle(el).backgroundColor;
  const you = host.querySelector('.forge-chat-msg.is-you .forge-chat-text')!;
  const cs = win.getComputedStyle(you);
  assert.equal(bg(you), '#f0f0f0', 'the background-secondary tone (the first, token declaration; color-mix refines it in a browser)');
  assert.equal(cs.borderRadius, '18px'); assert.equal(cs.paddingTop, '10px'); assert.equal(cs.paddingLeft, '14px'); assert.equal(cs.color, '#222222');
  assert.notEqual(bg(you), '#ffffff');
  for (const m of [...host.querySelectorAll('.forge-chat-msg.is-forge')]) { for (const el of [m, m.querySelector('.forge-chat-text')!, m.querySelector('.forge-chat-line')!]) { assert.notEqual(bg(el), '#f0f0f0'); assert.ok(['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(bg(el)), `${m.getAttribute('data-kind')}: no bubble (${bg(el)})`); } }
  assert.equal(host.querySelectorAll('.forge-chat-msg.is-you').length, 1);
  assert.match(CSS, /\.forge-chat-msg\.is-you\s*\{[^}]*align-self:\s*flex-end[^}]*max-width:\s*80%/);
  assert.match(CSS, /\.forge-chat-text\s*\{[^}]*white-space:\s*pre-wrap/, 'wrapped');
  assert.match(CSS, /color-mix\(in srgb, var\(--background-secondary\)/, 'a little deeper than the token where the browser can mix, so it shows on a near-white page');
  h.dispose();
});

// ---- (1) no red ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('(1) the grammar refusal and the service refusal: wording unchanged, a neutral "!" glyph, text in the NORMAL colour (computed from the real styles.css with --text-error set to pure red), the glyph muted, no red border', () => {
  const host = mk(); const h = mountChatPanel(host, { box: BOX, store: memoryStore(), now: () => T0 }, '');
  h.render(entries(
    [{ type: 'rejected', line: 1, column: 7, message: 'expected a bar name' }, T0], [{ type: 'refused', message: 'the plan has no change' }, T0], [{ type: 'failed', message: 'could not write' }, T0], [{ type: 'dropped', message: 'the note changed' }, T0]), '');
  const texts = [...host.querySelectorAll('.forge-chat-text')].map((t) => t.textContent);
  assert.deepEqual(texts, ['The grammar did not accept this sentence (line 1, column 7: expected a bar name).', 'The service refused: the plan has no change', 'Apply failed: could not write', 'Dropped: the note changed']);
  const msgs = [...host.querySelectorAll('.forge-chat-msg')] as HTMLElement[];
  for (const m of msgs.slice(0, 3)) {
    const bang = m.querySelector('.forge-chat-bang') as HTMLElement; assert.ok(bang, `${m.getAttribute('data-kind')}: the neutral "!"`); assert.equal(bang.textContent, '!'); assert.equal(bang.getAttribute('aria-hidden'), 'true');
    assert.equal(bang.nextElementSibling!.className, 'forge-chat-text', 'the glyph comes BEFORE the wording');
    assert.equal(m.querySelector('.forge-chat-text')!.textContent!.includes('!'), false, 'the glyph is not part of the wording');
    const bcs = win.getComputedStyle(bang);
    assert.equal(bcs.color, '#5c5c5c', 'the glyph is the muted colour');
  }
  for (const m of msgs) for (const el of [m, m.querySelector('.forge-chat-text')!, m.querySelector('.forge-chat-line')!, m.querySelector('.forge-chat-bang'), m.querySelector('.forge-chat-time')].filter(Boolean) as Element[]) {
    const cs = win.getComputedStyle(el);
    for (const prop of ['color', 'borderTopColor', 'borderLeftColor', 'borderBottomColor', 'borderRightColor', 'outlineColor']) { const v = cs[prop]; if (v) assert.equal(isRed(v), false, `${m.getAttribute('data-kind')} ${el.className} ${prop}: ${v}`); }
  }
  assert.equal(win.getComputedStyle(msgs[0]!).color, '#222222'); assert.equal(win.getComputedStyle(msgs[1]!).color, '#222222');
  assert.equal(msgs[3]!.querySelector('.forge-chat-bang'), null, 'a plain notice is not an error line');
  h.dispose();
});
test('(1) the composer\'s own error line (under the card) is muted text, not red; the "!" glyph is drawn by the line itself, so the wording the tests and the screen reader read is unchanged', () => {
  const host = mk(); const h = mountChatPanel(host, { box: BOX, store: memoryStore() }, '');
  h.box.setNote('The grammar did not accept this sentence (line 1, column 3: x).');
  const line = host.querySelector('.forge-composer-error') as HTMLElement;
  assert.equal(line.textContent, 'The grammar did not accept this sentence (line 1, column 3: x).');
  const cs = win.getComputedStyle(line); assert.equal(cs.color, '#5c5c5c'); assert.equal(isRed(cs.color), false);
  const rule = CSS.match(/\.forge-composer-error::before\s*\{[^}]*\}/)![0];
  assert.match(rule, /content:\s*"!"/); assert.match(rule, /var\(--text-muted\)/); assert.doesNotMatch(rule, /text-error|red/);
  assert.match(CSS, /\.forge-composer-error\.is-empty::before\s*\{\s*content:\s*none/, 'no glyph on an empty line');
  h.box.setNote(null); assert.ok(line.classList.contains('is-empty'));
  h.dispose();
});

// ---- P3: the everywhere surface keeps its red ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('P3: the Forge output panel (the surface every vault has) still draws an error entry in the error colour, and the music-tab classes live in no file that surface uses', () => {
  const entry = win.document.createElement('div'); entry.className = 'forge-output-entry'; win.document.body.appendChild(entry);
  const adapt = (el: any): any => ({ addClass: (c: string) => el.classList.add(c), createEl: (tag: string, o?: { text?: string; cls?: string }) => { const c = win.document.createElement(tag); if (o?.cls) c.className = o.cls; if (o?.text) c.textContent = o.text; el.appendChild(c); return adapt(c); } });
  renderForgeError(adapt(entry), { cause: 'The engine failed', suggested_fix: 'Check the recipe.' } as any);
  assert.ok(entry.classList.contains('is-error'));
  const cause = entry.querySelector('.forge-output-error')!;
  assert.equal(win.getComputedStyle(cause).color, '#ff0000', 'the error cause is still --text-error');
  assert.equal(win.getComputedStyle(entry).borderLeftColor, '#ff0000', 'and so is the entry\'s left border');
  assert.equal(isRed(win.getComputedStyle(cause).color), true, 'non-vacuity: the detector sees this one as red');
  // opt-in: the shared look is reachable only through the score-first panel (description-apply.ts mounts it; score-first.ts is its only gate)
  const users = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\.generated\.ts$/.test(f)).filter((f) => /forge-chat-|forge-composer-error|mountChatPanel|chat-panel-dom|chat-layout-core/.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  assert.deepEqual(users.sort(), ['chat-divider-dom.ts', 'chat-layout-core.ts', 'chat-panel-dom.ts', 'description-apply.ts', 'dialog-core.ts', 'live-score-dom.ts', 'main.ts', 'prompt-box-dom.ts', 'relative-time-core.ts'], 'only the chat panel, its layout core, the prompt box, the controller that mounts it, the settings migration, the Score area (it looks for the panel\'s scroller, null-safe) and a comment');
  // and none of the everywhere-surface rules was touched: the red rules of the output panel and the Score message line are still there
  assert.match(CSS, /\.forge-output-entry\.is-error\s*\{\s*border-left-color:\s*var\(--text-error/);
  assert.match(CSS, /\.forge-output-error\s*\{[^}]*color:\s*var\(--text-error/);
  assert.match(CSS, /\.forge-rhythm-score-message\.is-error\s*\{\s*color:\s*var\(--text-error\)/);
});
