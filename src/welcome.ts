import { App, DataAdapter } from 'obsidian';
import { copyDirRecursive } from './copy-dir-core';
import { ensureForgeTomlStub } from './forge-toml-stub';
import { vaultDeclaresMusic } from './forge-music-gate';
import { compareBundledVaultVersion } from './bundled-vault-version-core';
import { classifyChipsMd, chooseBackupName } from './chips-md-migration-core';
import { ensureWelcomeFiles } from './welcome-files-core';
import { isSourceVault, shouldSkipBundledExtract } from './source-vault-core';
import { shouldCreateLegacyWelcomeMd } from './welcome-legacy-gate-core';
export { copyDirRecursive };

// v0.2.64 — names of bundled libraries the auto-extract path may
// detect as "the vault IS this library's source repo." Must match
// chips.ts's KNOWN_BUNDLED_LIBRARIES (intentional duplication —
// both glue layers consult the same set, but neither owns the
// source of truth, so a tiny copy is cheaper than a new shared file).
// v0.2.76 — forge-tutorial added as the Tier 1 onboarding library.
// Default-on (mirrors forge-moda), not domain-gated.
const KNOWN_BUNDLED_LIBRARIES = new Set([
  'forge-moda', 'forge-music', 'forge-tutorial',
]);

/** Read the vault root's `forge.toml` (if any) and return the matched
 *  bundled-library identity when the vault IS that library's source
 *  repo. v0.2.64 — used by ensureBundled* + ensureWelcomeFiles gates
 *  to skip auto-extract on source repos (per brief (e)). Defensive:
 *  missing/unreadable forge.toml → null (treat as a normal vault). */
async function detectSourceVault(adapter: DataAdapter): Promise<string | null> {
  try {
    if (!(await adapter.exists('forge.toml'))) return null;
    const body = await adapter.read('forge.toml');
    return isSourceVault(body, KNOWN_BUNDLED_LIBRARIES);
  } catch (e) {
    console.error('Forge: detectSourceVault read failed', e);
    return null;
  }
}

// .forge/ is managed by Forge — safe to write cache, logs, future state files here.
const SENTINEL_DIR = '.forge';
const SENTINEL_PATH = '.forge/initialized';
const WELCOME_PATH = 'Welcome.md';

// v0.2.13: V1-accurate welcome text. The pre-V1 version walked the
// reader through `[[install]] "forge-core"` + `[[forge-core/hello_registry]]`,
// neither of which work in V1 — `install` isn't bundled in the engine
// assets and there's no hosted registry to fetch from. Students who
// followed those instructions hit SnippetResolutionError on the first
// click. The new text references only flows the V1 closed-beta
// actually supports: open the simulator (no setup), author a
// snippet against the hosted /generate, read the bundled forge-moda
// content as files.
const WELCOME_NOTE = `# Welcome to Forge

Forge runs Python diffusion simulations and snippet authoring entirely
inside Obsidian — no terminal, no server, no Python install.

## Try the simulator (no setup needed)

1. **Cmd+P** → "Forge: Open MoDa simulation".
2. A particle canvas opens with ~500 water particles.
3. Click **Run simulation** in the panel header. After a few seconds,
   ink dispersions render over the water — that's a 300-tick
   simulation playing back.

If you see the ink, the full Forge stack is working.

## Write your own snippet

1. Make a new note in this vault — e.g. **\`hello.md\`**.
2. Paste this as the file's contents:

   \`\`\`
   ---
   type: action
   description: print hello with a name
   inputs:
     - name
   ---

   # English

   Print "hello " followed by the name.
   \`\`\`

3. Click the **Forge** button at the top of the editor. Paste your
   transpile token if prompted (Settings → Forge → Transpile service
   → Transpile service token).
4. Forge calls the hosted transpile service, generates Python from
   your English, writes it back into the note, and runs it. The
   result renders in the **Forge Output** panel on the right.

## What you'll find in this vault

The bundled **forge-moda** library has been copied into a
\`forge-moda/\` folder above (each .md is one snippet). Read them
to see how the simulation is built; edit them to experiment.

Edit or delete this Welcome note anytime — Forge won't recreate it.
`;

