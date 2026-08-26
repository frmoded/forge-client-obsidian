// Drain 2026-08-25-2100 (plan F4) — Forge derives; the panel runs.
//
// The prompt's §2 names two tests: "a note with inputs forged from the
// toolbar primes the strip and does not open a modal" and "no third run
// path may survive". Both are here, plus the grep-guards that keep them
// true against a future refactor rather than only today.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  decideForgeLanding,
  FORGE_OUTCOMES,
  type ForgeOutcome,
} from './forge-landing-core.ts';

function src(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

// ---------------------------------------------------------------------
// The invariant this drain exists to establish.
// ---------------------------------------------------------------------

test('forging NEVER runs — for every outcome, including ones added later', () => {
  // Iterates the exported list, not a copy. A new ForgeOutcome that
  // lands with `run: true` fails here without anyone remembering to
  // extend this test.
  for (const outcome of FORGE_OUTCOMES) {
    assert.equal(
      decideForgeLanding(outcome).run, false,
      `outcome '${outcome}' must not run — Forge derives, the panel runs`,
    );
  }
});

test('every outcome opens and primes the panel', () => {
  for (const outcome of FORGE_OUTCOMES) {
    const landing = decideForgeLanding(outcome);
    assert.equal(landing.openPanel, true, outcome);
    assert.equal(landing.primeStrip, true, outcome);
  }
});

test('a rejection still opens and primes the panel', () => {
  // NON-VACUITY for the choice above: the rejection card renders INSIDE
  // the panel, so a closed panel would swallow the only explanation the
  // cohort gets. If someone later "optimises" rejection to skip the
  // panel, this fails and names why.
  const landing = decideForgeLanding('rejected');
  assert.deepEqual(landing, { openPanel: true, primeStrip: true, run: false });
});

test('the outcome list matches the union — no outcome is unreachable', () => {
  // Guards the other direction: a ForgeOutcome added to the type but
  // not to FORGE_OUTCOMES would make the loop above vacuous for it.
  const core = src('src/forge-landing-core.ts');
  const union = [...core.matchAll(/^\s*\|\s*'([a-z-]+)';?$/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...union].sort(), [...FORGE_OUTCOMES].sort(),
    'ForgeOutcome union and FORGE_OUTCOMES have drifted',
  );
});

// ---------------------------------------------------------------------
// §2 — the Run dialog is retired. Grep-guards on the real source.
// ---------------------------------------------------------------------

test('the Run dialog class no longer exists anywhere in src/', () => {
  // The prompt asks for a grep-guard on the modal class name. Guard the
  // PROPERTY, not the spelling: a tombstone comment saying "ForgeRunModal
  // lived here and is retired" is documentation worth keeping, and a
  // bare name-grep would forbid it — which is how the first version of
  // this test failed, against modal.ts's own retirement note.
  //
  // What must not exist: a declaration, a construction, or an import.
  // Walk the real tree rather than naming files, so a copy reintroduced
  // in a NEW file is caught too.
  const shapes: Array<[RegExp, string]> = [
    [/\bclass\s+ForgeRunModal\b/, 'declares'],
    [/\bnew\s+ForgeRunModal\b/, 'constructs'],
    [/\bimport\s*\{[^}]*\bForgeRunModal\b[^}]*\}/, 'imports'],
  ];
  const offenders: string[] = [];
  for (const f of fs.readdirSync(path.resolve(process.cwd(), 'src'))) {
    if (!f.endsWith('.ts')) continue;
    if (f === 'forge-landing-core.test.ts') continue; // this file names it
    const body = src(path.join('src', f));
    for (const [re, verb] of shapes) {
      if (re.test(body)) offenders.push(`${f} ${verb} it`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `ForgeRunModal is retired (F4 §2); still live in: ${offenders.join(', ')}`,
  );
});

test('the retirement guard would actually catch a revival', () => {
  // NON-VACUITY. The guard above passes trivially if its patterns are
  // wrong. Feed it the three shapes it claims to catch.
  const shapes = [
    'export class ForgeRunModal extends Modal {}',
    'const m = new ForgeRunModal(app);',
    "import { ForgeSnippetModal, ForgeRunModal } from './modal.ts';",
  ];
  const patterns = [
    /\bclass\s+ForgeRunModal\b/,
    /\bnew\s+ForgeRunModal\b/,
    /\bimport\s*\{[^}]*\bForgeRunModal\b[^}]*\}/,
  ];
  for (let i = 0; i < shapes.length; i++) {
    assert.ok(patterns[i].test(shapes[i]), `pattern ${i} misses its own shape`);
  }
  // And the tombstone comment must NOT trip any of them.
  const tombstone = '// `ForgeRunModal` lived here and is RETIRED.';
  for (const p of patterns) {
    assert.ok(!p.test(tombstone), `pattern ${p} forbids the retirement note`);
  }
});

