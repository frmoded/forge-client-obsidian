// v0.2.91 — restore inlined plugin assets to the plugin directory.
// BRAT downloads only main.js + manifest.json + styles.css + data.json
// — the `assets/` directory shipped via release.sh never lands. We
// inline ~1 MB of vault + engine + iframe + welcome content into
// main.js (via scripts/inline-bundled-assets.mjs → bundled-assets.
// generated.ts) and restore the missing files on plugin onload.
//
// Idempotent — only writes files that don't already exist. The dev
// workflow (install-latest.sh) places `assets/` on disk and existing
// files are skipped.
//
// Pyodide + wheels (16 MB + 23 MB) stay disk-only with CDN fallback
// at runtime (see pyodide-host.ts Phase 3 + Phase 4).

import type { App, DataAdapter } from 'obsidian';
import { BUNDLED_ASSETS } from './bundled-assets.generated.ts';

/** Write any inlined asset files that don't already exist under
 *  `<plugin-dir>/assets/`. After this completes, the plugin
 *  directory looks the same as a release.sh-zip install — and the
 *  existing `ensureBundledVault` + Pyodide MEMFS + iframe loader
 *  code paths work unchanged.
 *
 *  Returns the number of files written (0 when dev install already
 *  has everything; ~136 on a fresh BRAT install).
 */
export async function restoreInlinedAssets(
  app: App,
  pluginId: string,
): Promise<number> {
  const adapter = app.vault.adapter;
  const pluginDir = `.obsidian/plugins/${pluginId}`;
  const assetsRoot = `${pluginDir}/assets`;

  // Ensure the assets root exists. mkdir is idempotent via
  // try/catch — Obsidian throws if the dir already exists.
  await safeMkdir(adapter, assetsRoot);

  let written = 0;
  const allFiles = Object.entries(BUNDLED_ASSETS);
  // Sort by depth so parent dirs are created before children when
  // mkdir-ing intermediate paths.
  allFiles.sort(([a], [b]) => a.split('/').length - b.split('/').length);

  for (const [relPath, content] of allFiles) {
    const targetPath = `${assetsRoot}/${relPath}`;
    if (await adapter.exists(targetPath)) {
      continue;  // dev install or prior BRAT restore — skip.
    }
    // Ensure intermediate directories exist.
    const parts = targetPath.split('/');
    parts.pop();  // drop filename
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!(await adapter.exists(dir))) {
        await safeMkdir(adapter, dir);
      }
    }
    await adapter.write(targetPath, content);
    written += 1;
  }

  return written;
}

async function safeMkdir(adapter: DataAdapter, path: string): Promise<void> {
  try { await adapter.mkdir(path); }
  catch {
    // Obsidian's adapter.mkdir throws "Folder already exists" — that's
    // fine. Other errors propagate.
  }
}
