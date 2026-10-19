// Drain 2026-10-19-1800 (addendum to 1530) — a library note that carries the OLD writer's blank line before the closing `# Python` fence must not be
// rewritten by a Run for that alone.
//
// CCQA 2026-10-19 (build 939db14): a Moda Run rewrote `forge-moda/simulation.md` (md5 156f5580… -> e5a6655b…), one blank line removed before the closing
// fence. The premise of the addendum was "19 shipped notes still carry the blank line"; they do not — every source vault at origin/main is clean (pinned
// below, and Iteration 82 healed them) — and that file is not shipped bytes: the ClaudeQA vault's copy has a plugin-written `# Python` (the shipped note has
// none) from an old Run, git-logged "vault local edits post-install 2026-08-04". The same state exists in EVERY vault whose library notes were Run under a
// writer older than Iteration 82, so the fix is not a re-bake at the source but the library guard: a difference that is only a blank line at the end of a
// python fence is cosmetic, exactly as a trailing-whitespace or lineage-only difference already is (planPythonWriteBack, Iteration 77).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';
import { applyPythonWriteBack, differsOnlyCosmetically, planPythonWriteBack } from './python-write-back-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField } from './v2-note-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QA_COPY = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'vault', 'moda_simulation_qa_copy_old_baked_blank_line.md'), 'utf8');
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

async function runInput(body: string) {
  // The Python a Run hands the writer for this note: the engine's transpile; for this fixture it is what the section already holds, trimmed (the
  // delta CCQA observed was the blank line and nothing else).
  const python = (extractPythonSection(body) ?? '').trim();
  const layer = await whichLayerIsSource(body, {
    extractDescription, extractRecipeSection, extractPythonSection,
    getFrontmatterField: (b: string, k: string) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; },
  } as never);
  return { python, pythonHash: await computeFacetHash(python), englishHash: null, sourceLayer: layer, resolvedSlots: null };
}

test('PROVENANCE: the fixture is the ClaudeQA vault copy CCQA recorded (md5 156f5580…) and it really carries the blank line before the closing fence', () => {
  assert.equal(md5(QA_COPY).slice(0, 8), '156f5580');
  assert.match(QA_COPY, /\n  return final\n\n```\n$/);
});

test('INCIDENT: the writer\'s output for that note is CCQA\'s "after" md5 (e5a6655b…) — one blank line removed — and for a LIBRARY note it is not written', async () => {
  const input = await runInput(QA_COPY);
  const after = applyPythonWriteBack(QA_COPY, input);
  assert.equal(md5(after).slice(0, 8), 'e5a6655b', 'the same bytes CCQA saw after the Run');
  assert.equal(QA_COPY.split('\n').length - after.split('\n').length, 1, 'exactly one line fewer');
  const lib = planPythonWriteBack(QA_COPY, input, { library: true });
  assert.equal(lib.write, false, 'a Run must not dirty a library note for a blank line');
  assert.equal(lib.next, QA_COPY);
});

test('a COHORT note (not under a library directory) keeps its maintenance: the same delta IS written (healed)', async () => {
  const input = await runInput(QA_COPY);
  const plan = planPythonWriteBack(QA_COPY, input, { library: false });
  assert.equal(plan.write, true);
  assert.equal(md5(plan.next).slice(0, 8), 'e5a6655b');
});

test('differsOnlyCosmetically: blank lines at the END of a python fence are cosmetic; nothing else inside the fence is', () => {
  const head = '---\ntype: action\n---\n\n# Python\n\n```python\n';
  const a = `${head}x = 1\ny = 2\n\`\`\`\n`;
  assert.equal(differsOnlyCosmetically(`${head}x = 1\ny = 2\n\n\`\`\`\n`, a), true, 'one blank line');
  assert.equal(differsOnlyCosmetically(`${head}x = 1\ny = 2\n\n\n  \n\`\`\`\n`, a), true, 'several, incl. whitespace-only');
  assert.equal(differsOnlyCosmetically(`${head}x = 1\n\ny = 2\n\`\`\`\n`, a), false, 'a blank line INSIDE the code is a real difference');
  assert.equal(differsOnlyCosmetically(`${head}x = 1\ny = 3\n\n\`\`\`\n`, a), false, 'a code change hiding behind a blank-line change is still a change');
  assert.equal(differsOnlyCosmetically(`${head}x = 1\ny = 2\n\`\`\`\n\n\n`, a), true, 'and the long-standing trailing blank lines at EOF still are');
});

test('SCOPE: only a python fence — the same blank line at the end of any OTHER fence, or in prose, is not cosmetic', () => {
  const base = (fence: string, tail: string) => `---\ntype: action\n---\n\n# Recipe\n\n\`\`\`${fence}\nline\n${tail}\`\`\`\n`;
  assert.equal(differsOnlyCosmetically(base('text', '\n'), base('text', '')), false);
  assert.equal(differsOnlyCosmetically(base('python', '\n'), base('python', '')), true);
  assert.equal(differsOnlyCosmetically('# A\n\ntext\n\n# B\n', '# A\n\ntext\n# B\n'), false);
  // the python fence is CLOSED when it ends: a later fence of another kind is out of scope again
  const two = (blankPy: string, blankText: string) => `---\ntype: action\n---\n\n\`\`\`python\nx = 1\n${blankPy}\`\`\`\n\n\`\`\`text\nnote\n${blankText}\`\`\`\n`;
  assert.equal(differsOnlyCosmetically(two('\n', ''), two('', '')), true, 'the python fence\'s blank line is cosmetic');
  assert.equal(differsOnlyCosmetically(two('', '\n'), two('', '')), false, 'the text fence after it is not');
});

test('a first-time stamp is STILL a real difference (the guard was widened by one thing only)', async () => {
  const unstamped = QA_COPY.replace(/^python_hash: .*\n/m, '');
  const plan = planPythonWriteBack(unstamped, await runInput(QA_COPY), { library: true });
  assert.equal(plan.write, true, 'python_hash is added: not cosmetic');
});

test('PREMISE PIN: no shipped note recorded from the source vaults carries a blank line before its closing python fence (they were healed in Iteration 82)', () => {
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'), 'utf8')) as { notes: Record<string, { note?: string }> };
  const baked = Object.entries(rec.notes).filter(([, v]) => typeof v.note === 'string' && /```python\n(?:(?!```)[\s\S])*\n\n```/.test(v.note as string)).map(([k]) => k);
  assert.deepEqual(baked, []);
  assert.ok(Object.values(rec.notes).filter((v) => typeof v.note === 'string').length >= 30, 'and the pin looked at the notes (non-vacuity)');
});
