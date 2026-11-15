// 2026-11-15-1220 - rename the VANILLA notes of a vault (no front matter) so that no file name has an underscore, and rewrite every reference. The rules and the pure functions are in rename-vanilla-notes-core.mjs.
//   node scripts/rename-vanilla-notes.mjs <vault>                   dry run: the classes, the collisions, the held notes, the links resolved by rule, the dead links BEFORE; changes nothing
//   node scripts/rename-vanilla-notes.mjs <vault> --apply           `git mv` each note (history kept), rewrite the references, print the dead links AFTER; exit 1 if the rename added a dead link
// Exit 2 on a collision (nothing is touched). The vault must be a git repository with no staged changes under the notes it renames. Re-running after an apply finds nothing to do.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { plan, applyRewrites, deadLinks, inScope, targetPath } from './rename-vanilla-notes-core.mjs';

const args = process.argv.slice(2); const apply = args.includes('--apply'); const vault = path.resolve((args.find((a) => !a.startsWith('--')) ?? '').replace(/^~/, process.env.HOME ?? ''));
if (!args.find((a) => !a.startsWith('--'))) { console.error('usage: rename-vanilla-notes.mjs <vault> [--apply]'); process.exit(64); }
const git = (...a) => execFileSync('git', ['-C', vault, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const notes = tracked.filter((p) => inScope(p)).map((p) => ({ path: p, text: fs.readFileSync(path.join(vault, p), 'utf8') }));
const before = deadLinks(notes, tracked);
const thePlan = plan(notes, tracked);
const list = (title, xs) => { console.log(`\n${title} (${xs.length})`); for (const x of xs) console.log('  ' + x); };
console.log(`vault ${vault}: ${notes.length} Markdown notes; ${thePlan.classes.vanilla.length + thePlan.classes.frontMatter.length} with an underscore in the file name`);
list('RENAME (vanilla)', thePlan.renamed.map((p) => `${p}  ->  ${targetPath(p)}`));
list('HELD: vanilla, but a hashed action/data note links to it (rewriting that link would change the note\'s hash); not renamed, the driver decides', [...thePlan.held].map(([p, why]) => `${p}  <-  ${why.map((w) => `${w.in} ${w.link}`).join('; ')}`));
list('LEFT: front matter (action or data notes, their names are code identifiers)', thePlan.classes.frontMatter);
if (thePlan.collisions.length) { list('COLLISIONS (nothing renamed)', thePlan.collisions.map((c) => `${c.from} -> ${c.to} collides with ${c.with}`)); process.exit(2); }
const result = applyRewrites(notes, thePlan);
list('BARE LINKS THAT NAME TWO NOTES, resolved by rule', result.byRule.map((b) => `${b.in}: [${b.link}] -> ${b.to} (${b.by})${b.renamed ? ', rewritten' : ', unchanged'}`));
list('AMBIGUOUS (left as written)', result.ambiguous.map((a) => `${a.in}: ${a.link} (${a.candidates.join(' | ')})`));
console.log(`\nreferences rewritten: ${result.changes.length} in ${new Set(result.changes.map((c) => c.in)).size} notes`);
console.log(`dead links BEFORE: ${before.length}`);
if (!apply) { console.log('dry run: nothing changed. Add --apply.'); process.exit(0); }
for (const from of thePlan.renamed) git('mv', '--', from, targetPath(from));
const renamedNow = new Map(thePlan.renames);
for (const n of result.notes) { const old = notes.find((o) => o.path === n.path); if (old && old.text !== n.text) fs.writeFileSync(path.join(vault, renamedNow.get(n.path) ?? n.path), n.text); }
const afterNotes = result.notes.map((n) => ({ path: renamedNow.get(n.path) ?? n.path, text: n.text }));
const afterFiles = tracked.map((p) => renamedNow.get(p) ?? p);
const after = deadLinks(afterNotes, afterFiles);
console.log(`dead links AFTER: ${after.length}`);
const key = (d) => `${d.in}\t${d.link}`; const beforeKeys = new Set(before.map((d) => key({ in: renamedNow.get(d.in) ?? d.in, link: d.link })));
const added = after.filter((d) => !beforeKeys.has(key(d)));
if (added.length) { list('NEW DEAD LINKS', added.map((d) => `${d.in}: ${d.link}`)); process.exit(1); }
console.log('no dead link added.');
