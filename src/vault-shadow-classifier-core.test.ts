// v0.2.212 — TDD-first pure-core tests for vault-shadow-classifier.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  classifyVaultShadow,
  parseFrontmatterFields,
  hasOnlyChipNameHeading,
  hasOnlyEmptyActionTemplate,
} from './vault-shadow-classifier-core.ts';

describe('classifyVaultShadow', () => {
  test('empty string → forensic', () => {
    assert.equal(classifyVaultShadow('', 'kick'), 'forensic');
  });

  test('whitespace-only → forensic', () => {
    assert.equal(classifyVaultShadow('   \n\n  \t\n', 'kick'), 'forensic');
  });

  test('heading matches chip name → forensic', () => {
    assert.equal(
      classifyVaultShadow('# play_at_offsets\n', 'play_at_offsets'),
      'forensic',
    );
  });

  test('heading does NOT match chip name → intentional', () => {
    // Cohort renamed / repurposed the file.
    assert.equal(
      classifyVaultShadow('# kick\n', 'play_at_offsets'),
      'intentional',
    );
  });

  test('only `type: action` frontmatter + empty body → forensic', () => {
    assert.equal(
      classifyVaultShadow('---\ntype: action\n---\n', 'kick'),
      'forensic',
    );
  });

  test('`type: action` frontmatter + matching heading → forensic', () => {
    assert.equal(
      classifyVaultShadow(
        '---\ntype: action\n---\n# play_at_offsets\n',
        'play_at_offsets',
      ),
      'forensic',
    );
  });

  test('empty action-template scaffold (Description + Recipe) → forensic', () => {
    assert.equal(
      classifyVaultShadow(
        '---\ntype: action\n---\n# Description\n\n# Recipe\n',
        'kick',
      ),
      'forensic',
    );
  });

  test('Description with prose → intentional', () => {
    assert.equal(
      classifyVaultShadow(
        '---\ntype: action\n---\n# Description\n\nKick on beat 1.\n# Recipe\n',
        'kick',
      ),
      'intentional',
    );
  });

  test('Recipe with chip call → intentional', () => {
    assert.equal(
      classifyVaultShadow(
        '---\ntype: action\n---\n# Recipe\n\nCall [[snare]].\n',
        'kick',
      ),
      'intentional',
    );
  });

  test('extra frontmatter field (tags) → intentional', () => {
    assert.equal(
      classifyVaultShadow(
        '---\ntype: action\ntags: [drums]\n---\n',
        'kick',
      ),
      'intentional',
    );
  });

  test('non-action frontmatter (featured: true) → intentional', () => {
    assert.equal(
      classifyVaultShadow(
        '---\nfeatured: true\n---\n# kick\n',
        'kick',
      ),
      'intentional',
    );
  });

  test('prose under chip-name heading → intentional', () => {
    assert.equal(
      classifyVaultShadow('# kick\n\nA drum.\n', 'kick'),
      'intentional',
    );
  });

  test('wikilink under chip-name heading → intentional', () => {
    assert.equal(
      classifyVaultShadow('# kick\n\n[[other_chip]]\n', 'kick'),
      'intentional',
    );
  });

  test('alternate heading (not chip name, not Description/Recipe) → intentional', () => {
    assert.equal(
      classifyVaultShadow('# Notes on drums\n', 'kick'),
      'intentional',
    );
  });

  test('code block in body → intentional', () => {
    assert.equal(
      classifyVaultShadow(
        '# kick\n\n```python\nkick()\n```\n',
        'kick',
      ),
      'intentional',
    );
  });
});

describe('parseFrontmatterFields', () => {
  test('no frontmatter → empty fm + body verbatim', () => {
    const r = parseFrontmatterFields('# heading\nbody\n');
    assert.deepEqual(r.frontmatter, {});
    assert.equal(r.body, '# heading\nbody\n');
  });

  test('extracts top-level scalar keys', () => {
    const r = parseFrontmatterFields(
      '---\ntype: action\ntags: drums\n---\nbody\n',
    );
    assert.equal(r.frontmatter.type, 'action');
    assert.equal(r.frontmatter.tags, 'drums');
  });

  test('strips the trailing newline after the closing fence', () => {
    const r = parseFrontmatterFields('---\ntype: action\n---\nbody\n');
    assert.equal(r.body, 'body\n');
  });

  test('unclosed frontmatter → returns raw as body', () => {
    const r = parseFrontmatterFields('---\ntype: action\nno close\n');
    assert.deepEqual(r.frontmatter, {});
  });
});

describe('hasOnlyChipNameHeading', () => {
  test('single matching heading → true', () => {
    assert.equal(hasOnlyChipNameHeading('# kick', 'kick'), true);
  });

  test('matching heading with trailing whitespace → true', () => {
    assert.equal(hasOnlyChipNameHeading('# kick\n\n', 'kick'), true);
  });

  test('non-matching heading → false', () => {
    assert.equal(hasOnlyChipNameHeading('# snare', 'kick'), false);
  });

  test('matching heading + extra content → false', () => {
    assert.equal(hasOnlyChipNameHeading('# kick\n\nA drum.', 'kick'), false);
  });
});

describe('hasOnlyEmptyActionTemplate', () => {
  test('# Description + # Recipe (blank between) → true', () => {
    assert.equal(
      hasOnlyEmptyActionTemplate('# Description\n\n# Recipe'),
      true,
    );
  });

  test('# Description + content + # Recipe → false', () => {
    assert.equal(
      hasOnlyEmptyActionTemplate('# Description\n\nfoo\n\n# Recipe'),
      false,
    );
  });

  test('only # Description → false (recipe missing)', () => {
    assert.equal(hasOnlyEmptyActionTemplate('# Description\n'), false);
  });
});
