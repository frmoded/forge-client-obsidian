// 2026-10-29-0820 (M10 slice 1): what "New kit" and "New arrangement" do over a fake vault - folder made when absent, a free name, a note that reads back to what was chosen, the evidence line, the note opened, every trouble one sentence and nothing
// thrown - and when the commands are offered (score-first vaults only: P3). Host-faithful: the fake vault refuses a create on a path that exists, with the error shape Obsidian gives ("File already exists.").
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readArrangementNote } from './arrangement-core.ts';
import { readKitNote } from './kit-core.ts';
import {
  NEW_ARRANGEMENT_COMMAND_ID, NEW_ARRANGEMENT_COMMAND_NAME, NEW_KIT_COMMAND_ID, NEW_KIT_COMMAND_NAME, OPEN_ARRANGEMENT_COMMAND_ID, OPEN_ARRANGEMENT_COMMAND_NAME, createArrangement, createKit, newArrangementAvailable, newKitAvailable, openArrangementAvailable, type CreatePorts,
} from './kit-arrangement-flow-core.ts';

function vault(opts: { files?: string[]; folders?: string[]; failCreate?: string; raceOnce?: string; noFolder?: boolean; folderRace?: boolean; alwaysTaken?: boolean } = {}) {
  const store = new Map<string, string>((opts.files ?? []).map((p) => [p, 'existing']));
  const folders = new Set(opts.folders ?? []);
  const log: { created: string[]; opened: string[]; notices: string[]; lines: string[]; folders: string[]; attempts: string[] } = { created: [], opened: [], notices: [], lines: [], folders: [], attempts: [] };
  let race = opts.raceOnce;
  const ports: CreatePorts<string> = {
    folderExists: (f) => folders.has(f),
    createFolder: async (f) => { if (opts.noFolder) throw new Error('read-only vault'); folders.add(f); if (opts.folderRace) throw new Error('Folder already exists.'); log.folders.push(f); },
    exists: (p) => store.has(p),
    create: async (p, content) => {
      log.attempts.push(p);
      if (opts.alwaysTaken) throw new Error('File already exists.');          // a vault whose listing is stale: the name looks free every time and is never free
      if (opts.failCreate === p) throw new Error('disk full');
      if (race === p) { race = undefined; store.set(p, 'someone else\'s'); }          // another writer took the name between the check and the write
      if (store.has(p)) throw new Error('File already exists.');
      store.set(p, content); log.created.push(p); return p;
    },
    open: async (f) => { log.opened.push(f); },
    notify: (m) => { log.notices.push(m); },
    trace: (l) => { log.lines.push(l); },
    isAlreadyExists: (e) => /already exists/i.test(String((e as Error)?.message)),
  };
  return { ports, store, log, folders };
}

test('New kit: the kits folder is made when the vault lacks it, the note reads back to what was chosen (engine order), the evidence line is printed, the note is opened, the person is told', async () => {
  const v = vault();
  const r = await createKit(v.ports, { name: 'rock', channels: ['hihat', 'kick', 'snare'] });
  assert.deepEqual(r, { ok: true, path: 'kits/rock.md' });
  assert.deepEqual(v.log.folders, ['kits']);
  const read = readKitNote(v.store.get('kits/rock.md')!);
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(read.value, { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] });
  assert.deepEqual(v.log.lines, ['[forge-kit] created kits/rock.md channels=kick,snare,hihat']);
  assert.deepEqual(v.log.opened, ['kits/rock.md']);
  assert.deepEqual(v.log.notices, ['Created the rock kit (kits/rock.md).']);
  const existing = vault({ folders: ['kits'] });
  assert.deepEqual((await createKit(existing.ports, { name: 'x', channels: ['kick'] })).ok, true);
  assert.deepEqual(existing.log.folders, [], 'an existing folder is not made again');
});

