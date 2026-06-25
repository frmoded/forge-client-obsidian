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
  extractEmmSection,
  extractInputs,
  replaceEmmSection,
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
  '# E--',
  '',
  'Call [[print]] with text="Hello, " + name + "!".',
  'Return.',
  '',
].join('\n');

describe('isV2Shape', () => {
  test('returns true for body with # Description and # E--', () => {
    assert.equal(isV2Shape(SAMPLE_V2), true);
  });

  test('returns false when # Description is missing', () => {
    const body = '---\ntype: action\n---\n\n# E--\n\nReturn.\n';
    assert.equal(isV2Shape(body), false);
  });

  test('returns false when # E-- is missing', () => {
    const body = '---\ntype: action\n---\n\n# Description\n\nFoo\n';
    assert.equal(isV2Shape(body), false);
  });

  test('returns false for V1 # English + # Python note', () => {
    const body = '---\ntype: action\n---\n\n# English\n\nFoo\n\n# Python\n\nbar\n';
    assert.equal(isV2Shape(body), false);
  });

  test('does not match # Descriptionoid (heading must be exact)', () => {
    const body = '---\ntype: action\n---\n\n# Description Of Things\n\nFoo\n\n# E--\n\nReturn.\n';
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
    // (# E--), so ## subheadings inside Description are retained.
  });

  test('returns empty string when # Description absent', () => {
    const body = '---\ntype: action\n---\n\n# E--\n\nReturn.\n';
    assert.equal(extractDescription(body), '');
  });

  test('handles a single-line description with no following sections', () => {
    const body = '# Description\n\nJust this line.\n';
    assert.equal(extractDescription(body), 'Just this line.');
  });
});

describe('extractEmmSection', () => {
  test('extracts the E-- recipe body', () => {
    assert.equal(
      extractEmmSection(SAMPLE_V2),
      'Call [[print]] with text="Hello, " + name + "!".\nReturn.',
    );
  });

  test('returns null when # E-- absent', () => {
    const body = '# Description\n\nFoo\n';
    assert.equal(extractEmmSection(body), null);
  });

  test('returns empty string for an empty # E-- section', () => {
    const body = '# Description\n\nFoo\n\n# E--\n';
    assert.equal(extractEmmSection(body), '');
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
    const body = '# Description\n\nFoo\n\n# E--\n\nReturn.\n';
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
    const body = '## Inputs\n\n- a\n- b\n\n# E--\n\n- not_an_input\n';
    const decls = extractInputs(body);
    assert.equal(decls.length, 2);
    assert.deepEqual(decls.map((d) => d.name), ['a', 'b']);
  });
});

describe('replaceEmmSection', () => {
  test('replaces an existing # E-- body', () => {
    const out = replaceEmmSection(SAMPLE_V2, 'Return.');
    const emm = extractEmmSection(out);
    assert.equal(emm, 'Return.');
    // Description preserved.
    assert.ok(extractDescription(out).startsWith('Prints "Hello, world!".'));
  });

  test('appends a # E-- section when absent', () => {
    const body = '---\ntype: action\n---\n\n# Description\n\nFoo\n';
    const out = replaceEmmSection(body, 'Return.');
    assert.match(out, /^# E--\s*$/m);
    assert.equal(extractEmmSection(out), 'Return.');
  });

  test('preserves frontmatter exactly', () => {
    const out = replaceEmmSection(SAMPLE_V2, 'Return None.');
    assert.match(out, /^---\ntype: action\n---/);
  });

  test('trims leading + trailing blank lines in the new E-- body', () => {
    const out = replaceEmmSection(SAMPLE_V2, '\n\nReturn.\n\n');
    assert.equal(extractEmmSection(out), 'Return.');
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
    const body = '---\ntype: action\nlock: e--canonical\n---\n\n# Description\n\nFoo\n';
    const out = removeFrontmatterField(body, 'lock');
    assert.equal(getFrontmatterField(out, 'lock'), null);
    assert.equal(getFrontmatterField(out, 'type'), 'action');
  });
});
