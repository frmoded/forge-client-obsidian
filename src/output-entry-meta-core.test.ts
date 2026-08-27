import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderEntryMeta, GENERIC_ATTRIBUTION } from './output-entry-meta-core.ts';

test('a generic plugin message renders with no meta line', () => {
  assert.equal(shouldRenderEntryMeta('Forge'), false);
  assert.equal(shouldRenderEntryMeta(GENERIC_ATTRIBUTION), false);
});

test('a real snippet id keeps its attribution', () => {
  // Non-vacuity: if this ever returns false the fix has eaten the useful
  // case, which is the half the driver did NOT complain about.
  for (const id of ['greeting', 'mood', '03-functions/cheer', 'registry-inventory']) {
    assert.equal(shouldRenderEntryMeta(id), true, `${id} lost its attribution`);
  }
});

test('blank and whitespace attributions render bare rather than as an empty header', () => {
  assert.equal(shouldRenderEntryMeta(''), false);
  assert.equal(shouldRenderEntryMeta('   '), false);
  assert.equal(shouldRenderEntryMeta(' Forge '), false);
});

test('the generic literal has ONE definition', () => {
  // It previously lived in two default parameters and was compared
  // nowhere; a third caller spelling it differently would silently get a
  // meta line back.
  assert.equal(GENERIC_ATTRIBUTION, 'Forge');
});
