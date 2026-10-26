// 2026-10-23-0030 — MECHANISM PINS for the click-to-play policy. The behaviour is proven in score-click-play-dom.test.ts (the handler) and in real Chrome (scripts/dev/measure-phrase.ts); these pin the WIRING
// that a happy-dom test cannot reach: every surface that engraves a Score hands the same policy to the renderer, and the renderer routes its click through the one handler. If the design moves, these SHOULD go red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SRC = import.meta.dirname;
const code = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('every caller of renderTaggedMusicXML passes the click-to-play policy: the Beat Box tab, the phrase tab, the read-only Score view, the embed and the Forge output panel', () => {
  const callers = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts') && /\.renderTaggedMusicXML\(/.test(code(f))).sort();
  assert.deepEqual(callers, ['output-view.ts', 'phrase-view.ts', 'rhythm-edit-view.ts', 'rhythm-embed-view.ts', 'rhythm-score-view.ts'], 'a new caller must decide too');
  for (const f of callers) {
    const calls = code(f).match(/\.renderTaggedMusicXML\([^;]*\)/g) ?? [];
    assert.ok(calls.length > 0);
    // 2026-10-26-1100, deliberate: a surface may pass more options after the policy (the phrase tab passes its zoom memory and the follower's trace); the POLICY must still be there
    for (const c of calls) assert.match(c, /\{\s*clickToPlay:\s*scoreClickPlays\s*(,[^}]*)?\}/, `${f}: ${c}`);
    assert.match(code(f), /import \{ scoreClickPlays \} from '\.\/score-click-policy\.ts'/, `${f} imports the one policy`);
  }
});

test('the music edition routes the Score click through attachClickToPlay and threads the option down to it; the lean edition has no click at all', () => {
  const full = code('music-edition.full.ts');
  assert.match(full, /attachClickToPlay\(scoreWrap, player,/);
  assert.ok(!/player\.start\(\)/.test(full), 'the edition itself never calls player.start()');
  assert.match(full, /renderTaggedMusicXML\(entry, result, snippetId, opts\)/);
  assert.match(full, /renderMusicXMLWithToggle\(entry, r\.multi_staff_content, r\.kit_content, snippetId, engineMidi, opts\)/);
  assert.match(full, /allowed: opts\.clickToPlay/);
  assert.match(code('music-edition.ts'), /clickToPlay\?: \(\) => boolean/);
  assert.ok(!/addEventListener\('click'/.test(code('music-edition.lean.ts')));
});

test('the policy module reads only the published flag, never the profile', () => {
  const policy = code('score-click-policy.ts');
  assert.match(policy, /messageDelivery\.isScoreFirst\(\)/);
  assert.ok(!/vault-profile-core|isScoreFirstVault/.test(policy));
});

test('the policy reaches the click handler on EVERY render path: the single score, and the kit and multi-staff views of a percussion score', () => {
  const full = code('music-edition.full.ts');
  assert.match(full, /renderMusicXML\(entry, r\.content as string, snippetId, undefined, undefined, undefined, opts\)/, 'single-XML score');
  assert.match(full, /renderMusicXML\(scoreHost, kitXml, snippetId, multiStaffXml, shared \?\? undefined, zoomBarHost, opts\)/, 'kit view');
  assert.match(full, /renderMusicXML\(scoreHost, multiStaffXml, snippetId, undefined, shared \?\? undefined, zoomBarHost, opts\)/, 'multi-staff view');
  assert.match(full, /opts: RenderOptions = \{\},\n\) \{\n  const host = entry\.createDiv\(\{ cls: 'forge-output-musicxml' \}\);/, 'the inner renderer takes the options');
});
