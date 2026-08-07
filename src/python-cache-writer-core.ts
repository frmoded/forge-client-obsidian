// v0.2.72 — pure-core helper that writes a snippet body's
// `# Python` heading and `english_hash` frontmatter field in one
// idempotent operation per B7.3's unified-cache contract.
//
// Behaviors:
//   - Replace # Python heading if present, otherwise insert one
//     after # English (before # Dependencies if present, else
//     end-of-body before any trailing heading).
//   - Replace english_hash: line in frontmatter if present,
//     otherwise insert one before the closing `---` of the
//     frontmatter block. If no frontmatter exists, none is added
//     (the engine treats missing english_hash as miss).
//   - Optionally strip a pre-existing # Slots heading + its YAML
//     block (v0.2.70/v0.2.71 migration cleanup; cosmetic).
//   - Idempotent: applying the same call twice yields the same body.
//
// Pure-core extraction #32. No `obsidian` import.

export interface PythonCacheUpdate {
  pythonCode: string;
  /** CW-generate-persist-path-fix-backfill-and-write (drain
   *  2026-07-29-2230) — `null` means "this note has no `# English`
   *  facet, so write no english_hash at all". Writing the hash of an
   *  empty string is strictly worse than writing nothing: the engine
   *  reads an ABSENT english_hash as "no invalidation contract →
   *  serve the cached `# Python`" (executor.py:956-957), but a
   *  present-but-empty one fails the equality check and drops into a
   *  doomed E-- re-transpile. Existing values are left untouched — we
   *  skip the write, we do not strip (drain 1000.1 reverted an
   *  english_hash strip; that decision stands). */
  englishHash: string | null;
  stripStaleSlots?: boolean;
}

/** Update a snippet body with new # Python content + english_hash
 *  frontmatter. See file header for the behavior contract. */
export function writePythonAndEnglishHash(
  body: string,
  update: PythonCacheUpdate,
): string {
  let out = body;
  if (update.stripStaleSlots !== false) {
    out = removeSlotsSection(out);
  }
  // CW-2230 — null englishHash: skip the frontmatter write entirely.
  // See PythonCacheUpdate.englishHash for why absent beats empty.
  //
  // [2026-08-06-1900] — with ONE exception: an existing value equal to
  // sha256("") is the known-bad remnant the pre-drain-2100 writers
  // stamped on V2 notes (CCQA v0.2.331 smoke, test3.md). Stamping null
  // over exactly that constant HEALS it to absent. Value-scoped, so
  // drain 1000.1's strip-revert rationale doesn't apply: real hashes
  // (slot-cache writer output, V1 notes) are never touched.
  if (update.englishHash !== null) {
    out = replaceOrInsertEnglishHash(out, update.englishHash);
  } else {
    out = removeEmptyShaEnglishHash(out);
  }
  out = replaceOrInsertPythonHeading(out, update.pythonCode);
  return out;
}

/** sha256 of the empty string — the exact known-bad english_hash value
 *  stamped by pre-drain-2100 writers on V2 notes (no # English facet).
 *  Load-bearing constant; pinned by the heal tests. */
export const EMPTY_ENGLISH_HASH_SHA =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Remove the frontmatter english_hash line IFF its value is the
 *  empty-string SHA remnant. Any other value — a real hash — is left
 *  untouched. No-op when no frontmatter or no english_hash line. */
function removeEmptyShaEnglishHash(body: string): string {
  const bounds = findFrontmatterBounds(body);
  if (bounds === null) return body;
  const lines = body.split('\n');
  const remnantRe = new RegExp(
    `^english_hash\\s*:\\s*['"]?${EMPTY_ENGLISH_HASH_SHA}['"]?\\s*$`);
  const fmLines = lines
    .slice(bounds.start + 1, bounds.end)
    .filter((line) => !remnantRe.test(line));
  return [
    ...lines.slice(0, bounds.start + 1),
    ...fmLines,
    ...lines.slice(bounds.end),
  ].join('\n');
}

// --- Frontmatter english_hash ---------------------------------------

/** Find the YAML frontmatter block (delimited by `---` on lines 0 and
 *  N for some N>0). Returns null if no frontmatter present. */
function findFrontmatterBounds(body: string): { start: number; end: number } | null {
  const lines = body.split('\n');
  if (lines.length === 0 || lines[0] !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return { start: 0, end: i };
    }
  }
  return null;
}