test('forging from the toolbar cannot open a modal — the branch is gone', () => {
  // The dialog had exactly ONE production call site, inside runSnippet,
  // reachable only when no preset inputs were supplied. F4 makes preset
  // inputs required, so the branch that asked the user is unreachable
  // by construction rather than by convention.
  const main = src('src/main.ts');
  assert.ok(
    !/new ForgeRunModal/.test(main),
    'main.ts still constructs the Run dialog',
  );
  assert.match(
    main, /presetInputs: Record<string, unknown>,/,
    'runSnippet must REQUIRE preset inputs — an optional parameter lets a '
    + 'future caller re-open the ask-the-user path',
  );
});

// ---------------------------------------------------------------------
// §1 — no third run path may survive.
// ---------------------------------------------------------------------

test('the panel strip is the only surface that calls runSnippet', () => {
  const main = src('src/main.ts');
  const calls = [...main.matchAll(/this\.runSnippet\(/g)].length;
  assert.equal(
    calls, 1,
    `expected exactly one runSnippet call site (the panel strip's Run); `
    + `found ${calls}. F4 §1: "no third run path may survive."`,
  );
});

test('the Cmd-P "Run only" command is retired', () => {
  const main = src('src/main.ts');
  assert.ok(
    !/forge-run-only/.test(main),
    'forge-run-only is retired — the panel Run is the only run surface',
  );
});

test('forgeSnippet derives but does not execute', () => {
  // The four terminal runSnippet calls inside forgeSnippet were what
  // made ▶ a run button. They are replaced by the landing helper.
  const main = src('src/main.ts');
  const forgeBody = main.slice(
    main.indexOf('private async forgeSnippet()'),
    main.indexOf('private async runSnippet('),
  );
  assert.ok(forgeBody.length > 0, 'could not locate forgeSnippet body');
  assert.ok(
    !/this\.runSnippet\(/.test(forgeBody),
    'forgeSnippet still executes — F4 §1 makes it derive-and-hand-off only',
  );
  assert.match(
    forgeBody, /landAfterForge\(/,
    'forgeSnippet must land through the shared helper so every branch '
    + 'gets the same panel treatment',
  );
});

test('the toolbar button says Forge, not Run', () => {
  const main = src('src/main.ts');
  assert.match(
    main, /view\.addAction\(\s*'hammer',\s*'Forge this note'/,
    'the note toolbar button must read "Forge this note" — it no longer runs',
  );
  assert.ok(
    !/view\.addAction\('play', 'Run'/.test(main),
    'the play-triangle "Run" affordance is retired from the note toolbar',
  );
});

// ---------------------------------------------------------------------
// New user-facing strings. F4 changes what the cohort is TOLD, not just
// what happens: three surfaces used to promise a run that no longer
// happens on that gesture. L43's skip criterion (4) wants a drift guard
// on any load-bearing new string, and "running as-is" over a button
// that stopped running is the load-bearing case.
// ---------------------------------------------------------------------

test('no Forge-path notice promises that forging runs the note', () => {
  const main = src('src/main.ts');
  // The two branches that used to say "running as-is" now say what the
  // cohort must do instead. Assert the PROMISE is gone rather than
  // pinning the replacement wording, so a copy-edit does not fail the
  // suite but a regression does.
  const forgeBody = main.slice(
    main.indexOf('private async forgeSnippet()'),
    main.indexOf('private async runSnippet('),
  );
  const promises = [...forgeBody.matchAll(/[Rr]unning as-is/g)];
  assert.equal(
    promises.length, 0,
    'a Forge notice still says "running as-is" — Forge no longer runs',
  );
});

test('the Python-canonical notices point the cohort at the panel', () => {
  // NON-VACUITY for the test above: deleting the notices entirely would
  // satisfy "no promise" while leaving the cohort with no idea what to
  // do next. Both branches must name the actual next gesture.
  const main = src('src/main.ts');
  const pointers = [...main.matchAll(/Press Run in the Forge panel to execute/g)];
  assert.equal(
    pointers.length, 2,
    `expected both Python-canonical branches to name the next gesture; `
    + `found ${pointers.length}`,
  );
});

test('the spinner verb matches the gesture', () => {
  const main = src('src/main.ts');
  const forgeBtn = main.slice(main.indexOf("view.addAction('hammer'"));
  const head = forgeBtn.slice(0, 600);
  assert.match(head, /🔨 forging …/, 'the Forge button spinner must say forging');
  assert.ok(
    !/🔥 running …/.test(head),
    'the Forge button spinner still says "running"',
  );
});

test('onboarding prose does not tell the cohort the toolbar runs', () => {
  const welcome = src('src/welcome.ts');
  assert.ok(
    !/Click the \*\*Run\*\* button \(▶\)/.test(welcome),
    'welcome.ts still points at a run button on the note toolbar',
  );
  assert.match(
    welcome, /Press \*\*Run\*\* in the Forge panel/,
    'welcome.ts must name the panel as the run surface',
  );
});

// ---------------------------------------------------------------------
// Type-level: the switch stays total.
// ---------------------------------------------------------------------

test('decideForgeLanding handles every declared outcome', () => {
  for (const outcome of FORGE_OUTCOMES) {
    const landing = decideForgeLanding(outcome as ForgeOutcome);
    assert.ok(landing && typeof landing.run === 'boolean', outcome);
  }
});
