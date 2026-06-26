// v0.2.182 — V2 note shape helpers for the plugin-side /generate flow.
//
// Pure-core (no `obsidian` import). All helpers operate on a V2 note's
// full-body markdown string (frontmatter + headings + bodies) and
// return either parsed substrings or a rewritten body.
//
// A V2 note's structure:
//
//   ---
//   type: action
//   [optional: featured, lock, description_hash, ...]
//   ---
//
//   # Description
//
//   <prose>
//
//   ## Inputs
//
//   - name1 (default v1) — doc
//   - name2 — doc
//
//   # Recipe
//
//   <Recipe>
//
// `## Mechanics` and other H2s may interleave. The helpers below
// locate sections by exact H1/H2 heading match and tolerate
// interleaved content.

export interface InputDecl {
  name: string;
  hasDefault: boolean;
  defaultLiteral: string | null;
  doc: string;
}

/** True iff the body has both `# Description` and `# Recipe` H1 headings.
 *  Doesn't require `# Python` to be absent — V2 notes can coexist with
 *  legacy V1 Python facets during the migration. */
export function isV2Shape(body: string): boolean {
  if (typeof body !== 'string') return false;
  return /^# Description\s*$/m.test(body) && /^# Recipe\s*$/m.test(body);
}

/** Extract the body of `# Description` (until the next H1 or EOF).
 *  Leading + trailing blank lines stripped; internal blanks preserved.
 *  Returns '' if the heading is absent. */
export function extractDescription(body: string): string {
  return _extractH1Section(body, 'Description');
}

/** Extract the body of `# Recipe` (until the next H1 or EOF). */
export function extractRecipeSection(body: string): string | null {
  if (!/^# Recipe\s*$/m.test(body)) return null;
  return _extractH1Section(body, 'Recipe');
}

function _extractH1Section(body: string, name: string): string {
  // Find the heading line.
  const re = new RegExp(`^# ${_escapeRegex(name)}\\s*$`, 'm');
  const m = re.exec(body);
  if (!m) return '';
  const start = m.index + m[0].length;
  // Find next H1 (a line that starts with `# ` but not `##`).
  const tail = body.slice(start);
  const nextH1 = /^# [^#\n]/m.exec(tail);
  const sectionRaw = nextH1
    ? tail.slice(0, nextH1.index)
    : tail;
  // Strip leading + trailing blank lines.
  return sectionRaw.replace(/^\s*\n/, '').replace(/\s+$/, '');
}

/** Extract `## Inputs` declarations.
 *
 *  Format expected:
 *    ## Inputs
 *
 *    - name (default VALUE) — doc
 *    - name — doc
 *    - name (default VALUE)
 *    - name
 *
 *  Lines that don't match the `- name ...` shape are skipped silently.
 *  Returns [] if `## Inputs` is absent. */
export function extractInputs(body: string): InputDecl[] {
  const re = /^## Inputs\s*$/m;
  const m = re.exec(body);
  if (!m) return [];
  const start = m.index + m[0].length;
  const tail = body.slice(start);
  // Stop at the next ## or # heading.
  const nextHeading = /^#{1,6} [^#\n]/m.exec(tail);
  const sectionRaw = nextHeading
    ? tail.slice(0, nextHeading.index)
    : tail;

  const out: InputDecl[] = [];
  for (const line of sectionRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const rest = trimmed.slice(2).trim();
    if (!rest) continue;
    // Patterns:
    //   name (default VALUE) — doc
    //   name (default VALUE)
    //   name — doc
    //   name
    // Tolerate `--` and `—` (em-dash) as the doc separator.
    const decl = _parseInputDeclLine(rest);
    if (decl) out.push(decl);
  }
  return out;
}

function _parseInputDeclLine(rest: string): InputDecl | null {
  // Try with default: `name (default VALUE) [— doc]`
  const withDef = /^(\w+)\s*\(\s*default\s+([^)]+?)\s*\)\s*(?:[—–-]+\s*(.+))?$/.exec(rest);
  if (withDef) {
    return {
      name: withDef[1],
      hasDefault: true,
      defaultLiteral: withDef[2].trim(),
      doc: (withDef[3] || '').trim(),
    };
  }
  // Without default: `name [— doc]`
  const noDef = /^(\w+)\s*(?:[—–-]+\s*(.+))?$/.exec(rest);
  if (noDef) {
    return {
      name: noDef[1],
      hasDefault: false,
      defaultLiteral: null,
      doc: (noDef[2] || '').trim(),
    };
  }
  return null;
}

