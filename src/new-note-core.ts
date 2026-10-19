// New Forge note (beat_as_data Phase 0.5, drain 2026-10-04-1200) — the pure, testable half of the
// "New Forge note" dialog (ForgeSnippetModal in modal.ts).
//
// Why this exists as its own module: the dialog already existed ("New action note", reached from the
// per-note toolbar) but its decision logic — the data-note template, the offline content-type list, where
// the new note lands, the duplicate-name check — lived inside an obsidian-coupled file and could not be
// unit-tested. Per the repo's pure-core convention it is extracted here VERBATIM where it already existed
// (dataTemplate, FENCE_LANG, SEED, isBinaryContentType, the duplicate-name message) and extended only where
// this drain's scope adds behavior (yaml/musicxml, active-folder placement, location text).

import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';

/** Text content types the engine can deserialize — MUST stay equal to TEXT_CONTENT_TYPES in
 *  forge/core/serialization.py (pinned by new-note-core.test.ts, which reads the engine file the plugin
 *  bundles, so drift fails the suite instead of silently hiding a type from the dialog). */
export const TEXT_CONTENT_TYPES = ['json', 'yaml', 'text', 'markdown', 'musicxml', 'svg'] as const;

/** Used when /connect doesn't carry a content_types list (older backend, or connect failed). The text
 *  types first (so the default is `json`), then the one binary entry the dialog has always offered.
 *  Binary notes are out of scope for this drain — `jpeg` is the pre-existing entry, untouched. */
export const FALLBACK_CONTENT_TYPES: readonly string[] = [...TEXT_CONTENT_TYPES, 'jpeg'];

// Fence language tag per content_type. Obsidian's preview renders these nicely.
export const FENCE_LANG: Record<string, string> = {
  json: 'json',
  yaml: 'yaml',
  text: 'text',
  markdown: 'markdown',
  musicxml: 'xml',
  svg: 'xml',
  jpeg: 'text',
};

// Seed payload per content_type — short and instructive where possible, blank where any concrete seed
// would feel arbitrary.
export const SEED: Record<string, string> = {
  json: '{}',
  yaml: '',
  text: '',
  markdown: '',
  musicxml: '',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>',
  jpeg: '',
};

// When `content` is provided (e.g., from "Save as data snippet"), it replaces the per-content_type seed
// payload and lands inside the same fenced block.
export function dataTemplate(name: string, contentType: string, content?: string): string {
  const lang = FENCE_LANG[contentType] ?? 'text';
  const body = content ?? SEED[contentType] ?? '';
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `description: ${name}`,
    '---',
    '',
    '```' + lang,
    body,
    '```',
    '',
  ].join('\n');
}

// ---- the Rhythm (Beat Box) choice (drain 2026-10-20-1700) ---------------------------------------------------------------------
//
// The dialog's data kinds are the Content type dropdown, so "make a rhythm note" is one more entry there. It is NOT a backend content type: the note it makes is an
// ordinary `type: data`, `content_type: json` note whose json is a valid rhythm pattern, which the Phase 5c allow-list (rhythm-default-view-core.ts) opens in the Beat Box.

/** The dropdown value of the choice. Recognised only by exact match. */
export const RHYTHM_CHOICE = 'rhythm';
export const RHYTHM_CHOICE_LABEL = 'Rhythm (Beat Box)';

export function isRhythmChoice(choice: string): boolean {
  return choice === RHYTHM_CHOICE;
}

export interface ContentChoice { value: string; label: string }

/** The Content type menu: the backend's list in its order (so the first entry, the default, is unchanged) with "Rhythm (Beat Box)" right after `json` — or at the end when the
 *  list has no json. Never doubled. */
