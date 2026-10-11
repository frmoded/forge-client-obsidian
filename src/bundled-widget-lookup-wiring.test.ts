// Drain 2026-10-10-2100 (a) — wiring pins: the Beat Box view and every `html-embed` block find their widget through the tiered,
// bundled-aware lookup (bundled-widget-lookup-core.ts), not through a root-absolute `getAbstractFileByPath`. Source pins with
// comments stripped (this repo's convention for Obsidian-coupled glue), so prose cannot satisfy them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const glue = code(read('src/bundled-widget-lookup.ts'));
const rhythmView = code(read('src/rhythm-edit-view.ts'));
const embedView = code(read('src/html-embed-view.ts'));

test('the glue builds the lookup from the plugin\'s ONE bundled-vault list and its inlined assets — no second list, no literal vault name', () => {
  assert.match(glue, /import \{[^}]*BUNDLED_VAULT_NAMES[^}]*\} from '\.\/bundled-vault-extraction-core\.ts'/);
  assert.match(glue, /import \{[^}]*BUNDLED_ASSETS[^}]*\} from '\.\/bundled-assets\.generated\.ts'/);
  assert.match(glue, /bundledVaultNames: BUNDLED_VAULT_NAMES/);
  assert.ok(!/['"`]music-theory['"`]|['"`]music-core['"`]|['"`]forge-moda['"`]|['"`]forge-tutorial['"`]/.test(glue), 'no hand-spelled vault name');
});

test('the Rhythm Box view resolves its widget through the tiered lookup, and the refusal carries what was searched', () => {
  assert.match(rhythmView, /import \{ resolveWidgetFile \} from '\.\/bundled-widget-lookup\.ts'/);
  assert.match(rhythmView, /await resolveWidgetFile\(this\.app, RHYTHM_BOX_WIDGET_PATH\)/);
  assert.ok(!/getAbstractFileByPath\(RHYTHM_BOX_WIDGET_PATH\)/.test(rhythmView), 'the root-absolute lookup is gone');
  assert.match(rhythmView, /Edit rhythm: the Rhythm Box widget was \$\{widget\.message\}/);
  assert.match(rhythmView, /createSandboxedWidgetIframe\(this\.contentEl, widget\.html, '100%'\)|const html = widget\.html;[\s\S]*createSandboxedWidgetIframe\(this\.contentEl, html, '100%'\)/);
});

test('a note that is not valid rhythm data is still refused BEFORE any widget lookup (refusal not weakened)', () => {
  const mount = rhythmView.slice(rhythmView.indexOf('private async mount('));
  const refuse = mount.indexOf('if (note.ok === false) return this.showRefusal');
  const lookup = mount.indexOf('resolveWidgetFile(');
  assert.ok(refuse > 0 && lookup > refuse, 'invalid rhythm data refuses first');
});

test('html-embed blocks resolve through the same lookup, so piano / guitar / monochord / lute / Rhythm Box open in a normal user vault', () => {
  assert.match(embedView, /import \{ resolveWidgetFile \} from '\.\/bundled-widget-lookup\.ts'/);
  assert.match(embedView, /await resolveWidgetFile\(plugin\.app, parsed\.path\)/);
  assert.ok(!/getAbstractFileByPath\(parsed\.path\)/.test(embedView), 'the root-absolute lookup is gone');
  assert.match(embedView, /html-embed: file not found/);
});

test('html-embed keeps its extension check and empty-file refusal', () => {
  assert.match(embedView, /endsWith\('\.html'\)/);
  assert.match(embedView, /html-embed: target is not an \.html file/);
});