export async function runFirstRunCheck(app: App): Promise<void> {
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
    const sourceVaultName = await detectSourceVault(adapter);

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
          `Forge: skipping legacy Welcome.md create — vault root ` +
          `declares itself as source repo for ${sourceVaultName}`,
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
        `Forge: skipping welcome.md extraction — vault root declares ` +
        `itself as source repo for ${sourceVaultName}`,
      );
    } else {
      try {
        const result = await ensureWelcomeFiles(adapter, {
          welcomeBundle: '.obsidian/plugins/forge-client-obsidian/assets/welcome/welcome.md',
          greetBundle: '.obsidian/plugins/forge-client-obsidian/assets/welcome/greet.md',
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
    if (shouldSkipBundledExtract(sourceVaultName)) {
      console.log(
        `Forge: skipping forge-moda extraction — vault root declares ` +
        `itself as source repo for ${sourceVaultName}`,
      );
    } else {
      await ensureBundledForgeModa(app);
    }

    // v0.2.52: one-shot `_meta/_chips.md` v1→v2 upgrade. Cohort
    // vaults that installed v0.2.48-v0.2.51 had stuck v1 files
    // because the v0.2.38 auto re-extract only fires on forge.toml
    // version drift and the schema-v2 migration shipped without
    // bumping forge-moda's forge.toml. Idempotent via schema_version
    // detection — second run is a no-op.
    await migrateChipsMdToV2(adapter, 'forge-moda');

    // v0.2.76: extract bundled forge-tutorial content on first install
    // + on forge.toml version drift. Mirrors ensureBundledForgeModa
    // (forge-tutorial is the V1 default-on Tier 1 tutorial library —
    // not domain-gated like forge-music; closed-beta cohorts get it
    // automatically as the K&R-style onboarding walk).
    //
    // v0.2.66 source-vault gate also applies: a vault that IS the
    // forge-tutorial source repo doesn't get re-extraction into itself.
    if (shouldSkipBundledExtract(sourceVaultName)) {
      console.log(
        `Forge: skipping forge-tutorial extraction — vault root declares ` +
        `itself as source repo for ${sourceVaultName}`,
      );
    } else {
      await ensureBundledForgeTutorial(app);
    }

    // v0.2.14: write a minimal forge.toml at the vault root if
    // missing. Pre-empts the InitializeForgeVaultWizard auto-open
    // trigger on fresh-vault first ribbon click. Same independent-
    // of-sentinel semantics as ensureBundledForgeModa above.
    try {
      const wrote = await ensureForgeTomlStub(adapter);
      if (wrote) console.log('Forge: wrote V1 stub forge.toml');
    } catch (e) {
      console.error('Forge: ensureForgeTomlStub failed', e);
    }

    // v0.2.15: extract bundled forge-music IFF the user's forge.toml
    // declares "music" in its domains array. Gated unlike forge-moda
    // (which is V1's default-on library) because music isn't on the
    // seminar curriculum — most students won't want forge-music/
    // appearing in their vault.
    //
    // v0.2.64 — also skipped when vault IS forge-music's source repo
    // (per brief (e)).
    // v0.2.66 — symmetric gate per brief (e) followup: any source vault
    // (not just same-name) skips forge-music extraction too.
    if (shouldSkipBundledExtract(sourceVaultName)) {
      console.log(
        `Forge: skipping forge-music extraction — vault root declares ` +
        `itself as source repo for ${sourceVaultName}`,
      );
    } else {
      await ensureBundledForgeMusic(app);
    }

    // v0.2.52: same one-shot v1→v2 migration for forge-music. No-op
    // when forge-music isn't extracted (gated by domains) OR when
    // forge-music has no _meta/_chips.md (today's state — forge-music
    // hasn't shipped a curator file yet). Wired in advance so future
    // forge-music _chips.md drains don't need to revisit welcome.ts.
    await migrateChipsMdToV2(adapter, 'forge-music');
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

/** v0.2.106 — was renameWithBackup. The v0.2.39 .bak.<version>
 *  rename strategy was designed to preserve user edits to bundled
 *  snippets across re-extracts; in practice it accumulated noise
 *  (every drift event left another `<lib>.bak.<v>` directory at
 *  vault root) AND broke findFeaturedSnippet by having every .bak
 *  contribute another `simulation.md` with `featured: true`.
 *
 *  Cohort smoke (Tamar) on v0.2.105 surfaced both:
 *    "Forge: multiple featured snippets found; using first by id.
 *     picked=simulation, all=simulation, simulation, simulation"
 *    + "please remove the .bak directories, they are adding noise."
 *
 *  Replaced with direct recursive delete. Trade-off: users who
 *  poked at a bundled snippet to learn lose the local copy on
 *  re-extract — but the bundled-library snippets are intended-
 *  immutable per V1 convention; user authoring lives at vault root.
 *
 *  Tries `adapter.rmdir(recursive)` first; falls back to a manual
 *  recursive walk if rmdir's recursive flag isn't honored. */
async function deleteExtractedDir(
  adapter: DataAdapter,
  targetDir: string,
): Promise<void> {
  try {
    await adapter.rmdir(targetDir, true);
  } catch (e) {
    console.error(`deleteExtractedDir: rmdir ${targetDir} failed`, e);
  }
}

/** v0.2.106 — sweep pre-existing `<lib>.bak.<version>` directories
 *  from past renameWithBackup calls. One-shot cleanup so users who
 *  upgraded across the 0.2.39 → 0.2.106 span don't carry permanent
 *  backup-dir litter at vault root. Only matches the specific
 *  `forge-{moda,music,tutorial}.bak.*` shape to avoid touching
 *  user-named directories that happen to contain `.bak`. */
async function sweepLegacyBakDirs(adapter: DataAdapter): Promise<number> {
  const candidates = [
    'forge-moda',
    'forge-music',
    'forge-tutorial',
  ];
  let removed = 0;
  // adapter.list returns { folders: string[]; files: string[] } at
  // the given path; "/" lists vault root.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = await (adapter as any).list?.('/');
    if (!root?.folders) return 0;
    for (const folder of root.folders) {
      const name = folder.split('/').filter(Boolean).pop() ?? '';
      const bakMatch = candidates.some(c => name.startsWith(`${c}.bak.`));
      if (!bakMatch) continue;
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

/** Shared extraction routine for bundled vaults (forge-moda + forge-
 *  music). Compares the bundled forge.toml version against the
 *  extracted one and either skips, copies (first install), or
 *  backs-up-then-re-extracts (drift detected). v0.2.39 replaces the
 *  pre-v0.2.39 `exists(targetDir) → skip` gate that left users
 *  running stale extracted vaults until they manually `rm -rf`.
 *
 *  Behavior matrix:
 *  - bundled forge.toml missing → warn, skip (no source to extract).
 *  - target dir missing → first-install copy.
 *  - target dir present, both versions equal → skip (logged).
 *  - target dir present, versions differ → backup + re-extract.
 *  - target dir present, either version unparseable → warn, skip
 *    (avoid data loss; user can re-bootstrap manually). */
async function ensureBundledVault(
  adapter: DataAdapter,
  sourceDir: string,
  targetDir: string,
  label: string,
): Promise<void> {
  if (!(await adapter.exists(sourceDir))) {
    console.warn(`Forge: bundled ${label} missing from plugin assets; skipping extraction`);
    return;
  }

  const bundledTomlPath = `${sourceDir}/forge.toml`;
  const extractedTomlPath = `${targetDir}/forge.toml`;
  const bundledBody = (await adapter.exists(bundledTomlPath))
    ? await adapter.read(bundledTomlPath)
    : null;
  const extractedBody =
    (await adapter.exists(targetDir)) && (await adapter.exists(extractedTomlPath))
      ? await adapter.read(extractedTomlPath)
      : null;

  const status = compareBundledVaultVersion(bundledBody, extractedBody);

  if (status.kind === 'no-bundled') {
    console.warn(`Forge: bundled ${label} forge.toml missing or unreadable; skipping`);
    return;
  }
  if (status.kind === 'unparseable') {
    console.warn(
      `Forge: cannot compare ${label} versions (${status.reason}); skipping to avoid data loss`,
    );
    return;
  }
  if (status.kind === 'match') {
    console.log(`Forge: ${label} already at version ${status.version}; skipping`);
    return;
  }
  if (status.kind === 'drift') {
    console.log(
      `Forge: ${label} drift detected (extracted ${status.extracted} → bundled ${status.bundled}); re-extracting`,
    );
    // v0.2.106 — was renameWithBackup. See deleteExtractedDir for
    // rationale. The .bak directories were noise.
    await deleteExtractedDir(adapter, targetDir);
  }
  // 'no-extracted' falls through to the copy below.

  await copyDirRecursive(adapter, sourceDir, targetDir);
  console.log(`Forge: extracted bundled ${label} into vault`);
}

/** Copy the bundled forge-moda content from the plugin's assets dir
 *  into the user's vault root. v0.2.39 — version-aware: replaces the
 *  pre-v0.2.39 `exists(targetDir) → skip` gate with a version compare
 *  so drift triggers a backup + re-extract instead of silently leaving
 *  stale content. See ensureBundledVault. */
async function ensureBundledForgeModa(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  try {
    await ensureBundledVault(
      adapter,
      '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda',
      'forge-moda',
      'forge-moda',
    );
  } catch (e) {
    // Non-fatal — the simulator and own-snippet authoring still work
    // without forge-moda extracted as authoring content. Surface as
    // warn rather than throwing so plugin load doesn't abort.
    console.error('Forge: ensureBundledForgeModa failed', e);
  }
}

/** v0.2.76: extract bundled forge-tutorial content into the vault. The
 *  Tier 1 onboarding library — a 9-chapter K&R-style walk from
 *  first-Forge-click to composing your own snippets. Default-on
 *  (mirrors forge-moda), not gated by domain. Source-vault gate at
 *  the call site (runFirstRunCheck) skips extraction when the vault
 *  IS the forge-tutorial source repo. */
async function ensureBundledForgeTutorial(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  try {
    await ensureBundledVault(
      adapter,
      '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-tutorial',
      'forge-tutorial',
      'forge-tutorial',
    );
  } catch (e) {
    // Non-fatal — first-Forge-click on welcome.md still works without
    // the tutorial extracted. Surface as warn rather than throwing so
    // plugin load doesn't abort.
    console.error('Forge: ensureBundledForgeTutorial failed', e);
  }
}

/** v0.2.15: extract bundled forge-music if the vault declares "music"
 *  in its forge.toml domains. v0.2.39 — version-aware re-extract on
 *  drift, sharing the ensureBundledVault helper with forge-moda. The
 *  gate is per-vault opt-in because music isn't on the V1 seminar
 *  curriculum; defaulting it on would leave unwanted files in most
 *  closed-beta vaults. */
async function ensureBundledForgeMusic(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  const tomlPath = 'forge.toml';

  try {
    if (!(await adapter.exists(tomlPath))) {
      // No forge.toml means no domain declaration; nothing to extract.
      // (v0.2.14's stub usually creates one, but defensive against
      // races and adapter quirks.)
      return;
    }
    const tomlBody = await adapter.read(tomlPath);
    if (!vaultDeclaresMusic(tomlBody)) {
      return;
    }

    await ensureBundledVault(
      adapter,
      '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-music',
      'forge-music',
      'forge-music',
    );
  } catch (e) {
    console.error('Forge: ensureBundledForgeMusic failed', e);
  }
}

/** v0.2.52: one-shot `_meta/_chips.md` v1→v2 upgrade for a single
 *  library subdir. Detects v1 shape via `classifyChipsMd` (absence
 *  of `schema_version: 2` in frontmatter), backs the v1 file up to
 *  `_chips.md.bak.v1` (with collision-suffix), and overwrites with
 *  the bundled v2 file from the plugin assets dir.
 *
 *  Idempotent: subsequent runs see `schema_version: 2` and no-op.
 *
 *  No-op paths (in order):
 *  - Vault has no extracted `<libraryDirName>/_meta/_chips.md` (e.g.
 *    the library wasn't extracted, or the curator hasn't shipped a
 *    `_chips.md` yet). Returns silently.
 *  - Extracted file is already v2 (`schema_version: 2`). Returns
 *    silently.
 *  - Extracted file is unparseable (no `---` frontmatter
 *    delimiters). Warns + returns to avoid clobbering an unexpected
 *    file shape.
 *  - Extracted file is v1 BUT bundled v2 file is missing from plugin
 *    assets. Warns + returns (likely a dev-mode setup; nothing safe
 *    to migrate from).
 *
 *  Migration path (extracted=v1, bundled present):
 *  1. Compute collision-free backup name via `chooseBackupName`
 *     against the actual `_meta/` listing.
 *  2. Rename v1 → backup. Falls back to copy+delete on rename
 *     failure (same mobile-Obsidian quirk pattern as
 *     `renameWithBackup`).
 *  3. Write bundled v2 body to the original path.
 *  4. Log success.
 *
 *  Errors during the migration are caught and warn-logged so plugin
 *  onload doesn't abort. The user's existing v1 file stays on disk
 *  if the migration fails. */
async function migrateChipsMdToV2(
  adapter: DataAdapter,
  libraryDirName: string,
): Promise<void> {
  const extractedPath = `${libraryDirName}/_meta/_chips.md`;
  const bundledPath =
    `.obsidian/plugins/forge-client-obsidian/assets/vaults/${libraryDirName}/_meta/_chips.md`;
  const metaDir = `${libraryDirName}/_meta`;

  try {
    if (!(await adapter.exists(extractedPath))) {
      return;  // 'absent' — nothing to migrate
    }
    const extractedBody = await adapter.read(extractedPath);
    const status = classifyChipsMd(extractedBody);

    if (status.kind === 'v2') return;  // idempotent
    if (status.kind === 'absent') return;  // unreachable (exists checked)
    if (status.kind === 'unparseable') {
      console.warn(
        `Forge: ${extractedPath} is unparseable; skipping v2 migration`,
      );
      return;
    }

    // status.kind === 'v1' — needs migration
    if (!(await adapter.exists(bundledPath))) {
      console.warn(
        `Forge: bundled ${bundledPath} missing; cannot migrate ` +
        `${extractedPath} to v2`,
      );
      return;
    }

    // Compute backup name from the on-disk _meta/ listing.
    const listing = await adapter.list(metaDir);
    const existingNames = new Set(
      listing.files.map(p => p.slice(metaDir.length + 1)),
    );
    const backupName = chooseBackupName(existingNames);
    const backupPath = `${metaDir}/${backupName}`;

    // Backup v1 → restore as <backupName>. Try rename, fall back to
    // copy+delete if rename throws (mobile-Obsidian quirk pattern
    // matching renameWithBackup).
    try {
      await adapter.rename(extractedPath, backupPath);
    } catch (e) {
      console.warn(
        `Forge: rename ${extractedPath} → ${backupPath} failed; ` +
        `using copy+delete fallback`,
        e,
      );
      const v1Body = await adapter.read(extractedPath);
      await adapter.write(backupPath, v1Body);
      await adapter.remove(extractedPath);
    }

    // Overwrite with bundled v2.
    const bundledBody = await adapter.read(bundledPath);
    await adapter.write(extractedPath, bundledBody);
    console.log(
      `Forge: migrated ${extractedPath} v1→v2; previous version ` +
      `backed up as ${backupName}`,
    );
  } catch (e) {
    console.error(`Forge: migrateChipsMdToV2(${libraryDirName}) failed`, e);
  }
}

/** v0.2.45: dispatch to the right ensureBundled* helper for a domain
 *  whose activation just landed via EditVaultDomainsModal.applyDiff.
 *  Mirrors the per-domain branch list inside runFirstRunCheck.
 *
 *  - 'music' → ensureBundledForgeMusic (the only domain-gated bundled
 *    vault today; moda is unconditionally extracted at onload).
 *  - Other domain ids → no-op + warn (forward-compat against future
 *    domains added to forge.toml without a matching helper here).
 *
 *  Idempotent: re-firing for an already-extracted vault no-ops via
 *  ensureBundledVault's match-case (the v0.2.39 drift-detection's
 *  "already at version" path). */
export async function ensureBundledFor(domain: string, app: App): Promise<void> {
  if (domain === 'music') {
    await ensureBundledForgeMusic(app);
    return;
  }
  // moda is unconditionally extracted regardless of domains; nothing
  // to do on activation. Other domain ids are forward-compat.
  console.log(
    `Forge: ensureBundledFor('${domain}') — no bundled-vault helper for this domain; skipping`,
  );
}

