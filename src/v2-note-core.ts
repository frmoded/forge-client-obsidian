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

/** Extract the body of `# Recipe`. v0.2.279 CW-2200: hard-terminate at
 *  `# Python` (or EOF), not "any H1". LLM Recipe output may include
 *  markdown-style annotation lines starting with `# ` that pre-fix were
 *  treated as section boundaries. */
export function extractRecipeSection(body: string): string | null {
  if (!/^# Recipe\s*$/m.test(body)) return null;
  return _extractSectionUntil(body, 'Recipe', /^# Python\s*$/m);
}

/** Extract the body of `# Python` (until the next H1 or EOF). Returns
 *  null when the heading is absent — distinguishes "no Python facet
 *  authored yet" from "Python facet authored but empty". v0.2.196 added
 *  for the implicit-locking state machine; the V2 3-layer model needs
 *  to read the Python facet alongside Description + Recipe to compute
 *  python_hash and detect canonical-layer state.
 *
 *  Strips fenced code-block delimiters (```python ... ```) if present;
 *  the Recipe → Python transpile emits raw Python, but cohort-edited
 *  Python may use fences for editor syntax highlighting. Returning the
 *  unfenced body keeps `computeFacetHash` stable across that prose
 *  difference. */
export function extractPythonSection(body: string): string | null {
  if (!/^# Python\s*$/m.test(body)) return null;
  const raw = _extractH1Section(body, 'Python');
  return _unwrapPythonFence(raw);
}

function _unwrapPythonFence(text: string): string {
  // Match the canonical ```python ... ``` shape but tolerate ```py or
  // a leading-blank-line wrapper. Single-pass, no recursion.
  const fenced = /^```(?:python|py)?\s*\n([\s\S]*?)\n```\s*$/.exec(text.trim());
  return fenced ? fenced[1] : text;
}

/** v0.2.279 CW-2200 helper — extract a named section terminating at a
 *  specific downstream heading rather than "any H1". Used for Recipe
 *  (terminates at `# Python`) so that LLM output containing markdown-
 *  style annotation lines (e.g. `# missing chip: ...`) doesn't get
 *  treated as a section boundary. */
function _extractSectionUntil(
  body: string,
  name: string,
  terminator: RegExp,
): string {
  const re = new RegExp(`^# ${_escapeRegex(name)}\\s*$`, 'm');
  const m = re.exec(body);
  if (!m) return '';
  const start = m.index + m[0].length;
  const tail = body.slice(start);
  const t = terminator.exec(tail);
  const sectionRaw = t ? tail.slice(0, t.index) : tail;
  return sectionRaw.replace(/^\s*\n/, '').replace(/\s+$/, '');
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

/** Replace the body of `# Python` with `pythonSrc`. If the section
 *  doesn't exist, appends `# Python` at the end of the body, wrapped
 *  in a ```python fence so the editor's markdown view highlights it.
 *  Removing the section: pass `null` instead of a string — the
 *  Python facet is excised entirely (used by the toggle command to
 *  hide Python until the cohort opts in).
 *
 *  Inserted block shape:
 *
 *    # Python
 *
 *    ```python
 *    <pythonSrc>
 *    ```
 *
 *  with a single trailing newline so subsequent edits start cleanly.
 *  v0.2.196 for the implicit-locking 3-layer state machine. */
export function replacePythonSection(
  body: string,
  pythonSrc: string | null,
): string {
  const re = /^# Python\s*$/m;
  const m = re.exec(body);
  if (pythonSrc === null) {
    // Excise: drop heading + all body up to next H1 (or EOF).
    if (!m) return body;
    const headingStart = m.index;
    const headingEnd = m.index + m[0].length;
    const tail = body.slice(headingEnd);
    const nextH1 = /^# [^#\n]/m.exec(tail);
    const sectionEnd = nextH1 ? headingEnd + nextH1.index : body.length;
    const before = body.slice(0, headingStart).replace(/\s+$/, '');
    const after = body.slice(sectionEnd).replace(/^\s+/, '\n');
    return before + (after.startsWith('\n') ? after : '\n' + after);
  }
  const trimmed = pythonSrc.replace(/^\s+/, '').replace(/\s+$/, '');
  const block = '# Python\n\n```python\n' + trimmed + '\n```\n';
  if (!m) {
    const sep = body.endsWith('\n') ? '\n' : '\n\n';
    return body + sep + block;
  }
  const headingStart = m.index;
  const headingEnd = m.index + m[0].length;
  const tail = body.slice(headingEnd);
  const nextH1 = /^# [^#\n]/m.exec(tail);
  const sectionEnd = nextH1 ? headingEnd + nextH1.index : body.length;
  const before = body.slice(0, headingStart);
  const after = body.slice(sectionEnd);
  let glue = '';
  if (after.length > 0 && !after.startsWith('\n')) glue = '\n';
  return before + block + glue + after;
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
  // v0.2.279 CW-2200 — terminate at the KNOWN downstream heading
  // (# Python), not "any H1". LLM output may include markdown-style
  // notes prefixed with `# ` (e.g. `# missing chip: ...`) which the
  // pre-fix regex treated as a section boundary — those leaked into the
  // note as pseudo-sections and polluted subsequent forge cycles.
  const tail = body.slice(headingEnd);
  const nextPython = /^# Python\s*$/m.exec(tail);
  const sectionEnd = nextPython
    ? headingEnd + nextPython.index
    : body.length;
  const before = body.slice(0, headingStart);
  const after = body.slice(sectionEnd);
  const replacement = '# Recipe\n\n' + trimmedEmm + '\n';
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
