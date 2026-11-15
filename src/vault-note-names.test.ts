// 2026-11-15-1220 - no underscores in the names of the music-theory vault's NOTES. The guard (one list, checked in both directions, shown red by a synthetic file):
//   - every Markdown note of the BUNDLED vault whose file name has an underscore is either a Forge action/data note (front matter: its name is a code identifier) or on the HELD list below (a vanilla note a hashed action note links to);
//   - the HELD list names only notes that exist, still have an underscore and are still vanilla (a note that was renamed or got front matter must leave the list);
//   - the notes the driver named resolve by their NEW names through the client's own vault reader, and the OLD names resolve to nothing;
//   - no link of the vault is dead only because it still carries an old spelling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { readVaultFile } from './test-support/vault-source.ts';
// @ts-expect-error the script core is a plain .mjs module
import * as core from '../scripts/rename-vanilla-notes-core.mjs';

const BUNDLE = path.resolve(import.meta.dirname, '../assets/vaults/music-theory');
/** The vanilla notes that keep an underscore on purpose: a hashed action note links to each by name inside its Description, and rewriting that link would change the action note's hash (it would read "edited, not applied"). The driver decides (1220). */
export const HELD: Record<string, string> = {
  'chord/construction/chord_quality.md': 'exercises/build_triad.md',
  'chord/construction/seventh_chord.md': 'exercises/build_seventh_chord.md',
  'chord/function/chord_progression.md': 'exercises/chord_progression.md',
  'chord/function/diatonic_chord.md': 'exercises/chord_progression.md',
  'chord/function/harmonic_function.md': 'exercises/chord_progression.md',
};
function walk(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));
}
const files = walk(BUNDLE).filter((f) => !f.startsWith('.git/'));
const notes = files.filter((f) => core.inScope(f)).map((p) => ({ path: p, text: fs.readFileSync(path.join(BUNDLE, p), 'utf8') }));

/** The offenders of the rule, for a given vault (as data). */
function offenders(vault: { path: string; text: string }[], held: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const n of vault) {
    if (!core.inScope(n.path) || !core.stemOf(n.path).includes('_')) continue;
    if (core.hasFrontMatter(n.text)) continue;                       // an action or data note: its name is a code identifier
    if (!(n.path in held)) bad.push(`${n.path}: a vanilla note with an underscore in its name that is not on the HELD list`);
  }
  for (const h of Object.keys(held)) {
    const n = vault.find((x) => x.path === h);
    if (!n) bad.push(`${h}: on the HELD list but not in the vault (renamed or removed: take it off the list)`);
    else if (core.hasFrontMatter(n.text)) bad.push(`${h}: on the HELD list but now has front matter (take it off the list)`);
  }
  return bad;
}
test('every vanilla note of the bundled music-theory vault has a name with no underscore, except the HELD list; the HELD list is accurate (both directions)', () => {
  assert.deepEqual(offenders(notes, HELD), []);
  assert.ok(notes.length >= 133, `the vault has its notes (${notes.length})`);
});
test('the held notes are held for a reason that is true: the named hashed action note links to each', () => {
  for (const [held, by] of Object.entries(HELD)) {
    const a = notes.find((n) => n.path === by)!; assert.ok(a, by); assert.ok(core.hasHashes(a.text), `${by} carries hashes`);
    assert.ok(a.text.includes(`[[${held.replace(/\.md$/, '')}]]`), `${by} links to ${held}`);
  }
});
test('CONTROL: a vanilla note with an underscore that is not listed, a listed note that is gone, and a listed note that got front matter each go red; an action note with an underscore does not', () => {
  assert.equal(offenders([...notes, { path: 'a/new_note.md', text: 'plain' }], HELD).length, 1);
  assert.equal(offenders(notes, { ...HELD, 'a/gone_note.md': 'x' }).length, 1);
  assert.equal(offenders(notes.map((n) => (n.path === 'chord/function/diatonic_chord.md' ? { ...n, text: '---\ntype: data\n---\n' + n.text } : n)), HELD).length, 1);
  assert.equal(offenders([...notes, { path: 'exercises/some_action.md', text: '---\ntype: action\n---\n' }], HELD).length, 0);
});
test('the notes the driver named resolve by their new names through the client\'s own vault reader (the bundle), and the old names resolve to nothing', () => {
  const NEW: [string, string][] = [
    ['intervals/hearing intervals.md', 'intervals/hearing_intervals.md'], ['intervals/what matters is intervals.md', 'intervals/what_matters_is_intervals.md'], ['intervals/interval notation and jargon.md', 'intervals/interval_notation_and_jargon.md'],
    ['notes/note_notation/Note notation.md', 'notes/note_notation/Note_notation.md'], ['chord/notation/chord symbol.md', 'chord/notation/chord_symbol.md'], ['chord/construction/chord tone.md', 'chord/construction/chord_tone.md'],
  ];
  for (const [now, old] of NEW) {
    const t = readVaultFile('music-theory', now, { cwd: path.resolve(import.meta.dirname, '..'), allowDisagreement: true }); assert.ok(t && t.length > 20, `${now} is read`);
    assert.equal(readVaultFile('music-theory', old, { cwd: path.resolve(import.meta.dirname, '..'), allowDisagreement: true }), null, `${old} is gone`);
    const resolve = core.makeResolver(notes.map((n) => n.path));
    assert.equal(resolve(core.stemOf(now), 'x/Source.md').path, now, `[[${core.stemOf(now)}]] resolves to ${now}`);
    assert.equal(resolve(core.stemOf(old), 'x/Source.md').kind, 'none', `[[${core.stemOf(old)}]] resolves to nothing`);
  }
});
test('no link of the vault is dead only because it still carries an old spelling (a dead link whose name with underscores turned to spaces, or the reverse, IS a note)', () => {
  const dead = core.deadLinks(notes, files) as { in: string; link: string }[];
  const stems = new Set(notes.map((n) => core.stemOf(n.path).toLowerCase()));
  const stale = dead.filter((d) => { const s = core.stemOf(d.link).toLowerCase(); return stems.has(s.replace(/_/g, ' ')) || stems.has(s.replace(/ /g, '_')); });
  assert.deepEqual(stale, []);
  assert.ok(dead.length < 400, 'the checker ran over the whole vault');                       // pre-existing dead links (library Calls such as [[form]]) are not this test's business
});
