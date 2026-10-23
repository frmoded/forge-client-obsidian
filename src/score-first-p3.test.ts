// score_first_experiment (drain 2026-10-21-1100) — PRINCIPLE P3 as a test: "contributions must not harm earlier projects". Behaviour in every vault that does NOT declare
// `profile = "score_first"` is unchanged: the tutorial vault (the Forge output panel stays first class), music-theory, music-core, forge-moda, the lean edition. The key
// absent IS the default.
//
// Two kinds of proof here. Behavioural: every shipped vault's real forge.toml has no profile, and for each of them, in each edition, every score-first decision answers "as
// before" (no Score area, no New bar, the widget fills the pane). The tab's DOM for that answer is byte-identical (live-score-dom.test.ts). Mechanism pins (the docstrings
// say so — if the design moves these SHOULD go red, reassess, don't just rewrite): which files may ask the profile question at all, and that "New bar" is registered only
// after the answer is yes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { isScoreFirstToml, readVaultProfile } from './vault-profile-core.ts';
import { newBarAvailable, scorePanelPlan, widgetFillsPane } from './score-first-core.ts';
import { vaultDeclaresMusic } from './forge-music-gate.ts';
import { isSourceVault } from './source-vault-core.ts';
import { parseLocalImports } from './vault-imports-local-core.ts';
import { BUNDLED_VAULT_NAMES } from './bundled-vault-extraction-core.ts';

const SRC = path.resolve(import.meta.dirname);
const ROOT = path.resolve(SRC, '..');
const VAULTS = path.join(ROOT, 'assets/vaults');
const src = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const code = (f: string) => src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const FIXTURE = path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml');
const SIBLING = path.resolve(ROOT, '../music-playground/forge.toml');
const shippedVaults = () => fs.readdirSync(VAULTS).filter((d) => fs.existsSync(path.join(VAULTS, d, 'forge.toml'))).sort();

test('every vault the plugin ships has NO profile — and so every score-first decision answers "as before" for it, in both editions', () => {
  const vaults = shippedVaults();
  assert.ok(vaults.length >= 2, `non-vacuity: the audit found the shipped vaults (${vaults.join(', ')})`);
  for (const v of vaults) {
    const toml = fs.readFileSync(path.join(VAULTS, v, 'forge.toml'), 'utf8');
    assert.equal(readVaultProfile(toml), null, `${v}: no profile key`);
    const scoreFirst = isScoreFirstToml(toml);
    assert.equal(scoreFirst, false, v);
    for (const edition of ['music', 'lean'] as const) {
      const plan = scorePanelPlan({ scoreFirst, edition });
      assert.equal(plan, 'none', `${v}/${edition}: the Beat Box tab shows nothing under the widget`);
      assert.equal(widgetFillsPane(plan), true, `${v}/${edition}: the widget fills the pane as before`);
    }
    assert.equal(newBarAvailable(scoreFirst), false, `${v}: no "New bar"`);
  }
});

test('non-vacuity: a vault that DOES declare the key flips every one of those answers (the checks above can fail)', () => {
  const toml = 'name = "music-playground"\nversion = "0.0.1"\ndescription = "x"\ndomains = ["music"]\nprofile = "score_first"\n';
  assert.equal(isScoreFirstToml(toml), true);
  assert.equal(scorePanelPlan({ scoreFirst: true, edition: 'music' }), 'score');
  assert.equal(scorePanelPlan({ scoreFirst: true, edition: 'lean' }), 'lean-note');
  assert.equal(widgetFillsPane('score'), false);
  assert.equal(newBarAvailable(true), true);
});

test('the shipped vaults include the ones the principle names (tutorial where present in this edition, music-theory, music-core, forge-moda)', () => {
  const shipped = new Set(shippedVaults());
  for (const name of BUNDLED_VAULT_NAMES) assert.ok(shipped.has(name), `${name} ships in this edition and its forge.toml was audited`);
});

test('a score-first vault is otherwise an ordinary vault to every other forge.toml reader (extraction, imports, domains): the key changes nothing for them', () => {
  const toml = fs.readFileSync(FIXTURE, 'utf8');
  assert.equal(isScoreFirstToml(toml), true);
  assert.equal(vaultDeclaresMusic(toml), true, 'the music gate still sees domains = ["music"]');
  assert.deepEqual(parseLocalImports(toml), [{ name: 'music-core', local: '../music-core' }], 'the import is read through the key');
  assert.equal(isSourceVault(toml, new Set(BUNDLED_VAULT_NAMES)), null, 'not a bundled library\'s source repo: a normal vault');
  // The same text without the key reads the same for every one of those readers.
  const without = toml.replace(/^profile = "score_first"\n/m, '');
  assert.notEqual(without, toml);
  assert.equal(vaultDeclaresMusic(without), vaultDeclaresMusic(toml));
  assert.deepEqual(parseLocalImports(without), parseLocalImports(toml));
  assert.equal(isSourceVault(without, new Set(BUNDLED_VAULT_NAMES)), isSourceVault(toml, new Set(BUNDLED_VAULT_NAMES)));
});

