// Drain 2026-08-05-1200 — every body-mutating write must sync MEMFS.
//
// THE BUG THIS PINS
// -----------------
// The executor does not read the note from disk. It reads it from
// Pyodide's MEMFS, via the snippet registry that `_forge_sync_user_file`
// refreshes. So a write that lands on disk and skips the sync leaves
// two sources of truth disagreeing, and NOTHING reports it: the note is
// correct in Obsidian, correct on disk, correct in git — and executes as
// its previous self.
//
// Two paths were missing the sync:
//
//   - `sanitizePythonTabs` — rewrites the Python facet on a debounce.
//   - the v11.3 backfill — can ADD a `# Python` section.
//
// The second is the one that produces CCQA's v0.2.317 signature. Disk
// gains `# Python`, MEMFS does not, `extract_python` on the registry
// copy returns empty, and the engine raises `SnippetExecError: Empty or
// missing Python code for '...'` — for a note whose Python is plainly
// visible in the editor.
//
// WHY A SOURCE AUDIT AND NOT A UNIT TEST
// --------------------------------------
// main.ts imports 'obsidian', which does not resolve under `node --test`
// (the repo's pure-core convention exists because of this). The write
// sites are methods on the plugin class and cannot be exercised here.
//
// What CAN be checked is the property that actually failed: a
// body-mutating write with no sync near it. That is a textual property
// of this file, and `main-imports.test.ts` establishes the precedent for
// asserting one.
//
// The audit is deliberately shaped as "every write site is accounted
// for" rather than a count. A count passes forever once someone adds an
// exemption; this fails on a NEW unsynced write, which is the event
// worth catching.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_TS = fs.readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
const LINES = MAIN_TS.split('\n');

/** Writes that replace a note's whole body. `processFrontMatter` is
 *  excluded on purpose — it edits frontmatter through Obsidian's own
 *  API and does not rewrite facets. */
const BODY_WRITE = /\bvault\.(modify|process)\s*\(/;

/** Start of a class member at the class's 2-space indent — the end of
 *  the method a write belongs to.
 *
 *  A fixed line-window was the first shape of this audit and it was
 *  wrong: `writeSourcePythonBack` syncs 48 lines after its write,
 *  because the `vault.process` callback that does the hash-stamping is
 *  long. A 40-line window called that a bug. The property that actually
 *  matters is not "soon" but "in the same method" — a write and its
 *  sync belong to one unit of work, however much stamping sits between
 *  them. */
const MEMBER_START = /^ {2}(?:(?:private|public|protected)\s+)?(?:static\s+)?(?:async\s+)?[A-Za-z_$][\w$]*\s*[(<]/;

function bodyWriteSites(): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  LINES.forEach((text, i) => {
    if (!BODY_WRITE.test(text)) return;
    // Skip comment lines — several comments in main.ts name these calls
    // while explaining the write ordering.
    const t = text.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;
    out.push({ line: i + 1, text: t });
  });
  return out;
}

/** Text from `line` to the end of the method containing it. */
function restOfEnclosingMethod(line: number): string {
  let end = LINES.length;
  for (let i = line; i < LINES.length; i += 1) {
    if (MEMBER_START.test(LINES[i])) { end = i; break; }
  }
  return LINES.slice(line - 1, end).join('\n');
}

function syncsInSameMethod(line: number): boolean {
  return /syncUserVaultFile|syncMemfsAfterBodyWrite/
    .test(restOfEnclosingMethod(line));
}

describe('MEMFS sync after body writes (drain 2026-08-05-1200)', () => {
  test('main.ts has body-write sites to audit', () => {
    // Guards the audit itself: if the write API is renamed, the two
    // tests below would vacuously pass on an empty list.
    assert.ok(
      bodyWriteSites().length >= 4,
      'found almost no vault.modify/process calls — has the write API '
      + 'changed? This audit is now blind and needs updating.',
    );
  });

  test('every body write syncs MEMFS in the same method', () => {
    const unsynced = bodyWriteSites()
      .filter((s) => !syncsInSameMethod(s.line))
      .map((s) => `  main.ts:${s.line}  ${s.text}`);

    assert.deepEqual(
      unsynced,
      [],
      'These writes change a note body on disk without telling MEMFS.\n'
      + 'The executor reads MEMFS through the snippet registry, so the\n'
      + 'note will RUN AS ITS PREVIOUS SELF while looking correct\n'
      + 'everywhere a human would check:\n\n'
      + unsynced.join('\n')
      + '\n\nCall `this.syncMemfsAfterBodyWrite(file, newBody, "<site>")`\n'
      + 'after the write.',
    );
  });

  test('the shared helper exists and calls syncUserVaultFile', () => {
    // The two fixed sites route through one helper rather than repeating
    // the host-lookup dance, so there is a single place to change if the
    // sync contract moves.
    assert.match(
      MAIN_TS,
      /private async syncMemfsAfterBodyWrite\(/,
      'syncMemfsAfterBodyWrite helper is gone — the audit above would '
      + 'still pass on raw syncUserVaultFile calls, but the two write '
      + 'sites this drain fixed reference the helper by name.',
    );
    const helper = MAIN_TS.slice(MAIN_TS.indexOf('private async syncMemfsAfterBodyWrite('));
    assert.match(helper.slice(0, 1200), /host\.syncUserVaultFile\(file\.path, body\)/);
  });

  test('the helper syncs file.path, never a path rebuilt from an id', () => {
    // Drain 2026-08-05-0810 fixed exactly this bug in the /generate
    // pre-flight: `${snippetId}.md` resolves to a vault-ROOT path for a
    // note in a non-library subdir, because snippetIdFromPath returns
    // the basename only. Pinned here so the same mistake cannot be
    // reintroduced on the write side.
    const start = MAIN_TS.indexOf('private async syncMemfsAfterBodyWrite(');
    const helper = MAIN_TS.slice(start, start + 1200);
    assert.doesNotMatch(
      helper,
      /\$\{[^}]*[sS]nippetId[^}]*\}\.md/,
      'the helper rebuilds a path from a snippet id — use file.path',
    );
  });
});
