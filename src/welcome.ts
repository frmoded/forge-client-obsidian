import { App, DataAdapter, TFile, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import { copyDirRecursive } from './copy-dir-core.ts';
import { ensureForgeTomlStub } from './forge-toml-stub.ts';
import { shouldSweepLegacyBakDir } from './rolling-backup-core.ts';
import {
  ensureBundledVaultCore,
  extractedIdsPath,
  parseExtractedIds,
  serializeExtractedIds,
  manifestOfBundleDir,
  sweepBundleDroppedCore,
  type ExtractorAdapter,
} from './bundled-vault-extractor-core.ts';
import {
  formatLibraryNotice,
  manifestsPath,
  parseManifests,
  serializeManifests,
  type ManifestStore,
} from './bundled-library-manifest-core.ts';
import { BUNDLED_ASSETS_CONTENT_ID } from './bundled-assets.generated.ts';
import { isReservedDirName } from './vault-mount-exclusions-core.ts';
import { ensureWelcomeFiles } from './welcome-files-core.ts';
import { extractionSkipFor, isSourceVault, shouldSkipBundledExtract, skipWhy } from './source-vault-core.ts';
import { shouldCreateLegacyWelcomeMd } from './welcome-legacy-gate-core.ts';
import { classifyWelcomeShape, shouldRefreshWelcome } from './welcome-shape-classifier-core.ts';
import {
  bundledVaultsRoot,
  bundledWelcomePaths,
  sourceVaultNames,
  deriveBundledVaultNames,
  type DerivedBundledVaults,
} from './bundled-vault-extraction-core.ts';
import {
  LEGACY_MUSIC_DIR,
  LEGACY_MUSIC_BACKUP_DIR,
  LEGACY_MUSIC_VARIANT_DIR,
  decideLegacyMusicRename,
  legacyMusicRenameNotice,
  legacyVariantRenameNotice,
} from './legacy-music-rename-core.ts';
export { copyDirRecursive };

// v0.2.64 — the auto-extract path may detect that the vault IS a
// bundled library's source repo. Drain 2026-08-22-0920: the name set
// used for that check is no longer spelled here (nor duplicated in
// chips.ts, which used to carry an "intentional duplication" copy) —
// both import the one constant.

/** Read the vault root's `forge.toml` (if any) and return the matched
 *  bundled-library identity when the vault IS that library's source
 *  repo. v0.2.64 — used by ensureBundled* + ensureWelcomeFiles gates
 *  to skip auto-extract on source repos (per brief (e)). Defensive:
 *  missing/unreadable forge.toml → null (treat as a normal vault). */
async function detectSourceVault(adapter: DataAdapter, pluginDir: string): Promise<string | null> {
  try {
    if (!(await adapter.exists('forge.toml'))) return null;
    const body = await adapter.read('forge.toml');
    // Drain 2026-10-12-1700 §3: NOT the edition-only BUNDLED_VAULT_NAME_SET. Extraction extracts whatever the plugin folder carries,
    // so the gate must know every name extraction could extract: all editions' names plus the folder listing.
    let listed: string[] = [];
    try {
      listed = (await adapter.list(bundledVaultsRoot(pluginDir)))?.folders ?? [];
    } catch { /* an unreadable bundle dir still leaves every edition's names */ }
    // Drain 2026-10-21-2200: one question for every extraction gate — a library's own source repo, OR a score-first vault (profile = "score_first").
    return extractionSkipFor(isSourceVault(body, sourceVaultNames(listed)), body);
  } catch (e) {
    console.error('Forge: detectSourceVault read failed', e);
    return null;
  }
}

// .forge/ is managed by Forge — safe to write cache, logs, future state files here.
const SENTINEL_DIR = '.forge';
const SENTINEL_PATH = '.forge/initialized';
const WELCOME_PATH = 'Welcome.md';

// v0.2.230 — refreshed for V2 vocabulary (drain 2026-07-02-1330).
// Snippets → notes (library + vault). English/Python facet talk
// replaced with Description → Recipe → Python flow. Cohort writes
// Description; /generate produces a Recipe; Forge-click compiles
// the Recipe to Python and runs it.
const WELCOME_NOTE = `# Welcome to Forge

Forge runs Python simulations and code authoring entirely inside
Obsidian — no terminal, no server, no Python install.

## Try the simulator (no setup needed)

1. **Cmd+P** → "Forge: Open MoDa simulation".
2. A particle canvas opens with ~500 water particles.
3. Click **Run simulation** in the panel header. After a few seconds,
   ink dispersions render over the water — that's a 300-tick
   simulation playing back.

If you see the ink, the full Forge stack is working.

## Write your own note

A Forge **note** has three facets — Description (what you mean),
Recipe (the structured plan, generated for you), and Python (compiled
from the Recipe and run by the engine).

1. Make a new note in this vault — e.g. **\`hello.md\`**.
2. Paste this as the file's contents:

   \`\`\`
   ---
   type: action
   inputs:
     - name
   ---

   # Description

   Print "hello " followed by the name.
   \`\`\`

3. Click the **Forge this note** button (the hammer) at the top of the
   editor. Paste your transpile token if prompted (Settings → Forge →
   Transpile service → Transpile service token).
4. Forge calls the hosted transpile service, generates a Recipe from
   your Description, compiles it to Python, and writes it back into
   the note. It then opens the **Forge** panel with this note's inputs
   ready — but it does NOT run yet. Building and running are two
   gestures.
5. Press **Run** in the Forge panel to execute. The result renders
   there. Change an input and press Run again — you only need to Forge
   again when you change the note itself.

## Library notes vs vault notes

Notes come in two flavors:
- **Library notes** ship with Forge in \`forge.<domain>.lib\` (the
  engine-provided primitives — \`print\`, \`bar\`, \`voices\`, etc.).
  Cmd-click a wikilink like \`[[print]]\` in a Recipe to read its
  Description + Python source (read-only).
- **Vault notes** are notes you author in this vault. Press **Run** in
  the Forge panel to execute one; edit them freely. (The note toolbar's
  hammer forges — derives Recipe and Python — and hands the panel a
  primed note; it does not run.)

In a Recipe, \`Call [[name]]\` resolves to a library note OR a vault
note of the same basename. Library notes from the active domains are
always available — Cmd-click a \`[[name]]\` wikilink to read one.

## What you'll find in this vault

The bundled **forge-moda** library has been copied into a
\`forge-moda/\` folder above. Read those notes to see how the
simulation is built; edit them to experiment.

Edit or delete this Welcome note anytime — Forge won't recreate it.
`;

export async function runFirstRunCheck(app: App, pluginDir: string): Promise<void> {
  const adapter = app.vault.adapter;
  console.log('Forge: runFirstRunCheck starting');

  try {
    const hasSentinel = await adapter.exists(SENTINEL_PATH);
    console.log('Forge: sentinel exists?', hasSentinel);

    // v0.2.64 — detect source-vault BEFORE any auto-extract decision
    // (per brief (e)). When the vault root's forge.toml declares
    // `name = "forge-music"` or `name = "forge-moda"`, this IS the
    // library's source repo; auto-extracting bundled content INTO
    // the source tree just pollutes git status. The detection result
    // gates the three extract call sites below.
    //
    // v0.2.69 — moved BEFORE the sentinel block so the legacy
    // capital-W Welcome.md create path (below) can ALSO consult the
    // gate. Pre-v0.2.69 the lowercase ensureWelcomeFiles path was
    // gated but the older capital-W path was not, so source vaults
    // got a phantom Welcome.md each first run. Bug 1 fix.
    const sourceVaultName = await detectSourceVault(adapter, pluginDir);

    // Welcome-note + sentinel: gated by the existing sentinel check
    // AND, v0.2.69, the source-vault gate so opening forge-music's
    // source repo as a vault doesn't drop a phantom Welcome.md at the
    // repo root. Sentinel write still fires even for source vaults —
    // idempotency preserved (no re-check on subsequent reloads).
    if (!hasSentinel) {
      if (shouldCreateLegacyWelcomeMd(hasSentinel, sourceVaultName)) {
        const hasWelcome = await adapter.exists(WELCOME_PATH);
        console.log('Forge: Welcome.md exists?', hasWelcome);
        if (!hasWelcome) {
          await app.vault.create(WELCOME_PATH, WELCOME_NOTE);
          console.log('Forge: created Welcome.md');
        }
      } else {
        console.log(
          `Forge: skipping legacy Welcome.md create — ${skipWhy(sourceVaultName!)}`,
        );
      }

      if (!(await adapter.exists(SENTINEL_DIR))) {
        await adapter.mkdir(SENTINEL_DIR);
      }
      await adapter.write(SENTINEL_PATH, '1');
      console.log('Forge: wrote sentinel');
    }

    // v0.2.56: extract bundled welcome.md + greet.md to vault root
    // when both are absent. Per the 2026-06-05-1145 prompt: the
    // user's first action after install becomes a Forge-click on
    // welcome.md that produces "Welcome to Forge.\nHello world"
    // in the output panel — Mission's "low floor" property as a
    // concrete artifact. Idempotent + respectful of partial deletion
    // (if user kept greet.md, we don't restore welcome).
    //
    // Order: welcome BEFORE moda — welcome is the lower floor.
    //
    // v0.2.64 — skipped entirely when vault is a source repo for any
    // bundled library (per brief (e)). Source repos are dev workflows,
    // not first-Forge-click introductions.
    if (shouldSkipBundledExtract(sourceVaultName)) {
      console.log(
        `Forge: skipping welcome.md extraction — ${skipWhy(sourceVaultName!)}`,
      );
    } else {
      try {
        const welcomePaths = bundledWelcomePaths(pluginDir);
        const result = await ensureWelcomeFiles(adapter, {
          welcomeBundle: welcomePaths.welcome,
          greetBundle: welcomePaths.greet,
        });
        if (result.kind === 'extracted') {
          console.log('Forge: extracted welcome.md + greet.md to vault root');
        } else if (result.kind === 'skip-no-bundle') {
          console.warn(`Forge: bundled welcome asset missing (${result.missing}); skipping welcome extraction`);
        } else if (result.kind === 'error') {
          console.warn(`Forge: ensureWelcomeFiles failed — ${result.message}`);
        }
        // 'skip-existing' is the steady-state expected path; silent.
      } catch (e) {
        console.error('Forge: ensureWelcomeFiles threw unexpectedly', e);
      }

      // v0.2.233 — refresh outdated welcome notes (drain
      // 2026-07-02-1630). Existing cohort users have .forge-sentinel
      // from their first install, so ensureWelcomeFiles above is a
      // no-op for them. They never see the v0.2.230 V2 vocabulary
      // refresh of welcome.md/greet.md. Sweep + refresh any V1-shape
      // or Obsidian-default welcome files left behind.
      try {
        await refreshOutdatedWelcomes(app, adapter, pluginDir);
      } catch (e) {
        console.error('Forge: refreshOutdatedWelcomes failed', e);
      }
    }

    // v0.2.13: extract bundled forge-moda content if the vault
    // doesn't have it. Independent of the sentinel — covers both
    // fresh vaults (sentinel absent) AND upgrade-without-content
    // vaults (sentinel present but vault has no forge-moda dir
    // yet, e.g. a vault initialized before forge-moda was bundled).
    //
    // v0.2.64 — skipped when vault IS forge-moda's source repo.
    // v0.2.66 — symmetric gate per brief (e) followup: skip when vault
    // is ANY known source repo, not just same-name. forge-music's repo
    // (`name = "forge-music"`) was still getting forge-moda extracted
    // into it under v0.2.64's narrow same-name gate.
    // v0.2.14: write a minimal forge.toml at the vault root if
    // missing. Pre-empts the InitializeForgeVaultWizard auto-open
    // trigger on fresh-vault first ribbon click. Independent of the
    // sentinel, same as the bundled extraction below.
    try {
      const wrote = await ensureForgeTomlStub(adapter);
      if (wrote) console.log('Forge: wrote V1 stub forge.toml');
    } catch (e) {
      console.error('Forge: ensureForgeTomlStub failed', e);
    }

    // v0.2.262 drain 1310 — migrateChipsMdToV2 removed. `_chips.md`
    // schema retired in drain 1300 (v0.2.259). Cohort vaults still
    // carrying `_chips.md` files see them ignored by the palette
    // discovery + eventually replaced by bundled re-extract (which no
    // longer contains them).

    // Drain 2026-08-21-2300: extract EVERY vault the bundle carries,
    // derived from assets/vaults/ itself. Replaces three hand-written
    // call sites (forge-moda, forge-tutorial, and a music pair gated
    // on `domains = ["music"]`). The gate is why a fresh BRAT install
    // got two of four vaults: the v0.2.14 stub declares no domains,
    // so music-theory/music-core never reached extraction and the
    // sweep reported their roots missing.
    //
    // v0.2.64/v0.2.66 source-vault gate still applies: a vault that
    // IS a bundled library's source repo gets nothing extracted into
    // it.
    let libraryPass: LibraryPassSummary = { leftEdited: {}, keptEdited: {}, removed: {} };
    if (shouldSkipBundledExtract(sourceVaultName)) {
      console.log(
        `Forge: skipping bundled-vault extraction — ${skipWhy(sourceVaultName!)}`,
      );
    } else {
      libraryPass = await ensureAllBundledVaults(app, pluginDir);
    }

    // v0.2.262 drain 1310 — migrateChipsMdToV2 removed alongside
    // forge-moda counterpart above. `_chips.md` schema retired.

    // v0.2.229 — sweep bundle-dropped files (closes Pebble 1, drain
    // 2026-07-02-0930). When a bundled-vault version drops files
    // (forge-music v0.7.0 → 8 engineer-mode notes promoted to library
    // functions), the version-aware ensureBundledVault above handles
    // the case if drift is detected. But cohort vaults that hit the
    // 'match' path (e.g. forge.toml was bumped via the v0.2.221
    // re-extract command without the drop sync) keep stragglers. This
    // per-file diff sweep catches the gap regardless of how the
    // version compared. Source-vault gate respected — if vault IS a
    // bundled library's repo, we don't sweep INTO the repo.
    if (!shouldSkipBundledExtract(sourceVaultName)) {
      try {
        // Drain 2026-10-11-0900 §2 — MANIFEST-based: only a file the plugin extracted, that is gone from the bundle, and is still
        // byte-identical to what it wrote is trashed. A user's own note (never in the manifest) survives every launch.
        const manifestsBefore = await readManifestStore(adapter, pluginDir);
        const manifests: ManifestStore = { ...manifestsBefore };
        const removed: Record<string, string[]> = { ...libraryPass.removed };
        const keptEdited: Record<string, string[]> = { ...libraryPass.keptEdited };
        const sweepTargets = (await listBundledVaultNames(adapter, pluginDir)).names;
        for (const lib of sweepTargets) {
          const r = await sweepBundleDroppedFiles(
            app,
            `${bundledVaultsRoot(pluginDir)}/${lib}`,
            lib,
            manifestsBefore[lib] ?? null,
          );
          if (r.next !== null) manifests[lib] = r.next;
          if (r.trashed.length > 0) {
            console.log(`Forge: ${lib} bundle-dropped sweep moved ${r.trashed.length} unedited extracted file(s) to trash: ${r.trashed.join(', ')}`);
            removed[lib] = [...(removed[lib] ?? []), ...r.trashed];
          }
          if (r.keptEdited.length > 0) keptEdited[lib] = [...(keptEdited[lib] ?? []), ...r.keptEdited];
        }
        await writeManifestStore(adapter, pluginDir, manifestsBefore, manifests);
        // ONE Notice for the whole pass: what was moved to the trash, and what was left alone because the user had edited it.
        const notice = formatLibraryNotice({ leftEdited: libraryPass.leftEdited, keptEdited, removed });
        if (notice !== null) new Notice(notice, 14000);
      } catch (e) {
        console.error('runFirstRunCheck: bundle-dropped sweep failed', e);
      }
    }
    // v0.2.106 — sweep accumulated `<lib>.bak.<version>` directories
    // from pre-v0.2.106 re-extracts. One-shot per-onload pass; cheap
    // when the user has none (just lists vault root).
    try {
      await sweepLegacyBakDirs(adapter);
    } catch (e) {
      console.error('runFirstRunCheck: legacy .bak sweep failed', e);
    }
  } catch (e) {
    console.error('Forge: runFirstRunCheck failed', e);
  }
}

/** v0.2.106 — sweep pre-existing `<lib>.bak.<version>` directories
 *  from past renameWithBackup calls. One-shot cleanup so users who
 *  upgraded across the 0.2.39 → 0.2.106 span don't carry permanent
 *  backup-dir litter at vault root. Only matches the specific
 *  `forge-{moda,tutorial}.bak.*` shape to avoid touching user-named
 *  directories that happen to contain `.bak`.
 *
 *  v0.2.333 Phase 5 — 'forge-music' REMOVED from the candidates: the
 *  two-vault split parks a pre-rename forge-music/ dir at
 *  forge-music.bak.legacy/ deliberately (non-destructive, user-owned
 *  cleanup). Sweeping forge-music.bak.* here would permanently rmdir
 *  that parked copy on next load. Old forge-music.bak.<version>
 *  litter (if any survives the v0.2.106 delete-on-extract era) now
 *  stays too — acceptable trade for not destroying the legacy park.
 *
 *  Drain 2026-08-25-0120 — the CURRENT rolling backup
 *  (`<vault>.bak.previous/`) is explicitly exempt. This sweep only
 *  clears v0.2.39-era `<vault>.bak.<version>/` litter. */
async function sweepLegacyBakDirs(adapter: DataAdapter): Promise<number> {
  const candidates = [
    'forge-moda',
    'forge-tutorial',
  ];
  let removed = 0;
  // adapter.list returns { folders: string[]; files: string[] } at
  // the given path; "/" lists vault root.
  try {
    const root = await adapter.list('/');
    if (!root?.folders) return 0;
    for (const folder of root.folders) {
      const name = folder.split('/').filter(Boolean).pop() ?? '';
      // Drain 2026-08-25-0120 — `shouldSweepLegacyBakDir` excludes the
      // rolling backup, which has the same `<vault>.bak.` prefix. This
      // sweep runs on EVERY onload; without the carve-out it destroys
      // the backup the previous re-extract just made.
      if (!shouldSweepLegacyBakDir(name, candidates)) continue;
      try {
        await adapter.rmdir(folder, true);
        removed += 1;
      } catch (e) {
        console.error(`sweepLegacyBakDirs: failed to sweep ${folder}`, e);
      }
    }
  } catch (e) {
    console.error('sweepLegacyBakDirs: vault root list failed', e);
  }
  if (removed > 0) {
    console.log(`Forge: swept ${removed} legacy .bak directory/ies from vault root`);
  }
  return removed;
}

// Drain 2026-10-10-2100 (b) — the per-vault extraction routine (version compare, rolling backup, first-install copy, and the new
// content-identity "add missing files" pass) moved to bundled-vault-extractor-core.ts so a real extraction can be tested without
// `obsidian`. See that file's header for the behaviour matrix.

/** The vaults to extract: the EDITION's name table, filtered to what the plugin bundle physically carries (drain 2026-10-13-2100 §3 —
 *  the edition decides, never the disk listing). Falls back to the whole table (and says so) if the listing comes back empty,
 *  rather than extracting nothing. */
async function listBundledVaultNames(
  adapter: DataAdapter,
  pluginDir: string,
): Promise<DerivedBundledVaults> {
  const vaultsRoot = bundledVaultsRoot(pluginDir);
  let folders: string[] | undefined;
  try {
    const listed = await adapter.list(vaultsRoot);
    folders = listed?.folders;
  } catch (e) {
    console.error('Forge: listing bundled vaults failed', e);
  }
  const derived = deriveBundledVaultNames(folders);
  if (derived.source === 'fallback') {
    console.warn(
      `Forge: could not list ${vaultsRoot}; falling back to ` +
      `the built-in vault list [${derived.names.join(', ')}]`,
    );
  }
  return derived;
}

/** Drain 2026-08-08-1200 / v0.2.333 Phase 5 — park a pre-rename
 *  forge-music/ (or forge-music.legacy/) dir before any extraction.
 *  Runs unconditionally: a leftover legacy dir collides with the
 *  music-theory bundle at snippet discovery regardless of what the
 *  vault declares (driver's foo vault: domains=["moda"] but
 *  forge-music.legacy/ present). */
async function parkLegacyMusicDirs(adapter: DataAdapter): Promise<void> {
  const action = decideLegacyMusicRename({
    oldExists: await adapter.exists(LEGACY_MUSIC_DIR),
    backupExists: await adapter.exists(LEGACY_MUSIC_BACKUP_DIR),
    legacyVariantExists: await adapter.exists(LEGACY_MUSIC_VARIANT_DIR),
  });
  if (action === 'rename') {
    await adapter.rename(LEGACY_MUSIC_DIR, LEGACY_MUSIC_BACKUP_DIR);
    console.log(
      `Forge: parked pre-rename ${LEGACY_MUSIC_DIR}/ at ` +
      `${LEGACY_MUSIC_BACKUP_DIR}/ (two-vault split, v0.2.333)`,
    );
    new Notice(legacyMusicRenameNotice(), 12000);
  } else if (action === 'rename-legacy-variant') {
    await adapter.rename(LEGACY_MUSIC_VARIANT_DIR, LEGACY_MUSIC_BACKUP_DIR);
    console.log(
      `Forge: parked ${LEGACY_MUSIC_VARIANT_DIR}/ at ` +
      `${LEGACY_MUSIC_BACKUP_DIR}/ (no .bak. segment — it defeated ` +
      `the engine's backup-dir exclusion; drain 2026-08-08-1200)`,
    );
    new Notice(legacyVariantRenameNotice(), 12000);
  } else if (action === 'skip-backup-exists') {
    // A legacy dir AND an earlier park both exist — refuse to
    // clobber the backup. The leftover dir is neutralized by the
    // MEMFS mount-skip list (pyodide-host.ts); for forge-music/ the
    // engine's .bak.-dir discovery exclusion also applies.
    console.log(
      `Forge: a legacy music dir (${LEGACY_MUSIC_DIR}/ or ` +
      `${LEGACY_MUSIC_VARIANT_DIR}/) is present but ` +
      `${LEGACY_MUSIC_BACKUP_DIR}/ already exists; leaving both`,
    );
  }
}

/** Extract every bundled vault into the user's vault, version-aware
 *  per vault via ensureBundledVault (skip when already at the bundled
 *  version, re-extract on drift, copy when absent).
 *
 *  Drain 2026-08-21-2300 — was three helpers, one of which
 *  (ensureBundledMusicVaults) additionally required the vault's
 *  forge.toml to declare the "music" domain. That opt-in dated from
 *  v0.2.15, when music wasn't on the curriculum; it meant a fresh
 *  BRAT install shipped music-theory + music-core in the bundle and
 *  then never extracted them. The set now comes from the bundle.
 *
 *  Per-vault try/catch: one failing vault must not strand the rest,
 *  and none of them are fatal to plugin load. */
/** What an extraction pass left alone — the raw material of the ONE Notice (drain 2026-10-11-0900 §2/§3). */
interface LibraryPassSummary {
  leftEdited: Record<string, string[]>;
  keptEdited: Record<string, string[]>;
  removed: Record<string, string[]>;
}

/** The manifest record, kept beside the identity record in the plugin folder (never in the user's vault). */
async function readManifestStore(adapter: DataAdapter, pluginDir: string): Promise<ManifestStore> {
  try {
    const p = manifestsPath(pluginDir);
    return parseManifests((await adapter.exists(p)) ? await adapter.read(p) : null);
  } catch (e) {
    console.error('Forge: reading the extraction manifests failed; treating as none (nothing will be swept or updated per file)', e);
    return {};
  }
}

async function writeManifestStore(adapter: DataAdapter, pluginDir: string, before: ManifestStore, after: ManifestStore): Promise<void> {
  try {
    const body = serializeManifests(after);
    if (body !== serializeManifests(before)) await adapter.write(manifestsPath(pluginDir), body);
  } catch (e) {
    console.error('Forge: writing the extraction manifests failed (the next launch re-derives them; nothing is lost)', e);
  }
}

/** The extraction manifest of ONE library vault (path -> hash as extracted), or null when none is recorded. */
export async function readLibraryManifest(app: App, pluginDir: string, vaultName: string): Promise<Record<string, string> | null> {
  const store = await readManifestStore(app.vault.adapter, pluginDir);
  return store[vaultName] ?? null;
}

/** After a manual re-extract the vault holds the bundle's files: record their hashes as the vault's manifest. */
export async function recordLibraryManifestFromBundle(app: App, pluginDir: string, vaultName: string): Promise<void> {
  const adapter = app.vault.adapter;
  try {
    const before = await readManifestStore(adapter, pluginDir);
    const after: ManifestStore = { ...before };
    after[vaultName] = await manifestOfBundleDir(adapter as ExtractorAdapter, `${bundledVaultsRoot(pluginDir)}/${vaultName}`);
    await writeManifestStore(adapter, pluginDir, before, after);
  } catch (e) {
    console.error('Forge: recording the extraction manifest after a re-extract failed (the next launch re-adopts what matches the bundle)', e);
  }
}

async function ensureAllBundledVaults(app: App, pluginDir: string): Promise<LibraryPassSummary> {
  const adapter = app.vault.adapter;
  const summary: LibraryPassSummary = { leftEdited: {}, keptEdited: {}, removed: {} };
  try {
    await parkLegacyMusicDirs(adapter);
  } catch (e) {
    console.error('Forge: parkLegacyMusicDirs failed', e);
  }

  const derived = await listBundledVaultNames(adapter, pluginDir);
  console.log(
    `Forge: bundled vaults to extract (from ${derived.source}): ` +
    `${derived.names.join(', ')}`,
  );
  // Drain 2026-10-13-2100 §3 — the EDITION decides; the folder only says what is physically there. Say what was left alone.
  if (derived.ignored.length > 0) {
    console.log(
      `Forge: not extracting [${derived.ignored.join(', ')}] — the bundle folder carries ${derived.ignored.length === 1 ? 'it' : 'them'} ` +
      `but this build's edition does not ship ${derived.ignored.length === 1 ? 'it' : 'them'}`,
    );
  }
  if (derived.missing.length > 0) {
    console.warn(
      `Forge: this edition ships [${derived.missing.join(', ')}] but the bundle folder does not carry ${derived.missing.length === 1 ? 'it' : 'them'}`,
    );
  }

  // Drain 2026-10-10-2100 (b): the identity each vault was last extracted at lives in the PLUGIN folder, not the user's vault.
  const idsPath = extractedIdsPath(pluginDir);
  let recorded: Record<string, string> = {};
  try {
    recorded = parseExtractedIds((await adapter.exists(idsPath)) ? await adapter.read(idsPath) : null);
  } catch (e) {
    console.error('Forge: reading the extracted-bundle record failed; treating as none', e);
  }
  const next = { ...recorded };
  // Drain 2026-10-11-0900 §2/§3: the manifest of what was extracted (path -> hash), so a file is only ever updated or swept if it is
  // still byte-identical to what the plugin wrote.
  const manifestsBefore = await readManifestStore(adapter, pluginDir);
  const manifests: ManifestStore = { ...manifestsBefore };

  for (const name of derived.names) {
    try {
      const outcome = await ensureBundledVaultCore(adapter as ExtractorAdapter, {
        sourceDir: `${bundledVaultsRoot(pluginDir)}/${name}`,
        targetDir: name,
        label: name,
        bundleId: BUNDLED_ASSETS_CONTENT_ID,
        recordedId: recorded[name] ?? null,
        manifest: manifestsBefore[name] ?? null,
        trash: (p) => trashVaultFile(app, p),
      });
      if (outcome.record) next[name] = BUNDLED_ASSETS_CONTENT_ID;
      if (outcome.manifest !== null) manifests[name] = outcome.manifest;
      if (outcome.leftEdited.length > 0) summary.leftEdited[name] = outcome.leftEdited;
      if (outcome.keptEdited.length > 0) summary.keptEdited[name] = outcome.keptEdited;
      if (outcome.removed.length > 0) summary.removed[name] = outcome.removed;
    } catch (e) {
      console.error(`Forge: extracting bundled ${name} failed`, e);
    }
  }

  try {
    const body = serializeExtractedIds(next);
    if (body !== serializeExtractedIds(recorded)) await adapter.write(idsPath, body);
  } catch (e) {
    console.error('Forge: writing the extracted-bundle record failed (the next launch re-checks; nothing is lost)', e);
  }
  await writeManifestStore(adapter, pluginDir, manifestsBefore, manifests);
  return summary;
}

/** v0.2.45: re-run bundled extraction when a domain activation lands
 *  via EditVaultDomainsModal.applyDiff.
 *
 *  Drain 2026-08-21-2300 — extraction is no longer domain-gated, so
 *  every bundled vault is already present by the time a domain is
 *  activated. This stays as a repair hook: it re-runs the derived
 *  extraction, which is idempotent (ensureBundledVault's "already at
 *  version" path) and restores anything the user deleted. */
export async function ensureBundledFor(domain: string, app: App, pluginDir: string): Promise<void> {
  // Drain 2026-10-12-1700 §3: this entry point had NO source-vault gate (only runFirstRunCheck did), so activating a domain from
  // the dev vault's Edit-domains modal extracted the bundled libraries into the library's own source repo.
  const sourceVaultName = await detectSourceVault(app.vault.adapter, pluginDir);
  if (shouldSkipBundledExtract(sourceVaultName)) {
    console.log(
      `Forge: ensureBundledFor('${domain}') — skipped: ${skipWhy(sourceVaultName!)}`,
    );
    return;
  }
  console.log(
    `Forge: ensureBundledFor('${domain}') — bundled vaults are extracted ` +
    `unconditionally; re-running the derived extraction as a repair pass`,
  );
  await ensureAllBundledVaults(app, pluginDir);
}


/** v0.2.229 — sweep bundle-dropped files (closes Pebble 1).
 *
 *  Walks the extracted library subdir + the bundled-asset subdir.
 *  Any file in extracted-not-in-bundle gets trashed via system trash
 *  (recoverable via macOS Trash if cohort had local content there).
 *
 *  Runs AFTER each `ensureBundledVault` call. The version-aware
 *  re-extract there handles the drift case by recursively deleting +
 *  re-copying — but on the 'match' path it skips entirely, leaving
 *  stragglers from any prior in-place re-extract (e.g. the v0.2.221
 *  command). This per-file diff sync catches that gap.
 *
 *  Driver smoke 2026-07-02: forge-music v0.7.0 dropped 8 engineer-mode
 *  notes. Driver BRAT-updated; runFirstRunCheck's match path skipped;
 *  re-extract didn't re-fire; stragglers persisted. With this sweep,
 *  the 8 files move to system trash regardless of how the bundle
 *  version compared.
 *
 *  Returns the list of trashed relative paths (sorted) so the caller
 *  can surface a notice.
 *
 *  Logs + swallows per-file failures; one broken trash shouldn't
 *  strand the whole startup. */
export async function sweepBundleDroppedFiles(
  app: App,
  bundledRoot: string,
  extractedRoot: string,
  manifest: Record<string, string> | null,
): Promise<{ trashed: string[]; keptEdited: string[]; next: Record<string, string> | null }> {
  const adapter = app.vault.adapter;
  const none = { trashed: [] as string[], keptEdited: [] as string[], next: manifest };
  if (!(await adapter.exists(extractedRoot))) {
    console.log(`[sweep] ${extractedRoot}: extracted root missing; skip`);
    return none;
  }
  if (!(await adapter.exists(bundledRoot))) {
    console.log(`[sweep] ${extractedRoot}: bundled root missing (${bundledRoot}); skip`);
    return none;
  }
  if (manifest === null) {
    // Drain 2026-10-11-0900 §2: without a record of what the plugin extracted, "not in the bundle" does not mean "not the user's".
    console.log(`[sweep] ${extractedRoot}: no extraction manifest yet; nothing is swept`);
    return none;
  }

  const result = await sweepBundleDroppedCore(adapter as ExtractorAdapter, {
    sourceDir: bundledRoot,
    targetDir: extractedRoot,
    manifest,
    trash: (fullPath) => trashVaultFile(app, fullPath),
  });
  console.log(
    `[sweep] ${extractedRoot}: removed=${result.removed.length} (extracted by us, dropped from the bundle, unedited), ` +
    `kept-edited=${result.keptEdited.length}`,
  );

  // v0.2.236 — after per-file trash, sweep now-empty directories that shipped in a prior bundle version but were fully dropped in
  // the current one. Idempotent; failures log + continue. (Only directories ABSENT from the bundle and EMPTY are removed.)
  try {
    const bundledDirs = await collectExtractedDirsAbsentFromBundle(adapter, bundledRoot, extractedRoot);
    for (const dirRel of bundledDirs) {
      const fullDir = `${extractedRoot}/${dirRel}`;
      try {
        const listing = await adapter.list(fullDir);
        if (listing.files.length === 0 && listing.folders.length === 0) {
          await adapter.rmdir(fullDir, false);
          console.log(`[sweep] ${extractedRoot}: removed empty dir ${dirRel}`);
        }
      } catch (e) {
        console.error(`sweepBundleDroppedFiles: empty-dir cleanup failed for ${fullDir}`, e);
      }
    }
  } catch (e) {
    console.error(`sweepBundleDroppedFiles: empty-dir enumeration failed`, e);
  }

  return { trashed: [...result.removed].sort(), keptEdited: result.keptEdited, next: result.next };
}

/** Trash one vault file: detach any leaf showing it, send it to the system trash, fall back to a plain remove if the trash silently
 *  no-op'd. THROWS when the file is still there afterwards (the caller then keeps the manifest entry and retries next launch). */
async function trashVaultFile(app: App, fullPath: string): Promise<void> {
  const adapter = app.vault.adapter;
  const af = app.vault.getAbstractFileByPath(fullPath);
  if (af instanceof TFile) {
    // Detach any leaves displaying the file before trash, mirroring the trashForensicShadow leaf-detach contract from v0.2.214.
    const leavesToDetach: WorkspaceLeaf[] = [];
    app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file?.path === fullPath) leavesToDetach.push(leaf);
    });
    for (const leaf of leavesToDetach) {
      try { leaf.detach(); } catch (e) {
        console.error(`trashVaultFile: detach failed for ${fullPath}`, e);
      }
    }
    try {
      await app.vault.trash(af, true);
    } catch (e) {
      console.error(`trashVaultFile: vault.trash failed for ${fullPath}`, e);
    }
    if (await adapter.exists(fullPath)) await adapter.remove(fullPath);
  } else {
    // Not modeled as a TFile (the file exists on disk but Obsidian's index does not see it): direct adapter.remove.
    await adapter.remove(fullPath);
  }
  if (await adapter.exists(fullPath)) throw new Error(`${fullPath} is still present after trash`);
}

