// 2026-10-29-0840 (CC 0820 recommendation 3) - the ONE allowlist behind the three scoreFirst mechanism pins (who may import the Score area; who may mention scoreFirst; who may call renderTaggedMusicXML; and, new, who may read the profile).
// The reader and the detector are proven here, without the real tree: a malformed list is refused, the detector sees each right, and (card 16, a control run) a file that is NOT listed and imports, mentions, renders or reads the profile turns
// the pins red - on a copy of the real sources with one synthetic file added, so the detector is shown able to fail on the incident it guards (an unlisted file touching the gate), not merely to pass today.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadAllowlist, measure, parseAllowlist, problems, readSources, type Right } from './test-support/scorefirst-allowlist.ts';

const SRC = import.meta.dirname;
const RIGHTS: Right[] = ['imports', 'mentions', 'renders', 'reads-profile'];
const list = (entries: unknown[], roles: unknown = { 'pure core': { may: ['mentions'] }, owner: { may: ['imports', 'mentions', 'renders', 'reads-profile'] } }) => JSON.stringify({ roles, entries });

test('parseAllowlist accepts a well-formed list and refuses a malformed one with a sentence that names the line', () => {
  const ok = parseAllowlist(list([{ file: 'a-core.ts', role: 'pure core', rights: ['mentions'] }, { file: 'b.ts', role: 'owner', rights: ['imports', 'reads-profile'] }]));
  assert.deepEqual(ok.entries.map((e) => e.file), ['a-core.ts', 'b.ts']);
  assert.throws(() => parseAllowlist(list([{ file: 'a.ts', role: 'nobody', rights: ['mentions'] }])), /a\.ts: the role "nobody" is not one of: pure core, owner/);
  assert.throws(() => parseAllowlist(list([{ file: 'a.ts', role: 'pure core', rights: ['imports'] }])), /a\.ts: the role "pure core" may not have the right "imports"/);
  assert.throws(() => parseAllowlist(list([{ file: 'a.ts', role: 'owner', rights: ['sings'] }])), /a\.ts: "sings" is not a right/);
  assert.throws(() => parseAllowlist(list([{ file: 'a.ts', role: 'owner', rights: ['mentions'] }, { file: 'a.ts', role: 'owner', rights: ['imports'] }])), /a\.ts is listed twice/);
  assert.throws(() => parseAllowlist(list([{ role: 'owner', rights: ['mentions'] }])), /every entry needs a file/);
  assert.throws(() => parseAllowlist(list([{ file: 'a.ts', role: 'owner', rights: [] }])), /a\.ts: list at least one right/);
  assert.throws(() => parseAllowlist('not json'), /the allowlist is not JSON/);
  assert.throws(() => parseAllowlist(list([], { 'pure core': { may: ['reads-profile'] }, owner: { may: ['reads-profile'] } })), /only one role may read the profile \(found: pure core, owner\)/);
  assert.throws(() => parseAllowlist(list([], { 'pure core': { may: 'mentions' } })), /the role "pure core" needs "may": a list of rights \(imports, mentions, renders, reads-profile\)/);
  assert.throws(() => parseAllowlist(list([], { 'pure core': {} })), /the role "pure core" needs "may"/);
  assert.throws(() => parseAllowlist(list([], { 'pure core': { may: ['mentions', 'sings'] } })), /the role "pure core" needs "may"/);
});

test('measure: each right is seen, and a line of comment (// or * or /*) never counts', () => {
  const m = measure({
    'imp.ts': "import { x } from './live-score-dom.ts';\n",
    'men.ts': 'const a = scoreFirst;\n',
    'men2.ts': "const a = 'score_first';\n",
    'ren.ts': 'host.renderTaggedMusicXML(h, p);\n',
    'prof.ts': "import { isScoreFirstVault } from './vault-profile-core.ts';\n",
    'quiet.ts': "// scoreFirst is mentioned here\n/* import { x } from './score-first.ts'; */\n * renderTaggedMusicXML( and isScoreFirstVault\nconst fine = 1;\n",
    'other.ts': "import { y } from './phrase-core.ts';\n",
  });
  assert.deepEqual(m['imp.ts'], ['imports']);
  assert.deepEqual(m['men.ts'], ['mentions']);
  assert.deepEqual(m['men2.ts'], ['mentions']);
  assert.deepEqual(m['ren.ts'], ['renders']);
  assert.deepEqual([...m['prof.ts']].sort(), ['imports', 'mentions', 'reads-profile'].sort(), 'the profile reader is imported, named and read');
  assert.equal(m['quiet.ts'], undefined, 'comment lines are not code');
  assert.equal(m['other.ts'], undefined, 'a file with no right is not in the measure');
});

const GOOD = parseAllowlist(list([{ file: 'core.ts', role: 'pure core', rights: ['mentions'] }, { file: 'asker.ts', role: 'owner', rights: ['imports', 'mentions', 'reads-profile'] }]));
const SOURCES = { 'core.ts': 'export const f = (scoreFirst: boolean) => scoreFirst;\n', 'asker.ts': "import { isScoreFirstVault } from './vault-profile-core.ts';\nexport const scoreFirst = isScoreFirstVault;\n", 'plain.ts': 'export const x = 1;\n' };

