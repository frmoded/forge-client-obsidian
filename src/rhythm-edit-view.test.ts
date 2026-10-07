// Beat-as-data Phase 5 + 5b (drains 2026-10-05-2100, 2026-10-06-1200): wiring pins for rhythm-edit-view.ts. The view itself is Obsidian-coupled glue and, per
// this repo's convention (see html-embed-view.ts), is not unit-run — its decisions live in rhythm-edit-core.ts (tested). What CAN be
// pinned without an Obsidian instance is the safety-critical wiring: the sandbox, the message-source check, the atomic write, and
// that nothing else can write a note. These read the source, so a refactor that quietly weakens one of them fails the suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RHYTHM_BOX_WIDGET_PATH } from './rhythm-edit-core.ts';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const view = read('src/rhythm-edit-view.ts');
const embed = read('src/html-embed-view.ts');
const main = read('src/main.ts');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // comments out, so a pin cannot be satisfied by prose

test('sandbox: the shared iframe helper adds exactly allow-scripts and allow-same-origin — nothing wider', () => {
  const adds = [...code(embed).matchAll(/sandbox\.add\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(adds, ['allow-scripts', 'allow-same-origin']);
  assert.ok(!/sandbox\s*=|setAttribute\('sandbox'/.test(code(embed)), 'no other way of setting the sandbox');
  assert.match(code(embed), /setAttribute\('referrerpolicy', 'no-referrer'\)/);
});

test('sandbox: the Rhythm Box view hosts the widget through that helper and builds no iframe of its own', () => {
  assert.match(code(view), /createSandboxedWidgetIframe\(this\.contentEl, html, '100%'\)/);
  assert.ok(!/createEl\('iframe'|createElement\('iframe'|<iframe/.test(code(view)));
  assert.ok(!/sandbox/.test(code(view).replace(/createSandboxedWidgetIframe/g, '')), 'the view never touches sandbox flags itself');
});

test('sandbox: the html-embed processor still uses the same helper (behaviour unchanged by the extraction)', () => {
  assert.match(code(embed), /createSandboxedWidgetIframe\(el, html, `\$\{parsed\.heightPx\}px`\)/);
});

test('trust: only messages whose event.source is the view\'s own iframe are considered — checked BEFORE the payload is parsed', () => {
  const body = code(view);
  const source = body.indexOf('ev.source !== this.iframe.contentWindow');
  const parse = body.indexOf('parseWidgetMessage(ev.data)');
  assert.ok(source > 0 && parse > 0 && source < parse, 'source check precedes parseWidgetMessage');
  assert.match(body, /if \(!this\.iframe \|\| ev\.source !== this\.iframe\.contentWindow\) return;/);
});

test('trust: a malformed widget message is dropped with a warning and never reaches the write path', () => {
  const body = code(view);
  assert.match(body, /msg\.kind === 'malformed'[\s\S]*?console\.warn[\s\S]*?return;/);
  assert.match(body, /this\.pipeline\?\.submit\(msg\.data\)/);
  assert.equal([...body.matchAll(/\.submit\(/g)].length, 1, 'the pipeline has exactly one producer: the widget message handler');
  assert.equal([...body.matchAll(/this\.writeNote\(/g)].length, 1, 'writeNote is called from one place — the pipeline\'s write dep');
});

test('write: the note is changed only through ONE atomic vault.process, whose callback validates (session.apply) and aborts by throwing', () => {
  const body = code(view);
  assert.equal([...body.matchAll(/vault\.process\(/g)].length, 1);
  assert.match(body, /vault\.process\(file, \(current\) => \{\s*const result = session\.apply\(current, payload\);\s*if \(result\.ok === false\) throw new RhythmSaveRefused\(result\.kind, result\.message\);/);
  for (const forbidden of ['vault.modify(', 'vault.create(', 'vault.append(', 'adapter.write(', 'adapter.append(', 'vault.delete(', 'vault.rename(', 'fileManager.processFrontMatter(']) {
    assert.ok(!body.includes(forbidden), `the view must not call ${forbidden}`);
  }
});

test('write: a successful write re-baselines the session (commit) and every failure rolls the expectation back', () => {
  const body = code(view);
  assert.match(body, /\}\);\s*session\.commit\(\);\s*return \{ ok: true \};/);
  assert.match(body, /catch \(e\) \{\s*session\.rollback\(\);/);
  assert.equal([...body.matchAll(/session\.rebaseline\(/g)].length, 1, 'the baseline moves only on a load (sendLoad) or our own successful write');
});

test('autosave: the pipeline is the 600 ms core with real timers injected; there is no Save path left in the view', () => {
  const body = code(view);
  assert.match(body, /createAutosavePipeline\(\{\s*setTimer: \(fn, ms\) => window\.setTimeout\(fn, ms\),\s*clearTimer: \(h\) => window\.clearTimeout\(h as number\),/);
  assert.ok(!/debounceMs/.test(body), 'the debounce interval is the core\'s default (600 ms), not overridden here');
  assert.ok(!/private async save\(|this\.save\(|this\.saving/.test(body));
});

test('flush: pending edits are written on view close, when the view moves off a note, when switching back to JSON, on restore, and on plugin unload', () => {
  const body = code(view);
  assert.match(body, /async onClose\(\): Promise<void> \{\s*window\.removeEventListener\('message', this\.onMessage\);\s*await this\.flush\(\);\s*await super\.onClose\(\);/);
  assert.match(body, /async onUnloadFile\(file: TFile\): Promise<void> \{\s*await this\.flush\(\);\s*this\.pipeline\?\.dispose\(\);/);
  assert.match(body, /private async openAsJson\(\): Promise<void> \{[\s\S]*?await this\.flush\(\);[\s\S]*?setViewState/);
  assert.match(body, /async holdForRestore\(\): Promise<void> \{\s*await this\.flush\(\);\s*this\.pipeline\?\.pause\(\);/);
  assert.match(body, /plugin\.register\(\(\) => \{\s*for \(const leaf of app\.workspace\.getLeavesOfType\(RHYTHM_EDIT_VIEW_TYPE\)\) \{\s*if \(leaf\.view instanceof RhythmEditView\) void leaf\.view\.flush\(\);/);
});

test('external changes: the view listens to vault modify for ITS note, classifies via the session, reloads or halts — never writes', () => {
  const body = code(view);
  assert.match(body, /this\.registerEvent\(this\.app\.vault\.on\('modify', \(f\) => \{\s*if \(this\.file && f\.path === this\.file\.path\) void this\.onNoteModified\(\);/);
  assert.match(body, /session\.classifyModify\(await this\.app\.vault\.read\(file\), pipeline\.busy\(\)\)/);
  assert.match(body, /if \(verdict === 'reload'\) await this\.sendLoad\(\);\s*else if \(verdict === 'conflict'\) pipeline\.halt\(EXTERNAL_CHANGE_MESSAGE\);/);
  assert.match(body, /private async reloadFromNote\(\): Promise<void> \{\s*this\.pipeline\?\.resume\(\);\s*await this\.sendLoad\(\);/);
});

test('messages to the widget are built only by the core\'s builders', () => {
  const body = code(view);
  const posts = [...body.matchAll(/postMessage\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(posts.sort(), ['buildLoadMessage(note.value.data', 'buildStatusMessage(s'].sort());
});

test('a note that stops matching shows the refusal message with an "Open as JSON" button — the pane is never left stuck or silently closed', () => {
  const body = code(view);
  assert.match(body, /private showRefusal\(message: string\): void \{[\s\S]*?createEl\('button', \{ text: OPEN_AS_JSON_TITLE \}\)[\s\S]*?this\.openAsJson\(\)/);
  assert.match(body, /if \(note\.ok === false\) return this\.showRefusal\(`Edit rhythm: \$\{note\.message\}`\);/);
  assert.match(body, /if \(note\.ok === false\) \{\s*this\.showRefusal\(`Edit rhythm: \$\{note\.message\}`\);/);
  // a note that does not exist at all is closed by Obsidian's FileView (no file => result.close); the view detaches nothing itself
  assert.ok(!/this\.fail\(|detach\(\)/.test(body));
});

test('toggle: "Open as Beat Box" changes the note\'s OWN leaf — switchLeafToBeatBox never opens a tab', () => {
  const body = code(view);
  const fn = /export async function switchLeafToBeatBox[\s\S]*?\n\}\n/.exec(body)![0];
  assert.match(fn, /leaf\.setViewState\(\{ type: RHYTHM_EDIT_VIEW_TYPE, active: true, state: \{ file: file\.path \} \}\)/);
  assert.ok(!/getLeaf\(/.test(fn), 'no getLeaf anywhere on the toggle path');
  assert.equal([...body.matchAll(/getLeaf\('tab'\)/g)].length, 1, 'a new tab is opened in exactly one place: the command/menu fallback when no tab shows the note');
  const opener = /export async function openRhythmEditor[\s\S]*?\n\}\n/.exec(body)![0];
  assert.match(opener, /getLeavesOfType\('markdown'\)\.find\(\(l\) => l\.view instanceof MarkdownView && l\.view\.file\?\.path === file\.path\)/);
  assert.match(opener, /switchLeafToBeatBox\(app, own \?\? app\.workspace\.getLeaf\('tab'\), file\)/);
});

test('toggle: the header action on the markdown view switches view.leaf (the note\'s own tab) and the command passes the active markdown leaf', () => {
  const body = code(view);
  assert.match(body, /view\.addAction\('music', OPEN_AS_BEAT_BOX_TITLE, \(\) => \{\s*const file = view\.file;\s*if \(isCandidateFile\(app, file\)\) \{\s*hooks\.clearPreferMarkdown\(view\.leaf\);\s*void switchLeafToBeatBox\(app, view\.leaf, file\);/);
  assert.match(body, /void toBeatBox\(file, app\.workspace\.getActiveViewOfType\(MarkdownView\)\?\.leaf\)/);
  assert.match(body, /const toBeatBox = async \(file: TFile, from\?: WorkspaceLeaf \| null\) => \{\s*if \(from\) hooks\.clearPreferMarkdown\(from\);\s*await openRhythmEditor\(app, file, from\);/);
});

test('header actions appear only for matching notes: added when the note is a candidate, removed when it is not, re-synced on every relevant event', () => {
  const body = code(view);
  assert.match(body, /const want = isCandidateFile\(app, view\.file\);\s*const have = headerActions\.get\(view\);\s*if \(want && !have\) \{/);
  assert.match(body, /\} else if \(!want && have\) \{\s*have\.remove\(\);\s*headerActions\.delete\(view\);/);
  for (const ev of ["'file-open'", "'active-leaf-change'", "'layout-change'"]) assert.ok(body.includes(`app.workspace.on(${ev}, syncHeaderActions)`), ev);
  assert.ok(body.includes("app.metadataCache.on('changed', syncHeaderActions)"));
});

test('toggle back: "Open as JSON" is a header action of the Beat Box view and returns the SAME leaf to markdown for the same file; no JSON editor of our own', () => {
  const body = code(view);
  assert.match(body, /this\.addAction\('braces', OPEN_AS_JSON_TITLE, \(\) => \{ void this\.openAsJson\(\); \}\);/);
  assert.match(body, /await this\.leaf\.setViewState\(\{ type: 'markdown', active: true, state: \{ file: filePath \} \}\);/);
  assert.ok(!/CodeMirror|EditorView|new Editor|createEl\('textarea'/.test(body), 'the view builds no editor of its own');
});

test('no per-file memory: nothing in the view persists a view preference', () => {
  const body = code(view);
  assert.ok(!/saveData|loadData|localStorage|sessionStorage/.test(body));
});

test('the editor is refused (with a Notice naming why) before any pane switches: read_only, wrong type, wrong body', () => {
  const body = code(view);
  assert.match(body, /const note = readRhythmNote\(await app\.vault\.read\(file\)\);\s*if \(note\.ok === false\) \{\s*new Notice\(`Edit rhythm: \$\{note\.message\}`, 8000\);\s*return;/);
});

test('registration: main.ts registers the view, command and menus once, via registerRhythmEdit, lending it the setting and two vault-level actions', () => {
  assert.match(main, /import \{ registerRhythmEdit \} from '\.\/rhythm-edit-view\.ts';/);
  assert.equal([...code(main).matchAll(/registerRhythmEdit\(this, \{/g)].length, 1);
  assert.match(code(main), /isDefaultViewEnabled: \(\) => this\.settings\.openRhythmNotesInBeatBox,\s*createNewNote: \(\) => \{ void this\.createNewSnippet\(\); \},\s*toggleEdgesPanel: \(\) => \{ void this\.toggleEdgesView\(\); \},/);
  const body = code(view);
  assert.match(body, /id: 'edit-rhythm-in-rhythm-box'/);
  assert.match(body, /export const RHYTHM_EDIT_COMMAND_NAME = 'Edit rhythm in Rhythm Box';/);
  assert.match(body, /plugin\.registerView\(RHYTHM_EDIT_VIEW_TYPE/);
  assert.match(body, /app\.workspace\.on\('file-menu'/);
  assert.match(body, /app\.workspace\.on\('editor-menu'/);
});

test('availability: the command and both menu items are gated on isRhythmEditCandidate (type: data, content_type: json)', () => {
  const body = code(view);
  assert.match(body, /isRhythmEditCandidate\(app\.metadataCache\.getFileCache\(file\)\?\.frontmatter/);
  assert.match(body, /checkCallback: \(checking: boolean\) => \{\s*const file = app\.workspace\.getActiveFile\(\);\s*if \(!isCandidateFile\(app, file\)\) return false;/);
  assert.equal([...body.matchAll(/isCandidateFile\(/g)].length >= 6, true);   // definition + command + file-menu + editor-menu + header sync + header click
});

test('the widget path the view loads is where the music-theory vault keeps it', () => {
  assert.equal(RHYTHM_BOX_WIDGET_PATH, 'music_instruments/resources/html/rhythm_box.html');
  const found = ['../music-theory', 'assets/vaults/music-theory'].some((base) => fs.existsSync(path.resolve(process.cwd(), base, RHYTHM_BOX_WIDGET_PATH)));
  assert.ok(found, 'rhythm_box.html exists at that path in the source vault or the bundled copy');
});


// ---- Phase 5c (drain 2026-10-07-0100) ------------------------------------------------------------------------------

const restoreSrc = code(read('src/restore-note-to-git.ts'));
const edgesSrc = code(read('src/edges-view.ts'));
const settingsSrc = code(read('src/settings.ts'));

test('FileView: the Beat Box is an EditableFileView (title, rename, "…" menu, breadcrumbs, getActiveFile) and never claims other notes\' extensions', () => {
  const body = code(view);
  assert.match(body, /export class RhythmEditView extends EditableFileView \{/);
  assert.ok(!/canAcceptExtension/.test(body), 'canAcceptExtension stays false: leaf.openFile(other note) must not be captured by the Beat Box');
  assert.match(body, /async onOpen\(\): Promise<void> \{\s*await super\.onOpen\(\);/);
  assert.match(body, /async onLoadFile\(file: TFile\): Promise<void> \{\s*await super\.onLoadFile\(file\);\s*await this\.mount\(file\);/);
  assert.ok(!/getDisplayText|getState\(\)/.test(body), 'title and state come from FileView');
});

test('FileView: a layout saved by Phase 5b ({filePath}) still opens — setState migrates it to {file}', () => {
  assert.match(code(view), /typeof legacy\.filePath === 'string' && typeof legacy\.file !== 'string'\s*\? \{ \.\.\.\(state as object\), file: legacy\.filePath \}/);
});

test('FileView: the file-menu item "Edit rhythm in Rhythm Box" is skipped inside the Beat Box\'s own "…" menu', () => {
  assert.match(code(view), /on\('file-menu', \(menu, file, _source, leaf\) => \{\s*if \(leaf\?\.view instanceof RhythmEditView\) return;/);
});

test('default view: the swap is driven by the pure controller on file-open / active-leaf-change / layout-change / metadata changed / layout-ready', () => {
  const body = code(view);
  assert.match(body, /createDefaultViewController<WorkspaceLeaf>\(\{\s*settingOn: \(\) => base\.isDefaultViewEnabled\(\),/);
  for (const ev of ["'file-open'", "'active-leaf-change'", "'layout-change'"]) assert.ok(body.includes(`app.workspace.on(${ev}, evaluateAllLeaves)`), ev);
  assert.ok(body.includes("app.metadataCache.on('changed', evaluateAllLeaves)"));
  assert.ok(body.includes('app.workspace.onLayoutReady(evaluateAllLeaves)'));
  assert.match(body, /defaultView\.evaluate\(leaf\)\.catch\(/);
});

test('default view: the allow-list reads the leaf\'s ROOT — main area and sidebars only; everything else is "other"', () => {
  const body = code(view);
  assert.match(body, /if \(root === app\.workspace\.rootSplit\) return 'main';\s*if \(root === app\.workspace\.leftSplit \|\| root === app\.workspace\.rightSplit\) return 'sidebar';\s*return 'other';/);
  assert.match(body, /const isPlainMarkdownView = view instanceof MarkdownView;/);
});

test('default view: the swap happens in the SAME leaf (setViewState) and only the already-active leaf is re-activated', () => {
  const body = code(view);
  assert.match(body, /swapToBeatBox: async \(leaf, path\) => \{[\s\S]*?await leaf\.setViewState\(\{ type: RHYTHM_EDIT_VIEW_TYPE, active, state: \{ file: path \}, popstate: true \} as ViewState\);/);
  assert.match(body, /isSwapped: \(leaf\) => leaf\.view\.getViewType\(\) === RHYTHM_EDIT_VIEW_TYPE,/);
  assert.match(body, /const active = app\.workspace\.getActiveViewOfType\(MarkdownView\)\?\.leaf === leaf;/);
});

test('default view: the automatic swap stays out of navigation history (internal popstate flag), the explicit toggles do not use it', () => {
  const body = code(view);
  assert.equal([...body.matchAll(/popstate: true/g)].length, 1, 'only the automatic swap');
  const explicit = /export async function switchLeafToBeatBox[\s\S]*?\n\}\n/.exec(body)![0];
  assert.ok(!/popstate/.test(explicit));
});

test('default view: "Open as JSON" marks the leaf BEFORE switching (so the events the switch fires see the mark)', () => {
  const body = code(view);
  const mark = body.indexOf('this.hooks.markPreferMarkdown(this.leaf, filePath);');
  const swap = body.indexOf("await this.leaf.setViewState({ type: 'markdown'");
  assert.ok(mark > 0 && swap > mark);
});

test('setting: "Open rhythm data notes in Beat Box by default" exists, defaults ON, and is what the view consults', () => {
  assert.match(settingsSrc, /openRhythmNotesInBeatBox: boolean;/);
  assert.match(settingsSrc, /openRhythmNotesInBeatBox: true,/);
  assert.match(settingsSrc, /setName\('Open rhythm data notes in Beat Box by default'\)/);
  assert.match(settingsSrc, /this\.plugin\.settings\.openRhythmNotesInBeatBox = value;\s*await this\.plugin\.saveSettings\(\);/);
});

test('restore: the checkout runs INSIDE runRestoreWithHolds (single and all), after the markdown flush, and the Beat Box is held then released', () => {
  const single = /export async function restoreNoteToLastCommit[\s\S]*?\n\}\n/.exec(restoreSrc)![0];
  assert.ok(single.indexOf('flushOpenEditors(app)') < single.indexOf('runRestoreWithHolds('));
  assert.match(single, /runRestoreWithHolds\(collectRestoreParticipants\(\), \[decision\.path\],\s*\(\) => attemptCheckout\(\(\) => \{ git\(base, \['checkout', '--', decision\.path\]\); \}\)\)/);
  const all = /export async function restoreVaultToLastCommit[\s\S]*?\n\}\n/.exec(restoreSrc)![0];
  assert.match(all, /runRestoreWithHolds\(collectRestoreParticipants\(\), paths,\s*\(\) => attemptCheckout\(\(\) => \{ git\(base, \['checkout', '--', \.\.\.paths\]\); \}\)\)/);
  const body = code(view);
  assert.match(body, /registerRestoreParticipants\(\(\) => \{[\s\S]*?flush: \(\) => v\.flush\(\), hold: \(\) => v\.holdForRestore\(\), release: \(\) => v\.releaseAfterRestore\(\)/);
  assert.match(body, /async releaseAfterRestore\(\): Promise<void> \{\s*await this\.reloadFromNote\(\);/);
});

test('restore: pending Beat Box edits are flushed BEFORE git status (single and all), so an edit still in the debounce makes the note restorable', () => {
  const single = /export async function restoreNoteToLastCommit[\s\S]*?\n\}\n/.exec(restoreSrc)![0];
  assert.ok(single.indexOf('flushRestoreParticipants(collectRestoreParticipants(), [file.path])') > 0);
  assert.ok(single.indexOf('flushRestoreParticipants(') < single.indexOf("git(base, ['status'"));
  const all = /export async function restoreVaultToLastCommit[\s\S]*?\n\}\n/.exec(restoreSrc)![0];
  assert.ok(all.indexOf('flushRestoreParticipants(open, open.map((p) => p.path))') > 0);
  assert.ok(all.indexOf('flushRestoreParticipants(') < all.indexOf("git(base, ['status', '--short']"));
});

test('restore: the header action targets the Beat Box\'s own file explicitly, and the palette command still resolves the active file', () => {
  assert.match(code(view), /restoreNoteToLastCommit\(this\.app, this\.file\)/);
  assert.match(restoreSrc, /export async function restoreActiveNoteToLastCommit\(app: App\): Promise<void> \{\s*await restoreNoteToLastCommit\(app, app\.workspace\.getActiveFile\(\)\);/);
});

test('hammer: the Forge button is gated on forgeButtonShouldShow (action only); the edges toggle on its own predicate; the Beat Box never has a hammer', () => {
  const m = code(main);
  const sync = /syncButtons\(\) \{[\s\S]*?\n  \}\n/.exec(m)![0];
  assert.match(sync, /if \(edgesToggleShouldShow\(\{ type: typeof fm\?\.type === 'string' \? fm\.type : undefined \}\)\) \{\s*const edgesBtn = view\.addAction\('network'/);
  assert.match(sync, /if \(forgeButtonShouldShow\(\{ type: typeof fm\?\.type === 'string' \? fm\.type : undefined \}\)\) \{[\s\S]*?view\.addAction\('hammer', 'Forge this note'/);
  assert.ok(!/hammer/.test(code(view)), 'no hammer in the Beat Box view');
});

test('edges panel: follows the Beat Box tab\'s note (a rhythm note is a note tab too)', () => {
  assert.match(edgesSrc, /activeFileView\?\.getViewType\(\) === RHYTHM_EDIT_VIEW_TYPE \? activeFileView\.file : null/);
  assert.match(edgesSrc, /\} else if \(activeBeatBoxFile\) \{\s*this\.currentFile = activeBeatBoxFile;/);
});
