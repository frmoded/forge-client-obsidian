// 2026-11-19-0950 (item 1) - the purple phrase bracket ("phrase_001 · 12 bars" under an extend phrase's Score) is gone, ALL of it. The DOM half is in phrase-lineage-dom.test.ts (an extend tab has no bracket and the controls strip
// follows the Score directly). This is the SOURCE half: nothing of it is left anywhere a leftover could hide - the plugin's code, styles.css, the dev measure scripts, the bundled vault notes and gadgets - found by the
// class, the exported name, the wire-up function and the two strings it showed ("<name> · N bars", "Open <name>: its N bars"). Pins the MECHANISM (the thing is not in the product), not a spelling of today's code: a
// renamed copy that still builds a box under the Score with a "name · N bars" text is caught by the text rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SELF = path.relative(ROOT, import.meta.filename);
const RULES: Array<[string, RegExp]> = [
  ['the bracket class', /forge-phrase-bracket/],
  ['the exported class name', /PHRASE_BRACKET_CLASS/],
  ['the wire-up function', /\bwireBracket\b/],
  ['the box text "<name> · N bars"', /\$\{[^}]*\}\s*·\s*\$\{[^}]*\}\s*bar/],
  ['the hidden name "Open <name>: its N bars"', /Open \$\{[^}]*\}: its \$\{/],
];
/** What the scan finds in one file's text. Pure, so the control below can feed it a planted file. */
export function findBracket(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) for (const [name, re] of RULES) if (re.test(line)) out.push(`${name}: ${line.trim().slice(0, 120)}`);
  return out;
}

function walk(dir: string, keep: (rel: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git' && e.name !== 'scratch') out.push(...walk(full, keep)); } else if (keep(path.relative(ROOT, full))) out.push(full);
  }
  return out;
}
const SRC = walk(path.join(ROOT, 'src'), (r) => /\.ts$/.test(r) && !/\.generated\.ts$/.test(r) && r !== SELF);
const SCRIPTS = walk(path.join(ROOT, 'scripts'), (r) => /\.(ts|mjs|js|sh)$/.test(r));
const VAULTS = walk(path.join(ROOT, 'assets/vaults'), (r) => /\.(md|html|json)$/.test(r));
const CSS = [path.join(ROOT, 'styles.css')];
/** A test or a measure script may NAME the class only to say it is not there (`assert.ok(q('.forge-phrase-bracket') === null)`, `assert.equal(q(...), null)`); every other mention is a stale pin. */
const negativeOnly = (line: string): boolean => /===\s*null/.test(line) || (/assert\.\w+\(/.test(line) && /\bnull\b/.test(line));
const scan = (files: string[]): string[] => files.flatMap((f) => findBracket(fs.readFileSync(f, 'utf8')).filter((x) => !((/\.test\.ts$/.test(f) || /scripts\//.test(f)) && negativeOnly(x))).map((x) => `${path.relative(ROOT, f)}: ${x}`));

test('no bracket in the plugin: not in src (code or tests), not in styles.css', () => {
  assert.ok(SRC.length > 300, `non-vacuity: walked ${SRC.length} source files`);
  assert.ok(fs.readFileSync(CSS[0], 'utf8').length > 50000, 'non-vacuity: styles.css was read');
  assert.deepEqual(scan([...SRC, ...CSS]), []);
});
test('no bracket in the dev measure scripts (they used to click it and read its text)', () => {
  assert.ok(SCRIPTS.length > 20, `non-vacuity: walked ${SCRIPTS.length} scripts`);
  assert.deepEqual(scan(SCRIPTS), []);
});
test('no bracket in the bundled vault notes or gadgets (read only: a mention there is REPORTED, not edited)', () => {
  assert.ok(VAULTS.length > 100, `non-vacuity: walked ${VAULTS.length} vault files`);
  assert.deepEqual(scan(VAULTS), []);
});
test('CONTROL: the scan can fail - a planted file with the class, the name, the function and each of the two strings is found; an ordinary phrase line is not', () => {
  const planted = [
    "bracket.className = 'forge-phrase-bracket';",
    'export const PHRASE_BRACKET_CLASS = x;',
    'wireBracket(el, a, b, c);',
    'bracket.textContent = `${name} · ${ext.bars} bar${s}`;',
    'setSrLabel(bracket, `Open ${name}: its ${ext.bars} bars`);',
  ].join('\n');
  const found = findBracket(planted);
  assert.equal(found.length, 5, found.join('\n'));
  assert.deepEqual(findBracket("const title = `${name} · ${kind}`; // a title, not a box\nbutton.textContent = 'Open note';"), []);
});
