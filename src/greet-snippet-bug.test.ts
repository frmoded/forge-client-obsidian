// TDD reproduction for the v0.2.14 "greet snippet silent failure" bug
// reported in ~/forge-vaults/smoke-v0.2.13. User authored greet.md with
// a markdown `---` horizontal rule between # English and # Python
// facets; Forge-click logged generate (α) but the file was not
// rewritten AND a subsequent compute returned `{stdout: '', result:
// undefined}` despite the Python facet containing
// `def compute(context): print("hello")`.
//
// Hypothesis 1a from the originating prompt: extract_section misreads
// the `---` line as a section delimiter, truncating extraction. The
// CPython probe I ran before writing this test showed both
// extract_section("english") and extract_python(body) returning the
// expected content, suggesting the engine parser handles this body
// correctly and the bug is plugin-side. This test mirrors the same
// probe in Pyodide-in-Node to confirm at suite-time.
//
// If this test PASSES, per prompt §2.2 the pivot is to plugin-side
// reproduction (writeGeneratedCode silent failure, /generate response
// handling, or stdout capture). Documented in feedback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPyodide } from 'pyodide';

// Verbatim from the originating prompt's "File content (verbatim)"
// section — the body content the engine would see after frontmatter
// strip. NOTE: the user's file frontmatter ends at line 5; this
// constant starts at the body (line 6 onwards).
const GREET_BODY = `
# English

  print "hello1"

---

# Python

\`\`\`python
def compute(context):
    print("hello")
\`\`\`
`;

// Verbatim copy of the engine's extract_section + extract_python from
// assets/engine/forge/core/executor.py (lines 419-458). Pure-string
// functions with no engine deps, so we can exec them directly in
// Pyodide without mounting the full bundle.
const EXTRACTORS_PY = `
import re

_PYTHON_HEADING = re.compile(r'^#{1,6}\\s+python\\s*$', re.IGNORECASE)

def extract_section(body, heading):
  pattern = re.compile(rf'^#{{1,6}}\\s+{re.escape(heading)}\\s*$', re.IGNORECASE)
  lines = body.splitlines()
  collecting = False
  section_lines = []
  for line in lines:
    if pattern.match(line.strip()):
      collecting = True
      continue
    if not collecting:
      continue
    if line.startswith("#") or line.strip() == "---":
      break
    section_lines.append(line)
  return "\\n".join(section_lines).strip() or None

def extract_python(body):
  lines = body.splitlines()
  collecting = False
  in_fence = False
  code_lines = []
  for line in lines:
    if _PYTHON_HEADING.match(line.strip()):
      collecting = True
      continue
    if not collecting:
      continue
    if line.startswith("#"):
      break
    if line.strip().startswith("\`\`\`python"):
      in_fence = True
      continue
    if line.strip() == "\`\`\`":
      if in_fence:
        break
      continue
    code_lines.append(line)
  return "\\n".join(code_lines).strip() or None
`;

// Shared Pyodide instance — same pattern as pyodide-inventory.test.ts.
let _pyodidePromise: Promise<any> | null = null;
function getPyodide(): Promise<any> {
  if (_pyodidePromise === null) _pyodidePromise = loadPyodide();
  return _pyodidePromise;
}

test('greet-bug: extract_section(body, "english") returns the English facet content', async () => {
  const py = await getPyodide();
  py.runPython(EXTRACTORS_PY);
  py.globals.set('_greet_body', GREET_BODY);
  const result = py.runPython('extract_section(_greet_body, "english")');
  // Hypothesis 1a would have this return None (extraction truncated
  // by `---` mid-body). If the parser handles the body correctly,
  // we get the English directive back.
  assert.equal(
    result,
    'print "hello1"',
    'extract_section should return the English directive past the markdown `---` rule',
  );
});

test('greet-bug: extract_python(body) returns the Python facet content past the `---` rule', async () => {
  const py = await getPyodide();
  py.runPython(EXTRACTORS_PY);
  py.globals.set('_greet_body', GREET_BODY);
  const result = py.runPython('extract_python(_greet_body)');
  // Hypothesis 1a would have this return None (extract_python's
  // `line.startswith("#")` break on the `# English` heading happens
  // BEFORE finding `# Python`, but extract_python skips lines until
  // _PYTHON_HEADING matches — so the `---` shouldn't break it).
  // If the parser is fine, we get the function definition back.
  assert.equal(
    result,
    'def compute(context):\n    print("hello")',
    'extract_python should return the function definition past the markdown `---` rule',
  );
});

test('greet-bug: exec(extract_python(body)) defines a callable compute function', async () => {
  const py = await getPyodide();
  py.runPython(EXTRACTORS_PY);
  py.globals.set('_greet_body', GREET_BODY);
  const stdout = py.runPython(`
import io, sys
_code = extract_python(_greet_body)
_ns = {"__builtins__": __builtins__}
_buf = io.StringIO()
_old = sys.stdout
sys.stdout = _buf
try:
  exec(compile(_code, "<snippet>", "exec"), _ns)
  _ns["compute"](object())
finally:
  sys.stdout = _old
_buf.getvalue()
`);
  // The behavioral assertion: print("hello") in compute() actually
  // produces output when run. If this test fails, the engine path
  // is broken. If it passes (as the CPython probe predicted), the
  // bug is plugin-side and the prompt §2.2 pivot kicks in.
  assert.equal(stdout, 'hello\n', 'compute() should print "hello" to stdout');
});
