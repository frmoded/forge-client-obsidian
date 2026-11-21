// 2026-11-21-1012 item 3 (CCQA N3): Verovio logs the same engraving warning ("Justification is highly compressed", "System full width", "Non-justifiable width", "Drawing justifiable width") for every system of every render: 300+ lines in five minutes with
// DevTools docked and a narrow Score pane. The console keeps the FIRST line of a kind as it is, counts the repeats, and says them as one line with a count when the window ends; every other line passes through untouched. The engraving itself is not changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ENGRAVING_WARNING, createWarningCollapser, installEngravingWarningFilter } from './engraving-warnings-core.ts';

function clock() { let t = 0; const timers: Array<{ at: number; fn: () => void }> = []; return { now: () => t, setTimer: (fn: () => void, ms: number) => { timers.push({ at: t + ms, fn }); return timers.length; }, clearTimer: () => {}, advance(ms: number) { t += ms; for (const x of timers.filter((y) => y.at <= t)) { timers.splice(timers.indexOf(x), 1); x.fn(); } } }; }

test('the four engraving warnings are recognised (with a number or a system name in them); other lines are not', () => {
  for (const m of ['[Warning] Justification is highly compressed (0.42)', 'System full width 1234', 'Non-justifiable width: 77', 'Drawing justifiable width = 3.5', '[Warning] Justification is highly compressed in system 3']) assert.match(m, ENGRAVING_WARNING, m);
  for (const m of ['[Warning] Something else', 'forge: hello', 'Justification', '']) assert.doesNotMatch(m, ENGRAVING_WARNING, m);
});
test('300 repeats of one warning in a window: the first passes, the 299 are counted, ONE summary line with the count is printed when the window ends; the next one after that passes again', () => {
  const c = clock(); const out: string[] = []; const k = createWarningCollapser({ print: (l) => out.push(l), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, windowMs: 10_000 });
  const passed: boolean[] = []; for (let i = 0; i < 300; i++) { passed.push(!k.handle(`[Warning] Justification is highly compressed (${i})`)); c.advance(10); }
  assert.equal(passed.filter(Boolean).length, 1, 'only the first is let through'); assert.deepEqual(out, []);
  c.advance(10_000); assert.equal(out.length, 1); assert.equal(out[0], '[forge-verovio] 299 more of: [Warning] Justification is highly compressed (N) (in the last 13 s)', 'the window runs from the first line (t=0) to the end (t=13 s)');
  assert.equal(k.handle('[Warning] Justification is highly compressed (5)'), false, 'a new window: the next one is shown again');
});
test('the default window is 10 seconds', () => {
  const c = clock(); const out: string[] = []; const k = createWarningCollapser({ print: (l) => out.push(l), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  k.handle('System full width 1'); k.handle('System full width 2'); c.advance(9_999); assert.deepEqual(out, []); c.advance(1); assert.deepEqual(out, ['[forge-verovio] 1 more of: System full width N (in the last 10 s)']);
});
test('different warnings are counted separately (the number in the text does not make a new kind); a warning that came once has no summary', () => {
  const c = clock(); const out: string[] = []; const k = createWarningCollapser({ print: (l) => out.push(l), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, windowMs: 5_000 }); c.advance(7_000);          // the first line is NOT at t=0: the seconds are a DIFFERENCE
  assert.equal(k.handle('System full width 100'), false); assert.equal(k.handle('System full width 200'), true); assert.equal(k.handle('Non-justifiable width: 3'), false); assert.equal(k.handle('System full width 300'), true);
  c.advance(5_000); assert.deepEqual(out, ['[forge-verovio] 2 more of: System full width N (in the last 5 s)']);
});
test('the console filter: a matching warning is collapsed whichever console method Verovio uses; every other line passes unchanged, in order; installing twice changes nothing; restore puts the console back', () => {
  const c = clock(); const seen: string[] = []; const fake: any = { warn: (...a: unknown[]) => seen.push(`warn:${a.join(' ')}`), error: (...a: unknown[]) => seen.push(`error:${a.join(' ')}`), log: (...a: unknown[]) => seen.push(`log:${a.join(' ')}`), info: (...a: unknown[]) => seen.push(`info:${a.join(' ')}`) };
  const origWarn = fake.warn; const restore = installEngravingWarningFilter(fake, { now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, windowMs: 1000 }); const again = installEngravingWarningFilter(fake, { now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, windowMs: 1000 });
  fake.warn('System full width 1'); fake.error('System full width 2'); fake.log('Drawing justifiable width = 3'); fake.warn('forge: hello', 5); fake.info('unrelated');
  assert.deepEqual(seen, ['warn:System full width 1', 'log:Drawing justifiable width = 3', 'warn:forge: hello 5', 'info:unrelated'], 'the repeat (through error) is swallowed; the first of another kind (through log) passes; other lines are untouched');
  c.advance(1000); assert.deepEqual(seen.slice(4), ['warn:[forge-verovio] 1 more of: System full width N (in the last 1 s)'], 'the summary goes out through the console\'s own warn');
  again(); restore(); assert.equal(fake.warn, origWarn, 'restored');
});
test('WIRING (music edition only): verovio.ts installs the filter before it loads Verovio, and no other source file imports the core (lean never reaches verovio.ts)', () => {
  const src = path.resolve(import.meta.dirname); const verovio = fs.readFileSync(path.join(src, 'verovio.ts'), 'utf8');
  assert.match(verovio, /installEngravingWarningFilter\(console as unknown as Record<string, any>, \{[^\n]*\);[^\n]*\n\s*const verovio: any = await import\('verovio'\);/);
  const importers = fs.readdirSync(src).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && f !== 'engraving-warnings-core.ts' && /engraving-warnings-core/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(importers, ['verovio.ts']);
});
test('the console filter, the edges: every one of log / info / warn / error is wrapped; a console without some of them is not given them; a console with no warn prints the summary through log; arguments are joined with a space and an object is read as text; installing twice leaves the first wrapper in place; restoring lets it be installed again', () => {
  const c = clock(); const mk = (methods: string[]) => { const seen: string[] = []; const f: any = {}; for (const m of methods) f[m] = (...a: unknown[]) => seen.push(`${m}:${a.join(' ')}`); return { f, seen }; };
  const ports = { now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, windowMs: 1000 };
  const all = mk(['log', 'info', 'warn', 'error']); installEngravingWarningFilter(all.f, ports);
  for (const m of ['log', 'info', 'warn', 'error']) { all.f[m]('Non-justifiable width: 1'); }
  assert.deepEqual(all.seen, ['log:Non-justifiable width: 1'], 'the first line of the kind passes (whichever method), the three repeats through the other methods are counted');
  c.advance(1000); assert.deepEqual(all.seen.slice(1), ['warn:[forge-verovio] 3 more of: Non-justifiable width: N (in the last 1 s)']);
  const some = mk(['warn']); installEngravingWarningFilter(some.f, ports); assert.deepEqual(Object.keys(some.f).filter((k) => !k.startsWith('__')), ['warn'], 'info and log are not made up');
  const noWarn = mk(['log']); installEngravingWarningFilter(noWarn.f, ports); noWarn.f.log('System full width 1'); noWarn.f.log('System full width 2'); c.advance(1000); assert.match(noWarn.seen[1], /^log:\[forge-verovio\] 1 more of: System full width N/);
  const j = mk(['warn']); installEngravingWarningFilter(j.f, ports); j.f.warn('System full', 'width 7'); j.f.warn({ toString: () => 'System full width 8' }); assert.deepEqual(j.seen, ['warn:System full width 7'], 'joined with a space; an object is read through its text');
  const once = mk(['warn']); const first = installEngravingWarningFilter(once.f, ports); const wrapped = once.f.warn; installEngravingWarningFilter(once.f, ports); assert.equal(once.f.warn, wrapped, 'the second install changes nothing');
  first(); assert.equal(once.f.__forgeEngravingWarningFilter, undefined); const again = installEngravingWarningFilter(once.f, ports); assert.notEqual(once.f.warn, wrapped); again();
});
