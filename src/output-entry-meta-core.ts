// Drain 2026-08-27-0230 — which output entries get an attribution line.
//
// `makeEntry` (output-view.ts) always rendered a meta line: the snippetId
// plus a wall-clock timestamp. For a real run that is useful attribution —
// "greeting 14:32:05" tells you which note produced the output and when.
//
// For a GENERIC plugin message it is noise. Those arrive through
// `forgeNotice` / `ForgePlugin.forgeOutput`, whose `snippetId` parameter
// DEFAULTS to the literal 'Forge' (forge-notice.ts:27, main.ts:5786), so
// every system notice rendered as "Forge 14:32:05" above one line of prose.
// There is no other source of panel messages, so the attribution says
// nothing the panel itself does not already say.
//
// ONE DEFINITION. The literal lived in two default parameters and was
// compared nowhere; it now lives here and both defaults reference it, so a
// future third generic caller cannot spell it differently and quietly get a
// meta line back.
//
// Pure core: no `obsidian` import, runs under `node --test`.

/** The attribution a caller passes when a message is not tied to a note. */
export const GENERIC_ATTRIBUTION = 'Forge';

/** True when an entry should carry the id + timestamp meta line.
 *
 *  Generic and blank attributions render bare. Anything else is treated as
 *  a real snippet id and keeps its header — per-note entries were never
 *  part of the complaint and the attribution is load-bearing there. */
export function shouldRenderEntryMeta(snippetId: string): boolean {
  const id = snippetId.trim();
  if (id === '') return false;
  return id !== GENERIC_ATTRIBUTION;
}