test('New kit: a name that is taken gets the next free one and the person is told; a name another writer takes at the last moment is handled the same way; the note is never overwritten', async () => {
  const taken = vault({ files: ['kits/rock.md'], folders: ['kits'] });
  assert.deepEqual(await createKit(taken.ports, { name: 'rock', channels: ['kick'] }), { ok: true, path: 'kits/rock_2.md' });
  assert.equal(taken.store.get('kits/rock.md'), 'existing', 'the existing kit is untouched');
  assert.match(taken.log.notices[0], /^A kit called rock already exists; created kits\/rock_2\.md instead\.$/);
  const raced = vault({ folders: ['kits'], raceOnce: 'kits/rock.md' });
  assert.deepEqual(await createKit(raced.ports, { name: 'rock', channels: ['kick'] }), { ok: true, path: 'kits/rock_2.md' });
  assert.equal(raced.store.get('kits/rock.md'), 'someone else\'s');
});

test('New kit: every refusal is one sentence, nothing is written, nothing opens, nothing throws', async () => {
  const cases: Array<[Parameters<typeof createKit>[1], RegExp]> = [
    [{ name: '', channels: ['kick'] }, /^New kit: The kit name "" is not usable\./], [{ name: 'a/b', channels: ['kick'] }, /^New kit: The kit name "a\/b" is not usable\./],
    [{ name: 'rock', channels: [] }, /^New kit: A kit needs at least one channel\.$/], [{ name: 'rock', channels: ['triangle'] }, /^New kit: Unknown channel "triangle"/], [{ name: 'rock', channels: ['kick', 'kick'] }, /^New kit: The channel "kick" is listed twice\.$/],
  ];
  for (const [choice, re] of cases) {
    const v = vault();
    const r = await createKit(v.ports, choice);
    assert.equal(r.ok, false, JSON.stringify(choice));
    if (r.ok === false) assert.match(r.message, re);
    assert.deepEqual([v.log.created, v.log.opened, v.log.lines, v.log.folders], [[], [], [], []], JSON.stringify(choice));
    assert.deepEqual(v.log.notices, [(r as { message: string }).message], 'the person sees the same sentence');
  }
  const w = vault({ failCreate: 'kits/rock.md' });
  assert.deepEqual(await createKit(w.ports, { name: 'rock', channels: ['kick'] }), { ok: false, message: 'New kit failed: disk full' });
  const ro = vault({ noFolder: true });
  assert.deepEqual(await createKit(ro.ports, { name: 'rock', channels: ['kick'] }), { ok: false, message: 'New kit failed: read-only vault' });
});

test('New arrangement: arrangements/arr_001.md in a vault that had no such folder, the note reads back to the tracks, the evidence line and the open happen once, then arr_002 ...', async () => {
  const v = vault();
  const tracks = [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }];
  assert.deepEqual(await createArrangement(v.ports, tracks), { ok: true, path: 'arrangements/arr_001.md' });
  assert.deepEqual(v.log.folders, ['arrangements']);
  const read = readArrangementNote(v.store.get('arrangements/arr_001.md')!);
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(read.value.tracks, tracks);
  assert.deepEqual(v.log.lines, ['[forge-arrangement] created arrangements/arr_001.md tracks=phrase_003@rock,phrase_009@latin']);
  assert.deepEqual(v.log.opened, ['arrangements/arr_001.md']);
  assert.deepEqual(v.log.notices, ['Created arrangements/arr_001.md.']);
  assert.deepEqual(await createArrangement(v.ports, tracks), { ok: true, path: 'arrangements/arr_002.md' });
  const raced = vault({ folders: ['arrangements'], raceOnce: 'arrangements/arr_001.md' });
  assert.deepEqual(await createArrangement(raced.ports, tracks), { ok: true, path: 'arrangements/arr_002.md' });
  assert.equal(raced.store.get('arrangements/arr_001.md'), 'someone else\'s');
});

test('New arrangement: no tracks, a kit twice, an unsafe name, a failing write: one sentence each, nothing written, nothing thrown', async () => {
  const cases: Array<[Array<{ kit: string; phrase: string }>, RegExp]> = [
    [[], /^New arrangement: An arrangement needs at least one track/], [[{ kit: 'rock', phrase: 'a' }, { kit: 'rock', phrase: 'b' }], /^New arrangement: The kit "rock" plays two tracks/],
    [[{ kit: '../x', phrase: 'a' }], /^New arrangement: tracks\[0\]: the kit "\.\.\/x" is not a kit name/],
  ];
  for (const [tracks, re] of cases) {
    const v = vault();
    const r = await createArrangement(v.ports, tracks);
    assert.equal(r.ok, false);
    if (r.ok === false) assert.match(r.message, re);
    assert.deepEqual([v.log.created, v.log.opened, v.log.lines, v.log.folders], [[], [], [], []]);
  }
  const w = vault({ folders: ['arrangements'], failCreate: 'arrangements/arr_001.md' });
  assert.deepEqual(await createArrangement(w.ports, [{ kit: 'rock', phrase: 'a' }]), { ok: false, message: 'New arrangement failed: disk full' });
});

