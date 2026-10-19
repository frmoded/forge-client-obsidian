// Drain 2026-10-19-0900 §1 — the hammer click on a SHIPPED library note must leave its bytes alone, judged with the Python the REAL ENGINE
// returns (recorded by scripts/record-engine-transpile.py from `resolve_action_code(snippet, force=True)`), not Python typed by hand.
//
// The incident: CCQA's hammer click on shipped `hello_world` changed md5 adc26a23… -> 953dee65… (one added empty line). Iteration 77's guard and
// tests could not see it because their stand-in Python had no trailing newline; the engine's real output ENDS with "\n", and the plugin's
// `# Python` writer wrapped it as "```python\n" + code + "\n```" — a blank line before the closing fence. The writer is `formatPythonHeading`
// in python-cache-writer-core.ts (not Obsidian's `view.save()`, which Iteration 77 suspected: Obsidian's `processFrontMatter` slices the file
// around the frontmatter only, and `save()` writes the editor text it was handed).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';
import { englishHashForStamp } from './english-hash-core.ts';
import { applyPythonWriteBack, planPythonWriteBack } from './python-write-back-core.ts';
import { replaceOrInsertPythonHeading } from './python-cache-writer-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField } from './v2-note-core.ts';

interface RecordedNote { recipe: string; python: string; note?: string }
const FIXTURE = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'), 'utf8')) as {
  engine_sha: string; vault_shas: Record<string, string>; notes: Record<string, RecordedNote>; unavailable: Record<string, string>;
};
const withPython = Object.entries(FIXTURE.notes).filter(([, v]) => typeof v.note === 'string') as Array<[string, RecordedNote & { note: string }]>;
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

/** What main.ts's writeSourcePythonBack builds before it plans the write — the same calls, in the same order. */
async function inputFor(content: string, python: string) {
  const layer = await whichLayerIsSource(content, {
    extractDescription, extractRecipeSection, extractPythonSection,
    getFrontmatterField: (b: string, k: string) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; },
  } as never);
  return { python, pythonHash: await computeFacetHash(python), englishHash: await englishHashForStamp(null), sourceLayer: layer, resolvedSlots: null };
}

test('the recording is what it claims to be: real engine output for the shipped notes, with the incident note byte-exact', () => {
  assert.match(FIXTURE.engine_sha, /^[0-9a-f]{40}$/);
  assert.ok(withPython.length >= 30, `only ${withPython.length} recorded notes with a # Python section`);
  const hello = FIXTURE.notes['forge-tutorial/01-hello/hello_world'];
  assert.equal(md5(hello.note!), 'adc26a23' + md5(hello.note!).slice(8), 'the pre-click bytes CCQA recorded (md5 adc26a23…)');
  assert.equal(hello.python, "def compute(context):\n  print('hello, world')\n");
});

test('NON-VACUITY: most real engine Python ends with a newline — the shape the hand-typed fixtures never had', () => {
  const ending = withPython.filter(([, v]) => v.python.endsWith('\n')).length;
  assert.ok(ending >= 15, `only ${ending} of ${withPython.length} recorded outputs end with a newline; if the engine changed, this test no longer reproduces the incident`);
});

test('INCIDENT: the hammer click on the real hello_world, with the real engine Python, writes nothing (md5 stays adc26a23…)', async () => {
  const { note, python } = FIXTURE.notes['forge-tutorial/01-hello/hello_world'] as RecordedNote & { note: string };
  const input = await inputFor(note, python);
  for (const library of [true, false]) {
    const plan = planPythonWriteBack(note, input, { library });
    assert.equal(plan.write, false, `library=${library}: the click must not write`);
    assert.equal(md5(plan.next), md5(note));
  }
  assert.equal(applyPythonWriteBack(note, input), note, 'and the writer itself is byte-identical, not merely "cosmetic"');
});

test('the written # Python fence is EXACTLY "```python\\n<code>\\n```" — no blank line before the closing fence, whatever the Python ends or starts with', () => {
  const base = '---\ntype: action\n---\n\n# Description\n\nx\n\n# Python\n\n```python\nold\n```\n';
  const head = '---\ntype: action\n---\n\n# Description\n\nx\n\n# Python\n\n```python\n';
  const cases: Array<[string, string]> = [['a = 1', 'a = 1'], ['a = 1\n', 'a = 1'], ['a = 1\n\n', 'a = 1'], ['a = 1\r\n', 'a = 1'], ['\n\na = 1\n', 'a = 1'], ['a = 1  \n', 'a = 1'], ['if x:\n  y\n', 'if x:\n  y']];
  for (const [code, expected] of cases) {
    assert.equal(replaceOrInsertPythonHeading(base, code), `${head}${expected}\n\`\`\`\n`, JSON.stringify(code));
  }
});

test('replaceOrInsertPythonHeading is idempotent on real engine output, and inserting a missing section ends the same way', () => {
  for (const [rel, v] of withPython) {
    const once = replaceOrInsertPythonHeading(v.note, v.python);
    assert.equal(replaceOrInsertPythonHeading(once, v.python), once, rel);
  }
  const fresh = '---\ntype: action\n---\n\n# Description\n\nx\n';
  const inserted = replaceOrInsertPythonHeading(fresh, 'a = 1\n');
  assert.ok(inserted.endsWith('```python\na = 1\n```\n'));
});

