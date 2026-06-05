import { App, DataAdapter } from 'obsidian';
import { copyDirRecursive } from './copy-dir-core';
import { ensureForgeTomlStub } from './forge-toml-stub';
import { vaultDeclaresMusic } from './forge-music-gate';
import { compareBundledVaultVersion } from './bundled-vault-version-core';
import { classifyChipsMd, chooseBackupName } from './chips-md-migration-core';
import { ensureWelcomeFiles } from './welcome-files-core';
export { copyDirRecursive };

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

    // Welcome-note + sentinel: gated by the existing sentinel check.
    // Pre-V1 vaults with sentinel-true won't get the new welcome text
    // (they had a pre-V1 version and have already moved past it).
    // That's intentional — the new note is for fresh vaults; existing
    // users can delete and recreate manually if they want it.
    if (!hasSentinel) {
      const hasWelcome = await adapter.exists(WELCOME_PATH);
      console.log('Forge: Welcome.md exists?', hasWelcome);
      if (!hasWelcome) {
        await app.vault.create(WELCOME_PATH, WELCOME_NOTE);
        console.log('Forge: created Welcome.md');
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
      console.warn('Forge: ensureWelcomeFiles threw unexpectedly', e);
    }

    // v0.2.13: extract bundled forge-moda content if the vault
    // doesn't have it. Independent of the sentinel — covers both
    // fresh vaults (sentinel absent) AND upgrade-without-content
    // vaults (sentinel present but vault has no forge-moda dir
    // yet, e.g. a vault initialized before forge-moda was bundled).
    await ensureBundledForgeModa(app);

    // v0.2.52: one-shot `_meta/_chips.md` v1→v2 upgrade. Cohort
    // vaults that installed v0.2.48-v0.2.51 had stuck v1 files
    // because the v0.2.38 auto re-extract only fires on forge.toml
    // version drift and the schema-v2 migration shipped without
    // bumping forge-moda's forge.toml. Idempotent via schema_version
    // detection — second run is a no-op.
    await migrateChipsMdToV2(adapter, 'forge-moda');

    // v0.2.14: write a minimal forge.toml at the vault root if
    // missing. Pre-empts the InitializeForgeVaultWizard auto-open
    // trigger on fresh-vault first ribbon click. Same independent-
    // of-sentinel semantics as ensureBundledForgeModa above.
    try {
      const wrote = await ensureForgeTomlStub(adapter);
      if (wrote) console.log('Forge: wrote V1 stub forge.toml');
    } catch (e) {
      console.warn('Forge: ensureForgeTomlStub failed', e);
    }

    // v0.2.15: extract bundled forge-music IFF the user's forge.toml
    // declares "music" in its domains array. Gated unlike forge-moda
    // (which is V1's default-on library) because music isn't on the
    // seminar curriculum — most students won't want forge-music/
    // appearing in their vault.
    await ensureBundledForgeMusic(app);

    // v0.2.52: same one-shot v1→v2 migration for forge-music. No-op
    // when forge-music isn't extracted (gated by domains) OR when
    // forge-music has no _meta/_chips.md (today's state — forge-music
    // hasn't shipped a curator file yet). Wired in advance so future
    // forge-music _chips.md drains don't need to revisit welcome.ts.
    await migrateChipsMdToV2(adapter, 'forge-music');
  } catch (e) {
    console.error('Forge: runFirstRunCheck failed', e);
  }
}

/** Rename `targetDir` to `<targetDir>.bak.<oldVersion>`, appending a
 *  numeric suffix if that backup name already exists. Lets multiple
 *  drift events accumulate side-by-side rather than clobbering each
 *  other (`forge-music.bak.0.3.5`, `forge-music.bak.0.3.5.2`, …).
 *
 *  Tries `adapter.rename` first — atomic on POSIX. Falls back to a
 *  copy-then-recursive-delete dance if rename throws (mobile-only
 *  quirks have shown up here in earlier Obsidian releases).
 *
 *  v0.2.39 — preserves user edits to bundled snippets across drift
 *  events. Even though V1 closed-beta is consumer-only, the cheap
 *  insurance matters for the "I poked at a bundled file to learn"
 *  corner case. */
async function renameWithBackup(
  adapter: DataAdapter,
  targetDir: string,
  oldVersion: string,
): Promise<void> {
  let backupName = `${targetDir}.bak.${oldVersion}`;
  let counter = 1;
  while (await adapter.exists(backupName)) {
    counter += 1;
    backupName = `${targetDir}.bak.${oldVersion}.${counter}`;
  }
  try {
    await adapter.rename(targetDir, backupName);
  } catch (e) {
    // Some Obsidian builds disallow directory rename through the
    // adapter; fall back to copy-then-delete. copyDirRecursive +
    // rmdir(recursive) is the same primitive pair welcome.ts has
    // used since v0.2.13.
    console.warn(
      `Forge: rename ${targetDir} → ${backupName} failed; using copy fallback`,
      e,
    );
    await copyDirRecursive(adapter, targetDir, backupName);
    await adapter.rmdir(targetDir, true);
  }
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
      `Forge: ${label} drift detected (extracted ${status.extracted} → bundled ${status.bundled}); backing up + re-extracting`,
    );
    await renameWithBackup(adapter, targetDir, status.extracted);
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
    console.warn('Forge: ensureBundledForgeModa failed', e);
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
    console.warn('Forge: ensureBundledForgeMusic failed', e);
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
    console.warn(`Forge: migrateChipsMdToV2(${libraryDirName}) failed`, e);
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