export function contentChoices(contentTypes: readonly string[]): ContentChoice[] {
  const plain = (value: string): ContentChoice => ({ value, label: value });
  const rhythm: ContentChoice = { value: RHYTHM_CHOICE, label: RHYTHM_CHOICE_LABEL };
  if (contentTypes.includes(RHYTHM_CHOICE)) return contentTypes.map((v) => (v === RHYTHM_CHOICE ? rhythm : plain(v)));
  const out: ContentChoice[] = [];
  for (const v of contentTypes) {
    out.push(plain(v));
    if (v === 'json') out.push(rhythm);
  }
  if (!contentTypes.includes('json')) out.push(rhythm);
  return out;
}

/** The sentence under the Content type menu. */
export function contentTypeDescription(choice: string): string {
  return isRhythmChoice(choice)
    ? 'Makes a one-bar kick and snare groove that opens in the Beat Box, where every change saves itself.'
    : 'Format of the data payload (only used for Data notes)';
}

/** The starter pattern: one plain bar of 4/4 in sixteenth-note steps — kick on beats 1 and 3, snare on 2 and 4 — so Play has something to say. Plain hits only (`true`),
 *  never an invented velocity. */
export const RHYTHM_STARTER: RhythmData = {
  time_signature: '4/4',
  steps: 16,
  group_size: 4,
  swing_pct: 0,
  tempo_bpm: 100,
  channels: {
    kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  },
};

/** A starter rhythm data note. The json block is `formatRhythmJson` — the Beat Box's own writer — so the first autosave rewrites only the cell that changed. The description is
 *  a double-quoted scalar (a JSON string is a YAML one), so a name with a quote, a backslash or a `#` cannot break the frontmatter. */
export function rhythmNoteTemplate(name: string): string {
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4.`)}`,
    '---',
    '',
    '```json',
    formatRhythmJson(RHYTHM_STARTER),
    '```',
    '',
  ].join('\n');
}

/** The text of a new DATA note for the chosen kind. */
export function dataNoteContent(name: string, choice: string): string {
  return isRhythmChoice(choice) ? rhythmNoteTemplate(name) : dataTemplate(name, choice);
}

export type NewNotePlan =
  | { ok: true; path: string; content: string | null }
  | { ok: false; reason: 'empty' | 'name' | 'exists'; message: string; path?: string };

/** Everything the dialog decides before it writes a non-binary note, in one place: the name is checked first (before any vault lookup), then the path (the active file's folder, or the
 *  vault root inside a plugin-managed library), then that exact path must be free, then the content (data notes only — an action note's content is built by the dialog). */
export function planNewNote(input: {
  activeFilePath: string | null | undefined;
  name: string;
  type: 'action' | 'data';
  choice: string;
  managedTopLevelDirs: ReadonlySet<string>;
  exists: (path: string) => boolean;
}): NewNotePlan {
  if (!input.name) return { ok: false, reason: 'empty', message: 'Snippet name is required.' };
  const nameCheck = validateNoteName(input.name);
  if (nameCheck.ok === false) return { ok: false, reason: 'name', message: nameCheck.message };
  const path = newNotePath(input.activeFilePath, input.name, input.managedTopLevelDirs);
  const free = checkNewNotePath(path, input.name, input.exists);
  if (free.ok === false) return { ok: false, reason: 'exists', message: free.message, path };
  return { ok: true, path, content: input.type === 'data' ? dataNoteContent(input.name, input.choice) : null };
}

export function isBinaryContentType(ct: string): boolean {
  return ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/') || ct === 'jpeg';
}

/** The folder a new note should land in: the ACTIVE file's parent folder, else the vault root ('').
 *
 *  One deliberate exception: if the active file sits inside a plugin-MANAGED bundled library folder
 *  (forge-moda/, music-theory/, …) the note goes to the vault root instead. Those folders are extracted
 *  and re-extracted by the plugin ("Customize" / "Reset to bundled"), so a user's new note written into
 *  one would be shadowed, overwritten or swept — not a place to create authoring notes.
 *
 *  `managedTopLevelDirs` is passed in (BUNDLED_VAULT_NAME_SET at the call site) so this stays pure and so
 *  tests can pin both editions' managed sets. */
