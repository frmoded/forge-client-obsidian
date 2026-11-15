// 2026-11-15-1220 - rename-vanilla-notes: the pure core on a small synthetic vault, and the script end to end on a throw-away git repository (history kept, collision stops it, a second run finds nothing).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as core from './rename-vanilla-notes-core.mjs';

const HERE = import.meta.dirname;
const FM = (extra = '') => `---\ntype: action\n${extra}---\n\n# Description\n\nbody\n`;
const note = (p, text) => ({ path: p, text });

// ---- classification
test('classify: vanilla (no front matter) with an underscore in the FILE name are renamed; front matter and underscore-free names are not; excluded directories are not looked at; folder names never change', () => {
  const notes = [note('a/hearing_intervals.md', 'plain'), note('exercises/build_triad.md', FM()), note('b/Chord.md', 'plain'), note('.forge/x_y.md', 'plain'), note('.obsidian/snip_it.md', 'plain'), note('music_instruments/rhythm_box.md', 'plain')];
  const c = core.classify(notes);
  assert.deepEqual(c.vanilla, ['a/hearing_intervals.md', 'music_instruments/rhythm_box.md']);
  assert.deepEqual(c.frontMatter, ['exercises/build_triad.md']);
  assert.deepEqual(c.untouched, ['b/Chord.md']);
  assert.equal(core.targetPath('music_instruments/rhythm_box.md'), 'music_instruments/rhythm box.md');       // the folder keeps its underscore
  assert.equal(core.targetPath('notes/note_notation/Note_notation.md'), 'notes/note_notation/Note notation.md');   // case unchanged
  assert.equal(core.targetPath('why_12_notes.md'), 'why 12 notes.md');
});
test('collisions: a new name that already exists (case-insensitive, as on macOS) or that two renames share stops the run', () => {
  assert.deepEqual(core.collisions(['x/a_b.md', 'x/a b.md'], ['x/a_b.md']).map((c) => c.with), ['x/a b.md']);
  assert.deepEqual(core.collisions(['x/A_b.md', 'x/a B.md'], ['x/A_b.md']).map((c) => c.with), ['x/a B.md']);
  assert.equal(core.collisions(['x/a_b.md', 'y/a_b.md'], ['x/a_b.md', 'y/a_b.md']).length, 0);          // same stem in two folders is no collision
  assert.equal(core.collisions(['x/a_b.md', 'x/a b.md', 'x/a_b_.md'], ['x/a_b.md']).length, 1);
  assert.equal(core.collisions(['x/a_b.md'], ['x/a_b.md']).length, 0);
});