/** Shipped notes whose stored `# Python` is NOT what the engine transpiles from the note today, so a hammer click (or a Run write-back) really
 *  does change them — a REAL difference, which the plugin is right to persist. Found by this test's real-engine view of the library (drain
 *  2026-10-19-0900); fixing them means re-deriving the Python at the source (a transpile), which that drain's restamp tool never does.
 *  A RATCHET: a note may leave this list (when it is re-derived), never join it — a new offender fails the test below, and a listed note
 *  that no longer offends fails it too, so the list can only shrink. (Until drain 2026-10-19-1530 five of them were on
 *  scripts/open-time-readonly.txt, claiming "pressing Run writes nothing" — a claim the gate's old Run model could not see to be false; the gate
 *  now models Run with the recorded engine output and the ratchet was corrected.) */
const NOT_DERIVED: Record<string, { why: string }> = {
  'forge-tutorial/05-conditionals/weather': { why: 'stored Python is the stub `return None`' },
  'music-theory/exercises/build_seventh_chord': { why: 'stored signature lacks the inputs the engine now emits' },
  'music-theory/exercises/build_triad': { why: 'stored signature lacks the inputs the engine now emits' },
  'music-theory/exercises/chord_progression': { why: 'stored signature lacks the inputs the engine now emits' },
  'music-theory/exercises/guitar_play_smoke': { why: 'stored Python lacks the Recipe\'s default argument (Python older than its Recipe)' },
  'music-theory/exercises/piano_play_smoke': { why: 'stored signature lacks the inputs the engine now emits' },
  'music-theory/exercises/scale_construction_a_minor_piano': { why: 'stored Python is the stub `return None`' },
  'music-theory/exercises/scale_construction_f_major_piano': { why: 'stored Python is the stub `return None`' },
  'music-theory/exercises/scale_construction_g_major_piano': { why: 'stored Python is the stub `return None`' },
  'music-theory/percussion/loom': { why: 'hand-written Python (comments, different structure) under a Recipe' },
  'music-theory/slow_burn/chorus': { why: 'hand-written Python (comments, different structure) under a Recipe' },
  'music-theory/slow_burn/slow_burn': { why: 'hand-written Python (comments, different structure) under a Recipe' },
  'music-theory/slow_burn/solo_chorus': { why: 'hand-written Python (comments, different structure) under a Recipe' },
};

/** The notes among `offenders` that are not on the named list — what the ratchet test below fails on. */
function unexplainedOffenders(offenders: string[]): string[] {
  return offenders.filter((r) => !(r in NOT_DERIVED));
}

test('the ratchet itself bites: a note that is not on the list is reported, a listed one is not', () => {
  assert.deepEqual(unexplainedOffenders(['forge-tutorial/01-hello/hello_world', 'music-theory/percussion/loom']), ['forge-tutorial/01-hello/hello_world']);
  assert.deepEqual(unexplainedOffenders([]), []);
});

test('EVERY recorded shipped note: a hammer click with the real engine Python writes nothing — except the named not-yet-derived ones (a ratchet)', async () => {
  const offenders: string[] = [];
  const unexplained: string[] = [];
  const where: Record<string, string> = {};
  for (const [rel, v] of withPython) {
    const plan = planPythonWriteBack(v.note, await inputFor(v.note, v.python), { library: true });
    if (!plan.write) continue;
    offenders.push(rel);
    const a = v.note.split('\n'), b = plan.next.split('\n');
    const at = a.findIndex((l, i) => l !== b[i]);
    where[rel] = `first difference at line ${at + 1}: ${JSON.stringify(a[at])} -> ${JSON.stringify(b[at])}`;
  }
  unexplained.push(...unexplainedOffenders(offenders).map((r) => `${r}: would write (${where[r]})`));
  assert.deepEqual(unexplained, [], 'a new offender: either the writer regressed or a note shipped not fully derived');
  assert.deepEqual(Object.keys(NOT_DERIVED).filter((r) => !offenders.includes(r)), [], 'listed as not derived but a click no longer writes it: remove it from NOT_DERIVED');
});

test('the named not-yet-derived notes really DO differ from the engine (non-vacuity: the list is not covering for a whitespace bug)', () => {
  for (const rel of Object.keys(NOT_DERIVED)) {
    const v = FIXTURE.notes[rel] as RecordedNote & { note: string };
    assert.ok(v, rel);
    assert.notEqual((extractPythonSection(v.note) ?? '').trim(), v.python.trim(), `${rel}: its stored Python equals the engine's, so it should not be listed`);
  }
});

// (The ratchet's agreement with the real engine is now enforced where the ratchet lives: scripts/check-open-time-writes-recorded.test.mjs and the gate itself.)

test('the recording is not stale: every recorded note still has the Recipe the shipped copy has (re-record with scripts/record-engine-transpile.py)', () => {
  const stale: string[] = [];
  for (const [rel, v] of withPython) {
    const shipped = path.resolve(import.meta.dirname, '..', 'assets', 'vaults', `${rel}.md`);
    if (!fs.existsSync(shipped)) continue;
    const recipe = extractRecipeSection(fs.readFileSync(shipped, 'utf8'));
    if ((recipe ?? '').trim() !== v.recipe.trim()) stale.push(rel);
  }
  assert.deepEqual(stale, []);
});
