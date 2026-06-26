// Tests for v2-note-core.ts pure-core helpers.
//
// Each helper has happy-path + edge-case coverage. Failures here mean
// the V2 /generate command will mis-extract or mis-rewrite cohort notes;
// the bar for correctness is high.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  isV2Shape,
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  extractInputs,
  replaceRecipeSection,
  replacePythonSection,
  setFrontmatterField,
  getFrontmatterField,
  removeFrontmatterField,
} from './v2-note-core.ts';

const SAMPLE_V2 = [
  '---',
  'type: action',
  '---',
  '',
  '# Description',
  '',
  'Prints "Hello, world!".',
  '',
  '## Inputs',
  '',
  '- name (default "world") — who to greet',
  '- excited',
  '',
  '## Mechanics',
  '',
  'Built-in `print`.',
  '',
  '# Recipe',
  '',
  'Call [[print]] with text="Hello, " + name + "!".',
  'Return.',
  '',
].join('\n');

describe('isV2Shape', () => {
  test('returns true for body with # Description and # Recipe', () => {
    assert.equal(isV2Shape(SAMPLE_V2), true);
  });

  test('returns false when # Description is missing', () => {
    const body = '---\ntype: action\n---\n\n# Recipe\n\nReturn.\n';
    assert.equal(isV2Shape(body), false);
  });

  test('returns false when # Recipe is missing', () => {
    const body = '---\ntype: action\n---\n\n# Description\n\nFoo\n';
    assert.equal(isV2Shape(body), false);
  });

  test('returns false for V1 # English + # Python note', () => {
    const body = '---\ntype: action\n---\n\n# English\n\nFoo\n\n# Python\n\nbar\n';
    assert.equal(isV2Shape(body), false);
  });

  test('does not match # Descriptionoid (heading must be exact)', () => {
    const body = '---\ntype: action\n---\n\n# Description Of Things\n\nFoo\n\n# Recipe\n\nReturn.\n';
    assert.equal(isV2Shape(body), false);
  });

  test('returns false for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(isV2Shape(null as any), false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(isV2Shape(undefined as any), false);
  });
});

describe('extractDescription', () => {
  test('extracts the prose body between # Description and the next H1', () => {
    assert.equal(
      extractDescription(SAMPLE_V2),
      'Prints "Hello, world!".\n\n## Inputs\n\n- name (default "world") — who to greet\n- excited\n\n## Mechanics\n\nBuilt-in `print`.',
    );
    // NOTE: the # Description body intentionally stops at the next H1
    // (# Recipe), so ## subheadings inside Description are retained.
  });

  test('returns empty string when # Description absent', () => {
    const body = '---\ntype: action\n---\n\n# Recipe\n\nReturn.\n';
    assert.equal(extractDescription(body), '');
  });

  test('handles a single-line description with no following sections', () => {
    const body = '# Description\n\nJust this line.\n';
    assert.equal(extractDescription(body), 'Just this line.');
  });
});

describe('extractRecipeSection', () => {
  test('extracts the Recipe body', () => {
    assert.equal(
      extractRecipeSection(SAMPLE_V2),
      'Call [[print]] with text="Hello, " + name + "!".\nReturn.',
    );
  });

  test('returns null when # Recipe absent', () => {
    const body = '# Description\n\nFoo\n';
    assert.equal(extractRecipeSection(body), null);
  });

  test('returns empty string for an empty # Recipe section', () => {
    const body = '# Description\n\nFoo\n\n# Recipe\n';
    assert.equal(extractRecipeSection(body), '');
  });

  // v0.2.200 regression guard: extractRecipeSection MUST be exported
  // (driver smoke against v0.2.199 hit ReferenceError: extractRecipeSection
  // is not defined — main.ts called whichLayerIsCanonical with the symbol
  // as a helper but never imported it). The test_main_imports_test below
  // is the actual scope test; this one pins the export contract from
  // v2-note-core itself.
  test('is exported from v2-note-core (load-bearing for facet-hash-core helpers)', () => {
    assert.equal(typeof extractRecipeSection, 'function');
  });
});

