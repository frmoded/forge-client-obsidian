// Drain 2026-10-10-2100 (a) — the Obsidian-coupled half of the tiered, bundled-aware widget lookup. Every decision lives in
// bundled-widget-lookup-core.ts (tested); this file only supplies its three lookups from the live vault and the plugin's inlined
// assets, in ONE place, so the Beat Box view and the html-embed processor cannot build them differently.
import { TFile } from 'obsidian';
import { BUNDLED_ASSETS } from './bundled-assets.generated.ts';
import { BUNDLED_VAULT_NAMES } from './bundled-vault-extraction-core.ts';
import { resolveBundledAwareFile, type BundledAwareResult } from './bundled-widget-lookup-core.ts';

/** The slice of `app.vault` the lookup needs (structural, like HtmlEmbedHostPlugin — a test or the processor passes its own). */
export interface WidgetVault {
  getAbstractFileByPath(path: string): unknown;
  read(file: never): Promise<string>;
}

export function resolveWidgetFile(app: { vault: WidgetVault }, relPath: string): Promise<BundledAwareResult> {
  const inlined: Record<string, string> = BUNDLED_ASSETS;
  return resolveBundledAwareFile(relPath, {
    bundledVaultNames: BUNDLED_VAULT_NAMES,
    async readVaultFile(p: string): Promise<string | null> {
      const f = app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) return null;
      return app.vault.read(f as never);
    },
    inlinedAsset: (key: string) => (Object.prototype.hasOwnProperty.call(inlined, key) ? inlined[key] : undefined),
  });
}