/** Enumerate every extracted directory (relative path) whose name is
 *  NOT present as a directory in the bundle. Used to sweep now-empty
 *  dirs like `blues/` after v0.8.0 rename dropped it. Directories that
 *  still exist in the bundle stay — even if temporarily empty during
 *  a transition. */
async function collectExtractedDirsAbsentFromBundle(
  adapter: DataAdapter,
  bundledRoot: string,
  extractedRoot: string,
): Promise<string[]> {
  const bundledDirs = await listAllDirsRecursive(adapter, bundledRoot);
  const extractedDirs = await listAllDirsRecursive(adapter, extractedRoot);
  const out: string[] = [];
  for (const dirRel of extractedDirs) {
    if (!bundledDirs.has(dirRel)) out.push(dirRel);
  }
  // Sort deepest-first so nested empty dirs cleanup before their
  // parents; simple length-descending sort suffices.
  out.sort((a, b) => b.length - a.length);
  return out;
}

async function listAllDirsRecursive(
  adapter: DataAdapter,
  root: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  async function walk(dir: string): Promise<void> {
    const listing = await adapter.list(dir);
    for (const dirPath of listing.folders) {
      out.add(dirPath.slice(root.length + 1));
      await walk(dirPath);
    }
  }
  await walk(root);
  return out;
}

