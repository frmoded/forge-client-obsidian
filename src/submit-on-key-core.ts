// Pure core for "should this keydown submit the dialog?" — drain
// 2026-08-03-1245.
//
// Lives outside modal.ts because modal.ts imports from 'obsidian',
// which does not resolve under `node --test`; anything needing direct
// test coverage has to sit in a core module. Same reason
// modal-templates-core.ts exists.
export function shouldSubmitOnKey(
  evt: Pick<KeyboardEvent, 'key' | 'isComposing' | 'shiftKey'>,
): boolean {
  // `isComposing` — an IME (Japanese, Chinese, Korean) commits its
  // candidate with Enter. Submitting there would create a note named
  // after a half-typed composition.
  // `shiftKey` — reserved as a no-submit escape so the field can become
  // a textarea later without silently breaking Enter.
  return evt.key === 'Enter' && !evt.isComposing && !evt.shiftKey;
}
