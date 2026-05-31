import { App } from 'obsidian';
import { copyDirRecursive } from './copy-dir-core';
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

    // v0.2.13: extract bundled forge-moda content if the vault
    // doesn't have it. Independent of the sentinel — covers both
    // fresh vaults (sentinel absent) AND upgrade-without-content
    // vaults (sentinel present but vault has no forge-moda dir
    // yet, e.g. a vault initialized before forge-moda was bundled).
    await ensureBundledForgeModa(app);
  } catch (e) {
    console.error('Forge: runFirstRunCheck failed', e);
  }
}

/** Copy the bundled forge-moda content from the plugin's assets dir
 *  into the user's vault root if it isn't already there. Skips the
 *  copy if the target already exists — protects user edits in
 *  existing vaults and avoids re-copying on every plugin load. */
async function ensureBundledForgeModa(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  const targetDir = 'forge-moda';

  try {
    if (await adapter.exists(targetDir)) {
      console.log('Forge: forge-moda already in vault; skipping bundle extraction');
      return;
    }
    const sourceDir = '.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda';
    if (!(await adapter.exists(sourceDir))) {
      console.warn('Forge: bundled forge-moda missing from plugin assets; skipping extraction');
      return;
    }
    await copyDirRecursive(adapter, sourceDir, targetDir);
    console.log('Forge: extracted bundled forge-moda into vault');
  } catch (e) {
    // Non-fatal — the simulator and own-snippet authoring still work
    // without forge-moda extracted as authoring content. Surface as
    // warn rather than throwing so plugin load doesn't abort.
    console.warn('Forge: ensureBundledForgeModa failed', e);
  }
}

