// Drain 2026-10-21-1200 — every `type: action` note in the bundled vaults has a `# Python` section, or is named (with a reason) in scripts/action-notes-without-python.txt.
// Reads the real bundled vaults (assets/vaults: needs a synced tree, like the ratchet's completeness test). Non-vacuity: it must find a plausible number of action notes, and the
// same guard must FAIL against a copy of the real vaults with one `# Python` taken out.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseAllowList, pythonGuard } from './action-notes-python-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULTS = path.join(ROOT, 'assets', 'vaults');
const ALLOW = parseAllowList(fs.readFileSync(path.join(ROOT, 'scripts', 'action-notes-without-python.txt'), 'utf8'));

function* walk(dir, base = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), rel);
    else if (e.isFile() && e.name.endsWith('.md')) yield rel;
  }
}
const bundled = () => [...walk(VAULTS)].map((rel) => ({ rel, text: fs.readFileSync(path.join(VAULTS, rel), 'utf8') }));

test('every action note in the bundled vaults has a # Python section or is on the allow-list with a reason — and every allow-list entry really lacks one', () => {
  const g = pythonGuard(bundled(), ALLOW);
  assert.deepEqual(g.missingNotAllowed, [], 'an action note ships without # Python and is not on scripts/action-notes-without-python.txt (backfill it with scripts/rederive-library-note.mjs, or name it with a reason)');
  assert.deepEqual(g.staleEntries, [], 'an allow-list entry whose note now has a # Python (remove the entry) or no longer exists');
});

test('NON-VACUITY: it looked at the real vaults (at least 80 action notes), the allow-list is exactly the notes that lack one, and each entry carries a reason', () => {
  const g = pythonGuard(bundled(), ALLOW);
  assert.ok(g.actionCount >= 80, `the guard saw only ${g.actionCount} action notes — it did not look at the vaults`);
  assert.equal(g.withoutPython, ALLOW.size, 'the notes without # Python are exactly the allow-listed ones');
  for (const [rel, reason] of ALLOW) assert.ok(reason.length >= 20, `${rel}: a real reason`);
});

test('the guard FAILS on the original incident: the real vaults with one # Python removed', () => {
  const files = bundled();
  const victim = files.find((f) => f.rel === 'forge-moda/go.md');
  assert.ok(victim, 'the fixture note exists');
  const broken = files.map((f) => (f === victim ? { rel: f.rel, text: f.text.replace(/\n# Python\n[\s\S]*$/, '\n') } : f));
  const g = pythonGuard(broken, ALLOW);
  assert.deepEqual(g.missingNotAllowed, ['forge-moda/go.md']);
});

test('a stale allow-list entry fails; an entry with no reason, a duplicate, and an empty input all throw (looked-at-nothing is never "no gap")', () => {
  const files = bundled();
  const stale = new Map(ALLOW); stale.set('forge-moda/go.md', 'it has one');
  assert.deepEqual(pythonGuard(files, stale).staleEntries, ['forge-moda/go.md']);
  assert.deepEqual(pythonGuard(files, new Map([...ALLOW, ['nope/ghost.md', 'not a note']])).staleEntries, ['nope/ghost.md']);
  assert.throws(() => parseAllowList('v/a.md\n'), /no reason/);
  assert.throws(() => parseAllowList('v/a.md | r\nv/a.md | r2\n'), /twice/);
  assert.throws(() => pythonGuard([], ALLOW), /looked at nothing/);
});

test('non-action notes and notes without frontmatter are not counted', () => {
  const g = pythonGuard([
    { rel: 'v/data.md', text: '---\ntype: data\n---\n\nx\n' },
    { rel: 'v/plain.md', text: 'no frontmatter\n' },
    { rel: 'v/act.md', text: '---\ntype: action\n---\n\n# Description\n\nd\n\n# Recipe\n\nReturn 1.\n' },
  ], new Map());
  assert.equal(g.actionCount, 1);
  assert.deepEqual(g.missingNotAllowed, ['v/act.md']);
});