// ---- rewriting one text
const vault = (extra = []) => [note('i/hearing_intervals.md', 'plain'), note('i/Index.md', 'x'), note('t/Rule_of_eighteen.md', 'plain'), note('n/why_12_notes.md', 'plain')].filter((n) => !extra.some((e) => e.path === n.path)).concat(extra);
function run(extra, wantRenamed = null) {
  const notes = vault(extra); const files = notes.map((n) => n.path);
  const plan = core.plan(notes, files); if (wantRenamed) assert.deepEqual(plan.renamed.sort(), wantRenamed.sort());
  return { plan, ...core.applyRewrites(notes, plan), notes0: notes };
}
const textOf = (r, p) => r.notes.find((n) => n.path === p).text;
test('wikilinks: every form is rewritten and only the target: plain, alias (the display text stays), heading, block, embed, a path prefix with and without .md, several on one line, case as written', () => {
  const src = 'a [[hearing_intervals]] b [[hearing_intervals|Hearing Intervals]] c [[hearing_intervals#Why]] d [[hearing_intervals^blk]] e ![[hearing_intervals]] f [[i/hearing_intervals]] g [[i/hearing_intervals.md|x_y]] h [[Hearing_Intervals]] i [[why_12_notes]] [[Rule_of_eighteen#h|Rule of Eighteen]]';
  const r = run([note('i/Index.md', src)]);
  assert.equal(textOf(r, 'i/Index.md'), 'a [[hearing intervals]] b [[hearing intervals|Hearing Intervals]] c [[hearing intervals#Why]] d [[hearing intervals^blk]] e ![[hearing intervals]] f [[i/hearing intervals]] g [[i/hearing intervals.md|x_y]] h [[Hearing Intervals]] i [[why 12 notes]] [[Rule of eighteen#h|Rule of Eighteen]]');
});
test('assets and non-notes: an embed of a file with an extension, a link to a missing note, a link inside a code fence of another name are untouched', () => {
  const src = '![[music_instruments/foo_bar.svg]] ![[some_picture.png]] [[missing_note]] [[http_thing]]';
  const r = run([note('i/Index.md', src)]); assert.equal(textOf(r, 'i/Index.md'), src);
});
test('navigation bars: data-href and href are both rewritten, the visible text follows only when it IS the old name (an alias text stays), other attributes and notes stay', () => {
  const src = '<span>&larr; <a class="internal-link" data-href="hearing_intervals" href="hearing_intervals" style="color:#1963D1;">hearing_intervals</a></span><a class="internal-link" data-href="Rule_of_eighteen" href="Rule_of_eighteen">Rule of Eighteen</a><a class="internal-link" data-href="n/why_12_notes" href="n/why_12_notes">why_12_notes</a><a class="internal-link" data-href="Index" href="Index">Index</a>';
  const r = run([note('i/Index.md', src)]);
  assert.equal(textOf(r, 'i/Index.md'), '<span>&larr; <a class="internal-link" data-href="hearing intervals" href="hearing intervals" style="color:#1963D1;">hearing intervals</a></span><a class="internal-link" data-href="Rule of eighteen" href="Rule of eighteen">Rule of Eighteen</a><a class="internal-link" data-href="n/why 12 notes" href="n/why 12 notes">why 12 notes</a><a class="internal-link" data-href="Index" href="Index">Index</a>');
});
test('a bare link that names two notes: the one in the source note\'s own folder; else the one vanilla note; else AMBIGUOUS, left as written and listed (never guessed)', () => {
  const extra = [note('chord/slash_chord.md', 'plain'), note('exercises/slash_chord.md', FM()), note('exercises/Exercises.md', '[[slash_chord]]'), note('chord/Chord.md', '[[slash_chord]]'), note('other/Other.md', '[[slash_chord]]'), note('exercises/b.md', 'x')];
  const r = run(extra);
  assert.equal(textOf(r, 'exercises/Exercises.md'), '[[slash_chord]]', 'same folder as the exercise: the exercise, unchanged');
  assert.equal(textOf(r, 'chord/Chord.md'), '[[slash chord]]', 'the one vanilla note');
  assert.equal(textOf(r, 'other/Other.md'), '[[slash chord]]');
  const two = [note('a/n_x.md', 'plain'), note('b/n_x.md', 'plain'), note('c/C.md', '[[n_x]]')]; const files = two.map((n) => n.path);
  const plan = core.plan(two, files); const out = core.applyRewrites(two, plan);
  assert.equal(out.ambiguous.length, 1); assert.equal(out.notes.find((n) => n.path === 'c/C.md').text, '[[n_x]]');
});
test('HELD: a vanilla note a HASHED action note links to is not renamed, and that action note\'s text is never changed; an action note without hashes is rewritten like any other', () => {
  const hashed = FM('description_hash: abc\nrecipe_hash: def\n').replace('body', 'See [[i/hearing_intervals]] here.');
  const plain = FM('recipe_version: 1\n').replace('body', 'See [[n/why_12_notes]] here.');
  const r = run([note('ex/build_x.md', hashed), note('ex/plain_x.md', plain)]);
  assert.deepEqual(r.plan.renamed.sort(), ['n/why_12_notes.md', 't/Rule_of_eighteen.md'], 'hearing_intervals is held');
  assert.deepEqual([...r.plan.held.keys()], ['i/hearing_intervals.md']);
  assert.equal(textOf(r, 'ex/build_x.md'), hashed);
  assert.match(textOf(r, 'ex/plain_x.md'), /\[\[n\/why 12 notes\]\]/);
});
test('the dead-link checker: counts links that resolve to no note and no file; a rewrite that is right adds none, a link left behind by a rename is found', () => {
  const extra = [note('i/Index.md', '[[hearing_intervals]] [[Rule_of_eighteen|r]] <a data-href="why_12_notes" href="why_12_notes">why_12_notes</a> [[gone]] ![[pic.png]]')];
  const notes = vault(extra); const files = [...notes.map((n) => n.path), 'a/pic.png'];
  assert.deepEqual(core.deadLinks(notes, files).map((d) => d.link), ['gone']);
  const plan = core.plan(notes, files); const out = core.applyRewrites(notes, plan);
  const afterFiles = files.map((f) => plan.renames.get(f) ?? f); const afterNotes = out.notes.map((n) => ({ path: plan.renames.get(n.path) ?? n.path, text: n.text }));
  assert.deepEqual(core.deadLinks(afterNotes, afterFiles).map((d) => d.link), ['gone'], 'still the one that was dead before, and no other');
  const broken = notes.map((n) => ({ path: plan.renames.get(n.path) ?? n.path, text: n.text }));            // the files renamed, the links NOT: the checker sees it
  assert.ok(core.deadLinks(broken, afterFiles).length > 1);
});
test('P3: apart from the underscores of the renamed names, no text changes (before and after, with every renamed name normalised, are identical); a second run changes nothing', () => {
  const src = 'Intro [[hearing_intervals|Hearing]] text_with_underscores and `code_span` and a [[why_12_notes]].\n<a class="internal-link" data-href="Rule_of_eighteen" href="Rule_of_eighteen">Rule_of_eighteen</a>\n';
  const r = run([note('i/Index.md', src)]);
  const norm = (t) => t.replace(/hearing_intervals|why_12_notes|Rule_of_eighteen/g, (m) => m.replace(/_/g, ' '));
  for (const n of r.notes0) assert.equal(norm(textOf(r, n.path)), norm(n.text), n.path);
  assert.match(textOf(r, 'i/Index.md'), /text_with_underscores and `code_span`/);                          // underscores that are not names stay
  const notes2 = r.notes.map((n) => ({ path: r.plan.renames.get(n.path) ?? n.path, text: n.text })); const files2 = notes2.map((n) => n.path);
  const plan2 = core.plan(notes2, files2); const again = core.applyRewrites(notes2, plan2);
  assert.deepEqual(plan2.renamed, []); assert.equal(again.changes.length, 0);
});

