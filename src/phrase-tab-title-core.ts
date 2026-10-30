// 2026-10-30-1010 (0900 item (e)) - the title of a phrase's tab. A transform's tab used to show only its own file name (`phrase_011`) while its strip says "Transform of phrase_003": the title now says both. Every other kind of phrase keeps the
// file name, exactly as before. Pure; the Obsidian side is PhraseView.getDisplayText.
import type { PhraseParams } from './phrase-core.ts';

const SEPARATOR = ' · ';

export function phraseTabTitle(basename: string, params: PhraseParams | null): string {
  if (params === null || params.kind !== 'transform') return basename;
  const source = params.source.split('/').pop() ?? params.source;
  return source.length > 0 ? `${basename}${SEPARATOR}transform of ${source}` : basename;
}
