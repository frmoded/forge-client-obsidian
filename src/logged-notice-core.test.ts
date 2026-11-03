// 2026-11-03-1155-9 (PRIORITY) - every toast the plugin shows is ALSO a `[forge-notice]` line in the console, so a sentence that vanished can be copied from there. The line, and the CHOKE POINT: no file but logged-notice.ts makes an Obsidian Notice
// (so a new one cannot be added without the line), and forgeNotice (the panel) logs its errors. Guards assert the mechanism, not a list of today's call sites.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { noticeLine } from './logged-notice-core.ts';

test('the evidence line: the tag, then the text on ONE line (breaks folded, the ends trimmed)', () => {
  assert.equal(noticeLine('Restored phrases/phrase_001.md to last commit.'), '[forge-notice] Restored phrases/phrase_001.md to last commit.');
  assert.equal(noticeLine('Arrangement: the change could not be written.\n  (disk full)\n'), '[forge-notice] Arrangement: the change could not be written. (disk full)');
  assert.equal(noticeLine('  x  '), '[forge-notice] x');
});

const SRC = import.meta.dirname;
const production = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'));
const code = (f: string): string => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('MECHANISM PIN 2026-11-03-1155-9 (if the design moves this SHOULD go red: reassess, do not just rewrite): the ONE place a toast is made is logged-notice.ts; no other production file calls `new Notice(`', () => {
  const offenders = production.filter((f) => f !== 'logged-notice.ts' && /(?<![`\w])new Notice\(/.test(code(f)));
  assert.deepEqual(offenders, []);
  assert.match(code('logged-notice.ts'), /console\.info\(noticeLine\(/, 'it writes the line BEFORE the toast');
  assert.ok(code('logged-notice.ts').indexOf('console.info') < code('logged-notice.ts').indexOf('new Notice('));
  assert.ok(production.filter((f) => /\bloggedNotice\(/.test(code(f))).length >= 8, 'non-vacuity: the sites really go through it');
  assert.match(code('forge-notice.ts'), /kind === 'error'\) console\.info\(noticeLine\(text\)\)/, 'the panel path logs its errors too');
});

test('MECHANISM PIN 2026-11-03-1155-9: the message surfaces draw their text through copyableMessage (selectable, a Copy button beside it): the bar, the three strips\' status, the Score\'s status and the notebook\'s alerts', () => {
  assert.match(code('description-bar-dom.ts'), /copyableMessage\(message, view\.message\)/);
  assert.equal((code('phrase-dom.ts').match(/setStatus\(text\) \{ copyableMessage\(statusEl, text\); \}/g) ?? []).length, 3);
  assert.ok(!/statusEl\.textContent = text/.test(code('phrase-dom.ts')), 'no strip sets its status text behind the helper');
  assert.match(code('live-score-dom.ts'), /else copyableMessage\(statusEl, text\)/);
  assert.match(code('notebook-dom.ts'), /kind === 'alert'\) copyableMessage\(message, text\)/);
});
