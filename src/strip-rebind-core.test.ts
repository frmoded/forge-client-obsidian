// Drain 2026-08-25-0100 §1 — clicking the panel's Run button must not
// grey the strip.
//
// THE INCIDENT (driver, v0.2.368): forging `hello_world` works, but
// clicking the Forge panel's Run button "grays out the entire run
// section".
//
// MECHANISM, probed before this file was written, through the real
// strip core:
//
//   1. note open, strip bound:            mode=active  disabled=false
//   2. Run clicked while active:          dispatched {"id":"hello_world",…}
//   3. panel leaf becomes active:         mode=stale   disabled=true
//        hint: "The open note is not an action note — showing hello_world."
//   4. Run clicked AGAIN:                 submitStrip.ran = false
//
// Clicking Run moves focus INTO the Forge panel leaf, so
// `active-leaf-change` fires with `leaf.view` = the panel itself.
// `refreshForgePanelStrip` reads `leaf.view instanceof MarkdownView ?
// leaf.view.file : null` -> null, the workspace re-query is also null
// (the active leaf is no longer a markdown leaf), and the strip binds
// to nothing -> `stale` -> disabled -> dimmed.
//
// NOT VISUAL-ONLY, which the driver's report could not tell us. Step 2
// shows the FIRST run does dispatch — it was submitted before the
// re-render. Step 4 shows the strip then refuses a SECOND run until the
// user clicks back into the note. The hint is also actively false: the
// open note IS an action note.
//
// Drain 2370 widened the dimming from body to title+body, which is why
// this reads as "the ENTIRE run section" now rather than part of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { shouldRebindStrip } from './strip-rebind-core.ts';

test('a leaf change onto a NON-markdown leaf does not rebind', () => {
  // The Forge panel itself, and every sidebar. This is the incident.
  assert.equal(
    shouldRebindStrip({ leafGiven: true, leafIsMarkdown: false, fileGiven: false }),
    false,
  );
});

test('a leaf change onto a markdown leaf DOES rebind', () => {
  // NON-VACUITY. Tab switching between notes is the strip's whole job;
  // a guard that stopped it would be worse than the bug.
  assert.equal(
    shouldRebindStrip({ leafGiven: true, leafIsMarkdown: true, fileGiven: false }),
    true,
  );
});

test('file-open always rebinds, even with no leaf', () => {
  // `file-open` hands us the file directly and carries no leaf. It is
  // the event that fires when a note is opened into the CURRENT leaf,
  // which produces no leaf change at all.
  assert.equal(
    shouldRebindStrip({ leafGiven: false, leafIsMarkdown: false, fileGiven: true }),
    true,
  );
});

test('the no-event call (initial wire-up) still rebinds', () => {
  // The panel can be opened while a note is already showing. That call
  // passes neither leaf nor file and must fall through to the
  // workspace re-query, or the strip would never paint at all.
  assert.equal(
    shouldRebindStrip({ leafGiven: false, leafIsMarkdown: false, fileGiven: false }),
    true,
  );
});

test('a file wins even when the leaf is non-markdown', () => {
  // Defensive ordering: if a caller ever hands us both, the concrete
  // file is better evidence than the leaf's type.
  assert.equal(
    shouldRebindStrip({ leafGiven: true, leafIsMarkdown: false, fileGiven: true }),
    true,
  );
});

// --- the wiring, pinned at the source -------------------------------

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('refreshForgePanelStrip consults the guard', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('shouldRebindStrip(')).length,
    1,
    'one guard, in refreshForgePanelStrip',
  );
});

test('a non-action MARKDOWN note still greys — CCQA check 2 is kept', () => {
  // The guard must be about the LEAF TYPE, never about whether the
  // note is an action note. Greying a real markdown note that is not
  // an action note is deliberate behaviour this drain must not undo,
  // so the null-note path through activeStripNote stays intact.
  assert.ok(
    MAIN.includes("if (frontmatter?.type !== 'action') return null;"),
    'activeStripNote must still return null for a non-action note',
  );
});

// ====================================================================
// Drain 2026-08-25-0100 §2 — the engine chips the model never sees.
//
// Driver's `random_2` transcript: the first LLM output began
// `# missing chip: random_float — return a random float between 0.0
// and 1.0` and used a `{{ }}` slot; the retry called `[[random_note]]`
// (a sibling vault NOTE) rather than `[[random_float]]`.
//
// §2(a): the `# missing chip:` line is MODEL-authored, following a
// prompt convention the service defines
// (forge-transpile/prompts/llm_prompts_v2.py). The client only reads
// and strips it. Not client-inserted.
//
// §2(b): probed. `loadLibraryNoteCatalog` reads exactly two domains —
// `music` and `moda` — and never `core`, which is where random_float
// lives:
//
//   chips indexed: 60 (music: 44, moda: 16)
//   random_float present in the CLIENT catalog: false
//   forge/core/lib.py: 4 chips — random_float, nth, pick_indices, mcq
//
// The catalog still reports READY (music/moda loaded fine), so
// `buildGenerateCallables` returns a list, the payload carries
// `callables`, and drain 1000's contract makes the service treat a
// supplied inventory as AUTHORITATIVE and skip its own engine-chip
// augmentation. The model was therefore choosing from notes plus
// music/moda chips only — which explains BOTH data points exactly.
//
// The service itself knows random_float: the vendored
// forge-transpile/engine_libs/core_lib.py matches the engine source
// and the drift check is clean. The chips were lost on the client.

import { ENGINE_LIB_DOMAINS, parseEngineLib, buildLibraryNoteIndex }
  from './library-note-catalog-core.ts';

test('the catalog reads the core domain', () => {
  assert.ok(ENGINE_LIB_DOMAINS.includes('core'),
    'core is where random_float, nth, pick_indices and mcq live');
});

test('music and moda are still read — nothing is traded away', () => {
  // NON-VACUITY. These 60 chips are the palette, Cmd-click resolution
  // and the existing generation vocabulary.
  assert.ok(ENGINE_LIB_DOMAINS.includes('music'));
  assert.ok(ENGINE_LIB_DOMAINS.includes('moda'));
});

test('random_float reaches the built index — the driver\'s exact chip', () => {
  const perDomain: Record<string, ReturnType<typeof parseEngineLib>> = {};
  for (const d of ENGINE_LIB_DOMAINS) {
    perDomain[d] = parseEngineLib(
      readFileSync(new URL(`../assets/engine/forge/${d}/lib.py`, import.meta.url), 'utf8'),
    );
  }
  const index = buildLibraryNoteIndex(perDomain);
  assert.ok(index.has('random_float'));
  // The other three core chips travel with it.
  for (const name of ['nth', 'pick_indices', 'mcq']) {
    assert.ok(index.has(name), `${name} should be indexed too`);
  }
  // And the music/moda chips are undisturbed.
  assert.ok(index.size >= 64, `expected >= 64 chips, saw ${index.size}`);
});

test('main.ts drives the catalog from the shared constant', () => {
  // The list was inline in main.ts, which is how `core` went missing
  // without anything noticing. One definition, and a test that reads
  // the same one the loader does.
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('ENGINE_LIB_DOMAINS')).length >= 1,
    true,
  );
  assert.equal(
    MAIN.split('\n').filter((l) => /const domains = \['music', 'moda'\]/.test(l)).length,
    0,
    'the inline two-domain list must be gone',
  );
});
