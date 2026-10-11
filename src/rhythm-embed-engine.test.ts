// Beat-as-data Phase 8 (drain 2026-10-10-2200): REAL engine check for the embed's Score toggle. A playground edit is made in the real widget
// page (happy-dom), the host asks for the widget's CURRENT data (`forge-rhythm-request-data` -> `forge-rhythm-current-data`), and the real
// Pyodide engine (the very Python the plugin runs) turns THAT — unsaved — data into MusicXML. The assertion is that the score reflects
// the EDIT, not the note it was loaded from, and that nothing was saved on the way.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine, compute } from './test-support/real-rhythm-engine.ts';
import { ROCK, loadWidget, skip as widgetSkip } from './test-support/rhythm-widget-harness.ts';
import { createRhythmEmbedSession } from './rhythm-embed-core.ts';
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';

const skip = widgetSkip || (WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels');
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);

const settle = () => new Promise((r) => setTimeout(r, 5));
const noteText = (d: RhythmData) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatRhythmJson(d)}\n\`\`\`\n`;

test('real engine + real widget: a playground edit (unsaved) is what the Score toggle engraves — tempo, an added hit, an added instrument', async () => {
  const py = await engine();
  const saved = ROCK as unknown as RhythmData;
  const savedText = noteText(saved);
  const h = await loadWidget(true);

  // The host side of the embed, wired straight to the widget page and the real engine.
  const toWidget = (m: unknown) => { h.win.dispatchEvent(new h.win.MessageEvent('message', { data: m, source: h.host })); };
  let reads = 0;
  const session = createRhythmEmbedSession({
    noteName: 'rhythm_pattern_straight_rock',
    title: 'Straight rock',
    readNote: async () => { reads++; return savedText; },
    post: (m) => { toWidget(JSON.parse(JSON.stringify(m))); },
    openNote: () => {},
    onPlaying: () => {},
    setStale: () => {},
    showError: (m) => { throw new Error(m); },
    computeScore: async (data, title) => compute(py, data, title),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (hd) => clearTimeout(hd as ReturnType<typeof setTimeout>),
  });
  // Route what the widget posts to the host session, as the plugin's message listener does (after its source check).
  let cursor = 0;
  const pump = async () => {
    await settle();
    while (cursor < h.posted.length) await session.onWidgetMessage(h.posted[cursor++]);
    await settle();
  };

  await pump();                                    // ready -> load (playground)
  // sanity: the engine on the SAVED data
  const baseline = compute(py, saved, 'Straight rock').multi_staff_content as string;
  const kickNotesBefore = [...baseline.matchAll(/<note[ >]/g)].length;
  assert.match(baseline, /<per-minute>100<\/per-minute>|tempo="100/);

  // The student plays with it: faster, an extra kick hit, a bell row.
  h.el('bBpmUp').click();
  h.el('bBpmUp').click();
  h.cell('kick', 3).click();
  h.el('addInstrument').value = 'bell';
  h.el('addInstrument').dispatchEvent(new h.win.Event('change', { bubbles: true }));
  await settle();
  h.cell('bell', 0).click();
  await pump();

  const outcome = await (async () => {
    const p = session.currentScore();
    await pump();
    return p;
  })();
  assert.equal(outcome.kind, 'score', outcome.kind === 'score' ? '' : (outcome as any).message);
  const xml = (outcome as any).payload.multi_staff_content as string;
  assert.match(xml, /<per-minute>102<\/per-minute>|tempo="102/, 'the edited tempo (100 + 2) is in the score');
  const names = [...xml.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]);
  assert.equal(names.length, 4, `a fourth part (the bell) was added: ${JSON.stringify(names)}`);
  assert.ok([...xml.matchAll(/<note[ >]/g)].length > kickNotesBefore, 'more notes than the saved note has');
  assert.equal(h.posted.filter((m) => m.type === 'forge-rhythm-save').length, 0, 'nothing was saved on the way');
  assert.equal(reads, 1, 'the saved note was read once, for the load — the score did not consult it');
  session.dispose();
});
