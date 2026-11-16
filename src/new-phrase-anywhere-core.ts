// 2026-11-16-0901 - "New phrase" (the palette entry and the ribbon button): a phrase is made FROM a bar, so there is a source to pick when the note you are on is not a bar. "New phrase from this bar" (the older command) stays exactly as it is and
// asks for a bar; this one never refuses: the bar you are on, else the FIRST bar by number in bars/ (the rule "New mix" uses for its second bar), else a NEW bar made first with "New bar", and the phrase is made from that. Pure: the vault and the UI come in as ports.
const BAR_PATH = /^bars\/bar_(\d+)\.md$/;
export type NewPhraseAnywhereResult =
  | { kind: 'from-active'; bar: string } | { kind: 'from-first'; bar: string } | { kind: 'from-new-bar'; bar: string } | { kind: 'failed'; message: string };
export interface NewPhraseAnywherePorts {
  /** The path of the note the person is on, or null. */
  activePath(): string | null;
  /** Basenames of the notes in `bars/` right now. */
  barBasenames(): string[];
  /** "New bar": makes the next free bar and opens it; the result names it (the flow notifies its own failures). */
  createBar(): Promise<{ ok: true; path: string } | { ok: false; message: string }>;
  /** The existing "New phrase from this bar" flow, for a given bar path: makes `phrases/phrase_NNN.md` and opens it in its tab. */
  createPhraseFrom(barPath: string): Promise<unknown>;
}
export function pickSourceBar(activePath: string | null, barBasenames: readonly string[]): { kind: 'from-active' | 'from-first'; bar: string } | null {
  if (activePath !== null && BAR_PATH.test(activePath)) return { kind: 'from-active', bar: activePath };
  const bars = barBasenames.map((n) => /^bar_(\d+)$/.exec(n)).filter((m): m is RegExpExecArray => m !== null).sort((a, b) => Number(a[1]) - Number(b[1]));
  return bars.length > 0 ? { kind: 'from-first', bar: `bars/${bars[0][0]}.md` } : null;
}
export async function createPhraseAnywhere(ports: NewPhraseAnywherePorts): Promise<NewPhraseAnywhereResult> {
  const picked = pickSourceBar(ports.activePath(), ports.barBasenames());
  if (picked !== null) { await ports.createPhraseFrom(picked.bar); return picked; }
  const made = await ports.createBar();
  if (made.ok === false) return { kind: 'failed', message: made.message };
  await ports.createPhraseFrom(made.path);
  return { kind: 'from-new-bar', bar: made.path };
}
