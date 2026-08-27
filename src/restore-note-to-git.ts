// Drain 2026-08-27-0400 — the wiring for "Restore to last commit".
//
// The decisions all live in restore-note-to-git-core.ts (drain 0200,
// reviewed and adopted); this file is the impure half: shelling to git,
// flushing the editor, and putting the restored text back on screen.
//
// GATE S: the reload is `editor.setValue(fresh)`. The driver's reasoning,
// kept here because it is the kind of thing that gets re-litigated: a
// restore is a discard the user just approved, so preserving the in-file
// undo stack does not serve them the way it would after a normal edit, and
// a cursor jump is a smaller, honester cost than the double-write in the
// vault.process option or the flicker in detach-and-reopen.
//
// ORDER IS THE SAFETY PROPERTY (RESTORE_STEPS): flush -> checkout ->
// reload. Skipping the flush loses silently — `git checkout` rewrites the
// file and Obsidian's next autosave flushes the stale in-memory buffer
// back over it, with no error anywhere.

import { App, MarkdownView, Notice, TFile } from 'obsidian';
import { ConfirmModal } from './confirm-modal.ts';
import {
  decideRestoreNote, selectRestorablePaths, describeRestore,
} from './restore-note-to-git-core.ts';

/** The vault's absolute path. Desktop-only; callers guard. */
function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter as unknown as { getBasePath?: () => string };
  return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : null;
}

/** Shell to git. Mirrors output-view.ts's inline `require('child_process')`
 *  idiom — the plugin has no git helper of its own, and main.ts had no
 *  child_process call at all before this drain. */
function git(cwd: string, args: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execFileSync } = require('child_process');
  return String(execFileSync('git', args, { cwd, encoding: 'utf8' }));
}

/** STEP 1 — flush. Reuses the primitive v0.2.219 added at main.ts:2550
 *  ("Forcing view.save() flushes the editor → disk SYNCHRONOUSLY"). */
async function flushOpenEditors(app: App): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      try { await view.save(); } catch (e) {
        console.error('restoreToGit: view.save() failed', e);
      }
    }
  }
}

/** STEP 3 — reload. Only for notes actually open somewhere: a note that is
 *  not on screen has nothing to desync, and force-opening it would be a
 *  side effect the user did not ask for. */
async function reloadOpenEditors(app: App, paths: readonly string[]): Promise<string[]> {
  const reloaded: string[] = [];
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) continue;
    const file = view.file;
    if (!file || !paths.includes(file.path)) continue;
    // `read`, not `cachedRead`: the cache predates the checkout, which is
    // exactly the staleness post-write-memfs-sync-core.ts exists for.
    const fresh = await app.vault.read(file as TFile);
    view.editor.setValue(fresh);
    reloaded.push(file.path);
  }
  return reloaded;
}

/** "Restore active note to last commit." */
export async function restoreActiveNoteToLastCommit(app: App): Promise<void> {
  const base = vaultBasePath(app);
  if (!base) { new Notice('Restore is desktop-only.'); return; }

  const file = app.workspace.getActiveFile();
  if (!file) { new Notice('No active note.'); return; }

  let status: string;
  try { status = git(base, ['status', '--short', '--', file.path]); }
  catch (e) { new Notice('Restore failed: this vault is not a git repository.'); return; }

  const decision = decideRestoreNote(file.path, status);
  if (decision.restorable === false) {
    new Notice(decision.reason === 'untracked'
      ? `${file.path} is not tracked by git — nothing to restore to.`
      : `${file.path} already matches the last commit.`);
    return;
  }

  const ok = await new ConfirmModal(app, {
    title: 'Restore to last commit',
    message: describeRestore([decision.path]),
    confirmText: 'Discard changes',
  }).openAndWait();
  if (!ok) return;

  await flushOpenEditors(app);
  git(base, ['checkout', '--', decision.path]);
  await reloadOpenEditors(app, [decision.path]);
  new Notice(`Restored ${decision.path} to last commit.`);
}

/** "Restore ALL notes to last commit." */
export async function restoreVaultToLastCommit(app: App): Promise<void> {
  const base = vaultBasePath(app);
  if (!base) { new Notice('Restore is desktop-only.'); return; }

  let status: string;
  try { status = git(base, ['status', '--short']); }
  catch (e) { new Notice('Restore failed: this vault is not a git repository.'); return; }

  const paths = selectRestorablePaths(status);
  if (paths.length === 0) { new Notice('Nothing to restore — no tracked changes.'); return; }

  // TWO-STEP GATE, and the second step is deliberately not a type-the-name
  // box. The prompt allowed "an equivalent two-step"; a text-entry modal
  // would be a new widget in a repo that already has ONE confirmation
  // pattern, and the no-fork convention is worth more here than the
  // marginal friction a typed name adds. The first step shows every path,
  // the second states the count and irreversibility in isolation.
  const first = await new ConfirmModal(app, {
    title: `Restore ${paths.length} notes to last commit`,
    message: describeRestore(paths),
    confirmText: 'Continue',
  }).openAndWait();
  if (!first) return;

  const second = await new ConfirmModal(app, {
    title: 'Are you sure?',
    message: `This discards uncommitted changes to ${paths.length} notes and `
      + 'cannot be undone. Untracked notes are never touched.',
    confirmText: 'Discard all changes',
  }).openAndWait();
  if (!second) return;

  await flushOpenEditors(app);
  git(base, ['checkout', '--', ...paths]);
  const reloaded = await reloadOpenEditors(app, paths);
  new Notice(`Restored ${paths.length} notes; refreshed ${reloaded.length} open editor(s).`);
}
