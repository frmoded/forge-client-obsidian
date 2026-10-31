// 2026-10-30-1050 (M15b) - "Refresh note links" as a DRY RUN over a real vault: every phrase and arrangement note is run through the same pure functions the command uses (refreshPhraseNoteText, refreshArrangementNoteText), IN MEMORY, and a
// table says what the command would do to each: updated / already current / refused (and why), whether the json fence stays byte-identical, whether the person's own frontmatter lines stay, whether a second run would change nothing,
// whether the Description parses back to the json's params, and whether any facet would be stale. NOTHING IS EVER WRITTEN (this script opens no file for writing; a test pins that).
//   node scripts/dev/refresh-dry-run.ts ~/projects/music-playground
import fs from 'node:fs';
import path from 'node:path';
import { readPhraseNote, refreshPhraseNoteText } from '../../src/phrase-core.ts';
import { readArrangementNote, refreshArrangementNoteText } from '../../src/arrangement-core.ts';
import { canonical, parse, type GrammarVault } from '../../src/phrase-grammar-core.ts';
import { sourceLayerStatusOf } from '../../src/source-layer-status-of-body-core.ts';
import { extractDescription } from '../../src/v2-note-core.ts';
import { SOURCE_CHAIN_KEYS } from '../../src/phrase-notes-core.ts';

const root = process.argv[2];
if (!root || !fs.existsSync(root)) { console.error('usage: node scripts/dev/refresh-dry-run.ts <vault folder>'); process.exit(2); }
const list = (dir: string): string[] => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.md') && f !== 'README.md').sort() : []);
const names = (dir: string): string[] => list(dir).map((f) => f.replace(/\.md$/, ''));
const vault: GrammarVault = { bars: names('bars'), phrases: names('phrases'), arrangements: names('arrangements'), kits: names('kits') };
const fenceOf = (t: string): string => t.slice(t.indexOf('```json'));
const frontOf = (t: string): string[] => (/^---\r?\n([\s\S]*?)\r?\n---/.exec(t)?.[1] ?? '').split(/\r?\n/);
const own = (lines: string[]): string[] => lines.filter((l) => l !== '' && !/^(description:|links:|\s+- )/.test(l) && !(SOURCE_CHAIN_KEYS as readonly string[]).includes(l.split(':')[0]));

const rows: string[][] = [['note', 'verdict', 'fence same', 'own lines kept', 'second run no-op', 'Description parses back', 'stale facets']];
let problems = 0;
for (const [dir, refresh, read] of [['phrases', refreshPhraseNoteText, readPhraseNote], ['arrangements', refreshArrangementNoteText, readArrangementNote]] as const) {
  for (const file of list(dir)) {
    const name = file.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(root, dir, file), 'utf8');
    const r = (refresh as (t: string, n: string) => { ok: true; text: string; changed: boolean } | { ok: false; message: string })(text, name);
    if (r.ok === false) { rows.push([`${dir}/${file}`, `REFUSED: ${r.message}`, '-', '-', '-', '-', '-']); problems++; continue; }
    const params = (read as (t: string) => { ok: true; value: any } | { ok: false })(r.text);
    const again = (refresh as (t: string, n: string) => { ok: true; text: string; changed: boolean } | { ok: false })(r.text, name);
    const parsed = params.ok ? parse(extractDescription(r.text), vault) : null;
    const status = await sourceLayerStatusOf(r.text);
    const checks = [fenceOf(r.text) === fenceOf(text), JSON.stringify(own(frontOf(r.text))) === JSON.stringify(own(frontOf(text))), again.ok && !again.changed && again.text === r.text,
      parsed !== null && parsed.ok && params.ok && JSON.stringify(parsed.params) === JSON.stringify(canonical(params.value)), status.staleFacets.length === 0];
    if (!checks.every(Boolean)) problems++;
    rows.push([`${dir}/${file}`, r.changed ? 'would update' : 'already current', ...checks.map((c) => (c ? 'yes' : 'NO')).slice(0, 4), checks[4] ? 'none' : status.staleFacets.join(',')]);
  }
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
for (const row of rows) console.log(row.map((c, i) => c.padEnd(widths[i])).join('  '));
console.log(`\n${rows.length - 1} note(s) looked at, ${problems} problem(s). Nothing was written.`);
process.exit(problems === 0 ? 0 : 1);