/** v0.2.233 — refresh outdated welcome notes (drain 2026-07-02-1630).
 *  Per-file pass: detect V1 shape or Obsidian default boilerplate in
 *  Welcome.md / welcome.md / greet.md, trash to system trash, and
 *  re-write fresh bundled content. Skips files that are already V2
 *  shape or look hand-customized. Idempotent on subsequent launches.
 *
 *  Trash uses `vault.trash(file, true)` per L8 (recoverable). The
 *  capital-W Welcome.md path uses the in-source WELCOME_NOTE constant
 *  as its refresh source — pre-v0.2.56 Welcome.md was never bundled.
 *  The lowercase welcome.md/greet.md paths use the bundled assets. */
async function refreshOutdatedWelcomes(
  app: App,
  adapter: DataAdapter,
  pluginDir: string,
): Promise<void> {
  const welcomePaths = bundledWelcomePaths(pluginDir);
  const candidates: Array<{
    path: string;
    bundlePath: string | null;  // null → use WELCOME_NOTE constant
    label: string;
  }> = [
    { path: WELCOME_PATH, bundlePath: null, label: 'Welcome.md' },
    {
      path: 'welcome.md',
      bundlePath: welcomePaths.welcome,
      label: 'welcome.md',
    },
    {
      path: 'greet.md',
      bundlePath: welcomePaths.greet,
      label: 'greet.md',
    },
  ];

  const refreshed: string[] = [];

  for (const { path, bundlePath, label } of candidates) {
    try {
      if (!(await adapter.exists(path))) continue;
      const body = await adapter.read(path);
      const shape = classifyWelcomeShape(body);
      if (!shouldRefreshWelcome(shape)) {
        console.log(`Forge: ${label} shape=${shape}; no refresh needed`);
        continue;
      }

      // Resolve fresh content BEFORE trashing the old file — if the
      // bundled asset is missing (dev mode / corrupt install), keep
      // the V1 file rather than leave the cohort with nothing.
      let freshContent: string;
      if (bundlePath === null) {
        freshContent = WELCOME_NOTE;
      } else {
        if (!(await adapter.exists(bundlePath))) {
          console.warn(`Forge: refresh of ${label} skipped — bundle missing at ${bundlePath}`);
          continue;
        }
        freshContent = await adapter.read(bundlePath);
      }

      // Move existing to system trash (recoverable per L8). Prefer
      // vault.trash(TFile, true) so Obsidian's index sees the removal;
      // fall back to adapter.remove if we can't resolve to a TFile
      // (e.g. file is outside the vault index).
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        try {
          await app.vault.trash(file, true);
        } catch (e) {
          console.error(`Forge: vault.trash failed for ${label}; falling back to adapter.remove`, e);
          await adapter.remove(path);
        }
      } else {
        await adapter.remove(path);
      }

      // Write fresh content at the same path.
      await adapter.write(path, freshContent);
      refreshed.push(`${label} (was ${shape})`);
      console.log(`Forge: refreshed ${label} from ${shape} → V2`);
    } catch (e) {
      console.error(`Forge: refresh of ${label} failed`, e);
    }
  }

  if (refreshed.length > 0) {
    new Notice(
      `Forge: welcome notes refreshed to V2 — ${refreshed.join(', ')}. Previous versions moved to system trash; recover from Trash if you customized them.`,
      12000,
    );
  }
}

/** Walk a directory recursively and collect every file path RELATIVE
 *  to the root (no leading slash). Used by sweepBundleDroppedFiles to
 *  compute the extracted vs bundled set diff. */
async function listAllFilesRecursive(
  adapter: DataAdapter,
  root: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  async function walk(dir: string): Promise<void> {
    const listing = await adapter.list(dir);
    for (const filePath of listing.files) {
      out.add(filePath.slice(root.length + 1));
    }
    for (const dirPath of listing.folders) {
      await walk(dirPath);
    }
  }
  await walk(root);
  return out;
}
