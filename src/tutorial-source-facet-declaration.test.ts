// Drain 2026-08-26-2200 — the bundled tutorial's `source_facet`
// declarations are pinned, and derived Python facets must carry their
// provenance.
//
// WHY A SNAPSHOT AND NOT A SHAPE RULE. `source_facet: python` is the one
// value the engine acts on: `forge/core/executor.py` reads a note's own
// `source_facet` on every no-layer route and honours ONLY `python` --
// `description`, `recipe`, `synced`, unknown and absent all fall through
// to the Recipe. So a flip TO python silently changes which code a note
// executes, on the Inputs strip, Cmd-P, MCP, scripts and transitive
// calls alike. Nothing about a note's own bytes says whether its
// declaration is intended; only a pinned expectation can.
//
// WHAT WENT WRONG, so the next reader knows what this guards. Drain 2100
// regenerated the `# Python` facets of `mood` and `function_inputs` by
// transpile. That is a SINGLE-facet Python change, which is exactly the
// shape `decideSourceWriteFromChange` (facet-edit-tracker-core.ts) is
// designed to read as "a real, targeted Python edit" -- so the running
// plugin flipped both notes to `source_facet: python` and dropped their
// `python_derived_from_*` lineage, because a hand-authored Python facet
// is not derived from anything. The plugin was behaving as designed. The
// machine transpile was indistinguishable from a human hand-edit at the
// file level, and it shipped in v0.2.378.
//
// These two notes are the only input-bearing notes chapter 3 teaches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFrontmatterField, extractPythonSection } from './v2-note-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import { DEFAULT_PYTHON_STUB } from './v11-3-backfill-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(
  __dirname, '..', 'assets', 'vaults', 'forge-tutorial',
);

/** Every bundled tutorial action note, with the `source_facet` it is
 *  MEANT to declare. Chapters 1-9 teach Description -> Recipe, so
 *  `description` is the norm; a deliberate exception belongs here with
 *  a reason, not silently in a note. */
const EXPECTED: Record<string, string | null> = {
  '01-hello/hello_world.md':            null,          // unstamped by design
  '02-variables/fix_me.md':             'synced',      // driver's chapter-2 exercise
                                                       // note. Unstamped when added
                                                       // (41208d9); stamped `synced` by
                                                       // the driver's own Forge run
                                                       // (f408e63, "stamp fix_me.md from
                                                       // driver's own Forge run") — an
                                                       // intended change, recorded here
                                                       // rather than silently absorbed
  '02-variables/greeting.md':           'description',
  '03-functions/cheer.md':              'description',
  '03-functions/fix_the_call.md':       'recipe',       // chapter 3's broken-on-purpose
                                                       // note (drain 2026-08-27-1200).
                                                       // `recipe` because both facets are
                                                       // hand-authored and the Recipe IS
                                                       // the artifact under repair
  '03-functions/excited.md':            'description',
  '03-functions/function_inputs.md':    'description',
  '03-functions/mood.md':               'description',
  '04-composition/describe_it.md':      'description',
  '04-composition/excited_word.md':     'description',
  '05-conditionals/weather.md':         null,          // unstamped
  '06-loops/countdown.md':              null,          // unstamped
  '07-data/show_colors.md':             'description',
  '08-recursion/factorial.md':          'description',
  '08-recursion/show_factorial.md':     null,          // unstamped in the bundle;
                                                       // the driver's live copy carries a
                                                       // v11.3 backfill stamp that has never
                                                       // been committed (held out since 1730)
  '09-slots/octopus_fact.md':           'description',
};

test('tutorial bundle: source_facet declarations match the pinned table', () => {
  const wrong: string[] = [];
  for (const [rel, want] of Object.entries(EXPECTED)) {
    const p = path.join(BUNDLE, rel);
    if (!fs.existsSync(p)) { wrong.push(`${rel}: MISSING from the bundle`); continue; }
    const got = getFrontmatterField(fs.readFileSync(p, 'utf8'), 'source_facet') ?? null;
    if (got !== want) {
      wrong.push(`${rel}: declares ${JSON.stringify(got)}, pinned ${JSON.stringify(want)}`);
    }
  }
  assert.deepEqual(
    wrong, [],
    'source_facet drift in the bundled tutorial. A flip to "python" changes '
    + 'which code the engine executes on every no-layer route (executor.py). '
    + 'If a change is intended, update EXPECTED with the reason.',
  );
});

test('tutorial bundle: a derived Python facet carries its provenance', async () => {
  // Non-vacuity note: this already guards `cheer` and `excited`, which
  // ship real transpiled Python under a Description-canonical
  // declaration. It is not waiting for a future note to become true.
  const offenders: string[] = [];
  let guarded = 0;
  for (const rel of Object.keys(EXPECTED)) {
    const p = path.join(BUNDLE, rel);
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, 'utf8');
    const declared = getFrontmatterField(t, 'source_facet') ?? null;
    const py = extractPythonSection(t);
    // A python-canonical note IS its own source: no lineage to carry.
    // The backfill stub is not derived either, and correctly says so by
    // omitting the field (v11-3-backfill-core.ts).
    // Drain 2026-08-27-0340 — a note with NO stamp block at all is exempt.
    // `fix_me.md` (chapter 2's deliberately-broken exercise) and the
    // unstamped chapter 5/6 notes carry a Python facet and no hashes
    // whatsoever; there is no provenance to contradict, and demanding a
    // derived-from field from a note that declares no hashes is a false
    // positive, not a finding. The guard's subject is notes that DO make
    // provenance claims.
    const recipeHashPresent = getFrontmatterField(t, 'recipe_hash');
    if (!recipeHashPresent) continue;
    if (declared === 'python' || py === null || py === DEFAULT_PYTHON_STUB) continue;
    guarded++;
    const pdr = getFrontmatterField(t, 'python_derived_from_recipe_hash');
    const recipeHash = getFrontmatterField(t, 'recipe_hash');
    if (!pdr) {
      offenders.push(`${rel}: has a derived # Python facet but no python_derived_from_recipe_hash`);
    } else if (pdr !== recipeHash) {
      offenders.push(`${rel}: python_derived_from_recipe_hash ${String(pdr).slice(0, 8)} != recipe_hash ${String(recipeHash).slice(0, 8)}`);
    }
  }
  assert.ok(guarded >= 2, `guard is vacuous — only ${guarded} note(s) exercised it`);
  assert.deepEqual(offenders, [], 'derived Python facets missing or contradicting their provenance');
});
