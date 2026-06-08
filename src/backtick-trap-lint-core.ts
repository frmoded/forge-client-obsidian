// v0.2.79 — build-time lint for the "backtick in embedded Python"
// trap. Per cc-prompt-queue.md §110, this has fired four times
// (v0.2.20, v0.2.23, v0.2.72, v0.2.78). Codification-as-comment has
// failed to prevent recurrence. Build-time lint catches it now.
//
// The trap: a Python source string embedded in a TS template literal
// (e.g. `pyodide.runPython(`def f(): pass`)`) is delimited by
// backticks. A backtick inside the Python code (in a docstring,
// comment, or markdown table) prematurely terminates the JS
// template literal — esbuild then emits a confusing syntax error
// far from the actual trap site.
//
// Lint shape: scan a TS source for `pyodide.runPython(`<body>`)`
// blocks. For each block's body, report any unescaped backtick.
// "Unescaped" = a backtick character that is NOT preceded by a
// backslash (which would mean the author intentionally escaped it).

export interface BacktickTrap {
  /** 1-based line number in the source where the offending backtick lives. */
  line: number;
  /** The full text of the offending line (trimmed). */
  context: string;
  /** Human-readable message describing what's wrong. */
  message: string;
}

/** Find all `pyodide.runPython(\`...\`)` blocks in `source` and report
 *  any unescaped backtick inside any block body.
 *
 *  Returns an empty array when the source is clean.
 *
 *  The scanner is intentionally simple — line-oriented, looking for
 *  the opening `pyodide.runPython(\`` literal and matching closing
 *  `\`)`. It does NOT handle the (theoretical) case of nested
 *  template literals; if one ever shows up the lint would need
 *  upgrading. For the current pyodide-host.ts shape, all runPython
 *  blocks are single-quoted template literals with no nesting. */
export function findBacktickTraps(source: string): BacktickTrap[] {
  const traps: BacktickTrap[] = [];
  const lines = source.split('\n');
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      // Look for the opening: `pyodide.runPython(\`` (with possible
      // whitespace) followed by either content or end-of-line.
      const open = line.match(/\bpyodide\.runPython\(\s*`(.*)$/);
      if (!open) continue;
      const remainder = open[1];
      // Check if the closing `\`)` is on the same line.
      const close = matchClose(remainder);
      if (close.closed) {
        // Same-line runPython — scan only the inner content.
        scanForUnescapedBacktick(close.body, i + 1, line, traps);
        continue;
      }
      // Multi-line block — scan this line's remainder for traps,
      // then continue scanning subsequent lines until we hit `\`)`.
      scanForUnescapedBacktick(remainder, i + 1, line, traps);
      inBlock = true;
      continue;
    }
    // In a block — look for the closing `\`)`.
    const close = matchClose(line);
    if (close.closed) {
      scanForUnescapedBacktick(close.body, i + 1, line, traps);
      inBlock = false;
    } else {
      scanForUnescapedBacktick(line, i + 1, line, traps);
    }
  }
  return traps;
}

/** Look for a closing `\`)` (possibly with surrounding whitespace and
 *  trailing chars). Returns `{closed: true, body: <pre-close text>}`
 *  when the line closes the block; `{closed: false, body: line}`
 *  otherwise. */
function matchClose(line: string): { closed: boolean; body: string } {
  // The closing is a backtick followed by ) — but the backtick must
  // not be escaped. Scan left-to-right.
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '`' && (i === 0 || line[i - 1] !== '\\')) {
      // Is this followed by `)`?
      if (i + 1 < line.length && line[i + 1] === ')') {
        return { closed: true, body: line.slice(0, i) };
      }
      // Bare backtick without `)` — counts as an unescaped trap-
      // signal in the block; treat as body content so the scanner
      // flags it below.
    }
  }
  return { closed: false, body: line };
}

function scanForUnescapedBacktick(
  text: string, lineNum: number, fullLine: string, out: BacktickTrap[],
): void {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`' && (i === 0 || text[i - 1] !== '\\')) {
      out.push({
        line: lineNum,
        context: fullLine.trim(),
        message:
          `Unescaped backtick at line ${lineNum} inside an embedded ` +
          `Python (pyodide.runPython) template literal. Backticks in ` +
          `Python docstrings, comments, or markdown tables terminate ` +
          `the outer JS template literal and produce a confusing ` +
          `esbuild error. Replace the backtick (e.g. use \\u0060 or ` +
          `paraphrase the docstring) or escape it as \\\``,
      });
      return;
    }
  }
}
