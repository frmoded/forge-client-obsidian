// 2026-10-31-1135 - the note-creating commands ask the engine about their SOURCES before they write (note-preflight-core.ts), so a wiring test's vault must hold REAL notes under the paths it names: a bar that parses and a phrase
// that reads back, as the vault of a person does. A placeholder ('' or 'p') is refused with the reason it would be refused in Obsidian ("The note has no frontmatter, so it is not a data note").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phraseNoteContent } from '../phrase-core.ts';

const BAR_FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test/fixtures/score-first/bar_005.md');
/** The text of a real bar note (the shipped score-first fixture). */
export const REAL_BAR_TEXT = fs.readFileSync(BAR_FIXTURE, 'utf8');

/** What a vault holds at `p`: a real bar under bars/, a real phrase over bar_005 under phrases/, the given text for anything else. */
export function realNoteAt(p: string, other = ''): string {
  if (/^bars\/(?!README)/.test(p)) return REAL_BAR_TEXT;
  if (/^phrases\/(?!README)/.test(p)) return phraseNoteContent(path.basename(p, '.md'), 'bar_005');
  return other;
}
