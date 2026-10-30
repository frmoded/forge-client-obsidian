// score_first_experiment M1 (drain 2026-10-21-1100) — "New bar": the one-minute fast path from an empty score-first vault to a first bar you can hear and see.
//
// The Obsidian-coupled half (the decisions are in score-first-core.ts, the gate in vault-profile-core.ts). In a vault that is NOT score-first NOTHING is registered that a
// person can see: no "New bar" command and no ribbon button are registered. The vault's profile is a constant, so both are added once, when the workspace is ready; a forge.toml
// edited mid-session to ADD the profile takes effect on the next load.

import { MarkdownView, Notice, TFile, type Plugin, type ViewState, type WorkspaceLeaf } from 'obsidian';
import { isScoreFirstVault } from './vault-profile-core.ts';
import { BAR_FOLDER, createNewBar, isFileExistsError, newBarAvailable, scorePanelPlan } from './score-first-core.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { musicEdition } from './music-edition-selected.ts';
import { refreshLine, refreshNoteLinks, refreshNotice } from './refresh-notes-core.ts';
import { BAR_FOLDER_NAME, PHRASE_FOLDER, PHRASE_VIEW_TYPE, createNewMix, isBarPath, createNewMorph, createNewPhrase, isPhrasePath, newMixAvailable, newMorphAvailable, newPhraseAvailable, readPhraseKind, turnMixIntoMorph, turnMixIntoMorphAvailable, type PhraseParams } from './phrase-core.ts';
import { morphChangesViaEngine } from './phrase-engine.ts';
import { PhraseView, openPhrase, openPhraseInLeaf, type PhraseStructureHooks } from './phrase-view.ts';
import { ArrangementView, registerKitsAndArrangements } from './kits-arrangements.ts';
import { isKitPath } from './kit-core.ts';
import { isArrangementPath } from './arrangement-core.ts';
import { choosePhraseTarget, createPhraseHeaderSync } from './phrase-header-core.ts';
import { headerResync } from './header-resync.ts';
import { createPhraseRouter } from './phrase-default-view-core.ts';
import { createPaneLinker, openPairAvailable, type PairSource } from './linked-panes-core.ts';
import { collectLeaves } from './workspace-leaves-core.ts';
import { usedByChips } from './structure-strip-core.ts';
import { mountStructureStrip, type StripHandle } from './structure-strip-dom.ts';
import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';
import { RHYTHM_SCORE_VIEW_TYPE } from './rhythm-mode-core.ts';
import { PLAN_COMMAND_ID, PLAN_COMMAND_NAME, createSentencePlanner, planAvailable, type PlanPayload } from './sentence-plan-core.ts';
import { SentencePlanModal } from './sentence-plan-modal.ts';
import { NOTEBOOK_FOLDER, createNotebook } from './notebook-core.ts';

export const NEW_BAR_COMMAND_ID = 'new-bar';
export const NEW_BAR_COMMAND_NAME = 'New bar';
// score_first M5 (drain 2026-10-22-1850): phrases. Registered after the SAME gate as "New bar", never in another vault.
export const NEW_PHRASE_COMMAND_ID = 'new-phrase-from-bar';
export const NEW_PHRASE_COMMAND_NAME = 'New phrase from this bar';
export const OPEN_PHRASE_COMMAND_ID = 'open-phrase-as-score';
export const OPEN_PHRASE_COMMAND_NAME = 'Open phrase as Score';
// score_first M7 Phase A (drain 2026-10-22-2330): a mix of two bars is a phrase too. Same gate, same place.
export const NEW_MIX_COMMAND_ID = 'new-mix-from-bar';
export const NEW_MIX_COMMAND_NAME = 'New mix from this bar';
// score_first M7c Phase A (drain 2026-10-24-1200): a morph from this bar to another is a phrase too. Same gate, same place.
export const NEW_MORPH_COMMAND_ID = 'new-morph-from-bar';
export const NEW_MORPH_COMMAND_NAME = 'New morph from this bar';
// score_first (drain 2026-10-25-1000): a mix has only about two visible states; its morph has the path. One gesture from the first to the second: offered ONLY while the active tab shows a mix phrase.
export const TURN_MIX_COMMAND_ID = 'turn-mix-into-morph';
export const TURN_MIX_COMMAND_NAME = 'Turn this mix into a morph';
// score_first M12 (drain 2026-10-26-1250): the two-pane spike. Same gate, same place; offered on a phrase tab, a phrase's JSON text tab or a bar's Beat Box tab.
export const OPEN_PAIR_COMMAND_ID = 'open-score-with-notes';
export const OPEN_PAIR_COMMAND_NAME = 'Open Score with notes';
// score_first M7b (a) (drain 2026-10-26-1260): phrase and bar notes read as notes (Description, Recipe, wikilinks). This command brings every phrase and bar note of the vault up to date; the plugin's own writes keep them in step.
export const REFRESH_LINKS_COMMAND_ID = 'refresh-note-links';
export const REFRESH_LINKS_COMMAND_NAME = 'Refresh note links';

