// score_first_experiment M1 (drain 2026-10-21-1100) — "New bar" and the Score-under-the-Beat-Box decisions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BAR_FOLDER, LEAN_SCORE_NOTE, barName, barPath, createNewBar, isFileExistsError, newBarAvailable, nextBarName, planNewBar, scorePanelPlan, widgetFillsPane, type NewBarPorts,
} from './score-first-core.ts';
import { RHYTHM_CHOICE, RHYTHM_STARTER, dataNoteContent, rhythmNoteTemplate } from './new-note-core.ts';
import { decideDefaultView, type DefaultViewInput } from './rhythm-default-view-core.ts';
import { formatRhythmJson, readRhythmNote } from './rhythm-edit-core.ts';

// ---- names -----------------------------------------------------------------------------------------------------------------------

test('bar names are bar_001, bar_002, … and grow past three digits without breaking', () => {
  assert.equal(barName(1), 'bar_001');
  assert.equal(barName(2), 'bar_002');
  assert.equal(barName(42), 'bar_042');
  assert.equal(barName(999), 'bar_999');
  assert.equal(barName(1000), 'bar_1000');
});

test('the first bar of an empty vault is bar_001', () => {
  assert.equal(nextBarName([]), 'bar_001');
});

test('the next name is one past the highest bar_NNN — not the first gap, and not confused by names that merely look similar', () => {
  assert.equal(nextBarName(['bar_001']), 'bar_002');
  assert.equal(nextBarName(['bar_001', 'bar_002', 'bar_003']), 'bar_004');
  assert.equal(nextBarName(['bar_001', 'bar_003']), 'bar_004', 'a deleted bar_002 is not handed out again');
  assert.equal(nextBarName(['bar_003', 'bar_001', 'bar_002']), 'bar_004', 'the order of the listing does not matter');
  assert.equal(nextBarName(['bar_009']), 'bar_010');
  assert.equal(nextBarName(['bar_999']), 'bar_1000');
  assert.equal(nextBarName(['notes', 'bar', 'bar_', 'bar_x', 'xbar_005', 'bar_005x', 'Bar_005', 'bar_5a']), 'bar_001', 'only exact bar_<digits> counts');
  assert.equal(nextBarName(new Set(['bar_007', 'groove'])), 'bar_008', 'any iterable');
});

test('a bar lands in bars/, at the vault root\'s bars folder whatever note is open', () => {
  assert.equal(BAR_FOLDER, 'bars');
  assert.equal(barPath('bar_001'), 'bars/bar_001.md');
});

// ---- the plan --------------------------------------------------------------------------------------------------------------------

test('planNewBar: the next free name, its path, and exactly the starter "New Forge note -> Rhythm (Beat Box)" writes', () => {
  const plan = planNewBar({ existingBasenames: ['bar_001'], exists: () => false });
  assert.equal(plan.ok, true);
  if (plan.ok !== true) return;
  assert.equal(plan.name, 'bar_002');
  assert.equal(plan.path, 'bars/bar_002.md');
  assert.equal(plan.content, dataNoteContent('bar_002', RHYTHM_CHOICE), 'ONE decision function for the starter content');
  assert.equal(plan.content, rhythmNoteTemplate('bar_002'));
});

test('the starter is a valid rhythm note that opens in the Beat Box: 4/4, 16 steps, kick and snare', () => {
  const plan = planNewBar({ existingBasenames: [], exists: () => false });
  if (plan.ok !== true) return assert.fail('expected a plan');
  const note = readRhythmNote(plan.content);
  assert.equal(note.ok, true);
  if (note.ok !== true) return;
  assert.equal(note.value.data.time_signature, '4/4');
  assert.equal(note.value.data.steps, 16);
  assert.deepEqual(Object.keys(note.value.data.channels), ['kick', 'snare']);
  assert.equal(formatRhythmJson(note.value.data), formatRhythmJson(RHYTHM_STARTER));
  const input = { settingOn: true, edition: 'music', location: 'main', viewType: 'markdown', isPlainMarkdownView: true, frontmatterIsCandidate: true, bodyIsRhythm: true, mark: null, extension: 'md', filePath: plan.path } as DefaultViewInput;
  assert.deepEqual(decideDefaultView(input), { swap: true, reason: 'swap', target: 'beatbox' }, 'the default-view logic opens it in the Beat Box');
});

