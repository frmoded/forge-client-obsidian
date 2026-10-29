// score_first M7b (a) (drain 2026-10-26-1260, DEMO profile) — "Refresh note links" over a fake vault: stale notes are upgraded, current ones are NOT written (a second run writes nothing), hand-written bar descriptions are kept, a
// note that cannot be read is a line and is not touched, a failing write is a skipped note and not a throw.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refreshLine, refreshNoteLinks, refreshNotice, type RefreshNotesPorts } from './refresh-notes-core.ts';
import { formatPhraseJson, morphNoteContent } from './phrase-core.ts';
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import { newArrangementNote } from './arrangement-core.ts';

const BAR_DATA = { time_signature: '4/4', steps: 4, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: [true, false, true, false] } } as RhythmData;
const bar = (name: string, desc: string) => `---\ntype: data\ncontent_type: json\ndescription: ${JSON.stringify(desc)}\n---\n\n\`\`\`json\n${formatRhythmJson(BAR_DATA)}\n\`\`\`\n`;
const OLD_PHRASE = `---\ntype: data\ncontent_type: json\ndescription: "phrase_001 — old."\n---\n\n\`\`\`json\n${formatPhraseJson({ kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 3, order: 'musical', seed: 0 })}\n\`\`\`\n`;

function vault(files: Record<string, string>, opts: { failWrite?: string } = {}) {
  const store = new Map(Object.entries(files));
  const writes: string[] = [];
  const ports: RefreshNotesPorts = {
    phrases: () => [...store.keys()].filter((p) => /^phrases\/phrase_\d+\.md$/.test(p)).map((path) => ({ path, name: path.replace(/^.*\//, '').replace(/\.md$/, '') })),
    bars: () => [...store.keys()].filter((p) => /^bars\/bar_\d+\.md$/.test(p)).map((path) => ({ path, name: path.replace(/^.*\//, '').replace(/\.md$/, '') })),
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { if (opts.failWrite === p) throw new Error('disk full'); writes.push(p); store.set(p, fn(store.get(p)!)); },
  };
  return { store, writes, ports };
}

test('stale notes are upgraded, README.md is never looked at, and a second run writes NOTHING (no write, no byte)', async () => {
  const v = vault({
    'phrases/phrase_001.md': OLD_PHRASE, 'phrases/README.md': '# phrases\n',
    'bars/bar_001.md': bar('bar_001', 'bar_001 — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4.'), 'bars/README.md': '# bars\n',
  });
  const first = await refreshNoteLinks(v.ports);
  assert.deepEqual(v.writes.sort(), ['bars/bar_001.md', 'phrases/phrase_001.md']);
  assert.equal(first.phrases.updated, 1); assert.equal(first.bars.updated, 1);
  assert.match(v.store.get('phrases/phrase_001.md')!, /links:\n {2}- "\[\[bar_001\]\]"\n {2}- "\[\[bar_002\]\]"/);
  assert.match(v.store.get('bars/bar_001.md')!, /description: "bar_001 — a one-bar rhythm for the Beat Box: 2 hits in 4 steps \(kick 2\), tempo 90\."/);
  assert.equal(v.store.get('phrases/README.md'), '# phrases\n');
  const snapshot = new Map(v.store);
  v.writes.length = 0;
  const second = await refreshNoteLinks(v.ports);
  assert.deepEqual(v.writes, [], 'nothing written the second time');
  assert.equal(second.phrases.current, 1); assert.equal(second.bars.current, 1);
  assert.deepEqual([...v.store], [...snapshot]);
});

test('a hand-written bar description is kept and counted; a note it cannot read is named and untouched; a failing write is a skipped note, never a throw', async () => {
  const v = vault({
    'phrases/phrase_001.md': morphNoteContent('phrase_001', 'bar_001', 'bar_002'),
    'phrases/phrase_002.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{ nope\n```\n',
    'phrases/phrase_003.md': OLD_PHRASE,
    'bars/bar_001.md': bar('bar_001', 'bar_001 — my own words.'),
  }, { failWrite: 'phrases/phrase_003.md' });
  const before = v.store.get('phrases/phrase_002.md');
  const s = await refreshNoteLinks(v.ports);
  assert.equal(s.bars.keptAsWritten, 1);
  assert.equal(s.phrases.current, 1);
  assert.equal(s.phrases.skipped.length, 2);
  assert.match(s.phrases.skipped.join('|'), /phrases\/phrase_002\.md: The json block is not valid JSON/);
  assert.match(s.phrases.skipped.join('|'), /phrases\/phrase_003\.md: disk full/);
  assert.equal(v.store.get('phrases/phrase_002.md'), before);
  assert.equal(refreshLine(s), '[forge-notes] refresh note links: phrases 3 (0 updated, 1 already current), bars 1 (0 updated, 1 already current, 1 descriptions left as written), 2 skipped');
  assert.match(refreshNotice(s), /^Refresh note links: every note was already up to date; 2 could not be read \(phrases\/phrase_002\.md: /);
});

test('the notice says what changed', async () => {
  const v = vault({ 'phrases/phrase_001.md': OLD_PHRASE });
  assert.equal(refreshNotice(await refreshNoteLinks(v.ports)), 'Refresh note links: 1 phrase note(s) and 0 bar note(s) updated.');
});

// ---- 2026-10-29-0820: kits and arrangements ---------------------------------------------------------------------------------------------------------------------------------

test('kits and arrangements: stale derived text is regenerated, current notes are NOT written, an unreadable one is named, and the line and notice count them - only when the vault has them', async () => {
  const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
  const files: Record<string, string> = {
    'kits/rock.md': newKitNote(ROCK).replace('Add the kick.', 'Somebody typed here.'),
    'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['claves'] }),
    'kits/broken.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "kit"}\n```\n',
    'arrangements/arr_001.md': newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] }).replace('Together.', 'Somebody typed here.'),
  };
  const v = vault(files);
  const named = (re: RegExp) => () => [...v.store.keys()].filter((p) => re.test(p)).map((path) => ({ path, name: path.replace(/^.*\//, '').replace(/\.md$/, '') }));
  const ports: RefreshNotesPorts = { ...v.ports, kits: named(/^kits\/(?!README)[^/]+\.md$/), arrangements: named(/^arrangements\/(?!README)[^/]+\.md$/) };
  const s = await refreshNoteLinks(ports);
  assert.deepEqual([s.kits!.total, s.kits!.updated, s.kits!.current, s.kits!.skipped.length], [3, 1, 1, 1]);
  assert.deepEqual([s.arrangements!.total, s.arrangements!.updated, s.arrangements!.current], [1, 1, 0]);
  assert.ok(!v.store.get('kits/rock.md')!.includes('Somebody typed here.') && !v.store.get('arrangements/arr_001.md')!.includes('Somebody typed here.'));
  assert.deepEqual(v.writes.sort(), ['arrangements/arr_001.md', 'kits/rock.md'], 'only the stale notes were written');
  assert.match(s.kits!.skipped[0], /^kits\/broken\.md: /);
  assert.match(refreshLine(s), /, kits 3 \(1 updated, 1 already current\), arrangements 1 \(1 updated, 0 already current\), 1 skipped$/);
  assert.match(refreshNotice(s), /^Refresh note links: 0 phrase note\(s\) and 0 bar note\(s\) updated \(and 1 kit note\(s\), 1 arrangement note\(s\)\); 1 could not be read \(kits\/broken\.md: /);
  const before = v.writes.length;
  await refreshNoteLinks(ports);
  assert.equal(v.writes.length, before, 'a second run writes nothing');
  const plain = await refreshNoteLinks(v.ports);
  assert.equal(plain.kits, undefined, 'a vault without the ports is exactly what it was');
  assert.ok(!refreshLine(plain).includes('kits'));
});