/** Replace the body of `# Recipe` with `newEmm`. If the section doesn't
 *  exist, appends a new `# Recipe` section at the end of the body. The
 *  inserted block is `# Recipe\n\n<newEmm>\n` with a single trailing
 *  newline so subsequent edits start cleanly. */
export function replaceRecipeSection(body: string, newEmm: string): string {
  const trimmedEmm = newEmm.replace(/^\s+/, '').replace(/\s+$/, '');
  const re = /^# Recipe\s*$/m;
  const m = re.exec(body);
  if (!m) {
    // Append.
    const sep = body.endsWith('\n') ? '\n' : '\n\n';
    return body + sep + '# Recipe\n\n' + trimmedEmm + '\n';
  }
  const headingStart = m.index;
  const headingEnd = m.index + m[0].length;
  // Find next H1 to know where this section ends.
  const tail = body.slice(headingEnd);
  const nextH1 = /^# [^#\n]/m.exec(tail);
  const sectionEnd = nextH1
    ? headingEnd + nextH1.index
    : body.length;
  const before = body.slice(0, headingStart);
  const after = body.slice(sectionEnd);
  // Reassemble with the trimmed E-- body. Preserve a blank line before
  // a following H1 if there is one.
  const replacement = '# Recipe\n\n' + trimmedEmm + '\n';
  // If there's content after AND it doesn't already start with a blank
  // line, add one.
  let glue = '';
  if (after.length > 0 && !after.startsWith('\n')) glue = '\n';
  return before + replacement + glue + after;
}

/** Read or write a top-level frontmatter scalar field. The frontmatter
 *  block is delimited by `---` on its own line at the start of the
 *  body and a matching `---` line.
 *
 *  setFrontmatterField inserts the key if absent. Existing value gets
 *  replaced in place. Frontmatter is preserved verbatim apart from the
 *  edited line (no YAML round-trip — protects exotic keys + comments).
 *
 *  Returns the rewritten body. Throws if the frontmatter block is
 *  missing or malformed (e.g. no closing `---`). */
export function setFrontmatterField(
  body: string,
  key: string,
  value: string,
): string {
  if (!body.startsWith('---\n')) {
    // No frontmatter — prepend a new block.
    return `---\n${key}: ${value}\n---\n\n` + body;
  }
  const end = body.indexOf('\n---\n', 4);
  if (end < 0) {
    throw new Error('Frontmatter has no closing --- delimiter');
  }
  const fm = body.slice(4, end);
  const rest = body.slice(end + 5);   // past the closing `---\n`
  const lineRe = new RegExp(`^${_escapeRegex(key)}:.*$`, 'm');
  if (lineRe.test(fm)) {
    const newFm = fm.replace(lineRe, `${key}: ${value}`);
    return `---\n${newFm}\n---\n${rest}`;
  }
  // Append the key inside the frontmatter block.
  const newFm = (fm.endsWith('\n') ? fm : fm + '\n') + `${key}: ${value}`;
  return `---\n${newFm}\n---\n${rest}`;
}

/** Read the value of a frontmatter scalar field. Returns null if the
 *  frontmatter block is absent or the key isn't present. */
export function getFrontmatterField(
  body: string,
  key: string,
): string | null {
  if (!body.startsWith('---\n')) return null;
  const end = body.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const fm = body.slice(4, end);
  const re = new RegExp(`^${_escapeRegex(key)}:\\s*(.*)$`, 'm');
  const m = re.exec(fm);
  return m ? m[1].trim() : null;
}

/** Remove a frontmatter scalar field if present. Returns the rewritten
 *  body. Idempotent — absent key is a no-op. */
export function removeFrontmatterField(body: string, key: string): string {
  if (!body.startsWith('---\n')) return body;
  const end = body.indexOf('\n---\n', 4);
  if (end < 0) return body;
  const fm = body.slice(4, end);
  const rest = body.slice(end + 5);
  // Match the whole line including its trailing newline (if any).
  const re = new RegExp(`^${_escapeRegex(key)}:.*\\n?`, 'm');
  if (!re.test(fm)) return body;
  const newFm = fm.replace(re, '');
  return `---\n${newFm}\n---\n${rest}`;
}

function _escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
