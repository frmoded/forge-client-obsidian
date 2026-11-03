// 2026-11-03-1155-91 (score_first polish R1 R2 R3) — three pieces of clutter go from SCORE-FIRST vaults only, and a test says the other vaults keep each one:
//   R1 the "Forge log (N)" button (the palette command "Open Forge log" replaces it; every error a run writes to the panel is ALSO on the Score line and in the console, so none is invisible)
//   R2 the source comment at the top of a phrase / arrangement / composition note (no producer writes it any more; an old note loses it through the next write, the stamps do not move)
//   R3 the edges-panel toggle (header action in the markdown view and the Beat Box, and the command), for score-first vaults only
// The plugin is the REAL one (onload, getOutputView, syncButtons, the Beat Box view's constructor), in BOTH editions, against a host-faithful stand-in for Obsidian (test-support/*).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before, afterEach } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { world } from './test-support/fake-panel-world.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { headerActionShown, HIDDEN_IN_SCORE_FIRST, MARKDOWN_HEADER_ACTIONS } from './header-actions-core.ts';
import { CACHE_NOTE, extractPhraseJsonBlock, newPhraseNote, refreshBarNoteText, renderPhraseNote, sourceChainStamps } from './phrase-notes-core.ts';
import { noteContentFor, phraseNoteContent, refreshPhraseNoteText } from './phrase-core.ts';
import { newArrangementNote, refreshArrangementNoteText } from './arrangement-core.ts';
import { newCompositionNote, refreshCompositionNoteText } from './composition-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

