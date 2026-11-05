// 2026-11-05-1182 (M17a, design 4.14) - a BAR note says where it came from: a `# Description` (one sentence) and a `# Recipe` (the same fact as a step with wikilinks, so `links:` and the graph show the origin), above the json fence.
// The bar stays a DATA note and the json fence stays what every reader reads (rhythm-edit-core.ts: the one reader of a bar, widened only to let these two sections sit above the fence). The sections are PROVENANCE: derived by this
// file from (the bar's origin, its data), never a second source, and rewritten by every write that touches the bar - the Beat Box save (applySave's `derive`), "Refresh note links" (the migration), and the two writers that make a bar
// (New bar, Edit this bar). A hand edit of them is overwritten by the next write, and the note says so in one comment line. Pure: no `obsidian`, no vault.
import { extractJsonBlock, type RhythmData } from './rhythm-edit-core.ts';

/** Where a bar came from. `hand` is also what a bar with no known origin is: there is nothing to link to. */
export type BarOrigin =
  | { kind: 'beatbox' }
  | { kind: 'hand' }
  | { kind: 'fork'; phrase: string; bar: number | null };

/** The one line above the sections, like the Cache comment of a phrase note: what they are and that a write replaces them. */
export const BAR_PROVENANCE_NOTE = '<!-- where this bar came from, written by the plugin: every save rewrites it, so edit the bar in the Beat Box, not this text -->';

const isHit = (v: unknown): boolean => v !== false && v !== 0 && v !== null && v !== undefined;

/** "8 hits in 16 steps, tempo 100" / "1 hit in 16 steps, tempo 100" / "no hits in 16 steps, tempo 100.5". */
export function barHits(data: RhythmData): string {
  const total = Object.values(data.channels).reduce((n, row) => n + row.filter(isHit).length, 0);
  const hits = total === 0 ? `no hits in ${data.steps} steps` : `${total} hit${total === 1 ? '' : 's'} in ${data.steps} steps`;
  return `${hits}, tempo ${data.tempo_bpm}`;
}

/** The `# Description` sentence: one sentence, the origin first. Only a bar made in the Beat Box says what is in it (the Beat Box save keeps that current); a fork and a bar made by hand say where they came from. */
export function barSentence(origin: BarOrigin, data: RhythmData): string {
  switch (origin.kind) {
    case 'beatbox': return `Bar made in the Beat Box; ${barHits(data)}.`;
    case 'hand': return 'Bar made by hand.';
    case 'fork': return origin.bar === null ? `A fork of a bar of [[${origin.phrase}]], to edit by hand.` : `Bar ${origin.bar} of [[${origin.phrase}]], forked to edit by hand.`;
  }
}

/** The `# Recipe` lines: the same fact as steps; the only wikilink is the origin a bar knows (a bar made by hand or in the Beat Box links to nothing). */
export function barRecipe(origin: BarOrigin): string[] {
  switch (origin.kind) {
    case 'beatbox': return ['Draw the bar in the Beat Box.'];
    case 'hand': return ['Write the bar by hand.'];
    case 'fork': return [origin.bar === null ? `Take a bar of [[${origin.phrase}]].` : `Take bar ${origin.bar} of [[${origin.phrase}]].`, 'Change it in the Beat Box.'];
  }
}

/** The names `links:` carries (what the graph and the backlinks show): the phrase a fork was taken from. */
export const barLinks = (origin: BarOrigin): string[] => (origin.kind === 'fork' ? [origin.phrase] : []);

/** The sections between the frontmatter and the fence, one array element per line. */
export function barProvenanceSections(origin: BarOrigin, data: RhythmData): string[] {
  return [BAR_PROVENANCE_NOTE, '', '# Description', '', barSentence(origin, data), '', '# Recipe', '', ...barRecipe(origin)];
}

interface Front { eol: string; lines: string[]; end: number }
function front(text: string): Front | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? { eol: m[1], lines: m[2].split(/\r?\n/), end: m[0].length } : null;
}

/**
 * The origin a bar note records: a fork's frontmatter (`forked_from: "[[phrase_006]]"` + `forked_bar: 9`, or the older `forked_from: "phrases/phrase_006 bar 9"`), else the words its own `# Description` already opens with
 * ("Bar made in the Beat Box"), else nothing known: made by hand. Reading the note is how a later write keeps the same origin; nothing is stored anywhere else.
 */
export function barOriginOf(text: string): BarOrigin {
  const f = front(text);
  if (f) {
    let phrase: string | null = null, bar: number | null = null;
    for (const line of f.lines) {
      const link = /^forked_from:\s*["']?\[\[([^\]|]+)\]\]["']?\s*$/.exec(line);
      const old = /^forked_from:\s*["']?phrases\/([^"'\s]+) bar (\d+)["']?\s*$/.exec(line);
      const n = /^forked_bar:\s*(\d+)\s*$/.exec(line);
      if (link) phrase = link[1];
      else if (old) { phrase = old[1]; bar = Number(old[2]); }
      if (n) bar = Number(n[1]);
    }
    if (phrase !== null) return { kind: 'fork', phrase, bar };
  }
  const lead = /^# Description[ \t]*(?:\r?\n)+([^\r\n]*)/m.exec(text);
  return lead !== null && lead[1].startsWith('Bar made in the Beat Box') ? { kind: 'beatbox' } : { kind: 'hand' };
}

/** Does this bar carry its provenance sections (something above the fence)? */
export function hasBarProvenance(text: string): boolean {
  const block = extractJsonBlock(text);
  const f = front(text);
  return block.ok === true && f !== null && text.slice(f.end, block.fenceStart).trim() !== '';
}

/**
 * The note with its provenance sections written: every frontmatter line kept as it is (a fork's `links:` set to the phrase it came from; a bar that is not a fork keeps whatever `links:` it has), the sections between the
 * frontmatter and the fence replaced, and the fence line and everything after it kept byte for byte. A text that is not a readable bar comes back unchanged. Idempotent: written twice it is the same text.
 */
export function withBarProvenance(text: string, origin: BarOrigin, data: RhythmData): string {
  const f = front(text);
  const block = extractJsonBlock(text);
  if (f === null || block.ok === false) return text;
  let lines = f.lines;
  const links = barLinks(origin);
  if (links.length > 0) {
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^links:/.test(lines[i])) { while (i + 1 < lines.length && /^\s*-/.test(lines[i + 1])) i++; continue; }
      kept.push(lines[i]);
    }
    const put = ['links:', ...links.map((l) => `  - ${JSON.stringify(`[[${l}]]`)}`)];
    lines = [...kept, ...put];                       // after every line the note has (description and forked_from stay together); written again it lands in the same place
  }
  const eol = f.eol;
  return `---${eol}${lines.join(eol)}${eol}---${eol}${eol}${barProvenanceSections(origin, data).join(eol)}${eol}${eol}${text.slice(block.fenceStart)}`;
}

/** What the Beat Box save passes as `derive`: a bar that carries its sections gets them rewritten for the data just saved (same origin); a bar that carries none is returned untouched, so a bar nobody migrated is written exactly as before. */
export function keepBarProvenance(text: string, data: RhythmData): string {
  return hasBarProvenance(text) ? withBarProvenance(text, barOriginOf(text), data) : text;
}
