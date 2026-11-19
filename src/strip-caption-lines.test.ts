// 2026-11-19-0955 - scripts/dev/strip-caption-lines.mjs removes the italic caption paragraph directly under an html-embed or an image figure of a CAPTIONED file (an entry in captions.json), in every note of the vault; it keeps an italic line anywhere else, under
// an uncaptioned figure, and every line that is not italic from its first to its last character; it is idempotent; a dry run writes nothing. The fixture is a tiny vault in a temp dir (not a git repository: the script then walks the folder; on a real vault it lists `git ls-files '*.md'`).
// The last test pins the real (bundled) vault: no note keeps such a line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { stripCaptionLines, isItalicParagraph, captionKey, stripVault } from '../scripts/dev/strip-caption-lines.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'scripts/dev/strip-caption-lines.mjs');
const G = 'a/resources/html/gadget.html', S = 'a/resources/images/fig.svg', U = 'a/resources/html/plain.html', V = 'a/resources/images/plain.svg';
const caps = { [G]: { title: 'T', line: 'L' }, [S]: { title: 'T', line: 'L' } };

test('an italic paragraph directly under a captioned embed or image figure is removed; the blank line above it goes with it when one is left below', () => {
  const note = `Intro.\n\n\`\`\`html-embed\n${G}\n300\n\`\`\`\n\n*Gadget: do this and that.*\n\nNext paragraph.\n\n![[${S}]]\n\n*A figure caption, said twice.*\n\nEnd.\n`;
  const r = stripCaptionLines(note, caps);
  assert.equal(r.text, `Intro.\n\n\`\`\`html-embed\n${G}\n300\n\`\`\`\n\nNext paragraph.\n\n![[${S}]]\n\nEnd.\n`);
  assert.deepEqual(r.removed.map((x) => [x.line, x.figure, x.text]), [[8, G, '*Gadget: do this and that.*'], [14, S, '*A figure caption, said twice.*']]);
});
test('the line directly under the closing fence (no blank between), an underscore italic, a wrapped italic paragraph, the end of the file: all go, nothing else does', () => {
  assert.equal(stripCaptionLines(`\`\`\`html-embed\n${G}\n300\n\`\`\`\n*glued to the fence*\n\nAfter.\n`, caps).text, `\`\`\`html-embed\n${G}\n300\n\`\`\`\n\nAfter.\n`);
  assert.equal(stripCaptionLines(`![[${S}|400]]\n\n_underscore caption_\n\nAfter.\n`, caps).text, `![[${S}|400]]\n\nAfter.\n`);
  assert.equal(stripCaptionLines(`![[${S}]]\n\n*a caption that\nwraps over two lines*\n\nAfter.\n`, caps).text, `![[${S}]]\n\nAfter.\n`);
  assert.equal(stripCaptionLines(`Text.\n\n![[${S}]]\n\n*last line of the file*\n`, caps).text, `Text.\n\n![[${S}]]\n`, 'the blank above goes at the end of the file too');
});
test('kept: an italic line elsewhere, under an UNCAPTIONED embed or figure, a bold line, a line that only contains italics, prose, and an italic line that is not the first paragraph after the figure', () => {
  const keep = [
    `Prose.\n\n*An italic line in the middle of a note.*\n\nMore prose.\n`,
    `\`\`\`html-embed\n${U}\n300\n\`\`\`\n\n*Under an uncaptioned embed.*\n`,
    `![[${V}]]\n\n*Under an uncaptioned figure.*\n`,
    `![[${S}]]\n\n**Bold, not italic.**\n`,
    `![[${S}]]\n\n***Bold italic.***\n`,
    `![[${S}]]\n\nA line with *some* italics inside.\n`,
    `![[${S}]]\n\n*one* and *two*\n`,
    `![[${S}]]\n\nProse first.\n\n*Then an italic line: not directly under.*\n`,
    `![[${S}]]\n\n*italic, then more text* here\n`,
    `\`\`\`html-embed\n${G}\n300\n\`\`\`\n\n- *a list item in italics*\n`,
    `![[no/such/captioned.svg]]\n\n*Not in captions.json.*\n`,
  ];
  for (const k of keep) { const r = stripCaptionLines(k, caps); assert.equal(r.text, k, JSON.stringify(k)); assert.equal(r.removed.length, 0); }
});
test('an italic line under a captioned figure is removed even when it is NOT the caption text (vault-wide, not only exact matches)', () => {
  const note = `![[${S}]]\n\n*Something the wizard wrote that has nothing to do with the caption at all.*\n\nEnd.\n`;
  assert.equal(stripCaptionLines(note, caps).text, `![[${S}]]\n\nEnd.\n`);
});
test('a bare file name is resolved to the one captions.json key that ends in it; an ambiguous name is not', () => {
  const keys = new Set([G, S, 'b/fig.svg']);
  assert.equal(captionKey('gadget.html', keys), G); assert.equal(captionKey(S, keys), S); assert.equal(captionKey('fig.svg', keys), null, 'two keys end in fig.svg'); assert.equal(captionKey('plain.svg', keys), null);
  assert.equal(stripCaptionLines(`![[gadget.html]]\n\n*x*\n`, caps).text, `![[gadget.html]]\n`);
});
test('idempotent: a second run finds nothing and returns the same bytes', () => {
  const note = `\`\`\`html-embed\n${G}\n300\n\`\`\`\n\n*Caption.*\n\nText.\n\n![[${S}]]\n\n*Caption two.*\n`;
  const once = stripCaptionLines(note, caps), twice = stripCaptionLines(once.text, caps);
  assert.equal(twice.text, once.text); assert.equal(twice.removed.length, 0); assert.equal(once.removed.length, 2);
});
test('isItalicParagraph: one italic run from the first to the last character, nothing else', () => {
  assert.ok(isItalicParagraph(['*a*'])); assert.ok(isItalicParagraph(['*a b, c: d.*'])); assert.ok(isItalicParagraph(['_a_'])); assert.ok(isItalicParagraph(['*a', 'b*']));
  for (const bad of [['**a**'], ['*a* b'], ['a *b*'], ['*a* *b*'], ['**'], ['* *'], ['*a'], ['a*'], [''], ['plain']]) assert.ok(!isItalicParagraph(bad), JSON.stringify(bad));
});

function makeVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-caption-lines-'));
  const put = (rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  put('captions.json', JSON.stringify(caps));
  put('n/one.md', `A.\n\n\`\`\`html-embed\n${G}\n300\n\`\`\`\n\n*Old caption.*\n\nB.\n`);
  put('n/two.md', `![[${V}]]\n\n*Stays: the figure has no caption.*\n`);
  put('n/three.md', `![[${S}]]\n\n*Old caption two.*\n`);
  put('n/four.md', `Just text.\n\n*An italic aside.*\n`);
  put('.hidden/skip.md', `![[${S}]]\n\n*A dot folder is not a note folder.*\n`);
  return dir;
}
test('the command: a dry run lists the files and each line and writes nothing; --write writes only the notes that had one; the second run finds nothing', () => {
  const dir = makeVault();
  try {
    const before = fs.readdirSync(path.join(dir, 'n')).map((f) => [f, fs.readFileSync(path.join(dir, 'n', f), 'utf8')]);
    const dry = spawnSync(process.execPath, [CLI, '--vault', dir], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /n\/one\.md:8 .*\*Old caption\.\*/); assert.match(dry.stdout, /n\/three\.md:3 .*\*Old caption two\.\*/); assert.match(dry.stdout, /2 italic caption lines in 2 notes \(dry run/);
    assert.doesNotMatch(dry.stdout, /two\.md|four\.md|skip\.md/);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'n')).map((f) => [f, fs.readFileSync(path.join(dir, 'n', f), 'utf8')]), before, 'a dry run writes nothing');
    const w = spawnSync(process.execPath, [CLI, '--vault', dir, '--write'], { encoding: 'utf8' });
    assert.equal(w.status, 0, w.stderr); assert.match(w.stdout, /2 italic caption lines in 2 notes removed/);
    assert.equal(fs.readFileSync(path.join(dir, 'n/one.md'), 'utf8'), `A.\n\n\`\`\`html-embed\n${G}\n300\n\`\`\`\n\nB.\n`);
    assert.equal(fs.readFileSync(path.join(dir, 'n/three.md'), 'utf8'), `![[${S}]]\n`);
    for (const f of ['two.md', 'four.md']) assert.equal(fs.readFileSync(path.join(dir, 'n', f), 'utf8'), before.find((b) => b[0] === f)![1], `${f} is untouched`);
    const again = spawnSync(process.execPath, [CLI, '--vault', dir, '--write'], { encoding: 'utf8' });
    assert.match(again.stdout, /0 italic caption lines in 0 notes/);
    assert.equal(stripVault(dir).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('the bundled music-theory vault keeps no italic caption line under a captioned figure (and the dry run on it says 0)', () => {
  const VAULT = path.join(ROOT, 'assets/vaults/music-theory');
  const captions = JSON.parse(fs.readFileSync(path.join(VAULT, 'captions.json'), 'utf8'));
  const walk = (d: string): string[] => fs.readdirSync(path.join(VAULT, d), { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
  const bad: string[] = [];
  for (const n of walk('')) { const r = stripCaptionLines(fs.readFileSync(path.join(VAULT, n), 'utf8'), captions); for (const x of r.removed) bad.push(`${n}:${x.line} ${x.text}`); }
  assert.deepEqual(bad, []);
});