test('problems: the tree and the list agree = nothing; an UNLISTED file with a right is named with the line to add; a LISTED right the file no longer exercises is named as stale', () => {
  assert.deepEqual(problems(measure(SOURCES), GOOD), []);
  const unlisted = problems(measure({ ...SOURCES, 'sneaky.ts': "import { plan } from './score-first-core.ts';\n" }), GOOD, 'imports');
  assert.equal(unlisted.length, 1);
  assert.match(unlisted[0], /sneaky\.ts imports the Score area\/profile modules but is not allowed to: add it to scorefirst-allowlist\.json with a role/);
  const stale = problems(measure({ ...SOURCES, 'core.ts': 'export const f = 1;\n' }), GOOD, 'mentions');
  assert.equal(stale.length, 1);
  assert.match(stale[0], /core\.ts is allowed to mention scoreFirst but no longer does: take the line or the right out of scorefirst-allowlist\.json/);
});

test('CONTROL RUN (card 16): on each right, one unlisted synthetic file makes THAT right red', () => {
  const synthetic: Record<Right, string> = {
    imports: "import { a } from './live-score-core.ts';\n",
    mentions: 'const quietly = scoreFirst;\n',
    renders: 'musicEdition.renderTaggedMusicXML(host, p, t);\n',
    'reads-profile': 'const answer = await isScoreFirstVault(app.vault);\n',
  };
  for (const right of RIGHTS) {
    const m = measure({ ...SOURCES, 'sneaky.ts': synthetic[right] });
    assert.equal(problems(m, GOOD, right).filter((p) => p.startsWith('sneaky.ts')).length, 1, `${right}: the unlisted file is caught`);
  }
  // and a file that does ONE thing is blamed for that thing only (the profile reader's name is also a mention of scoreFirst, so it is two)
  const onlyRenders = measure({ ...SOURCES, 'sneaky.ts': synthetic.renders });
  for (const right of RIGHTS.filter((r) => r !== 'renders')) assert.deepEqual(problems(onlyRenders, GOOD, right), [], `a renderer is not blamed for ${right}`);
});

test('CONTROL RUN on the REAL sources: add one unlisted file that imports, mentions, renders and reads the profile to a copy of src/, and the real allowlist names it for all four', () => {
  const real = readSources(SRC);
  const list = loadAllowlist();
  for (const right of RIGHTS) assert.deepEqual(problems(measure(real), list, right), [], `${right}: the real tree matches the real allowlist today`);
  const m = measure({ ...real, 'zz-unlisted-view.ts': "import { x } from './score-first.ts';\nconst a = scoreFirst; host.renderTaggedMusicXML(h, p);\nawait isScoreFirstVault(v);\n" });
  for (const right of RIGHTS) assert.ok(problems(m, list, right).some((p) => p.startsWith('zz-unlisted-view.ts')), `${right}: caught`);
});

test('NON-VACUITY: the detector sees the real tree (a measure that sees nothing would pass every pin), and the real list has the roles the pins talk about', () => {
  const m = measure(readSources(SRC));
  const count = (r: Right) => Object.values(m).filter((rs) => rs.includes(r)).length;
  assert.ok(count('imports') >= 8, `imports: ${count('imports')}`);
  assert.ok(count('mentions') >= 15, `mentions: ${count('mentions')}`);
  assert.ok(count('renders') >= 6, `renders: ${count('renders')}`);
  assert.ok(count('reads-profile') >= 3, `reads-profile: ${count('reads-profile')}`);
  const list = loadAllowlist();
  assert.deepEqual(Object.keys(list.roles).sort(), ['asks the profile', 'engraves a Score and never sees the gate', 'pure core taking the gate\'s answer as input', 'reads the published flag', 'registers the gate', 'view glue given the gate as a port'].sort());
  assert.deepEqual(list.entries.filter((e) => e.rights.includes('reads-profile')).map((e) => e.role), ['asks the profile', 'asks the profile', 'asks the profile', 'asks the profile'], 'only the asking role reads the profile');
});

test('problems: the sentence for each right, both directions, is the one a person can act on (the line to add, the line to take out)', () => {
  const sentence: Record<Right, [string, string]> = {
    imports: ['imports the Score area/profile modules but is not allowed to', 'is allowed to import the Score area/profile modules but no longer does'],
    mentions: ['mentions scoreFirst but is not allowed to', 'is allowed to mention scoreFirst but no longer does'],
    renders: ['calls renderTaggedMusicXML but is not allowed to', 'is allowed to call renderTaggedMusicXML but no longer does'],
    'reads-profile': ['reads the profile but is not allowed to', 'is allowed to read the profile but no longer does'],
  };
  const code: Record<Right, string> = { imports: "import { a } from './score-first.ts';\n", mentions: 'const q = scoreFirst;\n', renders: 'h.renderTaggedMusicXML(a);\n', 'reads-profile': 'isScoreFirstVault(v);\n' };
  for (const right of RIGHTS) {
    const unlisted = problems(measure({ 'x.ts': code[right] }), parseAllowlist(list([])), right);
    assert.deepEqual(unlisted, [`x.ts ${sentence[right][0]}: add it to scorefirst-allowlist.json with a role`]);
    const stale = problems({}, parseAllowlist(list([{ file: 'x.ts', role: 'owner', rights: [right] }])), right);
    assert.deepEqual(stale, [`x.ts ${sentence[right][1]}: take the line or the right out of scorefirst-allowlist.json`]);
  }
});

test('comment-line stripping keeps code lines: a real import on the line after a comment still counts (and a block-comment line never does)', () => {
  assert.deepEqual(measure({ 'a.ts': "// scoreFirst\nconst q = scoreFirst;\n" })['a.ts'] ?? null, ['mentions']);
  assert.equal(measure({ 'a.ts': "/* scoreFirst\n * scoreFirst */\nconst fine = 1;\n" })['a.ts'], undefined);
});