// ---- the script, end to end, on a throw-away git repository
function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvn-test-')); const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 't'); g('config', 'commit.gpgsign', 'false');
  for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); }
  g('add', '-A'); g('commit', '-q', '-m', 'init'); return { dir, g };
}
const script = (dir, ...a) => spawnSync('node', [path.join(HERE, 'rename-vanilla-notes.mjs'), dir, ...a], { encoding: 'utf8' });
test('the script: a dry run changes nothing; --apply renames with git mv (history kept), rewrites the links, adds no dead link; a second --apply finds nothing', () => {
  const { dir, g } = repo({ 'i/hearing_intervals.md': 'plain\n', 'i/Index.md': 'see [[hearing_intervals]] and [[i/hearing_intervals|h]]\n', 'x_y/Other.md': '[[Index]]\n' });
  try {
    const dry = script(dir); assert.equal(dry.status, 0, dry.stderr); assert.ok(fs.existsSync(path.join(dir, 'i/hearing_intervals.md')) && g('status', '--porcelain') === '');
    const r = script(dir, '--apply'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /no dead link added/);
    assert.ok(fs.existsSync(path.join(dir, 'i/hearing intervals.md')) && !fs.existsSync(path.join(dir, 'i/hearing_intervals.md')));
    assert.equal(fs.readFileSync(path.join(dir, 'i/Index.md'), 'utf8'), 'see [[hearing intervals]] and [[i/hearing intervals|h]]\n');
    assert.ok(fs.existsSync(path.join(dir, 'x_y/Other.md')), 'the folder keeps its underscore');
    g('add', '-A'); g('commit', '-q', '-m', 'rename');
    assert.match(g('log', '--follow', '--format=%s', '--', 'i/hearing intervals.md'), /rename[\s\S]*init/, 'history follows the rename');
    const again = script(dir, '--apply'); assert.equal(again.status, 0); assert.match(again.stdout, /RENAME \(vanilla\) \(0\)/); assert.match(again.stdout, /references rewritten: 0 in 0 notes/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('the script: a collision stops it with exit 2 and a list, and touches nothing', () => {
  const { dir, g } = repo({ 'i/hearing_intervals.md': 'a\n', 'i/Hearing intervals.md': 'b\n' });
  try { const r = script(dir, '--apply'); assert.equal(r.status, 2); assert.match(r.stdout, /COLLISIONS/); assert.equal(g('status', '--porcelain'), ''); assert.ok(fs.existsSync(path.join(dir, 'i/hearing_intervals.md'))); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- CONTROL: the damaged core goes red
async function damaged(from, to) {
  const src = fs.readFileSync(path.join(HERE, 'rename-vanilla-notes-core.mjs'), 'utf8'); assert.ok(src.includes(from), `premise: ${from}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvn-ctl-')); const file = path.join(dir, 'core.mjs'); fs.writeFileSync(file, src.replace(from, to));
  try { return await import(pathToFileURL(file).href + '?' + Math.random()); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('CONTROL: a rewrite that changes the alias text, one that rewrites a hashed note, a collision check that is case-sensitive, a classifier that renames front-matter notes, and a resolver that guesses an ambiguous link each go red', async () => {
  const alias = await damaged("replaced = `${bang}[[${next}${frag}${alias}]]`;", "replaced = `${bang}[[${next}${frag}${alias.replace(/_/g, ' ')}]]`;");
  const notes = [note('i/a_b.md', 'p'), note('i/I.md', '[[a_b|x_y]]')]; const files = notes.map((n) => n.path);
  assert.equal(core.applyRewrites(notes, core.plan(notes, files)).notes[1].text, '[[a b|x_y]]');
  assert.notEqual(alias.applyRewrites(notes, alias.plan(notes, files)).notes[1].text, '[[a b|x_y]]', 'alias control');
  const hashed = await damaged("if (hasHashes(text)) return { text, changes: [], ambiguous: [], byRule: [] };", "if (false) return { text, changes: [], ambiguous: [], byRule: [] };");
  const hn = [note('i/a_b.md', 'p'), note('e/h.md', FM('description_hash: x\n').replace('body', '[[i/a_b]]'))]; const hf = hn.map((n) => n.path);
  assert.deepEqual([...core.plan(hn, hf).held.keys()], ['i/a_b.md']);
  assert.equal(core.applyRewrites(hn, core.plan(hn, hf)).notes[1].text, hn[1].text);
  const noHold = await damaged("const heldMap = held(notes, cands);", "const heldMap = new Map();");
  assert.deepEqual(noHold.plan(hn, hf).renamed, ['i/a_b.md'], 'hold control');
  const cs = await damaged("const have = new Map(); for (const p of allPaths) have.set(p.toLowerCase(), p);", "const have = new Map(); for (const p of allPaths) have.set(p, p);");
  assert.equal(cs.collisions(['x/A_b.md', 'x/a B.md'], ['x/A_b.md']).length, 0, 'case-sensitive control');
  const fmRename = await damaged("(hasFrontMatter(n.text) ? out.frontMatter : out.vanilla).push(n.path);", "out.vanilla.push(n.path);");
  assert.equal(fmRename.classify([note('e/b_c.md', FM())]).vanilla.length, 1, 'classifier control');
  const guess = await damaged("return { kind: 'ambiguous', candidates: cands };\n  };", "return { kind: 'note', path: cands[0] };\n  };");
  assert.equal(guess.makeResolver(['a/n_x.md', 'b/n_x.md', 'c/C.md'])('n_x', 'c/C.md', () => true).kind, 'note', 'resolver control');
  assert.equal(core.makeResolver(['a/n_x.md', 'b/n_x.md', 'c/C.md'])('n_x', 'c/C.md', () => true).kind, 'ambiguous');
});
