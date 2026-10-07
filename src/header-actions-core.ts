// Beat-as-data Phase 5c (drain 2026-10-07-0100) — header parity between a note's markdown view and its Beat Box view, as DATA.
//
// `syncButtons()` (main.ts) puts these actions on a markdown view's header. The Beat Box is a different view (a FileView), so it gets
// none of them for free. This table is the audit: for each markdown-view action, is it also on the Beat Box, and if not, why not.
// header-actions-core.test.ts pins it against the source — add or remove a markdown-view action without a decision here and the suite fails.
//
// Order is left-to-right as rendered. Obsidian's addAction PREPENDS, so a view adds them right-to-left (last in this list first).

export interface MarkdownHeaderAction {
  id: string;
  icon: string;
  title: string;
  beatBox: 'added' | 'not-applicable';
  reason: string;
}

/** Everything `syncButtons()` adds to a markdown view, with the Beat Box decision. */
export const MARKDOWN_HEADER_ACTIONS: readonly MarkdownHeaderAction[] = [
  {
    id: 'forge-this-note', icon: 'hammer', title: 'Forge this note', beatBox: 'not-applicable',
    reason: 'derives Recipe -> Python for ACTION notes; a data note has nothing to derive (removed from data notes in Phase 5c, so it is not on the markdown view of a rhythm note either).',
  },
  {
    id: 'new-forge-note', icon: 'file-plus', title: 'New Forge note', beatBox: 'added',
    reason: 'a vault-level action, ungated on the markdown view; the same modal is useful from any note tab.',
  },
  {
    id: 'edges-toggle', icon: 'network', title: 'Toggle edges panel', beatBox: 'added',
    reason: 'the edges panel lists Outgoing AND Incoming call edges for the note; a rhythm data note is exactly what other notes call. The edges view follows the Beat Box\'s file.',
  },
  {
    id: 'restore-to-last-commit', icon: 'history', title: 'Restore to last commit', beatBox: 'added',
    reason: 'the safety net; ungated on the markdown view. In the Beat Box it holds autosave, checks out, then reloads the widget from disk.',
  },
  {
    id: 'library-palette', icon: 'puzzle', title: 'Open library note palette', beatBox: 'not-applicable',
    reason: 'inserts library notes into an ACTION note being authored (gated on type: action); a data note has no editor to insert into.',
  },
];

export interface BeatBoxAction { id: string; icon: string; title: string }

/** Actions only the Beat Box view has. */
export const BEAT_BOX_ONLY_ACTIONS: readonly BeatBoxAction[] = [
  { id: 'open-as-json', icon: 'braces', title: 'Open as JSON' },
];

const ORDER: readonly string[] = ['new-forge-note', 'edges-toggle', 'restore-to-last-commit'];

/** The Beat Box view's header, left to right (the shared actions in markdown-view order, then Open as JSON). */
export const BEAT_BOX_ACTIONS: readonly BeatBoxAction[] = [
  ...MARKDOWN_HEADER_ACTIONS.filter((a) => a.beatBox === 'added')
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
    .map((a) => ({ id: a.id, icon: a.icon, title: a.title })),
  ...BEAT_BOX_ONLY_ACTIONS,
];

export interface CommandAudit { id: string; beatBox: 'works' | 'not-applicable'; reason: string }

/** Commands that bind to the active note, and what happens when a Beat Box is the active tab. */
export const COMMAND_AUDIT: readonly CommandAudit[] = [
  { id: 'forge-restore-note-to-last-commit', beatBox: 'works',
    reason: 'uses getActiveFile(); the Beat Box is a FileView, so the active file resolves to its note (Obsidian: activeEditor?.file || the active FileView\'s file).' },
  { id: 'forge-copy-source-raw', beatBox: 'works',
    reason: 'uses getActiveFile() and reads the note from the vault, so it copies the rhythm note\'s source from a Beat Box tab too.' },
  { id: 'forge-toggle-frontmatter', beatBox: 'not-applicable',
    reason: 'folds frontmatter in the Live Preview editor; the Beat Box has no editor (and its note shows no fold).' },
  { id: 'forge-toggle-frontmatter-only', beatBox: 'not-applicable',
    reason: 'folds frontmatter in the Live Preview editor; the Beat Box has no editor.' },
  { id: 'forge-toggle-dependencies-only', beatBox: 'not-applicable',
    reason: 'folds the dependencies block in the Live Preview editor; the Beat Box has no editor.' },
];