test('MECHANISM PIN: the profile question is asked from exactly three places — the Beat Box tab, the "New bar" registration and the extraction gate (source-vault-core.ts, used by welcome.ts); the Forge output panel, the toolbar and the commands never ask it', () => {
  const askers = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'))
    .filter((f) => /from ['"]\.\/(vault-profile-core|score-first-core|score-first|live-score-core|live-score-dom)\.ts['"]/.test(code(f)))
    .sort();
  // main.ts only registers; the cores/dom import each other.
  // + the extraction gate (drain 2026-10-21-2200). + the phrase tab (M5, drain 2026-10-22-1850), deliberate: phrase-dom.ts reuses the live Score area and phrase-view.ts the Score panel's plan and message
  // line; NEITHER reads the profile — score-first.ts asks once, registers the phrase view and commands only after the answer is yes, and hands the view its plan.
  assert.deepEqual(askers, ['live-score-core.ts', 'live-score-dom.ts', 'main.ts', 'phrase-dom.ts', 'phrase-view.ts', 'rhythm-edit-view.ts', 'score-first.ts', 'source-vault-core.ts'].sort());
  for (const f of ['phrase-dom.ts', 'phrase-view.ts', 'phrase-core.ts', 'phrase-header-core.ts']) assert.ok(!/isScoreFirstVault|vault-profile-core/.test(code(f)), `${f} never asks the profile question`);
  for (const f of ['output-view.ts', 'forge-action.ts', 'edges.ts', 'modal.ts', 'welcome.ts', 'chips.ts', 'rhythm-embed-view.ts', 'rhythm-score-view.ts']) {
    // M4 (drain 2026-10-21-2010), deliberate: the panel may READ the published flag (`messageDelivery.isScoreFirst()` from score-first-messages-core.ts); it still never reads the profile.
    if (fs.existsSync(path.join(SRC, f))) assert.ok(!/vault-profile-core|score-first|isScoreFirstVault/.test(code(f).replace(/score-first-messages-core|messageDelivery\.isScoreFirst\(\)/g, '')), `${f} does not know about profiles`);
  }
  assert.match(code('main.ts'), /registerScoreFirst\(this, /);
  assert.ok(!/isScoreFirstVault|vault-profile-core/.test(code('main.ts')), 'main.ts does not ask the question itself');
});

test('MECHANISM PIN: the Beat Box tab makes ONE profile read and ONE plan, and the widget\'s fill-the-pane rule goes through that plan', () => {
  const view = code('rhythm-edit-view.ts');
  assert.equal((view.match(/isScoreFirstVault\(/g) ?? []).length, 1);
  assert.equal((view.match(/scorePanelPlan\(/g) ?? []).length, 1);
  assert.match(view, /if \(widgetFillsPane\(plan\)\) iframe\.style\.minHeight = '100%'/);
  assert.match(view, /attachScoreArea\(this\.contentEl, plan,/);
  assert.ok(!/minHeight = '100%'/.test(view.replace(/if \(widgetFillsPane\(plan\)\) iframe\.style\.minHeight = '100%'/, '')), 'no other place forces the height');
});

test('MECHANISM PIN: "New bar" (command and ribbon) is registered only AFTER the profile answered yes — never in another vault', () => {
  const body = code('score-first.ts');
  const check = body.indexOf('if (!newBarAvailable(scoreFirst)) return;');
  assert.ok(check > 0, 'the gate exists');
  assert.ok(body.indexOf('plugin.addCommand(') > check, 'the command is registered after the gate');
  assert.ok(body.indexOf('plugin.addRibbonIcon(') > check, 'the ribbon button is registered after the gate');
  assert.match(body, /scoreFirst = await isScoreFirstVault\(app\.vault\)/, 'the answer comes from the one profile reader');
  // M5 (drain 2026-10-22-1850), deliberate: three commands now — "New bar" and the two phrase commands — and the phrase view type; every one of them after the SAME gate.
  // M7 Phase A (drain 2026-10-22-2330), deliberate: four — "New mix from this bar" joins them, registered after the same gate.
  assert.equal((body.match(/plugin\.addCommand\(/g) ?? []).length, 4);
  assert.equal((body.match(/plugin\.registerView\(/g) ?? []).length, 1);
  const lastAddCommand = body.lastIndexOf('plugin.addCommand(');
  assert.ok(body.indexOf('plugin.registerView(') > check && lastAddCommand > check, 'the phrase view and commands are registered after the gate');
  for (const id of ['NEW_PHRASE_COMMAND_ID', 'OPEN_PHRASE_COMMAND_ID', 'NEW_MIX_COMMAND_ID']) assert.ok(body.indexOf(`id: ${id}`) > check, `${id} is registered after the gate`);
  assert.equal((body.match(/plugin\.addRibbonIcon\(/g) ?? []).length, 1);
  assert.ok(!/setSetting|saveSettings|loadData|saveData|processFrontMatter/.test(body), 'no setting, no switch');
});

test('MECHANISM PIN: the Beat Box tab feeds the Score area from the widget\'s edits and from a (re)load, and lets it go with the iframe — if the design moves this SHOULD go red; the real-Chromium run in the FEEDBACK is the behavioural proof', () => {
  const view = code('rhythm-edit-view.ts');
  assert.match(view, /this\.pipeline\?\.submit\(msg\.data\);\s*\n\s*this\.scoreArea\?\.update\(msg\.data\);/, 'an edit message: autosave AND the score follow the widget\'s data');
  assert.match(view, /buildLoadMessage\(note\.value\.data[^\n]*\n\s*this\.scoreArea\?\.showNow\(note\.value\.data\);/, 'a load: the score shows the data the widget was just given');
  assert.match(view, /this\.mountScore\(plan, file, note\.value\.data\);/, 'a mount: the score area is attached once, after the iframe');
  assert.match(view, /private releaseIframe\(\): void \{\s*\n\s*this\.releaseScore\(\);/, 'the score area goes first when the iframe is released (close, switch, refusal, remount)');
  assert.ok(!/vault\.(modify|process|create)|writeNote\(/.test(view.slice(view.indexOf('private mountScore'), view.indexOf('private async sendLoad'))), 'mounting the score writes nothing');
});

test('the profile is a constant: no setting, command, menu item or modal anywhere mentions it', () => {
  const offenders = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'))
    .filter((f) => /score_first|scoreFirst/i.test(code(f)) && !['vault-profile-core.ts', 'score-first-core.ts', 'score-first.ts', 'rhythm-edit-view.ts', 'live-score-core.ts', 'live-score-dom.ts', 'main.ts', 'source-vault-core.ts',
      // M4 (drain 2026-10-21-2010), deliberate: the message router, its two choke points and the Score's message DOM. They read the flag score-first.ts publishes; none reads the profile.
      'score-first-messages-core.ts', 'score-messages-dom.ts', 'forge-notice.ts', 'output-view.ts',
      // M5 (drain 2026-10-22-1850), deliberate: the phrase core, a pure core like score-first-core.ts — it takes the gate's answer as an INPUT (`newPhraseAvailable`) and never reads the profile.
      // 2100, deliberate: phrase-header-core.ts is the same kind of pure core (which note gets the header button; it receives the gate's answer and never reads the profile).
      'phrase-core.ts', 'phrase-header-core.ts',
      // 2026-10-23-0030, deliberate: score-click-policy.ts is the one answer to "does a click on a note play?"; like the M4 files above it READS the flag score-first.ts publishes (messageDelivery.isScoreFirst()) and never the profile.
      'score-click-policy.ts',
      // 2026-10-23-0630, deliberate: phrase-default-view-core.ts is a pure core like phrase-header-core.ts — the gate's answer is an INPUT (`scoreFirst()` port, wired in score-first.ts); it never reads the profile.
      'phrase-default-view-core.ts'].includes(f));
  assert.deepEqual(offenders, []);
  const settingsFiles = fs.readdirSync(SRC).filter((f) => /setting/i.test(f) && f.endsWith('.ts') && !f.endsWith('.test.ts'));
  for (const f of settingsFiles) assert.ok(!/profile/i.test(code(f).replace(/openRhythmNotesInBeatBox/g, '')), `${f} has no profile setting`);
});

// The fixture above is a byte copy of the playground vault's forge.toml, so the tests run where the vault is not checked out. When it IS checked out the two must agree
// (a skip says so by name — a skipped test is not a passing one).
test('the fixture is the playground vault\'s own forge.toml', { skip: fs.existsSync(SIBLING) ? false : `${SIBLING} is not checked out here` }, () => {
  assert.equal(fs.readFileSync(FIXTURE, 'utf8'), fs.readFileSync(SIBLING, 'utf8'));
  assert.equal(isScoreFirstToml(fs.readFileSync(SIBLING, 'utf8')), true);
});

test('MECHANISM PIN (M4): the message router\'s flag is set from ONE place — score-first.ts, from the profile answer — and read only through messageDelivery.isScoreFirst()', () => {
  const setters = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts') && /\.setScoreFirst\(/.test(code(f))).sort();
  assert.deepEqual(setters, ['score-first.ts'], 'only the file that asks the profile question publishes the answer');
  assert.match(code('score-first.ts'), /messageDelivery\.setScoreFirst\(scoreFirst\)/);
  for (const f of ['forge-notice.ts', 'output-view.ts', 'main.ts']) assert.ok(/messageDelivery\.isScoreFirst\(\)/.test(code(f)), `${f} consults the published flag`);
});