test('a name taken in the same instant is NOT a dialog: the next number is tried, then a plain message if even that fails', () => {
  const taken = new Set(['bars/bar_001.md', 'bars/bar_002.md']);
  const plan = planNewBar({ existingBasenames: [], exists: (p) => taken.has(p) });        // the listing was stale: it saw nothing, the vault has two
  assert.equal(plan.ok, true);
  if (plan.ok === true) assert.equal(plan.path, 'bars/bar_003.md');
  const never = planNewBar({ existingBasenames: [], exists: () => true, attempts: 3 });
  assert.equal(never.ok, false);
  if (never.ok === false) assert.match(never.message, /free bar name/);
});

test('the path planNewBar returns never exists already (collision is impossible by construction on a fresh listing)', () => {
  for (let n = 0; n < 40; n++) {
    const existing = Array.from({ length: n }, (_, i) => barName(i + 1));
    const plan = planNewBar({ existingBasenames: existing, exists: (p) => existing.some((b) => barPath(b) === p) });
    assert.equal(plan.ok, true);
    if (plan.ok === true) assert.ok(!existing.includes(plan.name), `${plan.name} is new`);
  }
});

test('isFileExistsError recognises Obsidian\'s refusal and nothing else', () => {
  assert.equal(isFileExistsError(new Error('File already exists.')), true);
  assert.equal(isFileExistsError('file already exists'), true);
  assert.equal(isFileExistsError(new Error('ENOENT: no such file')), false);
  assert.equal(isFileExistsError(new Error('The folder does not exist')), false, 'a different refusal that merely says "exist"');
  assert.equal(isFileExistsError(undefined), false);
  assert.equal(isFileExistsError({ message: 'already exists' }), false, 'only Error instances and strings');
});

// ---- what is offered, and what the Beat Box tab shows under the widget ----------------------------------------------------------

test('"New bar" is offered only where the vault is score-first', () => {
  assert.equal(newBarAvailable(true), true);
  assert.equal(newBarAvailable(false), false);
});

test('the Beat Box tab: no Score area at all unless the vault is score-first — in EITHER edition', () => {
  assert.equal(scorePanelPlan({ scoreFirst: false, edition: 'music' }), 'none');
  assert.equal(scorePanelPlan({ scoreFirst: false, edition: 'lean' }), 'none');
});

test('score-first: the live Score in the music edition, one line of explanation in the lean edition', () => {
  assert.equal(scorePanelPlan({ scoreFirst: true, edition: 'music' }), 'score');
  assert.equal(scorePanelPlan({ scoreFirst: true, edition: 'lean' }), 'lean-note');
  assert.match(LEAN_SCORE_NOTE, /music edition/);
  assert.ok(!LEAN_SCORE_NOTE.includes('\n'), 'one line');
});

test('the widget fills the pane exactly as before (min-height 100%) when there is no Score under it, and not otherwise', () => {
  assert.equal(widgetFillsPane('none'), true);
  assert.equal(widgetFillsPane('score'), false);
  assert.equal(widgetFillsPane('lean-note'), false);
});

// ---- the whole action, with the vault injected ----------------------------------------------------------------------------------------

type F = { path: string };
function bars(init: { folder?: boolean; files?: string[]; createThrows?: Array<unknown>; folderThrows?: unknown } = {}) {
  const files = new Set(init.files ?? []);
  let folder = init.folder ?? false;
  const log: string[] = [];
  const throws = [...(init.createThrows ?? [])];
  const ports: NewBarPorts<F> = {
    folderExists: () => folder,
    createFolder: async () => { log.push('createFolder'); if (init.folderThrows) throw init.folderThrows; folder = true; },
    listBarBasenames: () => [...files].map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
    exists: (p) => files.has(p),
    create: async (p, content) => {
      log.push(`create ${p}`);
      const t = throws.shift();
      if (t !== undefined) { files.add(p); throw t; }           // the file that "took the name" is now there
      files.add(p); void content; return { path: p };
    },
    open: async (f) => { log.push(`open ${f.path}`); },
    notify: (m) => { log.push(`notice: ${m}`); },
  };
  return { ports, log, files };
}