export interface ScoreFirstHooks {
  /** Open a rhythm note in the Beat Box (the plugin's own opener: a tab already showing the note is reused, else a new tab). */
  openRhythmNote(file: TFile): Promise<void>;
  /** 2026-10-26-1250 (M12): keep this leaf showing this (bar) note as text, so the Beat Box default view does not swap the notes pane into an editor. Absent = nothing is marked. */
  markRhythmText?(leaf: WorkspaceLeaf, path: string): void;
  /** 2026-10-26-1800: hold / release a leaf as reading text for the Beat Box default view (the pair's notes pane). */
  holdRhythmText?(leaf: WorkspaceLeaf, on: boolean): void;
  /** 2026-10-27-1015 ("New phrase from a sentence"): POST the sentence to the hosted service's /plan with the person's token, and the BYOK key to send (or undefined). Absent = the dialog says the service cannot be reached. */
  askPlan?(payload: PlanPayload): Promise<{ status: number; json: unknown }>;
  ownKey?(): string | undefined;
  /** 2026-10-27-0720 (the notebook's typed request): the service's /health version, or null. Asked only to tell an old service from a sentence it cannot plan. */
  serviceVersion?(): Promise<string | null>;
}

export function registerScoreFirst(plugin: Plugin, hooks: ScoreFirstHooks): void {
  const app = plugin.app;
  let scoreFirst = false;
  // M4 (drain 2026-10-21-2010): the same answer tells the message router whether this vault keeps the Forge output panel closed. Asked at registration too (not only when the workspace is
  // ready), so the first messages of a session already follow the vault's profile.
  const refresh = async () => {
    scoreFirst = await isScoreFirstVault(app.vault);
    messageDelivery.setScoreFirst(scoreFirst);
    console.info(`[forge-profile] refresh: score_first=${scoreFirst}`);                // a permanent evidence line: a report that a score-first behaviour is missing arrives with the answer the plugin had
  };
  void refresh();

  const createBar = (): Promise<unknown> => createNewBar<TFile>({
    folderExists: () => app.vault.getAbstractFileByPath(BAR_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(BAR_FOLDER); },
    listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => hooks.openRhythmNote(file),
    notify: (message) => { new Notice(message); },
  });

  const activePath = (): string | null => app.workspace.getActiveFile()?.path ?? null;
  const createPhrase = (): Promise<unknown> => createNewPhrase<TFile>({
    activePath,
    folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
    listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => openPhrase(app, file),
    notify: (message) => { new Notice(message); },
    isAlreadyExists: isFileExistsError,
  });

  const createMix = (): Promise<unknown> => createNewMix<TFile>({
    activePath,
    folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
    listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
    listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER_NAME}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => openPhrase(app, file),
    notify: (message) => { new Notice(message); },
    isAlreadyExists: isFileExistsError,
  });

  const createMorph = (): Promise<unknown> => createNewMorph<TFile>({
    activePath,
    folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
    createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
    listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
    listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER_NAME}/`)).map((f) => f.basename),
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open: (file) => openPhrase(app, file),
    notify: (message) => { new Notice(message); },
    isAlreadyExists: isFileExistsError,
  });

  // 2026-10-27-1015: "New phrase from a sentence". A fresh planner (no memory of an earlier sentence) per dialog; Create goes through the same loop every new phrase does.
  const openSentencePlan = (): void => {
    const barNames = (): string[] => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER_NAME}/`)).map((f) => f.basename);
    const planner = createSentencePlanner<TFile>({
      activePath,
      folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
      createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
      listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
      listBarBasenames: barNames,
      exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
      create: (p, content) => app.vault.create(p, content),
      open: (file) => openPhrase(app, file),
      notify: (message) => { new Notice(message); },
      isAlreadyExists: isFileExistsError,
      ask: (payload) => (hooks.askPlan ? hooks.askPlan(payload) : Promise.resolve({ status: 0, json: { detail: 'planning is not available in this build' } })),
      ownKey: () => hooks.ownKey?.(),
      trace: (line) => { console.info(line); },
    });
    new SentencePlanModal(app, planner, barNames().filter((n) => n !== 'README').sort()).open();
  };

  // 2026-10-25-1000 "Turn this mix into a morph": the note it acts on is named by the caller BEFORE any await (the active view's own file, or the strip button's own tab: never re-read from a getter later). It never
  // rejects: every failure is one Notice naming why (turnMixIntoMorph), and anything unexpected is a console.error plus a Notice, never a silent promise.
  const turnMix = (file: TFile): Promise<void> => {
    const path = file.path;
    return turnMixIntoMorph<TFile>({
      activePath: () => path,
      folderExists: () => app.vault.getAbstractFileByPath(PHRASE_FOLDER) !== null,
      createFolder: async () => { await app.vault.createFolder(PHRASE_FOLDER); },
      listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
      exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
      create: (p, content) => app.vault.create(p, content),
      open: (created) => openPhrase(app, created),
      notify: (message) => { new Notice(message); },
      isAlreadyExists: isFileExistsError,
      readNote: async (p) => {
        const f = app.vault.getAbstractFileByPath(p);
        if (!(f instanceof TFile)) throw new Error('File not found');
        return app.vault.read(f);
      },
      changes: (a, b, order, seed) => morphChangesViaEngine(a, b, order, seed),
      trace: (line) => { console.info(line); },
    }).then(() => undefined, (e) => { console.error('turnMix: unexpected failure', e); new Notice(`Could not turn this mix into a morph: ${(e as Error)?.message ?? e}`); });
  };
  // The phrase the person is on, from the ACTIVE VIEW (not from a leaf lookup): a phrase tab (its Score) or a phrase's own text tab, with the kind it says it is. null = not on a phrase.
  const activePhrase = (): { kind: PhraseParams['kind'] | null; file: TFile } | null => {
    const tab = app.workspace.getActiveViewOfType(PhraseView);
    if (tab?.file) return { kind: tab.phraseKind(), file: tab.file };
    const text = app.workspace.getActiveViewOfType(MarkdownView);
    if (text?.file && isPhrasePath(text.file.path)) return { kind: readPhraseKind(text.editor?.getValue() ?? text.data ?? ''), file: text.file };
    return null;
  };

  // The profile is a constant of the vault, so the command and the ribbon button are added ONCE, when the workspace is ready (the adapter is up) — and only if this vault is
  // score-first. In any other vault they are not registered at all: not in the palette, not in Settings -> Hotkeys, not in the ribbon. The command still asks the live answer
  // when run, so a forge.toml that stops declaring the profile mid-session turns it off at once.
  plugin.registerEvent(app.vault.on('modify', (f) => { if (f.path === 'forge.toml') void refresh(); }));
  app.workspace.onLayoutReady(() => {
    void refresh().then(() => {
      if (!newBarAvailable(scoreFirst)) return;
      plugin.addCommand({
        id: NEW_BAR_COMMAND_ID,
        name: NEW_BAR_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newBarAvailable(scoreFirst)) return false;
          if (!checking) void createBar();
          return true;
        },
      });
      plugin.addRibbonIcon('plus-circle', NEW_BAR_COMMAND_NAME, () => { void createBar(); });
      // M5: the phrase tab (a control strip over a live Score) and its two commands. The view type is registered here, after the gate, so no other vault knows it exists. Both commands still ask
      // the live answer when offered, like "New bar".
      const plan = scorePanelPlan({ scoreFirst: true, edition: musicEdition.id });
      // M6: a lineage link names a note by its path without .md. A phrase opens as a phrase tab, a bar in the Beat Box; a note that is not there is a Notice naming it (the person just clicked it).
      const openNote = (noteId: string) => {
        const file = app.vault.getAbstractFileByPath(`${noteId}.md`);
        if (!(file instanceof TFile)) { new Notice(`Could not open ${noteId}: that note is not in this vault.`); return; }
        if (noteId.startsWith(`${PHRASE_FOLDER}/`)) { void openPhrase(app, file); return; }
        // 2026-10-25-0800: a bar that is already open in a tab (its Beat Box, its Score or its text) is focused THERE, as a phrase is; only otherwise is it opened (the fork's "Open note" used to open a second tab of a bar already open)
        let open: WorkspaceLeaf | null = null;
        app.workspace.iterateAllLeaves((l) => {
          if (open) return;
          const s = l.getViewState();
          if ((s.type === 'markdown' || s.type === RHYTHM_EDIT_VIEW_TYPE || s.type === RHYTHM_SCORE_VIEW_TYPE) && (s.state as { file?: unknown } | undefined)?.file === file.path) open = l;
        });
        if (open) { app.workspace.setActiveLeaf(open, { focus: true }); console.info(`[forge-phrase] reused ${file.path} (focused existing tab)`); return; }
        void hooks.openRhythmNote(file);
      };
      // 2026-10-23-0630: a phrase note opens as its Score by default. Created only here, after the gate, so a vault that is not score-first has no router at all. The person's Open as JSON is a mark on
      // the leaf (set before the tab switches), cleared again by Open as Score; the tabs that exist now (restored with the layout) keep their text until their leaf navigates.
      const router = createPhraseRouter<WorkspaceLeaf>({
        scoreFirst: () => scoreFirst,
        describe: (leaf) => {
          if (!leaf.view) return null;
          const root = leaf.getRoot();
          const location = root === app.workspace.rootSplit ? 'main' : root === app.workspace.leftSplit || root === app.workspace.rightSplit ? 'sidebar' : 'other';
          const isPlainMarkdownView = leaf.view instanceof MarkdownView;
          return { location, isPlainMarkdownView, filePath: isPlainMarkdownView ? (leaf.view as MarkdownView).file?.path ?? null : null };
        },
        // popstate (an internal flag of setViewState, as in the Beat Box swap) keeps the swap out of the leaf's history, so Back does not land on text that is swapped again
        swapTo: async (leaf, path) => {
          const active = app.workspace.getActiveViewOfType(MarkdownView)?.leaf === leaf;
          await leaf.setViewState({ type: PHRASE_VIEW_TYPE, active, state: { file: path }, popstate: true } as ViewState);
        },
        isSwapped: (leaf) => leaf.view.getViewType() === PHRASE_VIEW_TYPE,
        sleep: (ms) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); }),
        trace: (line) => { console.info(line); },
        // one tab per phrase (2026-10-24-0900). Obsidian's explorer / link / quick switcher open a file with getLeaf(false).openFile(): they navigate the current tab and never look for a tab that already shows the note.
        // A leaf "shows" the phrase when its saved view state says so (a Score, or the note as markdown text; a background tab that has not loaded yet answers the same way).
        findOpen: (self, path) => {
          let found: WorkspaceLeaf | null = null;
          app.workspace.iterateAllLeaves((l) => {
            if (found || l === self) return;
            const s = l.getViewState();
            if ((s.type === PHRASE_VIEW_TYPE || s.type === 'markdown') && (s.state as { file?: unknown } | undefined)?.file === path) found = l;
          });
          return found;
        },
        focus: (leaf) => { app.workspace.setActiveLeaf(leaf, { focus: true }); },
        // 2026-10-25-0800: the leaf that just opened the phrase is PUT BACK to the view it had, and never closed unless the gesture itself made it. Not Obsidian's own history: setViewState records the replaced view in
        // `leaf.history` only at its END, while `file-open` (our trigger) fires inside it, so the back stack is still empty here (measured in Obsidian 1.14.5's app.js) and the old "nothing to go back to -> detach" closed the
        // person's tab in the middle of its own load (Obsidian then logs a RangeError from saveHistory). So the view the leaf had is recorded by us, on every workspace event (trackLeaves), and restored with setViewState
        // once the leaf is idle (a busy leaf silently drops setViewState and history.go only raises a "tab busy" notice), verified, and retried.
        dismiss: async (leaf) => {
          const before = beforeState.get(leaf);
          await idle(leaf);
          if (before === undefined || before === null) {                   // a leaf never seen before this open: the gesture made it (a new tab)
            const siblings = (leaf.parent as unknown as { children?: unknown[] } | null)?.children;
            if (siblings && siblings.length > 1) { leaf.detach(); return { kind: 'closed' as const }; }
            return null;
          }
          const file = (before.state as { file?: unknown } | undefined)?.file;
          if (before.type === 'markdown' && typeof file === 'string' && isPhrasePath(file)) router.setMark(leaf, file, 'markdown');   // a phrase that was showing as text stays text (the choice was dropped when the leaf moved on)
          for (let attempt = 0; attempt < 4; attempt++) {
            await leaf.setViewState({ type: before.type, state: before.state, active: false, popstate: true } as ViewState);
            if (stateKey(leaf.getViewState()) === stateKey(before)) return { kind: 'restored' as const, other: typeof file === 'string' ? file : null };
            await new Promise<void>((resolve) => { window.setTimeout(resolve, 60 * (attempt + 1)); });
            await idle(leaf);
          }
          return null;
        },
      });
      // The view every leaf showed before its CURRENT one, kept by us (see dismiss). A leaf first seen at the state it opens the phrase in has no "before": it was made by this very gesture.
      const lastState = new WeakMap<WorkspaceLeaf, ViewState>();
      const beforeState = new WeakMap<WorkspaceLeaf, ViewState | null>();
      const stateKey = (s: ViewState): string => `${s.type}|${String((s.state as { file?: unknown } | undefined)?.file ?? '')}`;
      const trackLeaves = () => app.workspace.iterateAllLeaves((leaf) => {
        const s = leaf.getViewState();
        const last = lastState.get(leaf);
        if (last !== undefined && stateKey(last) === stateKey(s)) return;
        beforeState.set(leaf, last ?? null);
        lastState.set(leaf, { type: s.type, state: s.state } as ViewState);
      });
      /** Wait (up to ~1 s) until the leaf is not in the middle of changing its view: Obsidian ignores setViewState and history.go on a leaf that is `working`. */
      const idle = async (leaf: WorkspaceLeaf): Promise<void> => {
        for (let i = 0; i < 50 && (leaf as unknown as { working?: boolean }).working === true; i++) await new Promise<void>((resolve) => { window.setTimeout(resolve, 20); });
      };
      trackLeaves();
      const baseline: Array<[WorkspaceLeaf, string]> = [];
      app.workspace.iterateAllLeaves((leaf) => {
        const s = leaf.getViewState();
        const f = (s.state as { file?: unknown } | undefined)?.file;
        if (s.type === 'markdown' && typeof f === 'string') baseline.push([leaf, f]);
      });
      router.restore(baseline);
      const routeAll = () => {
        trackLeaves();                                                      // first: what every tab showed before this event is what a duplicate open puts back
        for (const leaf of app.workspace.getLeavesOfType('markdown')) router.evaluate(leaf).catch((e) => console.warn('[forge-phrase] default-view pass failed:', e));
      };
      plugin.registerEvent(app.workspace.on('file-open', routeAll));
      plugin.registerEvent(app.workspace.on('active-leaf-change', routeAll));
      plugin.registerEvent(app.workspace.on('layout-change', routeAll));
      // 2026-10-26-1250 (M12, the two-pane spike): the notes pane beside a Score is a markdown leaf in READING view that follows the bar pinned in the Score. We keep our OWN pairing record (linked-panes-core.ts) rather
      // than Obsidian's linked-tab group: `setGroupMember`/`setGroup` exist in the typings, but a group syncs scroll between notes, and nothing says it behaves for a custom view. The notes leaf is marked "text" for BOTH
      // default-view routers (phrase and Beat Box) before every navigation, or they would swap the note into a Score / an editor.
      const liveLeaves = (): Set<WorkspaceLeaf> => collectLeaves<WorkspaceLeaf>((each) => app.workspace.iterateAllLeaves(each));   // never `(l) => set.add(l)`: a truthy return stops Obsidian's walk (workspace-leaves-core.ts)
      const showReadOnly = async (leaf: WorkspaceLeaf, path: string): Promise<void> => {
        router.setMark(leaf, path, 'markdown', 'plugin');
        hooks.markRhythmText?.(leaf, path);
        await leaf.setViewState({ type: 'markdown', active: false, state: { file: path, mode: 'preview' } } as ViewState);
      };
      const linker = createPaneLinker<WorkspaceLeaf>({
        openBeside: async (score, path) => { const notes = app.workspace.createLeafBySplit(score, 'vertical', false); await showReadOnly(notes, path); return notes; },
        show: showReadOnly,
        alive: (leaf) => liveLeaves().has(leaf),
        focus: (leaf) => { app.workspace.setActiveLeaf(leaf, { focus: true }); },
        trace: (line) => { console.info(line); },
        pathOf: (leaf) => { const f = (leaf.getViewState().state as { file?: unknown } | undefined)?.file; return typeof f === 'string' ? f : null; },
        leafCount: () => liveLeaves().size,
        idOf: (leaf) => String((leaf as unknown as { id?: unknown }).id ?? '?'),
        isReading: (leaf) => (leaf.getViewState().state as { mode?: unknown } | undefined)?.mode === 'preview',
        hold: (leaf, on) => { router.hold(leaf, on); hooks.holdRhythmText?.(leaf, on); },      // BOTH default-view routers: a wikilink click in the notes pane must stay a reading view
      });
      plugin.registerEvent(app.workspace.on('layout-change', () => linker.sweep()));
      // 2026-10-26-1270 (M13): when the workspace says something moved, see whether the PERSON navigated a notes pane (a wikilink click in the Recipe, a backlink): the Score lights the bars that note contributed. A show we made
      // ourselves is tagged and never echoed back (linked-panes-core.ts).
      const onWorkspaceMoved = (fn: () => void) => { plugin.registerEvent(app.workspace.on('file-open', fn)); plugin.registerEvent(app.workspace.on('active-leaf-change', fn)); plugin.registerEvent(app.workspace.on('layout-change', fn)); };
      onWorkspaceMoved(() => linker.checkNotes());
      // A chip of the strip was clicked: the pair's notes pane goes there; a note that is not in the vault is ONE Notice naming it (and counts as handled, so the tab does not also try to open it).
      const structureHooks: PhraseStructureHooks = {
        goto: async (leaf, noteId) => {
          if (!(app.vault.getAbstractFileByPath(`${noteId}.md`) instanceof TFile)) { new Notice(`Could not open ${noteId}: that note is not in this vault.`); return true; }
          return linker.navigate(leaf, noteId);
        },
        onNotesNavigated: (leaf, fn) => linker.onNotesNavigated(leaf, fn),
      };
      // 2026-10-27-1030 (M14 slice 1): the notebook below a phrase's Score. Its vault side lives here; the decisions are in notebook-core.ts. Removing a note closes the tabs that show it FIRST (L12: a trash of an open note can no-op),
      // then trashes it, then checks it is gone, then falls back to the adapter.
      const removeNote = async (path: string): Promise<void> => {
        const f = app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return;
        for (const leaf of app.workspace.getLeavesOfType(PHRASE_VIEW_TYPE)) if ((leaf.view as { file?: TFile | null }).file?.path === path) leaf.detach();
        for (const leaf of app.workspace.getLeavesOfType('markdown')) if ((leaf.view as { file?: TFile | null }).file?.path === path) leaf.detach();
        await app.vault.trash(f, true);
        if (app.vault.getAbstractFileByPath(path) !== null) await app.vault.adapter.remove(path);
        if (await app.vault.adapter.exists(path)) throw new Error(`${path} is still there`);
      };
      const notebookFor = (file: TFile) => ({
        notebook: createNotebook<TFile>({
          sourcePhrase: file.path.replace(/\.md$/, ''),
          activePath: () => file.path,
          folderExists: (folder) => app.vault.getAbstractFileByPath(folder) !== null,
          createFolder: async (folder) => { await app.vault.createFolder(folder); },
          listPhraseBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PHRASE_FOLDER}/`)).map((f) => f.basename),
          listCellPaths: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${NOTEBOOK_FOLDER}/`)).map((f) => f.path),
          exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
          read: async (p) => { const f = app.vault.getAbstractFileByPath(p); if (!(f instanceof TFile)) throw new Error('File not found'); return app.vault.read(f); },
          create: (p, content) => app.vault.create(p, content),
          write: async (p, content) => { const f = app.vault.getAbstractFileByPath(p); if (!(f instanceof TFile)) throw new Error('File not found'); await app.vault.process(f, () => content); },
          remove: removeNote,
          open: (f) => openPhrase(app, f),
          notify: (message) => { new Notice(message); },
          isAlreadyExists: isFileExistsError,
          trace: (line) => { console.info(line); },
          // the typed request (slice 2): the same service call, token and BYOK key as "New phrase from a sentence"; the bar names ride along as for every /plan call
          ask: (payload) => (hooks.askPlan ? hooks.askPlan(payload) : Promise.resolve({ status: 0, json: { detail: 'planning is not available in this build' } })),
          ownKey: () => hooks.ownKey?.(),
          listBarBasenames: () => app.vault.getFiles().filter((f) => f.path.startsWith(`${BAR_FOLDER_NAME}/`)).map((f) => f.basename),
          serviceVersion: () => (hooks.serviceVersion ? hooks.serviceVersion() : Promise.resolve(null)),
        }),
        trace: (line: string) => { console.info(line); },
        openPhrase: (path: string) => { const f = app.vault.getAbstractFileByPath(path); if (f instanceof TFile) void openPhrase(app, f); },
      });
      plugin.registerView(PHRASE_VIEW_TYPE, (leaf) => new PhraseView(leaf, plan, openNote, (l, path) => router.setMark(l, path, 'markdown'), (file) => { void turnMix(file); }, (l, pin) => { void linker.pinned(l, pin); }, structureHooks, notebookFor));
      // 2026-10-29-0820 (M10 slice 1): kits and arrangements. Registered here, inside the score-first gate, so no other vault gets a view, a command or a byte of it (P3).
      registerKitsAndArrangements(plugin, { plan, scoreFirst: () => scoreFirst, structure: structureHooks, openNote });
      // 2026-10-26-1270: a bar's tab (its Beat Box or its Score) shows the phrases that use it, as chips above it, from the vault's resolved links (the `links:` of 1260 are what makes them resolve). The strip is added to the view's
      // content element on every event that can change the answer and put back if the view redrew without it; clicking a chip opens that phrase. Only in a score-first vault (this code runs after the gate).
      const barStrips = new WeakMap<HTMLElement, { handle: StripHandle; key: string }>();
      const syncBarStrips = () => {
        const resolved = (app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks ?? {};
        app.workspace.iterateAllLeaves((leaf) => {
          const type = leaf.view?.getViewType();
          if (type !== RHYTHM_EDIT_VIEW_TYPE && type !== RHYTHM_SCORE_VIEW_TYPE) return;
          const file = (leaf.view as unknown as { file?: TFile | null }).file;
          const host = (leaf.view as unknown as { contentEl?: HTMLElement }).contentEl;
          if (!host || !file || !isBarPath(file.path)) return;
          const chips = usedByChips(file.basename, resolved);
          const key = chips.map((c) => c.noteId).join('|');
          let entry = barStrips.get(host);
          if (!entry || !host.contains(entry.handle.el)) {
            entry?.handle.dispose();
            entry = { handle: mountStructureStrip(host, { onHover: () => {}, onClick: (chip) => { openNote(chip.noteId); } }, host.firstChild as Element | null), key: '\0' };
            barStrips.set(host, entry);
          }
          if (entry.key !== key) {
            entry.handle.set(chips);
            entry.key = key;
            if (chips.length > 0) console.info(`[forge-strip] ${file.basename} used by ${chips.map((c) => c.text).join(', ')}`);
          }
        });
      };
      onWorkspaceMoved(() => syncBarStrips());
      plugin.registerEvent(app.metadataCache.on('resolved', () => syncBarStrips()));
      plugin.registerEvent(app.metadataCache.on('changed', () => syncBarStrips()));
      syncBarStrips();
      // Open as Score is the person asking for the Score again: forget an earlier Open as JSON on that leaf
      const openScore = (leaf: WorkspaceLeaf, file: TFile) => { router.setMark(leaf, file.path, null); return openPhraseInLeaf(app, leaf, file); };
      // The tab the command acts on comes from the ACTIVE VIEW (never a leaf lookup), as the other palette commands do. A bar's tab is its Beat Box (or its Score): the most recent leaf, which is the one the palette was opened from.
      const pairTarget = (): { kind: PairSource; leaf: WorkspaceLeaf; file: TFile } | null => {
        const tab = app.workspace.getActiveViewOfType(PhraseView);
        if (tab?.file) return { kind: 'phrase', leaf: tab.leaf, file: tab.file };
        const arrangement = app.workspace.getActiveViewOfType(ArrangementView);                 // 2026-10-29-0830: the notes pane shows the arrangement note itself (an arrangement's bars carry no pin)
        if (arrangement?.file) return { kind: 'arrangement', leaf: arrangement.leaf, file: arrangement.file };
        const text = app.workspace.getActiveViewOfType(MarkdownView);
        if (text?.file && isPhrasePath(text.file.path)) return { kind: 'phrase-text', leaf: text.leaf, file: text.file };
        const recent = app.workspace.getMostRecentLeaf();
        const type = recent?.view?.getViewType();
        const file = (recent?.view as { file?: TFile | null } | undefined)?.file;
        if (recent && (type === RHYTHM_EDIT_VIEW_TYPE || type === RHYTHM_SCORE_VIEW_TYPE) && file && isBarPath(file.path)) return { kind: 'bar', leaf: recent, file };
        return null;
      };
      const openPair = async (target: { kind: PairSource; leaf: WorkspaceLeaf; file: TFile }): Promise<void> => {
        try {
          if (target.kind === 'phrase-text') await openScore(target.leaf, target.file);        // the Score in this very tab first, then the pair
          const result = await linker.open(target.leaf, target.file.path, target.file.path);
          if (result === 'failed') new Notice(`${OPEN_PAIR_COMMAND_NAME} failed: the notes pane could not be opened (see the console).`);
        } catch (e) {
          console.error('Open Score with notes failed', e);
          new Notice(`${OPEN_PAIR_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        }
      };
      plugin.addCommand({
        id: OPEN_PAIR_COMMAND_ID,
        name: OPEN_PAIR_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          const target = pairTarget();
          if (!openPairAvailable({ scoreFirst, kind: target?.kind ?? null })) return false;
          if (!checking && target) void openPair(target);
          return true;
        },
      });
      // 1260: idempotent over every `phrases/phrase_NNN.md` and `bars/bar_NNN.md` (never README.md): a note that is already current is not written; one that cannot be read is named in the Notice; nothing ever throws.
      const refreshLinks = async (): Promise<void> => {
        try {
          const named = (f: TFile) => ({ path: f.path, name: f.basename });
          const summary = await refreshNoteLinks({
            phrases: () => app.vault.getFiles().filter((f) => isPhrasePath(f.path)).map(named),
            bars: () => app.vault.getFiles().filter((f) => isBarPath(f.path)).map(named),
            kits: () => app.vault.getFiles().filter((f) => isKitPath(f.path)).map(named),
            arrangements: () => app.vault.getFiles().filter((f) => isArrangementPath(f.path)).map(named),
            read: async (p) => { const f = app.vault.getAbstractFileByPath(p); if (!(f instanceof TFile)) throw new Error('File not found'); return app.vault.read(f); },
            process: async (p, fn) => { const f = app.vault.getAbstractFileByPath(p); if (!(f instanceof TFile)) throw new Error('File not found'); await app.vault.process(f, fn); },
          });
          console.info(refreshLine(summary));
          new Notice(refreshNotice(summary));
        } catch (e) {
          console.error('Refresh note links failed', e);
          new Notice(`${REFRESH_LINKS_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        }
      };
      plugin.addCommand({
        id: REFRESH_LINKS_COMMAND_ID,
        name: REFRESH_LINKS_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!scoreFirst) return false;
          if (!checking) void refreshLinks();
          return true;
        },
      });
      plugin.addCommand({
        id: NEW_PHRASE_COMMAND_ID,
        name: NEW_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newPhraseAvailable({ scoreFirst, activePath: activePath() })) return false;
          if (!checking) void createPhrase();
          return true;
        },
      });
      plugin.addCommand({
        id: NEW_MIX_COMMAND_ID,
        name: NEW_MIX_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newMixAvailable({ scoreFirst, activePath: activePath() })) return false;
          if (!checking) void createMix();
          return true;
        },
      });
      plugin.addCommand({
        id: TURN_MIX_COMMAND_ID,
        name: TURN_MIX_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          const active = activePhrase();
          if (!turnMixIntoMorphAvailable({ scoreFirst, kind: active?.kind })) return false;
          if (!checking && active) void turnMix(active.file);
          return true;
        },
      });
      plugin.addCommand({
        id: NEW_MORPH_COMMAND_ID,
        name: NEW_MORPH_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!newMorphAvailable({ scoreFirst, activePath: activePath() })) return false;
          if (!checking) void createMorph();
          return true;
        },
      });
      plugin.addCommand({
        id: PLAN_COMMAND_ID,
        name: PLAN_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          if (!planAvailable({ scoreFirst })) return false;
          if (!checking) openSentencePlan();
          return true;
        },
      });
      // 2100: the way back. A phrase shown as text (a markdown tab) carries "Open as Score" in its header, for exactly as long as it shows a phrase. A markdown view is reused when its tab
      // navigates, so the set is re-synced on every event that can change the answer (the same events the Beat Box's header buttons use).
      const headers = createPhraseHeaderSync<MarkdownView>({
        isScoreFirst: () => scoreFirst || messageDelivery.hasBeenScoreFirst(),      // this code only runs after the gate said yes; a later failed re-read must not take the button away
        open: (view, path) => {
          const file = app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) void openScore(view.leaf, file);
        },
      });
      const syncHeaders = (reason = 'event') => {
        const views: MarkdownView[] = [];
        for (const leaf of app.workspace.getLeavesOfType('markdown')) if (leaf.view instanceof MarkdownView) views.push(leaf.view);
        headers.sync(views);
        const shown = views.filter((v) => isPhrasePath(v.file?.path)).length;
        if (shown > 0) console.info(`[forge-header] phrase text tabs: ${shown}; header sync (${reason}); score-first now=${scoreFirst} ever=${messageDelivery.hasBeenScoreFirst()}`);
      };
      plugin.registerEvent(app.workspace.on('file-open', () => syncHeaders('file-open')));
      plugin.registerEvent(app.workspace.on('active-leaf-change', () => syncHeaders('active-leaf-change')));
      plugin.registerEvent(app.workspace.on('layout-change', () => syncHeaders('layout-change')));
      // the rhythm sync also listens to the metadata cache (a file's cache arriving after its tab did): the phrase's must too, or the two see different moments
      plugin.registerEvent(app.metadataCache.on('changed', () => syncHeaders('metadata-changed')));
      plugin.register(headerResync.subscribe((reason) => syncHeaders(reason)));
      plugin.register(messageDelivery.onScoreFirst(() => syncHeaders('profile-answer')));
      syncHeaders('registered');
      plugin.addCommand({
        id: OPEN_PHRASE_COMMAND_ID,
        name: OPEN_PHRASE_COMMAND_NAME,
        checkCallback: (checking: boolean) => {
          // 2105: act on the tab that SHOWS the phrase (the active markdown view's leaf, as the Beat Box's commands do), and never fail silently (a `void` on a rejected promise is invisible).
          const active = app.workspace.getActiveViewOfType(MarkdownView);
          const target = choosePhraseTarget<WorkspaceLeaf>({
            scoreFirst,
            activeMarkdown: active ? { path: active.file?.path, leaf: active.leaf } : null,
            markdownLeaves: app.workspace.getLeavesOfType('markdown').map((l) => ({ path: l.view instanceof MarkdownView ? l.view.file?.path : null, leaf: l })),
            activePath: app.workspace.getActiveFile()?.path ?? null,
          });
          if (!target) return false;
          if (!checking) {
            const file = app.vault.getAbstractFileByPath(target.path);
            if (!(file instanceof TFile)) { new Notice(`${OPEN_PHRASE_COMMAND_NAME} failed: ${target.path} is not in this vault.`); return true; }
            openScore(target.leaf ?? app.workspace.getLeaf(false), file).catch((e) => {
              console.error('Open phrase as Score failed', e);
              new Notice(`${OPEN_PHRASE_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
            });
          }
          return true;
        },
      });
    });
  });
}
