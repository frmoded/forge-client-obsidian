// Drain 2026-09-29-1030 — pure-core: parse an `html-embed` code-block's
// source into a vault-relative path + iframe height.
//
// Why this exists: forge-client-obsidian is replacing its hard runtime
// dependency on the third-party "Local HTML Embed" community plugin
// (id `local-html-embed`) with a native code-block processor, so all
// five shipped gadget widgets (monochord, piano, guitar, lute, rhythm
// box) render without requiring the user to separately install and
// enable someone else's plugin. This file owns exactly the parsing
// step, kept identical to the third-party plugin's own parsing so
// every existing note's `html-embed` block (vault-relative path on
// line 1, optional height in px on line 2 — confirmed against all
// five shipped widget notes: monochord.md, piano.md, guitar.md,
// lute.md, rhythm_box.md, all of which supply both lines) keeps
// working unmodified. Verified directly against the installed
// plugin's actual source (`.obsidian/plugins/local-html-embed/main.js`,
// lines 151-160 as read this drain):
//
//   const lines = source.split('\n').map(l => l.trim()).filter(Boolean);
//   const inputPath = lines[0];
//   const heightLine = lines[1] || '';
//   const heightMatch = heightLine.match(/^(\d+)(px)?$/i);
//   const requestedHeight = heightMatch ? Number(heightMatch[1]) : null;
//   const height = requestedHeight ? `${requestedHeight}px` : '720px';
//
// Deliberately NOT carried over: the third-party plugin's `auto` magic
// path (matches the current note's basename + .html) — none of the
// five shipped widget notes use it, and out-of-scope per this drain's
// prompt ("no existing note needs editing"). If a future note wants
// `auto`, that's a separate, explicit follow-up.

export interface HtmlEmbedParsed {
  /** Vault-relative path to the target .html file, or null if the
   *  code block's first non-blank line was missing/empty. */
  path: string | null;
  /** Resolved iframe height in px — either the explicit value parsed
   *  from line 2, or DEFAULT_HEIGHT_PX when omitted/unparseable. */
  heightPx: number;
  /** Whether line 2 supplied a valid `<digits>` or `<digits>px`
   *  height. False means heightPx is the default, not a real value. */
  heightWasExplicit: boolean;
}

/** Matches the third-party plugin's own fallback height (720px) so
 *  switching processors doesn't change the rendered size of any
 *  existing embed that omits line 2 — though as of this drain, all
 *  five shipped widget notes supply an explicit height, so this
 *  fallback is not currently load-bearing for any of them. */
export const DEFAULT_HEIGHT_PX = 720;

const HEIGHT_LINE_RE = /^(\d+)(px)?$/i;

export function parseHtmlEmbedSource(source: string): HtmlEmbedParsed {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const path = lines[0] ?? null;
  const heightLine = lines[1] ?? '';
  const heightMatch = heightLine.match(HEIGHT_LINE_RE);

  if (heightMatch) {
    return { path, heightPx: Number(heightMatch[1]), heightWasExplicit: true };
  }
  return { path, heightPx: DEFAULT_HEIGHT_PX, heightWasExplicit: false };
}
