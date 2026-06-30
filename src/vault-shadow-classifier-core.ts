// v0.2.212 — Vault-shadow classifier (pure-core).
//
// Forensic-shadow heuristic that closes the v0.2.206 "vault wins"
// trap surfaced in the v0.2.211 driver smoke. Pre-v0.2.206 (and on
// first-click before the catalog finished loading), Obsidian's default
// Cmd-click behavior on `[[engine_chip]]` created empty `.md` files at
// the vault root. v0.2.206's wikilink interceptor treated their
// presence as "cohort intentionally shadowed this chip" and deferred
// to Obsidian — so cohort opened the empty shadow forever and never
// discovered LibraryNoteView.
//
// This classifier distinguishes:
//
//   - 'forensic' — auto-created garbage; the chip-click interceptor
//     should open LibraryNoteView instead AND trash the shadow.
//   - 'intentional' — cohort wrote something; the chip-click
//     interceptor preserves the v0.2.206 "vault wins" rule.
//
// Conservative bias: ambiguity = intentional. Better to miss a
// forensic shadow than delete a real cohort note (vault.trash gives
// us recoverability, but a notice cohort missed is still a worse
// outcome than not cleaning).

export type VaultShadowClassification = 'forensic' | 'intentional';

/** Classify a vault note that shadows an library note name. */
export function classifyVaultShadow(
  rawMarkdown: string,
  chipName: string,
): VaultShadowClassification {
  const text = rawMarkdown ?? '';
  // Empty / whitespace-only → forensic.
  if (text.trim().length === 0) return 'forensic';

  const { frontmatter, body } = parseFrontmatterFields(text);

  // Reject any frontmatter that carries fields beyond `type: action`.
  // Cohort tagging, properties, dataview pragmas — all signal intent.
  const fmKeys = Object.keys(frontmatter);
  for (const k of fmKeys) {
    if (k === 'type' && frontmatter[k].trim() === 'action') continue;
    // Any other key = intentional.
    return 'intentional';
  }

  const bodyTrim = body.trim();
  if (bodyTrim.length === 0) return 'forensic';

  // Body has content. Allowed forensic shapes:
  //   - a single `# <chipName>` heading + optional trailing whitespace
  //   - the auto-action-template scaffold: empty `# Description` +
  //     empty `# Recipe` headings (anything else under either = intentional)
  if (hasOnlyChipNameHeading(bodyTrim, chipName)) return 'forensic';
  if (hasOnlyEmptyActionTemplate(bodyTrim)) return 'forensic';

  // Anything else: cohort wrote real content. Preserve.
  return 'intentional';
}

/** Minimal YAML frontmatter parser. Returns {frontmatter, body} where
 *  frontmatter is a Record<string, string> of top-level scalar keys.
 *  Block-style nested mappings, lists, and quoted values reduce to
 *  their raw string slice — sufficient for the classifier's purpose
 *  (we only check key presence + the literal `type: action` value).
 *  No external dep; we don't need full YAML.
 */
export function parseFrontmatterFields(
  raw: string,
): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw };
  }
  const close = raw.indexOf('\n---', 4);
  if (close === -1) {
    return { frontmatter: {}, body: raw };
  }
  const fmBlock = raw.slice(4, close);
  // body starts after the closing `\n---` line.
  const bodyStart = close + 4;
  // Skip exactly one trailing newline after the closing fence if
  // present (Obsidian convention).
  const body = raw[bodyStart] === '\n' ? raw.slice(bodyStart + 1) : raw.slice(bodyStart);

  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    // Skip blank + comment lines.
    if (line.trim().length === 0) continue;
    if (line.trim().startsWith('#')) continue;
    // Match `key: value` at indent 0. Indented continuations + list
    // items are ignored — they belong to the previous key. For
    // classifier purposes, the top-level key signals presence.
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (m) {
      frontmatter[m[1]] = m[2];
    }
  }
  return { frontmatter, body };
}

/** True iff the body, after trim, is exactly a single `# <chipName>`
 *  heading (case-sensitive — Obsidian's default-create uses the exact
 *  wikilink target as the H1).
 */
export function hasOnlyChipNameHeading(
  bodyTrim: string,
  chipName: string,
): boolean {
  // Allow trailing whitespace on the heading line but reject any
  // following non-whitespace line.
  const lines = bodyTrim.split('\n');
  // Find first non-blank line.
  let i = 0;
  while (i < lines.length && lines[i].trim().length === 0) i++;
  if (i >= lines.length) return false;
  const head = lines[i].trim();
  if (head !== `# ${chipName}`) return false;
  // Every subsequent line must be blank.
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim().length !== 0) return false;
  }
  return true;
}

/** True iff the body matches Obsidian's V2 action-template scaffold
 *  with EMPTY Description + EMPTY Recipe sections (no other content,
 *  no other headings). The actual scaffold the plugin emits looks
 *  like:
 *      # Description
 *
 *      # Recipe
 *
 *  with any whitespace between. Anything else (prose, code, alternate
 *  heading) classifies as intentional.
 */
export function hasOnlyEmptyActionTemplate(bodyTrim: string): boolean {
  const lines = bodyTrim.split('\n').map(l => l.trim());
  // Collect non-blank lines.
  const nonBlank = lines.filter(l => l.length > 0);
  if (nonBlank.length !== 2) return false;
  return nonBlank[0] === '# Description' && nonBlank[1] === '# Recipe';
}