const baseApp = () => ({
  vault: { adapter: { exists: async () => false, read: async () => '' }, on: () => ({}), getMarkdownFiles: () => [], getAbstractFileByPath: () => null, configDir: '.obsidian' },
  workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
  metadataCache: { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data' } }) }, plugins: {},
});
const tick = () => new Promise((r) => setTimeout(r, 30));
function captureInfo<T>(fn: () => Promise<T> | T) {
  const lines: string[] = []; const saved = console.info;
  console.info = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  return Promise.resolve().then(fn).finally(() => { console.info = saved; }).then(() => lines);
}

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin; let plugin: LoadedPlugin; let doc: any; let win: any;
  const P = (s: string) => `[${edition}] ${s}`;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    doc = win.document;
    real = await bundleRealPlugin(process.cwd(), edition);
    plugin = await loadRealOnload(real, baseApp());
  });
  afterEach(() => { real.messageDelivery.resetForTests(); (globalThis as any).__shimConstructed = []; });
  const scoreMessages = () => { const got: Array<{ text: string; kind: string; persistence: string }> = []; const off = real.messageDelivery.onScoreMessage((m) => got.push({ text: m.text, kind: m.kind, persistence: m.line.persistence })); return { got, off }; };

  // ---- R1 -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  test(P('R1: in a score-first vault every error a run writes to the panel (all four error methods) is ALSO a Score line that stays until the next draw and a [forge-notice] console line — with the panel closed (kept for later) and open'), async () => {
    for (const kind of ['none', 'expanded'] as const) {
      real.messageDelivery.setScoreFirst(true);
      const w = world(real, kind);
      for (const m of ['appendError', 'appendForgeError', 'appendLlmRecipeRejection', 'appendSlotCacheNotFound']) w.view[m] = (...a: unknown[]) => w.calls.push(`view.${m}(${a.length})`);
      plugin.target.app = { ...baseApp(), workspace: { ...w.ws, getActiveViewOfType: () => null } };
      const backlogBefore = real.messageDelivery.backlogSize();
      const s = scoreMessages();
      const lines = await captureInfo(async () => {
        const sink = await plugin.target.getOutputView();
        sink.appendError('bar_001', 'Compute failed: boom', 'some stdout');
        sink.appendForgeError('bar_001', { cause: 'The Recipe calls a note that is not there.', suggested_fix: 'Check the spelling of the link.' });
        sink.appendLlmRecipeRejection('bar_001', { failureMode: 'closure-fail', unresolvedWikilinks: ['[[nope]]'], llmRawOutput: 'x', descriptionBody: 'y' });
        sink.appendSlotCacheNotFound('bar_001', { attempts: [], markdownFileCount: 3 });
      });
      s.off();
      assert.deepEqual(s.got.map((m) => [m.kind, m.persistence]), Array(4).fill(['error', 'until-next-draw']), `${kind}: four error lines on the Score`);
      assert.equal(s.got[0].text, 'Compute failed: boom');
      assert.equal(s.got[1].text, 'The Recipe calls a note that is not there. Check the spelling of the link.');
      assert.match(s.got[2].text, /Recipe the LLM wrote was rejected \(closure-fail\)/);
      assert.match(s.got[3].text, /slot cache was not written/);
      assert.deepEqual(lines.filter((l) => l.startsWith('[forge-notice] ')).length, 4, `${kind}: four console evidence lines`);
      assert.ok(lines.includes('[forge-notice] Compute failed: boom'));
      if (kind === 'none') assert.equal(real.messageDelivery.backlogSize() - backlogBefore, 4, 'the panel still receives every one (kept until it opens)');
      else assert.deepEqual(w.calls.filter((c) => c.startsWith('view.append')), ['view.appendError(3)', 'view.appendForgeError(2)', 'view.appendLlmRecipeRejection(2)', 'view.appendSlotCacheNotFound(2)'], 'the open panel gets the original call, arguments intact');
      real.messageDelivery.resetForTests();
    }
  });

  test(P('R1 non-vacuity + P3: outside a score-first vault getOutputView hands back the panel itself (nothing patched), no Score line, no console line'), async () => {
    const w = world(real, 'expanded');
    w.view.appendError = () => {};
    plugin.target.app = { ...baseApp(), workspace: { ...w.ws, getActiveViewOfType: () => null } };
    const s = scoreMessages();
    const lines = await captureInfo(async () => { const v = await plugin.target.getOutputView(); v.appendError('x', 'boom', ''); assert.equal(v, w.view); });
    s.off();
    assert.deepEqual([s.got.length, lines.filter((l) => l.startsWith('[forge-notice]')).length], [0, 0]);
    assert.equal(Object.getOwnPropertySymbols(w.view).length, 0, 'the panel was not touched');
  });

  test(P('R1: forgeNotice in a score-first vault leaves an evidence line for EVERY kind (the panel-only ones included); outside it, only errors do (as before)'), async () => {
    const app = { ...baseApp(), workspace: { ...world(real, 'expanded').ws, getActiveViewOfType: () => null } };
    real.messageDelivery.setScoreFirst(true);
    const on = await captureInfo(async () => { await real.forgeNotice(app, 'Forge: all quiet', 'info'); await real.forgeNotice(app, 'Forge: done', 'success'); await real.forgeNotice(app, 'Forge: it failed', 'error'); });
    assert.deepEqual(on.filter((l) => l.startsWith('[forge-notice]')), ['[forge-notice] Forge: all quiet', '[forge-notice] Forge: done', '[forge-notice] Forge: it failed']);
    real.messageDelivery.resetForTests();
    const off = await captureInfo(async () => { await real.forgeNotice(app, 'Forge: all quiet', 'info'); await real.forgeNotice(app, 'Forge: it failed', 'error'); });
    assert.deepEqual(off.filter((l) => l.startsWith('[forge-notice]')), ['[forge-notice] Forge: it failed']);
  });

  test(P('R1: the Score panel\'s message line has no button; "Open Forge log" is a palette command offered in a score-first vault only (the mechanism is tested on the real onload in score-first-forge-log-open.test.ts)'), () => {
    const anchor = doc.createElement('div'); doc.body.appendChild(anchor);
    const m = real.mountScoreMessages(anchor, real.messageDelivery, { setTimer: () => 0, clearTimer: () => {} });
    real.messageDelivery.bump();
    assert.equal(doc.querySelectorAll('button').length, 0); assert.equal(doc.querySelector('.forge-rhythm-forge-log'), null);
    m.dispose(); anchor.remove();
    const cmd = plugin.commands.get('open-forge-log')!;
    assert.equal(cmd.name, 'Open Forge log');
    assert.equal(cmd.checkCallback!(true), false); real.messageDelivery.setScoreFirst(true); assert.equal(cmd.checkCallback!(true), true);
  });

  // ---- R3 -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  /** A markdown tab the real syncButtons can draw into: addAction puts a real element in the header, as Obsidian's does (prepending). */
  function markdownTab(app: any) {
    const view = new real.MarkdownView();
    view.containerEl = doc.createElement('div'); doc.body.appendChild(view.containerEl); view.containerEl.addClass = (c: string) => view.containerEl.classList.add(c); view.containerEl.removeClass = (c: string) => view.containerEl.classList.remove(c);
    view.file = Object.assign(new real.TFile(), { path: 'bars/bar_001.md', basename: 'bar_001' });
    view.addAction = (icon: string, title: string, cb: () => void) => { const el = doc.createElement('button'); el.setAttribute('aria-label', title); el.dataset.icon = icon; el.onclick = cb; el.addClass = (c: string) => el.classList.add(c); el.removeClass = (c: string) => el.classList.remove(c); view.containerEl.prepend(el); return el; };
    view.leaf = { view };
    app.workspace.getLeavesOfType = (t: string) => (t === 'markdown' ? [view.leaf] : []);
    return { view, titles: () => [...view.containerEl.querySelectorAll('button')].map((b: any) => b.getAttribute('aria-label')), dispose: () => view.containerEl.remove() };
  }
  const withApp = () => { const app: any = baseApp(); app.workspace = { ...app.workspace }; plugin.target.app = app; plugin.target.headerSignatures = new WeakMap(); return app; };

  test(P('R3: the markdown header: "Toggle edges panel" is drawn on a data note outside a score-first vault, NOT in a score-first one; the other actions are the same in both'), () => {
    const app = withApp(); const tab = markdownTab(app);
    plugin.target.syncButtons(tab.view);
    const outside = tab.titles();
    assert.ok(outside.includes('Toggle edges panel'), `P3: ${outside.join(' | ')}`);
    tab.dispose();
    real.messageDelivery.setScoreFirst(true);
    const tab2 = markdownTab(app);
    plugin.target.syncButtons(tab2.view);
    const inside = tab2.titles();
    assert.ok(!inside.includes('Toggle edges panel'), `score-first: ${inside.join(' | ')}`);
    assert.deepEqual(inside, outside.filter((t: string) => t !== 'Toggle edges panel'), 'nothing else moved or went');
    tab2.dispose();
  });

  test(P('R3: a markdown tab drawn BEFORE the profile answer loses the button when the answer arrives (the profile is read after load)'), () => {
    const app = withApp(); const tab = markdownTab(app);
    plugin.target.syncButtons(tab.view);
    assert.ok(tab.titles().includes('Toggle edges panel'));
    real.messageDelivery.setScoreFirst(true);                                  // the answer arrives: the plugin re-decides the headers by itself
    assert.ok(!tab.titles().includes('Toggle edges panel'), tab.titles().join(' | '));
    assert.ok(tab.titles().includes('New Forge note') && tab.titles().includes('Restore to last commit'));
    tab.dispose();
  });

  test(P('R3: the command "Toggle edges panel" is available outside a score-first vault (and toggles the view), not offered in one'), () => {
    const cmd = plugin.commands.get('forge-toggle-edges-panel')!;
    let toggled = 0; plugin.target.toggleEdgesView = () => { toggled++; };
    assert.equal(cmd.checkCallback!(true), true); assert.equal(toggled, 0, 'asking does not toggle');
    assert.equal(cmd.checkCallback!(false), true); assert.equal(toggled, 1);
    real.messageDelivery.setScoreFirst(true);
    assert.equal(cmd.checkCallback!(true), false); assert.equal(cmd.checkCallback!(false), false); assert.equal(toggled, 1, 'not offered, not run');
  });

  test(P('R3: the Beat Box header: the edges button is built outside a score-first vault, not in one, and goes when the answer arrives late; the other buttons are the same'), () => {
    const EV = real.EditableFileView.prototype as any;
    const made: any[] = []; const unsubs: Array<() => void> = [];
    EV.addAction = function (icon: string, title: string) { const el = doc.createElement('button'); el.setAttribute('aria-label', title); this.__els = [...(this.__els ?? []), el]; made.push(el); return el; };
    EV.register = function (f: () => void) { unsubs.push(f); };
    const build = () => { const v = plugin.views.get('forge-rhythm-edit')!({}) as any; return { v, titles: () => (v.__els ?? []).filter((e: any) => !e.removed).map((e: any) => e.getAttribute('aria-label')) }; };
    const outside = build();
    assert.ok(outside.titles().includes('Toggle edges panel'), `P3: ${outside.titles().join(' | ')}`);
    real.messageDelivery.setScoreFirst(true);
    for (const el of made) el.remove = () => { el.removed = true; };           // (the late answer above already ran the listener of the first view with the stand-in's remove)
    const inside = build();
    assert.ok(!inside.titles().includes('Toggle edges panel'), inside.titles().join(' | '));
    assert.deepEqual(inside.titles(), outside.titles().filter((t: string) => t !== 'Toggle edges panel'));
    real.messageDelivery.resetForTests();
    const late = build(); const lateEdges = made[made.length - late.titles().length + late.titles().indexOf('Toggle edges panel')];
    lateEdges.remove = () => { lateEdges.removed = true; };
    real.messageDelivery.setScoreFirst(true);
    assert.equal(lateEdges.removed, true, 'the button of a view built before the answer is taken away when it arrives');
  });
}

