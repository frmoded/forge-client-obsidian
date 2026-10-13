// Drain 2026-10-13-2100 §4 — the two console lines that separate "the first hammer click never ran" from "it waited for the engine".
//
// Driver report (CCQA, 2026-10-12): the FIRST hammer click in a freshly reloaded window does nothing visible. forgeSnippet returns
// WITH a notice when there is no active markdown view, so a silent no-op is not that branch; what it does first is
// `await view.save()` and `await hostManager.getInstance()` (the Pyodide engine boot) with no feedback — seconds on a cold window —
// or the click handler is bound to a not-yet-usable view. One look at DevTools on the next occurrence tells which:
//     [Forge] hammer click received  {file}        ← absent = the click never reached forgeSnippet
//     [Forge] pre-flight done  <n> ms              ← large n = it waited for the engine
//
// This pins the MECHANISM (the lines exist, in this order, at these points in forgeSnippet). forgeSnippet needs Obsidian, so it cannot
// be called here; if the method is restructured, reassess the placement rather than just rewriting the pin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const start = main.indexOf('private async forgeSnippet()');
const method = strip(main.slice(start, main.indexOf('private async', start + 20)));

const at = (needle: RegExp | string) => {
  const i = typeof needle === 'string' ? method.indexOf(needle) : method.search(needle);
  assert.ok(i >= 0, `forgeSnippet must contain ${needle}`);
  return i;
};

test('the click line is the FIRST thing forgeSnippet does — before the active-view check that can return silently', () => {
  const click = at(/console\.log\(\s*'\[Forge\] hammer click received'/);
  assert.ok(click < at('const view = this.app.workspace.getActiveViewOfType'), 'logged before the view lookup');
  assert.ok(click < at("this.notice('No active note to forge.')"));
});

test('the click line says whether there was an active file, and which', () => {
  assert.match(method, /\[Forge\] hammer click received',\s*\{[^}]*file:/);
});

test('the pre-flight line comes after the engine boot + MEMFS sync block and before routing, and carries elapsed milliseconds', () => {
  const done = at(/console\.log\(\s*'\[Forge\] pre-flight done'/);
  assert.ok(done > at("'forgeSnippet: pre-flight disk→MEMFS sync failed'"), 'after the pre-flight try/catch');
  assert.ok(done < at('decideForgeRouting('), 'before routing dispatch');
  assert.match(method, /\[Forge\] pre-flight done',\s*Date\.now\(\) - clickedAt,\s*'ms'/, 'elapsed since the click, in ms');
});

test('the elapsed time is measured from the click, not from some later point', () => {
  assert.match(method, /const clickedAt = Date\.now\(\)/);
  assert.ok(at(/const clickedAt = Date\.now\(\)/) < at(/console\.log\(\s*'\[Forge\] hammer click received'/) + 200);
});

test('these are console.log (a signal), not console.error (reserved for caught runtime errors)', () => {
  assert.doesNotMatch(method, /console\.(error|warn)\(\s*'\[Forge\] (hammer|pre-flight)/);
});
