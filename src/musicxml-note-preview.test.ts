// 2026-11-23-1022z - a MusicXML Data Note (`type: data`, `content_type: musicxml`) in a SCORE-FIRST vault opened as raw XML text and NO Score appeared (the driver, on the 1029 note): the file-open hook handed the preview to getOutputView() WITHOUT a gesture, and in a
// score-first vault that returns a buffered sink while the Forge panel is closed (M4: a run does not pop the panel): the preview was kept for a panel nobody opened, no error, no word. A MusicXML note has no other place to be seen, so opening one now opens the
// panel (as the person's own gesture would). Through the REAL plugin (the real ForgePlugin.onload and file-open hook, music-tabs-world.ts); the panel itself is a recorder here (the rig has no sidebar to mount it in). Other data notes are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });

const XML = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.0"><part-list><score-part id="P1"><part-name>Cello</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><type>whole</type></note></measure></part></score-partwise>';
const dataNote = (contentType: string, fence: string, body: string, desc = 'a "quoted": description'): string => `---\ntype: data\ncontent_type: ${contentType}\ndescription: ${JSON.stringify(desc)}\n---\n\n\`\`\`${fence}\n${body}\n\`\`\`\n`;
const SMALL = 'scores/small.md', JSON_NOTE = 'data/plain.md';

/** The panel as a recorder: what the hook asked for, and what it was handed to preview. */
function recordPanel(w: any) {
  const asked: Array<{ userInitiated: boolean }> = []; const previews: Array<{ id: string; type: string; body: string; path: string }> = [];
  const target = w.plugin.target;
  target.getOutputView = async (opts?: { userInitiated?: boolean }) => { asked.push({ userInitiated: opts?.userInitiated === true }); return { previewDataSnippet: async (id: string, type: string, body: string, p: string) => { previews.push({ id, type, body, path: p }); } }; };
  return { asked, previews };
}

test('P1 opening a MusicXML Data Note in a score-first vault ASKS FOR THE PANEL as a gesture would (so the Score is drawn where it can be seen), and hands it the XML body, not the whole note', async () => {
  const w = await musicTabsWorld(real, { [SMALL]: dataNote('musicxml', 'xml', XML) });
  try {
    const rec = recordPanel(w);
    await w.openFromList(SMALL); await w.settle(800);
    assert.deepEqual(rec.asked, [{ userInitiated: true }], 'the panel is asked for as a gesture: in a score-first vault anything else is a buffered sink for a panel nobody opened');
    assert.equal(rec.previews.length, 1); assert.equal(rec.previews[0].type, 'musicxml'); assert.equal(rec.previews[0].path, SMALL);
    assert.equal(rec.previews[0].body, XML, 'the body is the fence content, byte for byte (the DOCTYPE and the declaration included)');
  } finally { w.done(); }
});

test('P2 every OTHER data note is unchanged: its preview does not ask for the panel as a gesture (a json note keeps the buffered behaviour of a score-first vault)', async () => {
  const w = await musicTabsWorld(real, { [JSON_NOTE]: dataNote('json', 'json', '{"a": 1}') });
  try {
    const rec = recordPanel(w);
    await w.openFromList(JSON_NOTE); await w.settle(800);
    assert.deepEqual(rec.asked, [{ userInitiated: false }]); assert.equal(rec.previews.length, 1); assert.equal(rec.previews[0].type, 'json');
  } finally { w.done(); }
});

const REAL_NOTE = path.join(os.homedir(), 'forge-vaults/bwv1007-mock/scores/prelude_bwv1007_trimmed.md');
test('P3 the driver\'s REAL note (133 KB, read from the mock vault, never written): the hook reaches the preview with the whole XML', { skip: fs.existsSync(REAL_NOTE) ? false : 'the mock vault is not on this machine' }, async () => {
  const text = fs.readFileSync(REAL_NOTE, 'utf8'); const before = text.length;
  const w = await musicTabsWorld(real, { 'scores/prelude.md': text });
  try {
    const rec = recordPanel(w);
    await w.openFromList('scores/prelude.md'); await w.settle(800);
    assert.deepEqual(rec.asked, [{ userInitiated: true }]); assert.equal(rec.previews.length, 1);
    assert.ok(rec.previews[0].body.length > 100_000 && rec.previews[0].body.startsWith('<?xml'), `body of ${rec.previews[0].body.length} bytes`); assert.equal(fs.readFileSync(REAL_NOTE, 'utf8').length, before, 'the note on disk is untouched');
  } finally { w.done(); }
});
