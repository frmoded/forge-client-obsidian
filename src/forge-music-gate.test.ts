// Pure-core tests for forge-music-gate.ts. The regex is load-bearing:
// false positive → forge-music extracted into a vault that didn't ask
// for it; false negative → user toggled music on, modal succeeded, but
// no content extracted and they wonder why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultDeclaresMusic } from './forge-music-gate.ts';

test('vaultDeclaresMusic: single-domain ["music"] matches', () => {
  assert.equal(vaultDeclaresMusic('domains = ["music"]\n'), true);
});

test('vaultDeclaresMusic: multi-domain with music matches', () => {
  // Order shouldn't matter.
  assert.equal(vaultDeclaresMusic('domains = ["moda", "music"]\n'), true);
  assert.equal(vaultDeclaresMusic('domains = ["music", "moda"]\n'), true);
});

test('vaultDeclaresMusic: empty domains does NOT match', () => {
  // The v0.2.14 stub forge.toml writes this exact line. Must NOT
  // accidentally trigger forge-music extraction.
  assert.equal(vaultDeclaresMusic('domains = []\n'), false);
});

test('vaultDeclaresMusic: other domain without music does NOT match', () => {
  assert.equal(vaultDeclaresMusic('domains = ["moda"]\n'), false);
  assert.equal(vaultDeclaresMusic('domains = ["other", "things"]\n'), false);
});

test('vaultDeclaresMusic: commented-out music declaration does NOT match', () => {
  // A user who removed music from domains but kept the comment line
  // shouldn't get the extraction.
  assert.equal(vaultDeclaresMusic('# domains = ["music"]\n'), false);
  // Mixed: an active empty domains line + a commented music example —
  // the active line wins.
  const body = '# domains = ["music"]\ndomains = []\n';
  assert.equal(vaultDeclaresMusic(body), false);
});

test('vaultDeclaresMusic: missing domains line does NOT match', () => {
  assert.equal(vaultDeclaresMusic('# just a comment\n'), false);
  assert.equal(vaultDeclaresMusic(''), false);
});

test('vaultDeclaresMusic: whitespace tolerance', () => {
  // Various inter-character whitespace patterns should all match.
  assert.equal(vaultDeclaresMusic('domains=["music"]\n'), true);
  assert.equal(vaultDeclaresMusic('domains  =  [ "music" ]\n'), true);
  assert.equal(vaultDeclaresMusic('domains\t=\t["music"]\n'), true);
});

test('vaultDeclaresMusic: realistic v0.2.14 stub then user edit', () => {
  // Simulates the full flow: stub written at first-run, user later
  // edits to add music. The whole TOML body (comments + active line)
  // gets checked.
  const body = `# Forge vault manifest
# This file declares which domain libraries this vault depends on.
# For V1 closed beta, leave empty — forge-moda is pre-bundled into
# the plugin and available without being declared here.

domains = ["music"]

# When v1.1+ ships additional domains (e.g. "music"), add them to
# the list above, e.g.:
# domains = ["music"]
`;
  assert.equal(vaultDeclaresMusic(body), true);
});

test('vaultDeclaresMusic: substring "music" inside a different domain name does NOT spuriously match', () => {
  // E.g. a hypothetical "musical" domain shouldn't trigger the
  // music extraction. The regex requires the exact quoted string
  // "music" — verify the boundary.
  assert.equal(vaultDeclaresMusic('domains = ["musical"]\n'), false);
  assert.equal(vaultDeclaresMusic('domains = ["amusic"]\n'), false);
});
