// 2026-11-16-1102 - the Settings row "Music ribbon buttons": score-first.ts registers a function that reads the left ribbon and says shown / hidden because ...; settings.ts asks for the text when its page is drawn. Nothing registered (a lean edition,
// a test) = the row says it is not known. Pure: no obsidian.
let provider: (() => string) | null = null;
export function registerMusicRibbonStatus(fn: () => string): () => void { provider = fn; return () => { if (provider === fn) provider = null; }; }
export function musicRibbonStatusText(): string {
  if (provider === null) return 'Music ribbon buttons: not known yet (the music tabs are not loaded).';
  try { return provider(); } catch (e) { console.error('musicRibbonStatusText failed', e); return 'Music ribbon buttons: could not be read.'; }
}
