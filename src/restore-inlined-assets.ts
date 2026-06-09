// v0.2.91 — restore inlined plugin assets to the plugin directory.
// BRAT downloads only main.js + manifest.json + styles.css + data.json
// — the `assets/` directory shipped via release.sh never lands. We
// inline ~1 MB of vault + engine + iframe + welcome content into
// main.js (via scripts/inline-bundled-assets.mjs → bundled-assets.
// generated.ts) and restore the missing files on plugin onload.
//
// v0.2.98 — version-stamped. A sentinel file at
// `<plugin-dir>/assets/.bundle-version` records the plugin version
// that last restored the assets. On every onload we compare it to
// BUNDLED_ASSETS_VERSION (baked in at build time). Mismatch ⇒
// overwrite every inlined file. Match ⇒ skip (fast path).
//
// Why force-overwrite on mismatch: BRAT bumps main.js but never
// touches the already-existing `assets/` files. Before the version
// stamp, a stale iframe/engine from v0.2.96 would survive a v0.2.97
// update and the user would see the old UI under new plugin code.
// That actually happened — the "Run simulation" button removal in
// v0.2.97 wasn't visible because the iframe HTML on disk never got
// rewritten.
//
// Pyodide + wheels (16 MB + 23 MB) stay disk-only with CDN fallback
// at runtime (see pyodide-host.ts Phase 3 + Phase 4).

import type { App, DataAdapter } from 'obsidian';
import {
  BUNDLED_ASSETS,
  BUNDLED_ASSETS_VERSION,
} from './bundled-assets.generated.ts';

const SENTINEL_FILE = '.bundle-version';

/** Write inlined asset files under `<plugin-dir>/assets/`. After
 *  this completes, the plugin directory looks the same as a
 *  release.sh-zip install — and the existing `ensureBundledVault` +
 *  Pyodide MEMFS + iframe loader code paths work unchanged.
 *
 *  Idempotent across plugin versions via the .bundle-version
 *  sentinel: if the sentinel matches BUNDLED_ASSETS_VERSION, the
 *  whole restore is skipped. If it's missing (fresh BRAT install)
 *  or stale (plugin update), every file is force-overwritten.
 *
 *  Returns the number of files written (0 on version match;
 *  ~137 on fresh install or version bump).
 */
export async function restoreInlinedAssets(
  app: App,
  pluginId: string,
): Promise<number> {
  const adapter = app.vault.adapter;
  const pluginDir = `.obsidian/plugins/${pluginId}`;
  const assetsRoot = `${pluginDir}/assets`;
  const sentinelPath = `${assetsRoot}/${SENTINEL_FILE}`;

  // Ensure the assets root exists. mkdir is idempotent via
  // try/catch — Obsidian throws if the dir already exists.
  await safeMkdir(adapter, assetsRoot);

  // Version check fast path: if the sentinel matches, every file we
  // would write has already been written by this plugin version.
  // Skip the whole walk.
  if (await adapter.exists(sentinelPath)) {
    try {
      const onDisk = (await adapter.read(sentinelPath)).trim();
      if (onDisk === BUNDLED_ASSETS_VERSION) {
        return 0;
      }
      console.log(
        `Forge: bundled-assets version changed (${onDisk} → `
        + `${BUNDLED_ASSETS_VERSION}); overwriting inlined files.`,
      );
    } catch {
      // Sentinel exists but couldn't be read — fall through to
      // overwrite. Conservative: never leave a stale disk copy
      // when we're not sure.
    }
  }

  let written = 0;
  const allFiles = Object.entries(BUNDLED_ASSETS);
  // Sort by depth so parent dirs are created before children when
  // mkdir-ing intermediate paths.
  allFiles.sort(([a], [b]) => a.split('/').length - b.split('/').length);

  for (const [relPath, content] of allFiles) {
    const targetPath = `${assetsRoot}/${relPath}`;
    // Ensure intermediate directories exist.
    const parts = targetPath.split('/');
    parts.pop();  // drop filename
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!(await adapter.exists(dir))) {
        await safeMkdir(adapter, dir);
      }
    }
    // v0.2.98 — force-write. The previous skip-if-exists guard
    // silently preserved stale iframe/engine across plugin updates.
    await adapter.write(targetPath, content);
    written += 1;
  }

  // Stamp the version after a successful restore so the next
  // onload can take the fast path.
  await adapter.write(sentinelPath, BUNDLED_ASSETS_VERSION);

  return written;
}

async function safeMkdir(adapter: DataAdapter, path: string): Promise<void> {
  try { await adapter.mkdir(path); }
  catch {
    // Obsidian's adapter.mkdir throws "Folder already exists" — that's
    // fine. Other errors propagate.
  }
}