describe('extractInputs', () => {
  test('parses inputs with default + doc', () => {
    const decls = extractInputs(SAMPLE_V2);
    assert.equal(decls.length, 2);
    assert.deepEqual(decls[0], {
      name: 'name',
      hasDefault: true,
      defaultLiteral: '"world"',
      doc: 'who to greet',
    });
    assert.deepEqual(decls[1], {
      name: 'excited',
      hasDefault: false,
      defaultLiteral: null,
      doc: '',
    });
  });

  test('returns [] when ## Inputs absent', () => {
    const body = '# Description\n\nFoo\n\n# Recipe\n\nReturn.\n';
    assert.deepEqual(extractInputs(body), []);
  });

  test('tolerates `--` separator', () => {
    const body = '## Inputs\n\n- foo -- a thing\n';
    const decls = extractInputs(body);
    assert.equal(decls[0].name, 'foo');
    assert.equal(decls[0].doc, 'a thing');
  });

  test('skips lines that do not look like declarations', () => {
    const body = '## Inputs\n\nSee below.\n\n- valid\n\nignored prose\n';
    const decls = extractInputs(body);
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, 'valid');
  });

  test('stops at the next H1', () => {
    const body = '## Inputs\n\n- a\n- b\n\n# Recipe\n\n- not_an_input\n';
    const decls = extractInputs(body);
    assert.equal(decls.length, 2);
    assert.deepEqual(decls.map((d) => d.name), ['a', 'b']);
  });
});