export function replaceOrInsertEnglishHash(
  body: string, englishHash: string,
): string {
  const bounds = findFrontmatterBounds(body);
  if (bounds === null) {
    // No frontmatter — don't synthesize one. Engine treats absent
    // hash as miss; safe degradation. Production snippets always have
    // frontmatter, so this is defensive only.
    return body;
  }
  const lines = body.split('\n');
  const fmLines = lines.slice(bounds.start + 1, bounds.end);
  let replaced = false;
  const newFmLines: string[] = [];
  for (const line of fmLines) {
    if (/^english_hash\s*:/.test(line)) {
      newFmLines.push(`english_hash: ${englishHash}`);
      replaced = true;
    } else {
      newFmLines.push(line);
    }
  }
  if (!replaced) {
    newFmLines.push(`english_hash: ${englishHash}`);
  }
  const out = [
    ...lines.slice(0, bounds.start + 1),
    ...newFmLines,
    ...lines.slice(bounds.end),
  ];
  return out.join('\n');
}

// --- # Python heading ----------------------------------------------

const PYTHON_HEADING_RE = /^#\s+python\s*$/i;

/** Replace existing # Python heading + its content, or insert a new
 *  one in canonical order (after # English, before # Dependencies
 *  if present). */
export function replaceOrInsertPythonHeading(
  body: string, pythonCode: string,
): string {
  const lines = body.split('\n');
  const pythonStart = lines.findIndex(
    (l) => PYTHON_HEADING_RE.test(l.trim()));

  if (pythonStart >= 0) {
    // Find end of the # Python section: next top-level heading or EOF.
    let pythonEnd = lines.length;
    for (let i = pythonStart + 1; i < lines.length; i++) {
      if (/^#\s+\S/.test(lines[i])) {
        pythonEnd = i;
        break;
      }
    }
    // Trim trailing blank lines BEFORE the next heading so we don't
    // accumulate gap.
    let trimEnd = pythonEnd;
    while (trimEnd > pythonStart + 1 && lines[trimEnd - 1].trim() === '') {
      trimEnd--;
    }
    const before = lines.slice(0, pythonStart);
    // Trim trailing blanks from `before`.
    while (before.length > 0 && before[before.length - 1].trim() === '') {
      before.pop();
    }
    const after = lines.slice(trimEnd);
    // Strip leading blank lines from `after` so we don't accumulate
    // gap on repeated calls (the trailing \n of the source becomes a
    // single "" entry in lines after split).
    while (after.length > 0 && after[0].trim() === '') {
      after.shift();
    }
    const pythonBlock = formatPythonHeading(pythonCode);
    return (
      before.join('\n')
      + (before.length > 0 ? '\n\n' : '')
      + pythonBlock
      + (after.length > 0 ? '\n\n' + after.join('\n') : '\n')
    );
  }

  // No existing # Python heading; insert in canonical order.
  const depsIdx = lines.findIndex(
    (l) => /^#\s+dependencies\s*$/i.test(l.trim()));

  if (depsIdx >= 0) {
    const before = lines.slice(0, depsIdx);
    while (before.length > 0 && before[before.length - 1].trim() === '') {
      before.pop();
    }
    const after = lines.slice(depsIdx);
    const pythonBlock = formatPythonHeading(pythonCode);
    return (
      before.join('\n')
      + '\n\n'
      + pythonBlock
      + '\n\n'
      + after.join('\n')
    );
  }

  // No # Dependencies either — append at end.
  let trimmed = body;
  while (trimmed.endsWith('\n')) trimmed = trimmed.slice(0, -1);
  return trimmed + '\n\n' + formatPythonHeading(pythonCode) + '\n';
}

function formatPythonHeading(pythonCode: string): string {
  return `# Python\n\n\`\`\`python\n${pythonCode}\n\`\`\``;
}

// --- # Slots strip (migration cleanup) ------------------------------

/** Remove the # Slots heading and its YAML block from the body. No-op
 *  when no heading present. Used for cosmetic v0.2.70/v0.2.71 →
 *  v0.2.72 migration. */
export function removeSlotsSection(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inSection = false;
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection) {
      if (/^#\s+slots\s*$/i.test(trimmed)) {
        inSection = true;
        while (out.length > 0 && out[out.length - 1].trim() === '') {
          out.pop();
        }
        continue;
      }
      out.push(line);
      continue;
    }
    if (/^#\s+\S/.test(line)) {
      inSection = false;
      inFence = false;
      out.push(line);
      continue;
    }
    if (/^\s*```ya?ml\s*$/i.test(line)) {
      inFence = true;
      continue;
    }
    if (/^\s*```\s*$/.test(line) && inFence) {
      inFence = false;
      continue;
    }
    // Drop everything inside # Slots section.
  }
  return out.join('\n');
}