test('when the commands are offered: score-first vaults only; New arrangement needs a kit and a phrase; Open arrangement as Score is for an arrangement note (not README.md, not a note elsewhere)', () => {
  assert.deepEqual([NEW_KIT_COMMAND_NAME, NEW_ARRANGEMENT_COMMAND_NAME, OPEN_ARRANGEMENT_COMMAND_NAME], ['New kit', 'New arrangement', 'Open arrangement as Score']);
  assert.equal(newKitAvailable({ scoreFirst: true }), true);
  assert.equal(newKitAvailable({ scoreFirst: false }), false);
  assert.equal(newArrangementAvailable({ scoreFirst: true, kitCount: 1, phraseCount: 1 }), true);
  assert.equal(newArrangementAvailable({ scoreFirst: true, kitCount: 0, phraseCount: 3 }), false);
  assert.equal(newArrangementAvailable({ scoreFirst: true, kitCount: 2, phraseCount: 0 }), false);
  assert.equal(newArrangementAvailable({ scoreFirst: false, kitCount: 2, phraseCount: 3 }), false);
  assert.equal(openArrangementAvailable({ scoreFirst: true, activePath: 'arrangements/arr_001.md' }), true);
  for (const activePath of [null, 'arrangements/README.md', 'phrases/phrase_001.md', 'arrangements/deep/arr_001.md', 'kits/rock.md']) assert.equal(openArrangementAvailable({ scoreFirst: true, activePath }), false, String(activePath));
  assert.equal(openArrangementAvailable({ scoreFirst: false, activePath: 'arrangements/arr_001.md' }), false);
});

test('a folder another writer made at the last moment is not a failure; a folder that cannot be made is (the vault says "Folder already exists." and the work goes on)', async () => {
  const k = vault({ folderRace: true });
  assert.deepEqual(await createKit(k.ports, { name: 'rock', channels: ['kick'] }), { ok: true, path: 'kits/rock.md' });
  const a = vault({ folderRace: true });
  assert.deepEqual(await createArrangement(a.ports, [{ kit: 'rock', phrase: 'p' }]), { ok: true, path: 'arrangements/arr_001.md' });
});

test('a name that can never be had gives up after 20 tries with one sentence, asking for a different name each time, and never overwrites or opens anything', async () => {
  const k = vault({ folders: ['kits'], alwaysTaken: true });
  assert.deepEqual(await createKit(k.ports, { name: 'rock', channels: ['kick'] }), { ok: false, message: 'New kit: could not find a free kit name.' });
  assert.equal(k.log.attempts.length, 20, 'twenty tries, no more, no fewer');
  assert.equal(new Set(k.log.attempts).size, 20, 'a different name each time: the name that was just refused is not asked for again');
  assert.deepEqual([k.log.opened, k.log.lines, k.log.notices], [[], [], ['New kit: could not find a free kit name.']]);
  const a = vault({ folders: ['arrangements'], alwaysTaken: true });
  assert.deepEqual(await createArrangement(a.ports, [{ kit: 'rock', phrase: 'p' }]), { ok: false, message: 'New arrangement: could not find a free arrangement name.' });
  assert.equal(a.log.attempts.length, 20);
  assert.equal(new Set(a.log.attempts).size, 20, 'the arrangement asks for a new number each time too');
  assert.deepEqual([a.log.opened, a.log.lines, a.log.notices], [[], [], ['New arrangement: could not find a free arrangement name.']]);
});

test('the commands\' ids are the ones the plugin registers and the palette keeps across versions', () => {
  assert.deepEqual([NEW_KIT_COMMAND_ID, NEW_ARRANGEMENT_COMMAND_ID, OPEN_ARRANGEMENT_COMMAND_ID], ['new-kit', 'new-arrangement', 'open-arrangement-as-score']);
});
