// v0.2.206 — Engine-chip catalog pure-core. Parses bundled
// `assets/engine/forge/<domain>/lib.py` source text via regex to
// extract chip metadata: name, first-paragraph docstring, parameter
// names, and the full def-block source. Output drives the
// EngineChipView (Cmd-click on [[chip]] in a Recipe shows the
// Description + Recipe-signature + Python facets).
//
// Why TS-side and not the service introspector: Cmd-click needs an
// immediate response. A service round-trip per click would block
// the open-link path on network latency. The plugin already ships
// the engine source as bundled assets; parsing it locally is the
// cheap path.
//
// Why regex and not a proper Python AST: the engine libs follow a
// consistent style (top-level `def name(...):\n  """doc"""`), so
// regex covers them. A full AST would need a Python parser in TS
// (heavy) or Pyodide at plugin load (heavier). Mirrors the
// service's ast-based logic at a lower fidelity that's still
// sufficient for catalog display.

/** One chip's metadata extracted from a lib.py source file. */
export interface EngineChip {
  name: string;
  /** First paragraph of the docstring, internal whitespace collapsed.
   *  Empty string if no docstring. */
  description: string;
  /** Parameter names in declaration order. Includes positional +
   *  keyword-only; excludes `*args` (filtered) and `**kwargs`
   *  (excluded — V2 Recipe can't pass arbitrary kwargs). */
  inputs: string[];
  /** Full source of the def block (def line through end-of-body),
   *  exactly as it appears in the lib.py file. */
  pythonSource: string;
}

/** Parse a Python lib.py source file and return one EngineChip per
 *  top-level public function (no underscore prefix, no *args-only).
 *
 *  Limitations vs the service's ast.unparse:
 *  - Doesn't follow decorator stacks (chips don't use decorators).
 *  - Doesn't dedent docstrings (we just collapse internal whitespace
 *    of the first paragraph, which is enough for catalog display).
 *  - Function source extent is determined by dedent: every line whose
 *    indent is `> 0` (or blank) belongs to the def block; the next
 *    line at indent 0 ends it.
 */
export function parseEngineLib(source: string): EngineChip[] {
  const lines = source.split('\n');
  const chips: EngineChip[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Match the def header up to the opening paren. Single-line and
    // multi-line signatures both pass this check; the param-text
    // capture happens after we balance-match the parens below.
    const headMatch = /^def ([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
    if (!headMatch) {
      i++;
      continue;
    }
    const name = headMatch[1];
    const defStart = i;
    // Walk lines until paren depth balances back to zero. Track
    // depth across newlines (multi-line signatures are common in
    // forge.music.lib for play_at_offsets et al).
    const parenStart = headMatch[0].length;   // position AFTER `(`
    let depth = 1;
    let paramsRaw = line.slice(parenStart);
    let j = i;
    let signatureEndCol = -1;
    let scanFrom = 0;
    {
      let buf = paramsRaw;
      while (depth > 0) {
        for (let k = scanFrom; k < buf.length; k++) {
          const ch = buf[k];
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) { signatureEndCol = k; break; }
          }
        }
        if (depth === 0) break;
        // Read next line.
        if (j >= lines.length - 1) break;
        j++;
        scanFrom = buf.length + 1;   // +1 for the newline we add
        buf = buf + '\n' + lines[j];
        paramsRaw = buf;
      }
      if (signatureEndCol !== -1) {
        paramsRaw = buf.slice(0, signatureEndCol);
      }
    }
    // Move scanner past the def signature.
    i = j + 1;

    // Walk the body: indented lines (or blank) belong to this def.
    const bodyStart = i;
    while (i < lines.length) {
      const bl = lines[i];
      if (bl.length === 0 || /^[ \t]/.test(bl)) {
        i++;
      } else {
        break;
      }
    }
    const bodyEnd = i;
    const pythonSource = lines.slice(defStart, bodyEnd).join('\n');

    // Skip private names.
    if (name.startsWith('_')) continue;
    // Skip *args-only callables (V2 Recipe is kwargs-only).
    if (_isVariadicOnly(paramsRaw)) continue;

    const description = _extractFirstDocParagraph(
      lines.slice(bodyStart, bodyEnd).join('\n'),
    );
    const inputs = _extractParamNames(paramsRaw);
    chips.push({ name, description, inputs, pythonSource });
  }
  return chips;
}

/** Synthesize the Recipe-facet signature line for an engine chip.
 *  Per Phase 1 §3.4 pick A: kwarg form for positional chips,
 *  shorthand for zero-arg, special-case the print statement form.
 */
export function synthesizeRecipeSignature(chip: EngineChip): string {
  if (chip.name === 'print') {
    return `# Statement shorthand — pass the value as a positional arg:\n[[print]] <expr>.`;
  }
  if (chip.inputs.length === 0) {
    return `[[${chip.name}]].`;
  }
  const args = chip.inputs.map(p => `${p}=<${p}>`).join(', ');
  return `Call [[${chip.name}]] with ${args}.`;
}

/** Index lookup: returns the chip whose name matches, or null. */
export function findEngineChip(
  catalog: ReadonlyMap<string, EngineChip>,
  name: string,
): EngineChip | null {
  return catalog.get(name) ?? null;
}

/** Build a name → chip map for fast lookup at click time.
 *  Combines chips across all domains; on name collision the latest
 *  domain wins (mirrors the engine's last-vault-wins resolution). */
export function buildEngineChipIndex(
  perDomain: Record<string, EngineChip[]>,
): Map<string, EngineChip> {
  const out = new Map<string, EngineChip>();
  for (const chips of Object.values(perDomain)) {
    for (const c of chips) out.set(c.name, c);
  }
  return out;
}

// ---------- internals -------------------------------------------------

function _isVariadicOnly(paramsRaw: string): boolean {
  // Trim and strip comments + extra whitespace per param.
  const params = paramsRaw
    .split(',')
    .map(p => p.split('#')[0].trim())
    .filter(p => p.length > 0);
  // A bare `*args` is filtered if it's the ONLY param. Anything with
  // named positional/keyword params alongside is callable from V2
  // via the named slots.
  if (params.length === 1 && params[0].startsWith('*') && !params[0].startsWith('**')) {
    return true;
  }
  return false;
}

function _extractParamNames(paramsRaw: string): string[] {
  return paramsRaw
    .split(',')
    .map(p => p.split('#')[0].trim())
    .filter(p => p.length > 0)
    .filter(p => !p.startsWith('*'))       // drop *args, **kwargs, and `*` bare separator
    .filter(p => p !== 'self' && p !== 'cls')
    .map(p => {
      // Strip default: `x=1` → `x`
      const eq = p.indexOf('=');
      const beforeEq = eq === -1 ? p : p.slice(0, eq);
      // Strip annotation: `x: int` → `x`
      const colon = beforeEq.indexOf(':');
      const name = colon === -1 ? beforeEq : beforeEq.slice(0, colon);
      return name.trim();
    })
    .filter(p => p.length > 0);
}

function _extractFirstDocParagraph(body: string): string {
  // Match the first triple-quoted docstring (single OR triple-quote).
  const m = body.match(/^\s*("""|''')([\s\S]*?)\1/);
  if (!m) return '';
  const doc = m[2].trim();
  const firstPara = doc.split('\n\n', 1)[0];
  // Collapse internal whitespace.
  return firstPara.split(/\s+/).filter(s => s.length > 0).join(' ');
}