export function newNoteFolder(
  activeFilePath: string | null | undefined,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): string {
  if (!activeFilePath) return '';
  const parts = activeFilePath.split('/');
  if (parts.length < 2) return '';          // file at the vault root -> vault root
  if (managedTopLevelDirs.has(parts[0])) return '';
  return parts.slice(0, -1).join('/');
}

/** Vault-relative path for a new note named `name`. */
export function newNotePath(
  activeFilePath: string | null | undefined,
  name: string,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): string {
  const folder = newNoteFolder(activeFilePath, managedTopLevelDirs);
  return folder === '' ? `${name}.md` : `${folder}/${name}.md`;
}

/** "Creates in: …" line shown under the name field so the (now variable) location is never a surprise. */
export function describeNewNoteLocation(folder: string): string {
  return folder === '' ? 'Creates in: vault root' : `Creates in: ${folder}/`;
}

export type NewNoteCheck = { ok: true } | { ok: false; message: string };

/** Pre-flight duplicate check (v0.2.236). Path-scoped only: the same name in another folder is fine —
 *  only the EXACT path the new note would land at is checked. A collision is surfaced in the dialog; the
 *  note is never overwritten or auto-suffixed. `exists` is the vault lookup, injected so this is testable. */
export function checkNewNotePath(
  path: string,
  name: string,
  exists: (path: string) => boolean,
): NewNoteCheck {
  if (exists(path)) {
    return {
      ok: false,
      message:
        `A note named "${name}" already exists at ${path}. `
        + 'Choose a different name or open the existing note.',
    };
  }
  return { ok: true };
}

/** Wrapper .md for a binary data note. The bytes live at `contentRef`; the body is intentionally empty (the
 *  backend rejects content_ref + body content in the same note).
 *
 *  content_type is written UNQUOTED, exactly as dataTemplate does. It was quoted here from the first commit
 *  (4469de9) with no recorded reason; nothing depends on it (the engine reads frontmatter with yaml.safe_load, where
 *  `jpeg` and `"jpeg"` are the same string) so it was an oversight, fixed for consistency (drain 2026-10-04-2200 F5). */
export function binaryTemplate(name: string, contentType: string, contentRef: string): string {
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `content_ref: ${contentRef}`,
    `description: ${name}`,
    '---',
    '',
  ].join('\n');
}

/** Where a binary data note's two files land. The wrapper .md follows the SAME folder-aware rule as every other
 *  new note (newNotePath), so it lands where the dialog's "Creates in:" line says; the asset bytes stay at
 *  `_assets/<name><ext>` at the vault root. */
export function binaryNotePaths(
  activeFilePath: string | null | undefined,
  name: string,
  ext: string,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): { mdRel: string; assetRel: string } {
  return {
    assetRel: `_assets/${name}${ext}`,
    mdRel: newNotePath(activeFilePath, name, managedTopLevelDirs),
  };
}

/** Obsidian's own wording for a forbidden character in a file name (app.js, validator `jD`: it checks each
 *  "/"-separated segment against `\ / :` on macOS/Linux, and throws "File name cannot contain any of the
 *  following characters: \ / :"). Obsidian never raises it for "/" itself — it treats "/" as a folder
 *  separator — so a "/" in the name used to pass through and fail much later in the file write with a raw
 *  `ENOENT: ... open '/Users/...'` (absolute path leaked). We reject it BEFORE any write, with Obsidian's text. */
export const FORBIDDEN_NAME_CHARS_MESSAGE = 'File name cannot contain any of the following characters: \\ / :';

/** Pre-flight name check for the "New Forge note" dialog. Only "/" is rejected here; ":" and "\\" are still
 *  rejected (with the same message) by Obsidian's own validator inside vault.create. */
export function validateNoteName(name: string): NewNoteCheck {
  if (name.includes('/')) return { ok: false, message: FORBIDDEN_NAME_CHARS_MESSAGE };
  return { ok: true };
}