test('R3 table: the audit knows which header actions a score-first vault hides — the edges toggle and nothing else; every other vault keeps every one', () => {
  assert.deepEqual([...HIDDEN_IN_SCORE_FIRST], ['edges-toggle']);
  for (const a of MARKDOWN_HEADER_ACTIONS) {
    assert.equal(headerActionShown(a.id, false), true, `P3: ${a.id} shown outside score-first`);
    assert.equal(headerActionShown(a.id, true), a.id !== 'edges-toggle', `${a.id} in score-first`);
  }
});

// ---- R2 -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const COMMENT = '<!-- the Description below is the source of this note: the controls write it, and the Recipe, the Python and the json cache are derived from it -->';
/** What an older plugin wrote: the same note with the comment first in the body. It sits before `# Description`, outside every hashed section, so its stamps are the new note's. */
const legacy = (text: string): string => text.replace('\n---\n\n# Description', `\n---\n\n${COMMENT}\n\n# Description`);
const fixtures: Array<[string, string, (t: string) => { ok: boolean; text?: string; changed?: boolean }]> = [
  ['phrase', phraseNoteContent('phrase_001', 'bar_005'), (t) => refreshPhraseNoteText(t, 'phrase_001')],
  ['arrangement', newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }), (t) => refreshArrangementNoteText(t, 'arr_001')],
  ['composition', newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }), (t) => refreshCompositionNoteText(t, 'comp_001')],
];

