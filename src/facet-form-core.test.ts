// Pure-core tests for facet-form-core. Runs under `node --test` —
// no obsidian shim needed (the helper takes a plain `unknown` and
// duck-types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFacetForm } from './facet-form-core.ts';

test('getFacetForm: undefined frontmatter → undefined', () => {
  assert.equal(getFacetForm(undefined), undefined);
});

test('getFacetForm: null frontmatter → undefined', () => {
  assert.equal(getFacetForm(null), undefined);
});

test('getFacetForm: empty object → undefined (field absent)', () => {
  assert.equal(getFacetForm({}), undefined);
});

test('getFacetForm: facet_form: canonical → canonical', () => {
  assert.equal(getFacetForm({ facet_form: 'canonical' }), 'canonical');
});

test('getFacetForm: facet_form: free → free', () => {
  assert.equal(getFacetForm({ facet_form: 'free' }), 'free');
});

test('getFacetForm: unknown value → undefined (defensive: defaults to legacy /generate path)', () => {
  // Per the schema's defensive default: unrecognized values fall
  // through to undefined (treated identically to absent / 'free'
  // by the caller). Better to mis-route a typo to the well-tested
  // /generate path than to silently invoke an experimental compiler.
  assert.equal(getFacetForm({ facet_form: 'experimental' }), undefined);
  assert.equal(getFacetForm({ facet_form: 'CANONICAL' }), undefined);  // case-sensitive
  assert.equal(getFacetForm({ facet_form: 42 }), undefined);
  assert.equal(getFacetForm({ facet_form: true }), undefined);
});

test('getFacetForm: non-object input → undefined (defensive)', () => {
  assert.equal(getFacetForm('canonical'), undefined);
  assert.equal(getFacetForm(42), undefined);
  assert.equal(getFacetForm(true), undefined);
  assert.equal(getFacetForm([]), undefined);
});

test('getFacetForm: idempotent (same input → same output)', () => {
  const fm = { facet_form: 'canonical', other: 'kept' };
  assert.equal(getFacetForm(fm), getFacetForm(fm));
});

test('getFacetForm: other frontmatter fields are ignored', () => {
  // Defensive: only facet_form drives the routing decision; other
  // fields are bystander.
  const fm = {
    facet_form: 'canonical',
    type: 'action',
    inputs: ['name'],
    edit_mode: 'english',
    description: 'something',
  };
  assert.equal(getFacetForm(fm), 'canonical');
});
