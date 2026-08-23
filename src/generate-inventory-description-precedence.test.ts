// [test3-fresh-note-description-shadowed-by-yaml] — /generate payload
// description precedence.
//
// Driver smoke 2026-08-05 ~15:50: fresh note `test3.md` (created via
// the note-creation dialog, which stamps `description: <title>` into
// YAML frontmatter), cohort typed "Play D major scale." into the
// # Description body, clicked Run. Service logs show /generate was
// called with snippet_id=test3 twice; the note ended with the template
// Recipe `Return None.` stamped as derived-from the body description.
//
// Root cause: _forge_get_generate_inventory (pyodide-host.ts) gave
// the YAML `description:` field precedence and used the # Description
// body only as a FALLBACK (the CW-2200 fix's shape). Every
// dialog-created note carries a non-empty YAML description (the note
// title), which permanently shadows the cohort's actual intent — the
// LLM was asked to write a Recipe for the string "test3" and
// reasonably produced `Return None.`, which parses and so passes the
// drain-1700 validation. Meanwhile the hashing subsystem reads the
// BODY (description_hash was correct), so the two subsystems silently
// disagreed about what "the description" is.
//
// The fix inverts the precedence: in V2 the H1 Description body is
// the cohort-intent surface (CW-2200's own comment says so); the YAML
// field is the fallback, which still preserves V1 notes (they have no
// # Description section).
//
// DRIFT PROTECTION: this test does NOT carry a copy of the production
// Python. It regex-extracts `_forge_get_generate_inventory` from
// src/pyodide-host.ts at test start (option (a) of the
// mirror-drift rule) and executes it under a real Python with the
// REAL engine bundle's SnippetRegistry / GraphResolver /
// extract_section. The pre-existing verbatim copy in
// inventory-staleness.test.ts had already drifted (it lacks even the
// CW-2200 fallback) — this file is the pattern to prefer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { DESCRIPTION_PLACEHOLDER } from './description-placeholder-core.ts';

const REPO = process.cwd();
const HOST_TS = path.join(REPO, 'src', 'pyodide-host.ts');
const ENGINE = path.join(REPO, 'assets', 'engine');

function resolvePython(): string | null {
  const candidates = [
    path.resolve(REPO, '..', 'forge', '.venv', 'bin', 'python'),
    'python3',
  ];
  for (const py of candidates) {
    const probe = spawnSync(py, ['-c', 'import yaml'], { encoding: 'utf8' });
    if (probe.status === 0) return py;
  }
  return null;
}

