// Drain 2026-10-20-0900 §1 — the embed's title row (the white gap is rhythm-embed-gap.test.ts).
//
// §1: the playground's "Reset" and its "edits are not saved" label used to live INSIDE the widget iframe, as a second row under the host toolbar
//   (title, Open note, Score). They now live in the host toolbar itself, in the same row: Open note, Score, Reset, and a small muted "not saved"
//   whose full sentence is the tooltip and the accessible name. The widget is told it no longer has to draw them (`resetInHost` on the load
//   message), so an OLDER widget (which ignores the field) still shows its own and an older plugin (which never sends it) still gets them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { MSG_LOAD, MSG_READY, MSG_RESET, buildLoadMessage, formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';
import {
  PLAYGROUND_HINT_TEXT, PLAYGROUND_HINT_TITLE, createRhythmEmbedSession, embedToolbarItems,
} from './rhythm-embed-core.ts';

const SRC = path.resolve(import.meta.dirname);
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const TRESILLO: RhythmData = {
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: [true, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false] },
};
const noteText = (d: RhythmData = TRESILLO) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatRhythmJson(d)}\n\`\`\`\n`;

// ---- the toolbar model -------------------------------------------------------------------------------------------------------

test('toolbar model: Open note, Score (music edition only), Reset, then the small "not saved" hint — in that order, in ONE row', () => {
  assert.deepEqual(embedToolbarItems({ music: true }).map((i) => i.id), ['open-note', 'score', 'reset', 'hint']);
  assert.deepEqual(embedToolbarItems({ music: false }).map((i) => i.id), ['open-note', 'reset', 'hint'], 'the lean edition has no Score');
});

test('toolbar model: the hint is the short words "not saved"; the full sentence is its tooltip AND its accessible name', () => {
  const hint = embedToolbarItems({ music: true }).find((i) => i.id === 'hint')!;
  assert.equal(hint.kind, 'hint');
  assert.equal(hint.text, PLAYGROUND_HINT_TEXT);
  assert.equal(PLAYGROUND_HINT_TEXT, 'not saved');
  assert.equal(hint.title, PLAYGROUND_HINT_TITLE);
  assert.equal(hint.ariaLabel, PLAYGROUND_HINT_TITLE);
  assert.match(PLAYGROUND_HINT_TITLE, /not saved/i);
  assert.match(PLAYGROUND_HINT_TITLE, /Open note/, 'the sentence says where to edit for real (drain 2026-10-20-2100 wording)');
  assert.ok(PLAYGROUND_HINT_TITLE.length > PLAYGROUND_HINT_TEXT.length * 4, 'the tooltip carries the sentence the label no longer does');
});

test('toolbar model: Reset is a button named Reset with a tooltip saying what it does; the others keep their words and tooltips', () => {
  const items = embedToolbarItems({ music: true });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId['reset'].kind, 'button');
  assert.equal(byId['reset'].text, 'Reset');
  assert.match(byId['reset'].title, /nothing to reset/i, 'the model starts pristine; the state is embedToolbarState (rhythm-embed-dirty.test.ts)');
  assert.equal(byId['open-note'].text, 'Open note');
  assert.equal(byId['score'].text, 'Score');
  for (const i of items) assert.ok(i.title.length > 0, `${i.id} has a tooltip`);
});

// ---- Reset is the host's, and the widget is told ---------------------------------------------------------------------------------

test('the load message carries `resetInHost: true` ONLY when asked for; every older shape is byte-identical', () => {
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n'), { type: MSG_LOAD, data: TRESILLO, noteName: 'n' });
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'playground', null, false, false), { type: MSG_LOAD, data: TRESILLO, noteName: 'n', mode: 'playground' });
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'playground', null, false, true), { type: MSG_LOAD, data: TRESILLO, noteName: 'n', mode: 'playground', resetInHost: true });
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'playground', 'circle', true, true), { type: MSG_LOAD, data: TRESILLO, noteName: 'n', mode: 'playground', view: 'circle', autoHeight: true, resetInHost: true });
  assert.equal('resetInHost' in buildLoadMessage(TRESILLO, 'n', 'playground', null, true), false);
});

function makeSession(over: { resetInHost?: boolean; text?: () => string } = {}) {
  let text = noteText();
  const posted: any[] = [];
  const log = { errors: [] as string[], updated: 0 };
  const session = createRhythmEmbedSession({
    noteName: 'rhythm_pattern_tresillo', title: 'The tresillo', resetInHost: over.resetInHost,
    readNote: async () => (over.text ? over.text() : text),
    post: (m) => { posted.push(m); }, openNote: () => {}, onPlaying: () => {},
    showUpdated: () => { log.updated++; }, showError: (m) => { log.errors.push(m); },
    setTimer: () => 0, clearTimer: () => {},
  });
  return { session, posted, log, setText: (t: string) => { text = t; } };
}

