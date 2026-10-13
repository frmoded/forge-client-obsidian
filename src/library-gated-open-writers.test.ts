// Drain 2026-10-14-0900 §2 — opening a bundled-library note writes NOTHING.
//
// `maybeStampTypedLetsInputs` always returned early for a note under a bundled-library directory (those notes are read-only from the
// cohort's side). The file-open backfill and the layout-ready sweep did not, so merely opening a library note inserted a stub
// `# Python` and stamped hashes — 58 of 82 shipped action notes (measured by scripts/check-open-time-writes.mjs).
//
// This pins the MECHANISM, shape-independently (I28): it does not look for one spelling of the gate in two named methods; it finds
// EVERY method reachable from a `file-open` registration or the layout-ready sweep and asserts that any of them that can WRITE
// the vault carries `isInBundledLibraryDir`. A future open-time writer added without the gate goes red here. If main.ts is
// restructured so the call graph moves, this SHOULD go red — reassess the walk, don't just rewrite the expectation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// block comments only where they START a line: a `/*` inside a string or glob (`'**/*.md'`) must not swallow half the file.
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
const main = strip(fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8'));

/** Source text of `[private|public] [async] name(...) {…}` — balanced-brace walk from the method's opening brace. */
function methodBody(name: string): string | null {
  const m = new RegExp(`\\n  (?:private |public )?(?:async )?${name}\\(`).exec(main);
  if (!m) return null;
  let i = main.indexOf('{', main.indexOf(')', m.index));
  let depth = 0;
  const start = i;
  for (; i < main.length; i++) {
    if (main[i] === '{') depth++;
    else if (main[i] === '}') { depth--; if (depth === 0) return main.slice(start, i + 1); }
  }
  return null;
}

const WRITE = /\b(guardedWrite|guardedProcessFrontMatter|guardedVaultModify|processFrontMatter)\(|vault\.(modify|process|create)\(|adapter\.write\(/;

/** Method names invoked as `this.NAME(` inside `text`. */
const calledMethods = (text: string) => [...new Set([...text.matchAll(/this\.([A-Za-z_]\w*)\(/g)].map((m) => m[1]))];

/** The text of each `workspace.on('file-open', …)` call — a balanced-paren walk, so a multi-line handler is taken whole. */
function fileOpenRegistrations(): string[] {
  const out: string[] = [];
  const re = /workspace\.on\('file-open'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(main)) !== null) {
    let i = main.indexOf('(', m.index);
    let depth = 0;
    const start = i;
    for (; i < main.length; i++) {
      if (main[i] === '(') depth++;
      else if (main[i] === ')') { depth--; if (depth === 0) { out.push(main.slice(start, i + 1)); break; } }
    }
  }
  return out;
}
const fileOpenHandlers = fileOpenRegistrations();

test('the walk finds the open-time handlers (non-vacuity)', () => {
  assert.ok(fileOpenHandlers.length >= 4, `expected the file-open registrations, found ${fileOpenHandlers.length}`);
  const roots = new Set(fileOpenHandlers.flatMap(calledMethods));
  for (const expected of ['maybeBackfillV113Shape', 'maybeStampTypedLetsInputs']) {
    assert.ok(roots.has(expected), `${expected} must be reachable from a file-open registration`);
  }
  assert.notEqual(methodBody('seedSourceFacetForOpenFiles'), null);
});

test('EVERY method reachable from file-open / the layout-ready sweep that can write the vault is library-gated', () => {
  const sweep = methodBody('seedSourceFacetForOpenFiles')!;
  const roots = new Set([...fileOpenHandlers.flatMap(calledMethods), 'seedSourceFacetForOpenFiles', ...calledMethods(sweep)]);
  const writers: string[] = [];
  const ungated: string[] = [];
  for (const name of roots) {
    const body = methodBody(name);
    if (body === null) continue;                       // not a method of this class (a helper import, a closure)
    if (name.startsWith('guarded')) continue;          // the write PRIMITIVES themselves, not open-time writers
    if (!WRITE.test(body)) continue;                   // reads / in-memory only: nothing to gate
    writers.push(name);
    if (!/isInBundledLibraryDir\(/.test(body)) ungated.push(name);
  }
  assert.ok(writers.includes('maybeBackfillV113Shape') && writers.includes('maybeStampTypedLetsInputs') && writers.includes('seedSourceFacetForOpenFiles'),
    `the three known open-time writers must be recognised as writers, got ${JSON.stringify(writers)}`);
  assert.deepEqual(ungated, [], 'an open-time writer without the bundled-library gate rewrites library notes the moment they are opened');
});

test('the backfill checks the gate BEFORE the dedup Set records the file (L37: the Set must only hold files actually considered)', () => {
  const body = methodBody('maybeBackfillV113Shape')!;
  const gate = body.search(/isInBundledLibraryDir\(/);
  const add = body.search(/_v113BackfillSeen\.add\(/);
  assert.ok(gate >= 0 && add >= 0);
  assert.ok(gate < add);
});

test('the sweep keeps the in-memory hash cache for a library note (a deliberate edit still needs a baseline) but never WRITES it', () => {
  const body = methodBody('seedSourceFacetForOpenFiles')!;
  const cache = body.search(/_facetHashCache\.set\(/);
  const gate = body.search(/isInBundledLibraryDir\(/);
  const write = body.search(/guardedProcessFrontMatter\(/);
  assert.ok(cache >= 0 && gate >= 0 && write >= 0);
  assert.ok(cache < gate && gate < write, 'cache populate → library gate → frontmatter write');
});