function extractProductionFunction(): string {
  const src = fs.readFileSync(HOST_TS, 'utf8');
  const m = src.match(/^def _forge_get_generate_inventory\([\s\S]*?(?=^def )/m);
  assert.ok(m, 'could not extract _forge_get_generate_inventory from pyodide-host.ts');
  // The embedded block lives in a JS template literal; if it ever
  // grows escape sequences (\\, \`) this raw extraction stops being
  // the runtime text and needs an unescape step. Fail loudly then.
  assert.ok(!m[0].includes('\\\\'), 'extracted block contains JS escapes — add unescaping');
  return extractPlaceholderPrelude(src) + '\n\n' + m[0];
}

/** Drain 2026-08-23-2100 — the function above now calls
 *  `_forge_is_description_placeholder`, so the harness has to carry its
 *  definition and the constant it reads. Extracted from the same source
 *  file for the same reason the function is: a hand-copy here would be
 *  the drift trap this file's header exists to avoid.
 *
 *  This slice DOES contain a JS escape — the constant is built with
 *  `"\\n".join([...])` so that V8 hands Python a single backslash-n —
 *  so it gets the unescape step the raw-function assertion above
 *  demands rather than being waved through. */
function extractPlaceholderPrelude(src: string): string {
  const start = src.indexOf('_FORGE_DESCRIPTION_PLACEHOLDER = ');
  assert.ok(start >= 0, 'could not find _FORGE_DESCRIPTION_PLACEHOLDER');
  const end = src.indexOf('def _forge_get_generate_inventory(', start);
  assert.ok(end > start, 'placeholder prelude does not precede the inventory fn');
  return src.slice(start, end).replace(/\\\\n/g, '\\n');
}

const NOTE_YAML_AND_BODY = `---
type: action
description: test3
---

# Description

Play D major scale.

# Recipe

Return None.
`;

const NOTE_YAML_ONLY_V1 = `---
type: action
description: Greet politely
---

# English

  print "hello"
`;

const NOTE_BODY_ONLY = `---
type: action
---

# Description

Play E minor scale.

# Recipe

Return None.
`;

const NOTE_NEITHER = `---
type: action
---

# Recipe

Return None.
`;

// Drain 2026-08-23-2100 — a note straight out of the fresh-note
// template: the Description holds the authoring hint and nothing else.
// The hint is instructions TO the author, not intent FROM them.
const NOTE_UNTOUCHED_PLACEHOLDER = `---
type: action
description: test4
---

# Description

${DESCRIPTION_PLACEHOLDER}

# Recipe


`;

// The same note after the cohort types over the hint. Its intent must
// reach /generate untouched — this is the non-vacuity half.
const NOTE_EDITED_PLACEHOLDER = `---
type: action
description: test4
---

# Description

Print a random number multiplied by an input scale.

# Recipe


`;

test('generate inventory: # Description body wins over YAML description; YAML is V1 fallback', () => {
  const python = resolvePython();
  if (!python) {
    // Mirrors the sibling-repo skip convention: the harness needs a
    // Python with pyyaml (the forge venv). Do not fake a pass.
    assert.fail('no python with pyyaml found (expected ../forge/.venv/bin/python)');
  }
  const fnSrc = extractProductionFunction();

  const script = `
import sys, json, tempfile, os
sys.path.insert(0, ${JSON.stringify(ENGINE)})
from forge.core.snippet_registry import SnippetRegistry
from forge.core.graph_resolver import GraphResolver
from forge.core.executor import extract_section

notes = json.loads(sys.stdin.read())
vault = tempfile.mkdtemp()
for name, body in notes.items():
    with open(os.path.join(vault, name + ".md"), "w") as f:
        f.write(body)
_reg = SnippetRegistry(); _reg.scan(vault)
_forge_resolver = GraphResolver(_reg)
def _forge_find_deps(body):
    return []

g = {"_forge_resolver": _forge_resolver, "extract_section": extract_section,
     "_forge_find_deps": _forge_find_deps}
exec(${JSON.stringify('FN_SRC_PLACEHOLDER')} and FN_SRC, g)
out = {name: g["_forge_get_generate_inventory"](name)["description"] for name in notes}
print(json.dumps(out))
`.replace(
    `exec(${JSON.stringify('FN_SRC_PLACEHOLDER')} and FN_SRC, g)`,
    `exec(${JSON.stringify(fnSrc)}, g)`,
  );

  const notes = {
    yaml_and_body: NOTE_YAML_AND_BODY,
    yaml_only_v1: NOTE_YAML_ONLY_V1,
    body_only: NOTE_BODY_ONLY,
    neither: NOTE_NEITHER,
    untouched_placeholder: NOTE_UNTOUCHED_PLACEHOLDER,
    edited_placeholder: NOTE_EDITED_PLACEHOLDER,
  };
  const run = spawnSync(python, ['-'], {
    input: script.replace("sys.stdin.read()", JSON.stringify(JSON.stringify(notes))),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `python harness failed:\n${run.stderr}`);
  const lines = run.stdout.trim().split('\n');
  const got = JSON.parse(lines[lines.length - 1]);

  // THE BUG: dialog-created note (YAML description = title) with real
  // cohort intent in the body. The body must win.
  assert.equal(
    got.yaml_and_body,
    'Play D major scale.',
    'YAML description (note title) shadowed the cohort\'s # Description body',
  );
  // V1 compat: no # Description section → YAML field still used.
  assert.equal(got.yaml_only_v1, 'Greet politely');
  // CW-2200 case unchanged: body present, no YAML.
  assert.equal(got.body_only, 'Play E minor scale.');
  // Neither → empty (service-side handling owns that case).
  assert.equal(got.neither, '');

  // Drain 2026-08-23-2100 — the untouched template hint resolves to
  // EMPTY, and deliberately does not fall through to the YAML
  // description. Both halves matter: sending the hint would ask the
  // model to implement "Describe what this note should do", and
  // falling through would ask it to implement the note's title (the
  // very defect the first assertion in this test guards).
  assert.equal(got.untouched_placeholder, '');

  // NON-VACUITY: once the cohort writes over the hint, their intent
  // must reach /generate untouched. A guard that swallowed this would
  // silently break every generated note.
  assert.equal(
    got.edited_placeholder,
    'Print a random number multiplied by an input scale.',
  );
});