describe('replaceRecipeSection', () => {
  test('replaces an existing # Recipe body', () => {
    const out = replaceRecipeSection(SAMPLE_V2, 'Return.');
    const emm = extractRecipeSection(out);
    assert.equal(emm, 'Return.');
    // Description preserved.
    assert.ok(extractDescription(out).startsWith('Prints "Hello, world!".'));
  });

  test('appends a # Recipe section when absent', () => {
    const body = '---\ntype: action\n---\n\n# Description\n\nFoo\n';
    const out = replaceRecipeSection(body, 'Return.');
    assert.match(out, /^# Recipe\s*$/m);
    assert.equal(extractRecipeSection(out), 'Return.');
  });

  test('preserves frontmatter exactly', () => {
    const out = replaceRecipeSection(SAMPLE_V2, 'Return None.');
    assert.match(out, /^---\ntype: action\n---/);
  });

  test('trims leading + trailing blank lines in the new E-- body', () => {
    const out = replaceRecipeSection(SAMPLE_V2, '\n\nReturn.\n\n');
    assert.equal(extractRecipeSection(out), 'Return.');
  });
});

describe('setFrontmatterField', () => {
  test('inserts a new key when absent', () => {
    const out = setFrontmatterField(SAMPLE_V2, 'description_hash', 'abc123');
    assert.equal(getFrontmatterField(out, 'description_hash'), 'abc123');
    // Other fields preserved.
    assert.equal(getFrontmatterField(out, 'type'), 'action');
  });

  test('replaces an existing key value', () => {
    const body = '---\ntype: action\ndescription_hash: oldhex\n---\n\n# Description\n\nFoo\n';
    const out = setFrontmatterField(body, 'description_hash', 'newhex');
    assert.equal(getFrontmatterField(out, 'description_hash'), 'newhex');
    assert.ok(!out.includes('oldhex'));
  });

  test('creates a frontmatter block when none exists', () => {
    const body = '# Description\n\nFoo\n';
    const out = setFrontmatterField(body, 'type', 'action');
    assert.match(out, /^---\ntype: action\n---/);
  });

  test('throws on malformed frontmatter (no closing delimiter)', () => {
    const body = '---\ntype: action\n# Description\n\nFoo\n';
    assert.throws(
      () => setFrontmatterField(body, 'foo', 'bar'),
      /closing/,
    );
  });
});

describe('getFrontmatterField + removeFrontmatterField', () => {
  test('getFrontmatterField returns trimmed value', () => {
    assert.equal(getFrontmatterField(SAMPLE_V2, 'type'), 'action');
  });

  test('getFrontmatterField returns null for absent key', () => {
    assert.equal(getFrontmatterField(SAMPLE_V2, 'description_hash'), null);
  });

  test('removeFrontmatterField is idempotent on absent key', () => {
    const out = removeFrontmatterField(SAMPLE_V2, 'description_hash');
    assert.equal(out, SAMPLE_V2);
  });

  test('removeFrontmatterField deletes the key + line', () => {
    const body = '---\ntype: action\nlock: recipe-canonical\n---\n\n# Description\n\nFoo\n';
    const out = removeFrontmatterField(body, 'lock');
    assert.equal(getFrontmatterField(out, 'lock'), null);
    assert.equal(getFrontmatterField(out, 'type'), 'action');
  });
});

// ---------- Python facet helpers (v0.2.196 — 3-layer state machine) ---

const SAMPLE_WITH_PYTHON = [
  '---',
  'type: action',
  '---',
  '',
  '# Description',
  '',
  'Prints hello.',
  '',
  '# Recipe',
  '',
  'Print "hello".',
  '',
  '# Python',
  '',
  '```python',
  'def compute(context):',
  '    print("hello")',
  '```',
  '',
].join('\n');

describe('extractPythonSection', () => {
  test('returns null when # Python heading absent', () => {
    const body = SAMPLE_V2;
    assert.equal(extractPythonSection(body), null);
  });

  test('extracts and unwraps ```python fence', () => {
    const out = extractPythonSection(SAMPLE_WITH_PYTHON);
    assert.equal(out, 'def compute(context):\n    print("hello")');
  });

  test('returns raw body when no fence present', () => {
    const body = SAMPLE_WITH_PYTHON.replace(/```python\n/, '').replace(/```\n/, '');
    const out = extractPythonSection(body);
    assert.ok(out && out.includes('def compute(context):'));
  });

  test('stops at next H1', () => {
    const body = SAMPLE_WITH_PYTHON + '\n# Notes\n\nSome notes.\n';
    const out = extractPythonSection(body);
    assert.ok(out !== null);
    assert.ok(!out!.includes('Notes'));
  });
});

describe('replacePythonSection', () => {
  test('appends a new # Python section when absent', () => {
    const out = replacePythonSection(SAMPLE_V2, 'def compute(c): pass');
    const py = extractPythonSection(out);
    assert.equal(py, 'def compute(c): pass');
  });

  test('replaces an existing Python body', () => {
    const out = replacePythonSection(
      SAMPLE_WITH_PYTHON,
      'def compute(context):\n    print("EDITED")',
    );
    const py = extractPythonSection(out);
    assert.equal(py, 'def compute(context):\n    print("EDITED")');
  });

  test('excise (pythonSrc=null) removes the whole # Python section', () => {
    const out = replacePythonSection(SAMPLE_WITH_PYTHON, null);
    assert.equal(extractPythonSection(out), null);
    // Description + Recipe untouched.
    assert.ok(out.includes('# Description'));
    assert.ok(out.includes('# Recipe'));
    // No `# Python` heading.
    assert.ok(!out.includes('# Python'));
  });

  test('excise no-op when section absent', () => {
    const out = replacePythonSection(SAMPLE_V2, null);
    assert.equal(out, SAMPLE_V2);
  });

  test('replaceRecipeSection unaffected by replacePythonSection', () => {
    const out = replacePythonSection(SAMPLE_WITH_PYTHON, 'NEW PYTHON');
    assert.equal(extractRecipeSection(out), 'Print "hello".');
  });
});
