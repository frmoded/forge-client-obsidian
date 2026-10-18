// Drain 2026-10-13-2100 §5 / L11 / L42 — across ALL FOUR bundled vaults (forge-moda, music-theory, forge-tutorial, music-core), the
// plugin's open-time writers and its Run-time write reach a FIXED POINT: whatever they rewrite on the first pass, the second pass
// leaves alone. This is the churn guard (the v0.2.249 english_hash strip ↔ v0.2.251 keep-writer cycle is the founding instance of
// two correct writers undoing each other): a note may be rewritten ONCE, never forever.
//
// It does NOT say a shipped note is read-only — `scripts/check-open-time-writes.mjs --report` lists the notes that are not (that is a
// finding, reported, not a failure). It says the rewriting converges, per domain, through the plugin's own functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { backfillV113Shape } from './v11-3-backfill-core.ts';
import { planOpenSeed } from './open-seed-core.ts';
import { applyPythonWriteBack } from './python-write-back-core.ts';
import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';
import {
  extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape,
  removeFrontmatterField, replacePythonSection, setFrontmatterField,
} from './v2-note-core.ts';

const VAULTS = path.resolve(import.meta.dirname, '..', 'assets', 'vaults');
const str = (b: string, k: string) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };
const H = {
  extractDescription, extractRecipeSection, extractPythonSection,
  getFrontmatterField: str, setFrontmatterField, removeFrontmatterField, replacePythonSection, computeFacetHash,
};

function* mdFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* mdFiles(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

async function writeBack(body: string): Promise<string> {
  const python = extractPythonSection(body)!;
  return applyPythonWriteBack(body, {
    python,
    pythonHash: await computeFacetHash(python),
    englishHash: null,
    sourceLayer: await whichLayerIsSource(body, H),
    resolvedSlots: null,
  });
}

for (const vault of ['forge-moda', 'music-theory', 'forge-tutorial', 'music-core']) {
  test(`${vault}: open → backfill → sweep → Run-write converges (the second pass changes nothing)`, async () => {
    const dir = path.join(VAULTS, vault);
    assert.ok(fs.existsSync(dir), `${dir} must be tracked under assets/vaults`);
    let actionNotes = 0;
    const failures: string[] = [];
    for (const file of mdFiles(dir)) {
      const body = fs.readFileSync(file, 'utf8');
      if (str(body, 'type') !== 'action' || !isV2Shape(body)) continue;
      actionNotes++;
      const rel = `${vault}/${path.relative(dir, file).split(path.sep).join('/')}`;

      const first = await backfillV113Shape(body, H);
      const second = await backfillV113Shape(first.newBody, H);
      if (second.changed) failures.push(`${rel}: the file-open backfill is not idempotent`);

      const seed = await planOpenSeed(first.newBody, { ...H, getFrontmatterField: (b, k) => getFrontmatterField(b, k) });
      if (seed.write) failures.push(`${rel}: the layout-ready sweep still wants to write after the backfill ran`);

      if (extractPythonSection(first.newBody) !== null) {
        const w1 = await writeBack(first.newBody);
        const w2 = await writeBack(w1);
        if (w1 !== w2) failures.push(`${rel}: the Run-time write is not idempotent`);
      }
    }
    assert.ok(actionNotes > 0, `${vault}: the vault must contain V2 action notes, or this test proves nothing`);
    assert.deepEqual(failures, []);
  });
}

// Drain 2026-10-18-1200 — the test above iterates the Run writer ALONE the second time. A churn between an open-time writer and the Run
// writer (the backfill's lineage repair undoing the Run writer's root, and vice versa) is invisible to it. The property that was missing:
// once a note is what the plugin would write, merely OPENING it — in an authoring vault, where the open-time writers are not
// library-gated — writes nothing, and so does the next open-then-Run cycle.
import { restampNote } from '../scripts/restamp-library-notes-core.mjs';

for (const vault of ['forge-moda', 'music-theory', 'forge-tutorial', 'music-core']) {
  test(`${vault}: once restamped, a note is left alone by the file-open backfill and the layout-ready sweep (no open <-> Run churn)`, async () => {
    const dir = path.join(VAULTS, vault);
    let actionNotes = 0;
    const failures: string[] = [];
    for (const file of mdFiles(dir)) {
      const body = fs.readFileSync(file, 'utf8');
      if (str(body, 'type') !== 'action' || !isV2Shape(body)) continue;
      actionNotes++;
      const rel = `${vault}/${path.relative(dir, file).split(path.sep).join('/')}`;
      const { next: settled } = await restampNote(body);
      const open = await backfillV113Shape(settled, H);
      if (open.changed) failures.push(`${rel}: opening the restamped note still writes (${JSON.stringify(open.actions)})`);
      const seed = await planOpenSeed(settled, { ...H, getFrontmatterField: (b, k) => getFrontmatterField(b, k) });
      if (seed.write) failures.push(`${rel}: the layout-ready sweep still writes the restamped note`);
      if (extractPythonSection(settled) !== null) {
        const afterRun = await writeBack(settled);
        if (afterRun !== settled) failures.push(`${rel}: Run still rewrites the restamped note`);
      }
    }
    assert.ok(actionNotes > 0, `${vault}: the vault must contain V2 action notes, or this test proves nothing`);
    assert.deepEqual(failures, []);
  });
}