test('createNewBar: in an empty vault it makes bars/, creates bars/bar_001.md with the starter, and opens it — in that order, with no notice', async () => {
  const r = bars();
  const res = await createNewBar(r.ports);
  assert.deepEqual(res, { ok: true, path: 'bars/bar_001.md' });
  assert.deepEqual(r.log, ['createFolder', 'create bars/bar_001.md', 'open bars/bar_001.md']);
});

test('createNewBar: bars/ already there -> no folder call; the next bar gets the next number', async () => {
  const r = bars({ folder: true, files: ['bars/bar_001.md', 'bars/bar_002.md'] });
  const res = await createNewBar(r.ports);
  assert.deepEqual(res, { ok: true, path: 'bars/bar_003.md' });
  assert.deepEqual(r.log, ['create bars/bar_003.md', 'open bars/bar_003.md']);
});

test('createNewBar: the starter content is the Rhythm (Beat Box) note, written exactly once', async () => {
  const contents: string[] = [];
  const r = bars({ folder: true });
  const orig = r.ports.create;
  r.ports.create = async (p, c) => { contents.push(c); return orig(p, c); };
  await createNewBar(r.ports);
  assert.deepEqual(contents, [rhythmNoteTemplate('bar_001')]);
});

test('createNewBar: a name taken in the same instant ("File already exists.") tries the NEXT number, with no notice', async () => {
  const r = bars({ folder: true, createThrows: [new Error('File already exists.')] });
  const res = await createNewBar(r.ports);
  assert.deepEqual(res, { ok: true, path: 'bars/bar_002.md' });
  assert.deepEqual(r.log, ['create bars/bar_001.md', 'create bars/bar_002.md', 'open bars/bar_002.md']);
});

test('createNewBar: if the name keeps being taken it stops after three tries with a plain notice (no dialog, no endless loop)', async () => {
  const boom = () => new Error('File already exists.');
  const r = bars({ folder: true, createThrows: [boom(), boom(), boom(), boom()] });
  const res = await createNewBar(r.ports);
  assert.equal(res.ok, false);
  assert.equal(r.log.filter((l) => l.startsWith('create ')).length, 3);
  assert.ok(r.log.some((l) => l.startsWith('notice: Could not make a new bar')), r.log.join(' | '));
  assert.ok(!r.log.some((l) => l.startsWith('open ')));
});

test('createNewBar: another failure (disk, permissions) is a notice that names the reason and a console.error naming the function; nothing is opened', async () => {
  const errors: unknown[][] = [];
  const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const r = bars({ folder: true, createThrows: [new Error('EACCES: permission denied')] });
    const res = await createNewBar(r.ports);
    assert.equal(res.ok, false);
    assert.ok(r.log.includes('notice: Could not make a new bar: EACCES: permission denied'));
    assert.ok(!r.log.some((l) => l.startsWith('open ')));
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /createNewBar/);
});

test('createNewBar: "Folder already exists." from a race is fine; any other folder failure stops before a note is created', async () => {
  const ok = bars({ folderThrows: new Error('Folder already exists.') });
  assert.equal((await createNewBar(ok.ports)).ok, true);
  assert.deepEqual(ok.log, ['createFolder', 'create bars/bar_001.md', 'open bars/bar_001.md']);
  const orig = console.error; console.error = () => { /* expected */ };
  try {
    const bad = bars({ folderThrows: new Error('read-only file system') });
    const res = await createNewBar(bad.ports);
    assert.equal(res.ok, false);
    assert.ok(!bad.log.some((l) => l.startsWith('create bars/')), 'no note without its folder');
    assert.ok(bad.log.some((l) => l.includes('read-only file system')));
  } finally {
    console.error = orig;
  }
});

test('createNewBar: a failure to OPEN is reported (the bar exists; the person is told why nothing appeared)', async () => {
  const orig = console.error; console.error = () => { /* expected */ };
  try {
    const r = bars({ folder: true });
    r.ports.open = async () => { throw new Error('no leaf'); };
    const res = await createNewBar(r.ports);
    assert.equal(res.ok, false);
    assert.ok(r.log.includes('create bars/bar_001.md'));
    assert.ok(r.log.some((l) => l.includes('no leaf')));
  } finally {
    console.error = orig;
  }
});