test('session: with resetInHost the playground load tells the widget the host owns Reset; without it the load is the old one', async () => {
  const a = makeSession({ resetInHost: true });
  await a.session.onWidgetMessage({ type: MSG_READY });
  assert.deepEqual(a.posted, [{ type: MSG_LOAD, data: TRESILLO, noteName: 'rhythm_pattern_tresillo', mode: 'playground', resetInHost: true }]);
  const b = makeSession();
  await b.session.onWidgetMessage({ type: MSG_READY });
  assert.equal('resetInHost' in b.posted[0], false);
});

test('session.reset(): re-reads the note and sends a fresh playground load — the saved note as it is on disk RIGHT NOW', async () => {
  const { session, posted, setText } = makeSession({ resetInHost: true });
  await session.onWidgetMessage({ type: MSG_READY });
  posted.length = 0;
  const changed: RhythmData = { ...TRESILLO, tempo_bpm: 60 };
  setText(noteText(changed));
  await session.reset();
  assert.deepEqual(posted, [{ type: MSG_LOAD, data: changed, noteName: 'rhythm_pattern_tresillo', mode: 'playground', resetInHost: true }]);
});

test('session.reset(): the playground is clean afterwards, and it is NOT an "Updated from note" event (the student asked for it)', async () => {
  const { session, log } = makeSession({ resetInHost: true });
  await session.onWidgetMessage({ type: MSG_READY });
  await session.onWidgetMessage({ type: 'forge-rhythm-edited' });
  await session.onWidgetMessage({ type: 'forge-rhythm-current-data', data: { ...TRESILLO, tempo_bpm: 60 } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.isDirty(), true);
  await session.reset();
  assert.equal(session.isDirty(), false);
  assert.equal(log.updated, 0);
});

test('session.reset() is the SAME path as the widget\'s own Reset message (an older widget keeps working), and does nothing once disposed', async () => {
  const viaWidget = makeSession({ resetInHost: true });
  await viaWidget.session.onWidgetMessage({ type: MSG_READY });
  viaWidget.posted.length = 0;
  await viaWidget.session.onWidgetMessage({ type: MSG_RESET });
  const viaHost = makeSession({ resetInHost: true });
  await viaHost.session.onWidgetMessage({ type: MSG_READY });
  viaHost.posted.length = 0;
  await viaHost.session.reset();
  assert.deepEqual(viaHost.posted, viaWidget.posted);
  const gone = makeSession({ resetInHost: true });
  gone.session.dispose();
  await gone.session.reset();
  assert.deepEqual(gone.posted, []);
});

test('session.reset(): a note that has become invalid is an inline error, never a load (the same rule as the first load)', async () => {
  const { session, posted, log } = makeSession({ resetInHost: true, text: () => '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"x":1}\n```\n' });
  await session.reset();
  assert.deepEqual(posted, []);
  assert.equal(log.errors.length, 1);
});

// ---- the view ---------------------------------------------------------------------------------------------------------------------

test('mechanism pin: the embed view builds its toolbar from the model, tells the widget the host owns Reset, and Reset goes through the session', () => {
  const v = read('rhythm-embed-view.ts');
  assert.match(v, /embedToolbarItems\(\{ music: musicEdition\.id === 'music' \}\)/, 'the buttons come from ONE model');
  assert.match(v, /resetInHost: true/, 'the session tells the widget');
  assert.match(v, /session\.reset\(\)|this\.session\??\.reset\(\)/, 'Reset is the session\'s reset, not a hand-built load');
  assert.match(v, /else if \(item\.id === 'reset'\) \{ this\.resetBtn = btn; btn\.addEventListener\('click', \(\) => \{ void this\.resetPlayground\(\); \}\); \}/, 'and the Reset BUTTON is wired to it (not to another handler)');
  assert.match(v, /else if \(item\.id === 'score'\) \{ this\.scoreBtn = btn; btn\.addEventListener\('click', \(\) => \{ void this\.toggleScore\(\); \}\); \}/, 'Score still toggles the score');
  const bar = v.slice(v.indexOf("const bar = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-toolbar' })"));
  assert.doesNotMatch(bar.slice(0, bar.indexOf('this.statusEl')), /text: 'Open note'|text: 'Reset'|text: 'Score'/, 'no hand-written button words beside the model (the model owns them)');
  assert.equal((v.match(/this\.hooks\.openNote\(this\.file\)/g) ?? []).length >= 2, true, 'Open note stays wired to the plugin\'s opener (toolbar and the error box)');
});

test('mechanism pin: pressing Reset while the Score is showing brings the Beat Box back first (Reset restores the playground; the score would be stale)', () => {
  const v = read('rhythm-embed-view.ts');
  const reset = /private async resetPlayground\(\)[\s\S]*?\n  \}\n/.exec(v);
  assert.ok(reset, 'the handler exists');
  assert.match(reset![0], /this\.scoreHost/, 'it looks at the score');
  assert.match(reset![0], /await session\.reset\(\)/);
});

