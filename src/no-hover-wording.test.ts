// 2026-11-19-0950 (item 3) - NO HOVER WORDING in anything a person can read. 0800 took the behaviour away (src/no-hover-behavior.test.ts scans for handlers, :hover rules and native titles); this scan is for the WORDS: a
// label, a Notice, an error line, a settings description or a hidden accessible name that tells the person to hover ("hover to light its 12 bars", "hover over a bar", "hovering and clicking a bar still show it")
// describes a thing that no longer exists. It reads every non-test file of src with the TypeScript parser, so comments (which may say what the code used to do) are never seen and a string is a string whatever the
// quotes (single, double, template with or without ${}). Two rules:
//   1. HARD (the driver's): no string contains "hover to" or "hover over" (also hovering / hovers / hovered), case-insensitive.
//   2. WIDE: no PROSE string (one with a space in it) mentions hovering at all, except the entries of the one allow-list below, each with the reason it is not read by a person. A bare token (`'hover'`, `'forge-rhythm-hover'`)
//      is a wire name, not prose, and is not looked at.
// The scan is shown red by a PLANTED string in a temp copy of a real source file (control test).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOVER_TO = /\bhover(?:s|ed|ing)?\s+(?:to|over)\b/i;
const HOVER_ANY = /\bhover(?:s|ed|ing)?\b/i;
/** Prose strings that mention hovering and are NOT shown to a person. One file, each entry with its reason; an entry that matches nothing fails (remove it). */
const ALLOWED: Array<{ file: string; contains: string; reason: string }> = [
  { file: 'src/rhythm-edit-core.ts', contains: 'a hover message without a channel and an integer step', reason: 'the `reason` of a MALFORMED widget message (parseWidgetMessage): it is written to the console trace when a widget sends a broken message, never put on a page or in a Notice; the word names the wire message MSG_HOVER' },
];

/** Every string literal of one file's text as [kind, text, line]: comments never appear; template literals contribute each literal part. */
export function stringsOf(text: string, fileName = 'x.ts'): Array<{ text: string; line: number }> {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Array<{ text: string; line: number }> = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ text: n.text, line: at(n) });
    else if (ts.isTemplateExpression(n)) { out.push({ text: n.head.text, line: at(n) }); for (const s of n.templateSpans) out.push({ text: s.literal.text, line: at(s) }); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
/** [rule, line, excerpt] for one file's text. Pure: the control test feeds it a planted copy. */
export function findHoverWording(text: string, fileName = 'x.ts'): Array<{ rule: 'hover-to' | 'hover-prose'; line: number; text: string }> {
  const found: Array<{ rule: 'hover-to' | 'hover-prose'; line: number; text: string }> = [];
  // a template with ${} is checked as ONE string too, so "hover ${what} to" cannot slip between its parts
  for (const s of stringsOf(text, fileName)) {
    if (HOVER_TO.test(s.text)) found.push({ rule: 'hover-to', line: s.line, text: s.text.slice(0, 100) });
    else if (HOVER_ANY.test(s.text) && /\s/.test(s.text.trim())) found.push({ rule: 'hover-prose', line: s.line, text: s.text.slice(0, 100) });
  }
  return found;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git' && e.name !== 'test-support') out.push(...walk(full)); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/\.generated\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}
const FILES = walk(path.join(ROOT, 'src'));
const used = new Set<(typeof ALLOWED)[number]>();
const findings: string[] = [];
for (const f of FILES) {
  const rel = path.relative(ROOT, f);
  for (const h of findHoverWording(fs.readFileSync(f, 'utf8'), f)) {
    const a = ALLOWED.find((x) => x.file === rel && h.text.includes(x.contains) && h.rule === 'hover-prose');
    if (a) used.add(a); else findings.push(`${rel}:${h.line}: ${h.rule}: ${h.text}`);
  }
}

test('NO string of the plugin tells a person to hover ("hover to", "hover over", hovering, hovers): labels, Notices, error lines, settings descriptions, hidden names', () => {
  assert.ok(FILES.length > 300, `non-vacuity: walked ${FILES.length} source files`);
  assert.deepEqual(findings, []);
});
test('the allow-list is honest: every entry still matches a string, and says why it is not read by a person', () => {
  assert.deepEqual(ALLOWED.filter((a) => !used.has(a)).map((a) => `${a.file}: ${a.contains}`), [], 'entries that match nothing: remove them');
  for (const a of ALLOWED) assert.ok(a.reason.length > 40 && /never|not/i.test(a.reason), `${a.file}: the reason says why a person never reads it`);
});
test('CONTROL: the scan can fail - the very sentence the driver saw ("Open phrase_001 (hover to light its 12 bars)"), a settings sentence about hovering and a "hover over" Notice are found, in single, double and template quotes; a comment that says it, a bare token and a word like "chover" are not', () => {
  const planted = [
    "const a = 'Open phrase_001 (hover to light its 12 bars)';",
    'const b = "Hover over a bar to see where it came from";',
    'const c = `Off by default (hovering and clicking a bar still show it) for ${n} tabs`;',
    "new Notice(`Could not open ${id}: hover over it first`);",
  ].join('\n');
  const found = findHoverWording(planted);
  assert.deepEqual(found.map((f) => f.line), [1, 2, 3, 4], JSON.stringify(found));
  assert.deepEqual(found.map((f) => f.rule), ['hover-to', 'hover-to', 'hover-prose', 'hover-to']);
  const fine = "// hover to light its bars: the old tooltip\n/* hover over a bar */\nconst kind = 'hover'; const t = 'forge-rhythm-hover'; const w = 'chover is not a word here ok';\nlet onHover = 1;";
  assert.deepEqual(findHoverWording(fine), []);
});
test('CONTROL on a TEMP COPY of a real source file: the same file passes clean, with one planted user-visible string it fails; the real file is not touched', () => {
  const real = path.join(ROOT, 'src/settings.ts');
  const original = fs.readFileSync(real, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-hover-control-'));
  try {
    const copy = path.join(dir, 'settings.ts');
    fs.copyFileSync(real, copy);
    // a copy of the file as it is today may itself carry a leftover (that is what the scan is for): count against the copy's own baseline
    const base = findHoverWording(fs.readFileSync(copy, 'utf8'), copy).length;
    fs.appendFileSync(copy, "\nexport const PLANTED = 'Open phrase_001 (hover to light its 12 bars)';\n");
    const after = findHoverWording(fs.readFileSync(copy, 'utf8'), copy);
    assert.equal(after.length, base + 1, 'exactly the planted string is new');
    assert.equal(after.at(-1)!.rule, 'hover-to');
    assert.equal(fs.readFileSync(real, 'utf8'), original, 'the real file is untouched');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
