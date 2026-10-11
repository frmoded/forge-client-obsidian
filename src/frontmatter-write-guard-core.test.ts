// Drain 2026-10-11-0900 §4 — "a deleted note stays deleted". CCQA saw `forge_delete_note` commit a MODIFICATION of the note it was
// deleting (ClaudeQA 7df5c08): `source_facet: description -> python` and the two `python_derived_*` lines gone, file still on disk.
//
// THE WRITER (read from this repo's own code and Obsidian 1.14.4's FileSystemAdapter, not guessed):
//   `main.ts maybeUpdateSourceFacet` runs on every vault `modify` of a V2 action note. `git checkout HEAD -- <rel>` (the first step of
//   forge_delete_note) rewrites the file, Obsidian fires `modify`, and the handler decides the note's source facet from its hashes and
//   writes it with `fileManager.processFrontMatter` — exactly `source_facet = 'python'` plus `delete fm.python_derived_from_*`.
//   Obsidian's adapter implements that as   readFile(path) -> fn(content) -> writeFile(path, newContent)   with NO existence or mtime
//   check, and `writeFile` CREATES a missing file. So a `git rm` landing between the read and the write is undone by the plugin, and
//   the next path-scoped `git commit -- <rel>` commits the re-created file as a modification.
//
// The fix is a guard around every such write: never write to a path that is gone, and if a delete was observed while we were
// writing and the file exists afterwards, our write is what resurrected it — remove it again.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDeletionTracker, guardedFrontMatterWrite, type GuardedWriteDeps } from './frontmatter-write-guard-core.ts';

// ---- Obsidian's FileSystemAdapter.process semantics, in memory ------------------------------------------------------------
class FakeDisk {
  files = new Map<string, string>();
  /** called between processFrontMatter's read and its write — where an external `git rm` can land */
  betweenReadAndWrite: (() => void) | null = null;
  async exists(p: string) { return this.files.has(p); }
  async remove(p: string) { this.files.delete(p); }
  /** fileManager.processFrontMatter: read, transform, write — no existence check, and write CREATES the file. */
  async processFrontMatter(p: string, fn: (text: string) => string) {
    const text = this.files.get(p);
    if (text === undefined) throw new Error('ENOENT');
    const next = fn(text);
    this.betweenReadAndWrite?.();
    this.files.set(p, next);          // fs.writeFile: creates the file if it is no longer there
  }
}

const PATH = 'ccqa-scratch/regression_16th_hihat.md';
const HEAD_TEXT = '---\nsource_facet: description\npython_derived_from_recipe_hash: abc\n---\n\nbody\n';
const REWRITTEN = '---\nsource_facet: python\n---\n\nbody\n';

function harness(opts: { settleMs?: number } = {}) {
  const disk = new FakeDisk();
  disk.files.set(PATH, HEAD_TEXT);
  let clock = 1_000;
  const tracker = createDeletionTracker();
  const log: string[] = [];
  const deps = (write?: () => Promise<void>): GuardedWriteDeps => ({
    path: PATH,
    now: () => clock,
    tracker,
    exists: () => disk.exists(PATH),
    remove: () => disk.remove(PATH),
    write: write ?? (() => disk.processFrontMatter(PATH, () => REWRITTEN)),
    settle: async (ms) => { clock += ms; },
    settleMs: opts.settleMs ?? 300,
    log: (m) => log.push(m),
  });
  /** An external `git rm`: the file vanishes and Obsidian's watcher reports the delete. */
  const externalDelete = () => { disk.files.delete(PATH); tracker.noteDeleted(PATH, clock); clock += 1; };
  return { disk, tracker, deps, externalDelete, log, tick: (ms: number) => { clock += ms; } };
}

test('REPRO (unguarded): a delete between processFrontMatter\'s read and its write RESURRECTS the note with the rewritten frontmatter', async () => {
  const h = harness();
  h.disk.betweenReadAndWrite = h.externalDelete;
  await h.disk.processFrontMatter(PATH, () => REWRITTEN);
  assert.equal(h.disk.files.get(PATH), REWRITTEN, 'the file is back, with exactly 7df5c08\'s frontmatter change');
});

test('guarded: the same race ends with the note STILL DELETED (the resurrecting write is undone)', async () => {
  const h = harness();
  h.disk.betweenReadAndWrite = h.externalDelete;
  const outcome = await guardedFrontMatterWrite(h.deps());
  assert.equal(outcome, 'undone-resurrection');
  assert.equal(h.disk.files.has(PATH), false, 'a deleted note stays deleted');
});

test('guarded: a note that is already gone is never written to (no processFrontMatter call at all)', async () => {
  const h = harness();
  h.disk.files.delete(PATH);
  let wrote = 0;
  const outcome = await guardedFrontMatterWrite(h.deps(async () => { wrote++; }));
  assert.equal(outcome, 'skipped-missing');
  assert.equal(wrote, 0);
});

