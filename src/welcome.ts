import { App } from 'obsidian';

// .forge/ is managed by Forge — safe to write cache, logs, future state files here.
const SENTINEL_DIR = '.forge';
const SENTINEL_PATH = '.forge/initialized';
const WELCOME_PATH = 'Welcome.md';

const WELCOME_NOTE = `# Welcome to Forge

Forge turns your Obsidian vault into a programmable workspace.

## Two-step bootstrap

**Step 1.** Install the demo vault by Zapping this line:

[[install]] "forge-core"

**Step 2.** After install completes, Zap this line:

[[forge-core/hello_registry]]

If you see "hello registry" in the output panel, the full Forge stack is working end-to-end.

## What just happened

Step 1 downloaded the forge-core demo vault from the Forge registry and placed it in your Obsidian vault as a folder. Step 2 ran the hello_registry snippet from the installed vault. Together they exercised every layer of Forge: the plugin, the backend, the registry, the install machinery, cross-vault snippet resolution, and execution.

Edit or delete this note anytime — Forge won't recreate it.
`;

export async function runFirstRunCheck(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  console.log('Forge: runFirstRunCheck starting');

  try {
    const hasSentinel = await adapter.exists(SENTINEL_PATH);
    console.log('Forge: sentinel exists?', hasSentinel);
    if (hasSentinel) return;

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
  } catch (e) {
    console.error('Forge: runFirstRunCheck failed', e);
  }
}