// ---- hint style -----------------------------------------------------------------------------------------------------------------------

const CSS = fs.readFileSync(path.resolve(SRC, '..', 'styles.css'), 'utf8');
const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()), body: m[2] }));
const rulesFor = (sel: string) => rules.filter((r) => r.selectors.includes(sel));
const decl = (body: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();

test('hint style: the "not saved" text is small and muted, and sits beside the buttons (no border, not a button)', () => {
  const hint = rulesFor('.forge-rhythm-embed-hint');
  assert.equal(hint.length, 1);
  assert.match(decl(hint[0].body, 'color') ?? '', /var\(--text-muted\)/);
  assert.match(decl(hint[0].body, 'font-size') ?? '', /^1[0-2]px$|^0\.\d+em$/);
});

test('the view uses the class the style is written for', () => {
  assert.match(read('rhythm-embed-view.ts'), /forge-rhythm-embed-hint/);
});

// ---- the row stays ONE row in a narrow pane ------------------------------------------------------------------------------------------------
// Measured at a 460 px pane (real Chromium): title + Open note + Score + Reset + "not saved" did not fit and Reset wrapped to a second row — the row the
// driver asked to get rid of — and the "Updated from note" pill (4 s) wrapped it again, moving the widget (Iteration 83's rule was that it never does).
// A flex line breaks on its items' HYPOTHETICAL sizes, before any shrinking, so shrink-with-ellipsis on the title and the pill themselves is not enough: they
// live in ONE `lead` item whose basis is 0 (the line then breaks only if the BUTTONS cannot fit), and inside it the title gives way first, the pill second.
// Pins the MECHANISM; the measurement is in the FEEDBACK (toolbar height 43 = one row, with and without the pill, at 460 px).

test('title row: the title and the pill share one `lead` item with a zero basis, so only the buttons decide whether the row wraps', () => {
  const lead = rulesFor('.forge-rhythm-embed-lead');
  assert.equal(lead.length, 1);
  assert.match(decl(lead[0].body, 'flex') ?? '', /^1 1 0/, 'it takes the spare room and counts as nothing when the line breaks');
  assert.match(decl(lead[0].body, 'min-width') ?? '', /^0/);
  assert.equal(decl(lead[0].body, 'display'), 'flex');
  const v = read('rhythm-embed-view.ts');
  const bar = v.slice(v.indexOf("const bar = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-toolbar' })"));
  const section = bar.slice(0, bar.indexOf('this.statusEl'));
  assert.match(section, /const lead = bar\.createDiv\(\{ cls: 'forge-rhythm-embed-lead' \}\)/);
  assert.match(section, /lead\.createSpan\(\{ cls: 'forge-rhythm-embed-title', text: title, attr: \{ title \} \}\)/, 'the full title is the tooltip');
  assert.match(section, /this\.updatedEl = lead\.createSpan\(\{ cls: 'forge-rhythm-embed-updated/, 'the pill rides in the same lead');
});

test('title row: inside the lead the title gives way first (ellipsis) and the pill second (also ellipsis)', () => {
  const t = rulesFor('.forge-rhythm-embed-title')[0].body;
  assert.match(decl(t, 'min-width') ?? '', /^0/);
  assert.equal(decl(t, 'overflow'), 'hidden');
  assert.equal(decl(t, 'text-overflow'), 'ellipsis');
  assert.equal(decl(t, 'white-space'), 'nowrap');
  const tShrink = Number(/^\d+ (\d+)/.exec(decl(t, 'flex') ?? '')?.[1]);
  const p = rulesFor('.forge-rhythm-embed-updated')[0].body;
  const pShrink = Number(/^\d+ (\d+)/.exec(decl(p, 'flex') ?? '')?.[1]);
  assert.ok(tShrink > pShrink && pShrink >= 1, `the title (shrink ${tShrink}) yields before the pill (shrink ${pShrink})`);
  assert.match(decl(p, 'min-width') ?? '', /^0/);
  assert.equal(decl(p, 'overflow'), 'hidden');
  assert.equal(decl(p, 'text-overflow'), 'ellipsis');
  assert.equal(decl(p, 'white-space'), 'nowrap');
});

test('title row: the buttons and the hint never shrink (only the title and the pill do) — a clipped "Reset" would be worse than a clipped name; a pane too narrow even for them still wraps', () => {
  assert.match(decl(rulesFor('.forge-rhythm-embed-hint')[0].body, 'white-space') ?? '', /nowrap/);
  assert.equal(decl(rulesFor('.forge-rhythm-embed-toolbar')[0].body, 'flex-wrap'), 'wrap');
});