for (const [kind, fresh, refresh] of fixtures) {
  test(`R2 (${kind}): a new note has no source comment (only the cache comment remains); an old note loses it through "Refresh note links"; the json cache is byte-identical, the stamps unchanged; a second refresh changes nothing`, () => {
    assert.ok(!fresh.includes('source of this note'), 'a new note is written without it');
    assert.ok(fresh.includes(CACHE_NOTE), 'the cache comment stays (it is true for every source)');
    const old = legacy(fresh);
    assert.ok(old.includes(COMMENT), 'fixture: the old note has it');
    assert.deepEqual(sourceChainStamps(old), sourceChainStamps(fresh), 'the comment is outside every hashed section: the stamps a reader computes do not move');
    const fm = (t: string) => parseFrontmatter(t)!.fields;
    const r = refresh(old) as { ok: true; text: string; changed: boolean };
    assert.equal(r.ok, true); assert.equal(r.changed, true, 'the refresh rewrote the note (it differs by the comment)');
    assert.equal(r.text, fresh, 'the refreshed old note IS the new note, byte for byte');
    const fence = (t: string) => t.slice(t.indexOf('```json'));
    assert.equal(fence(r.text), fence(old), 'the json cache is byte-identical');
    for (const k of ['source_facet', 'description_hash', 'recipe_hash', 'python_hash']) assert.equal(fm(r.text)[k], fm(old)[k], `${k} unchanged`);
    const again = refresh(r.text) as { ok: true; text: string; changed: boolean };
    assert.deepEqual([again.changed, again.text], [false, r.text], 'idempotent: a note without it is untouched');
    assert.equal((refresh(fresh) as { changed: boolean }).changed, false, 'a new note is untouched by a refresh');
  });
}

test('R2: the NEXT write that touches an old phrase note (a control edit) also drops the comment, the stamps follow the new text, and the json cache is rewritten only as the edit says', () => {
  const p = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as const;
  const old = legacy(noteContentFor('phrase_001', p));
  const block = extractPhraseJsonBlock(old); assert.equal(block.ok, true);
  const next = renderPhraseNote(old, 'phrase_001', { ...p, bars: 8 }, (block as { fenceStart: number }).fenceStart);
  assert.ok(!next.includes('source of this note'));
  assert.equal(next, renderPhraseNote(noteContentFor('phrase_001', p), 'phrase_001', { ...p, bars: 8 }, (extractPhraseJsonBlock(noteContentFor('phrase_001', p)) as { fenceStart: number }).fenceStart), 'the same note a comment-less one gives');
  assert.equal(parseFrontmatter(next)!.fields.source_facet, 'description');
});

test('R2 mechanism: NOTHING reads the comment — no production file refers to it except the one note explaining its removal; the sections the hashes cover do not include it', () => {
  const dir = path.join(process.cwd(), 'src');
  const hits = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.')).filter((f) => /source of this note|SOURCE_CHAIN_NOTE/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(hits, ['phrase-notes-core.ts'], 'only the explanation of the removal mentions it');
  const core = fs.readFileSync(path.join(dir, 'phrase-notes-core.ts'), 'utf8');
  assert.ok(!/export const SOURCE_CHAIN_NOTE/.test(core));
  assert.ok(newPhraseNote('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, '{}').split('\n').filter((l) => l.startsWith('<!--')).every((l) => l === CACHE_NOTE));
  void refreshBarNoteText;
});