test('guarded: an ordinary write is untouched — the file keeps its new content and nothing is removed', async () => {
  const h = harness();
  const outcome = await guardedFrontMatterWrite(h.deps());
  assert.equal(outcome, 'written');
  assert.equal(h.disk.files.get(PATH), REWRITTEN);
});

test('guarded: a delete that happened BEFORE the write started, with the note re-created since, is not undone (the user wins)', async () => {
  const h = harness();
  h.tracker.noteDeleted(PATH, 500);        // long before `start`
  const outcome = await guardedFrontMatterWrite(h.deps());
  assert.equal(outcome, 'written');
  assert.equal(h.disk.files.get(PATH), REWRITTEN);
});

test('guarded: a failing write propagates and removes nothing', async () => {
  const h = harness();
  await assert.rejects(guardedFrontMatterWrite(h.deps(async () => { throw new Error('disk full'); })), /disk full/);
  assert.equal(h.disk.files.get(PATH), HEAD_TEXT);
});

test('guarded: the delete event arrives AFTER the write finished but inside the settle window — still caught', async () => {
  const h = harness({ settleMs: 300 });
  const settleSpy: number[] = [];
  const deps = h.deps();
  deps.settle = async (ms) => {
    settleSpy.push(ms);
    h.externalDelete();                    // the watcher\'s delete event lands late
    h.disk.files.set(PATH, REWRITTEN);     // and the resurrected file is what the write left behind
  };
  const outcome = await guardedFrontMatterWrite(deps);
  assert.deepEqual(settleSpy, [300]);
  assert.equal(outcome, 'undone-resurrection');
  assert.equal(h.disk.files.has(PATH), false);
});

test('guarded: settleMs 0 skips the wait (user-initiated writes pay no latency) but still checks the tracker', async () => {
  const h = harness({ settleMs: 0 });
  let settled = 0;
  const deps = h.deps();
  deps.settle = async () => { settled++; };
  h.disk.betweenReadAndWrite = h.externalDelete;
  const outcome = await guardedFrontMatterWrite(deps);
  assert.equal(settled, 0);
  assert.equal(outcome, 'undone-resurrection');
});

// ---- the deletion tracker -------------------------------------------------------------------------------------------------

test('tracker: remembers deletes, answers "deleted since t?", and forgets old entries', () => {
  const t = createDeletionTracker({ keepMs: 1000 });
  t.noteDeleted('a.md', 100);
  assert.equal(t.deletedSince('a.md', 50), true);
  assert.equal(t.deletedSince('a.md', 100), true);
  assert.equal(t.deletedSince('a.md', 101), false);
  assert.equal(t.deletedSince('b.md', 0), false);
  t.noteDeleted('c.md', 5000);             // 4900 ms later: a.md is pruned
  assert.equal(t.deletedSince('a.md', 0), false);
});

// ---- wiring ---------------------------------------------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';

test('wiring: every plugin frontmatter write goes through guardedProcessFrontMatter; the deletion tracker is fed by vault `delete`', () => {
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = [...main.matchAll(/fileManager\.processFrontMatter\(/g)].length;
  assert.equal(raw, 1, 'the only direct call is inside the guard helper');
  assert.match(main, /private async guardedProcessFrontMatter\(/);
  assert.match(main, /write: \(\) => this\.app\.fileManager\.processFrontMatter|this\.guardedWrite\(file, \(\) => this\.app\.fileManager\.processFrontMatter\(file, fn\), kind\)/);
  assert.match(main, /this\.app\.vault\.on\('delete', \(f\) => \{\s*this\.deletionTracker\.noteDeleted\(f\.path, Date\.now\(\)\);/);
  // the two modify-event writers settle (they are what races a `git rm`); user-initiated writes do not
  assert.equal([...main.matchAll(/guardedProcessFrontMatter\(file, \(fm: any\) => \{/g)].length, 6);
  assert.equal([...main.matchAll(/\}, 'event'\);/g)].length, 2, 'maybeUpdateSourceFacet and maybeStampTypedLetsInputs');
  assert.match(main, /settleMs: kind === 'event' \? EVENT_WRITE_SETTLE_MS : 0/);
});

test('wiring: the file-open backfill\'s whole-body vault.modify goes through the same guard (it ends in adapter.write, which also creates)', () => {
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(main, /await this\.guardedWrite\(file, \(\) => this\.app\.vault\.modify\(file, result\.newBody\), 'event'\);/);
  assert.match(main, /private async guardedWrite\(/);
  assert.ok(!/\n\s*await this\.app\.vault\.modify\(file, result\.newBody\)/.test(main), 'never awaited bare');
});
