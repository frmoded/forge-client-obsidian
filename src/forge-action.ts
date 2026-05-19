import { App, Menu, Modal, Notice, Setting, requestUrl } from 'obsidian';
import { ForgeGenerationModal } from './modal';
import { ensureServerRunning, connectVault, computeSnippet } from './server';
import {
  KNOWN_DOMAINS,
  ForgeActionContext,
  forgeActionContext,
  parseDomainsField,
  isValidVaultName,
  renderForgeToml,
} from './forge-action-core';

// Pure dispatcher logic lives in forge-action-core.ts so it can be
// unit-tested under `node --test` without an obsidian shim. Re-export it
// here so the rest of the plugin keeps a single import surface.
export {
  KNOWN_DOMAINS,
  forgeActionContext,
  parseDomainsField,
  isValidVaultName,
  renderForgeToml,
};
export type { ForgeActionContext };

// Registry the wizard resolves vault `latest` versions from. Mirrors the
// engine default (forge/config.py DEFAULT_REGISTRY_URL). A plugin setting
// could override this later; hardcoded is fine for v1.
const REGISTRY_URL =
  'https://raw.githubusercontent.com/frmoded/forge-registry/main/index.json';

// The repo BRAT installs this plugin from. Single source of truth — the
// "Create new Forge vault" explainer reuses this rather than re-typing
// the literal (per the prompt's reuse constraint).
export const BRAT_REPO_URL =
  'https://github.com/frmoded/forge-client-obsidian';

// ---------------------------------------------------------------------------
// Minimal surface the action UI needs from the plugin (keeps this module
// from importing main.ts and creating a cycle).
// ---------------------------------------------------------------------------

export interface ForgeHost {
  app: App;
  serverUrlOf(): string;
  vaultPathOf(): string;
  reloadActiveDomains(): Promise<void>;
  openModaView(): void;
  stepModaSimulation(): void;
}

// ---------------------------------------------------------------------------
// Dispatcher entry point
// ---------------------------------------------------------------------------

export async function openForgeAction(host: ForgeHost, evt: MouseEvent) {
  const adapter = host.app.vault.adapter;
  let tomlExists = false;
  let domainsField: string[] | undefined;
  try {
    tomlExists = await adapter.exists('forge.toml');
    if (tomlExists) {
      domainsField = parseDomainsField(await adapter.read('forge.toml'));
    }
  } catch {
    tomlExists = false;
  }

  const ctx = forgeActionContext(tomlExists, domainsField);
  if (ctx.kind === 'init') {
    new InitializeForgeVaultWizard(host).open();
  } else if (ctx.kind === 'legacy') {
    showActionMenu(host, evt, null);            // null = "all domains"
  } else {
    showActionMenu(host, evt, ctx.domains);
  }
}

// ---------------------------------------------------------------------------
// Action menu (legacy + declared-domains contexts)
// ---------------------------------------------------------------------------

function domainActive(declared: string[] | null, id: string): boolean {
  return declared === null || declared.includes(id);
}

function showActionMenu(
  host: ForgeHost,
  evt: MouseEvent,
  declared: string[] | null,
) {
  const menu = new Menu();

  if (declared === null) {
    menu.addItem(i =>
      i.setTitle('Update forge.toml: declare domains')
        .setIcon('settings')
        .onClick(() => new DeclareDomainsModal(host).open()));
    menu.addSeparator();
  }

  if (domainActive(declared, 'moda')) {
    menu.addItem(i =>
      i.setTitle('Open MoDa simulation').setIcon('atom')
        .onClick(() => host.openModaView()));
    menu.addItem(i =>
      i.setTitle('Step MoDa simulation').setIcon('step-forward')
        .onClick(() => host.stepModaSimulation()));
  }
  // (music actions land here when they exist)

  if (declared !== null) {
    menu.addSeparator();
    menu.addItem(i =>
      i.setTitle('Update installed domain vaults').setIcon('refresh-cw')
        .onClick(() => updateDeclaredVaults(host, declared)));
  }

  menu.addSeparator();
  menu.addItem(i =>
    i.setTitle('Create new Forge vault…').setIcon('folder-plus')
      .onClick(() => new CreateNewForgeVaultModal(host.app).open()));

  menu.addSeparator();
  menu.addItem(i =>
    i.setTitle('View forge.toml').setIcon('file-text')
      .onClick(() => {
        host.app.workspace.openLinkText('forge.toml', '', false);
      }));

  menu.showAtMouseEvent(evt);
}

async function updateDeclaredVaults(host: ForgeHost, declared: string[]) {
  const targets = KNOWN_DOMAINS.filter(
    d => declared.includes(d.id) && d.vault,
  );
  if (targets.length === 0) {
    new Notice('Forge: no registry-installable domain vaults to update.');
    return;
  }
  for (const d of targets) {
    const ok = await installVault(host, d.vault as string);
    if (!ok) return; // stop on first failure (per spec)
  }
  new Notice('Forge: domain vaults updated to latest.');
}

// ---------------------------------------------------------------------------
// Install path — direct `/compute install [name, version]`
//
// DEVIATION (documented in the report): the prompt describes authoring a
// temporary helper snippet, /generate, /run, delete. `install` is already
// a resolvable builtin snippet, so `/compute {snippet_id:"install",
// args:[name, version]}` does the same thing with no LLM round-trip and
// no temp-file residue — strictly better against the "cancelable without
// residue" + "show progress" constraints. Swap to a dedicated /install
// endpoint if one ever lands.
// ---------------------------------------------------------------------------

async function registryLatest(vaultName: string): Promise<string | null> {
  try {
    const res = await requestUrl({ url: REGISTRY_URL, method: 'GET' });
    const idx = res.json as {
      vaults?: Record<string, { latest?: string }>;
    };
    return idx.vaults?.[vaultName]?.latest ?? null;
  } catch (e) {
    console.error('Forge: registry fetch failed', e);
    return null;
  }
}

async function installVault(host: ForgeHost, vaultName: string): Promise<boolean> {
  const version = await registryLatest(vaultName);
  if (!version) {
    new Notice(
      `Forge: "${vaultName}" is not in the registry — declared the ` +
      `domain but skipped install.`);
    return false;
  }
  const modal = new ForgeGenerationModal(
    host.app, `Installing ${vaultName}@${version}…`);
  modal.open();
  try {
    await ensureServerRunning(host.serverUrlOf());
    const vaultPath = host.vaultPathOf();
    await connectVault(host.serverUrlOf(), vaultPath);
    const res = await computeSnippet(
      host.serverUrlOf(), vaultPath, 'install', [vaultName, version]);
    if (res.status !== 200) {
      const detail = res.json?.detail ?? `HTTP ${res.status}`;
      new Notice(`Forge: install of ${vaultName} failed — ${detail}`);
      return false;
    }
    new Notice(`Forge: installed ${vaultName}@${version}.`);
    return true;
  } catch (e) {
    console.error('Forge: install error', e);
    new Notice(`Forge: install of ${vaultName} failed — check console.`);
    return false;
  } finally {
    modal.finish();
  }
}

// ---------------------------------------------------------------------------
// Declare-domains dialog (legacy → declared)
// ---------------------------------------------------------------------------

class DeclareDomainsModal extends Modal {
  private picked = new Set<string>();

  constructor(private host: ForgeHost) {
    super(host.app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Declare domains' });
    contentEl.createEl('p', {
      text:
        'Write a `domains` field into this vault\'s forge.toml. Only the ' +
        'selected domains\' globals and /generate guidance will be in ' +
        'scope. Leaving all unchecked writes domains = [] (core-only).',
    });
    for (const d of KNOWN_DOMAINS) {
      new Setting(contentEl).setName(d.label).addToggle(t =>
        t.setValue(false).onChange(v => {
          if (v) this.picked.add(d.id);
          else this.picked.delete(d.id);
        }));
    }
    new Setting(contentEl).addButton(b =>
      b.setButtonText('Write forge.toml').setCta().onClick(() => this.submit()));
  }

  private async submit() {
    const adapter = this.host.app.vault.adapter;
    let toml = '';
    try {
      toml = await adapter.read('forge.toml');
    } catch {
      new Notice('Forge: forge.toml unreadable.');
      return;
    }
    const list =
      '[' + Array.from(this.picked).map(d => `"${d}"`).join(', ') + ']';
    const next = /^\s*domains\s*=.*$/m.test(toml)
      ? toml.replace(/^\s*domains\s*=.*$/m, `domains = ${list}`)
      : toml.replace(/\n*$/, `\ndomains = ${list}\n`);
    await adapter.write('forge.toml', next);
    await this.host.reloadActiveDomains();
    this.close();
    new Notice('Forge: domains declared. Reopen the Forge menu for scoped actions.');
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Create-new-Forge-vault explainer
//
// Plugins can't create Obsidian vaults or cross-vault-install plugins, so
// this is a hand-off: explain the BRAT-per-vault dance, copy the repo URL,
// and (if Obsidian exposes the command) jump to the vault manager.
// ---------------------------------------------------------------------------

class CreateNewForgeVaultModal extends Modal {
  // Steps as [text, isUrlStep] so the URL line can render distinctly.
  private static readonly STEPS: Array<string> = [
    'Open Obsidian\'s vault manager: click the vault name at the ' +
      'bottom-left, then "Manage vaults" → "Create new vault."',
    'Open the new empty vault.',
    'Settings → Community plugins → "Turn on community plugins."',
    'Browse → search "BRAT" → Install → Enable.',
    'Settings → BRAT → Add Beta plugin → paste the URL below, click Add.',
    'Settings → Community plugins → Installed → toggle "Forge Client" on.',
  ];

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('forge-new-vault-modal');
    contentEl.createEl('h2', { text: 'Create new Forge vault' });

    contentEl.createEl('p', {
      text:
        'To create a new Forge vault you\'ll repeat the Obsidian plugin ' +
        'install in the new vault. This is Obsidian\'s per-vault plugin ' +
        'model — annoying but unavoidable. Six steps:',
    });

    const ol = contentEl.createEl('ol', { cls: 'forge-new-vault-steps' });
    CreateNewForgeVaultModal.STEPS.forEach((step, i) => {
      const li = ol.createEl('li', { text: step });
      // The BRAT URL belongs visually with step 5 (index 4): boxed
      // monospace so it reads as "the thing you copy."
      if (i === 4) {
        li.createEl('div', {
          text: BRAT_REPO_URL,
          cls: 'forge-brat-url',
        });
      }
    });

    contentEl.createEl('p', {
      text:
        'After step 6 the Forge ribbon icon appears in the new vault. ' +
        'Click it to run the wizard and initialize the new vault.',
    });

    const buttons = new Setting(contentEl);
    buttons.addButton(b =>
      b.setButtonText('Copy BRAT URL').setCta().onClick(async () => {
        try {
          await navigator.clipboard.writeText(BRAT_REPO_URL);
          new Notice('Copied!');
        } catch {
          new Notice('Copy failed — select the URL in step 5 manually.');
        }
      }));

    // Only surface the vault-manager shortcut if Obsidian actually
    // registers the command — otherwise the text instructions stand on
    // their own and a dead button would just confuse.
    const commands = (this.app as any).commands;
    const hasOpenVault =
      commands?.commands?.['app:open-vault'] !== undefined ||
      typeof commands?.findCommand === 'function' &&
        commands.findCommand('app:open-vault') !== undefined;
    if (hasOpenVault) {
      buttons.addButton(b =>
        b.setButtonText('Open vault manager').onClick(() => {
          try {
            commands.executeCommandById('app:open-vault');
          } catch (e) {
            console.warn('Forge: app:open-vault failed', e);
          }
        }));
    }

    buttons.addButton(b =>
      b.setButtonText('Close').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Initialize-as-Forge-vault wizard
// ---------------------------------------------------------------------------

type Flavor = 'quick' | 'moda' | 'music' | 'multi' | 'empty';

class InitializeForgeVaultWizard extends Modal {
  private flavor: Flavor = 'quick';
  private multi = new Set<string>();
  private vaultName: string;

  constructor(private host: ForgeHost) {
    super(host.app);
    // Default to the Obsidian vault name, lowercased + sanitized toward
    // the engine's name rule; user can edit.
    this.vaultName = host.app.vault.getName()
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'my-vault';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Initialize as Forge vault' });

    const noteCount = this.host.app.vault.getMarkdownFiles().length;
    if (noteCount > 0) {
      const banner = contentEl.createDiv({ cls: 'forge-init-banner' });
      banner.createEl('strong', { text: 'Existing vault. ' });
      banner.appendText(
        `This vault has ${noteCount} existing note` +
        `${noteCount === 1 ? '' : 's'}. Initializing adds forge.toml ` +
        `and (optionally) a starter snippet — it won't modify or delete ` +
        `any existing notes.`);
    }

    new Setting(contentEl)
      .setName('Vault name')
      .setDesc('Lowercase letters, digits, dashes. 3–64 chars.')
      .addText(t =>
        t.setValue(this.vaultName).onChange(v => {
          this.vaultName = v.trim();
        }));

    contentEl.createEl('h3', { text: 'Flavor' });
    const flavorWrap = contentEl.createDiv();
    const flavors: Array<[Flavor, string, string]> = [
      ['quick', 'Quick try (recommended)',
        'forge.toml (domains = []) + a one-line forge-hello snippet.'],
      ['moda', 'MoDa',
        'domains = ["moda"], installs forge-moda from the registry, drops a welcome note.'],
      ['music', 'Music',
        'domains = ["music"], installs forge-music (if registered), drops a welcome note.'],
      ['multi', 'Multi-domain',
        'Pick any combination below; installs each chosen registry vault.'],
      ['empty', 'Empty Forge vault',
        'forge.toml (domains = []) and nothing else.'],
    ];
    for (const [id, label, desc] of flavors) {
      const s = new Setting(flavorWrap).setName(label).setDesc(desc);
      s.addButton(b => {
        b.setButtonText(this.flavor === id ? '✓ Selected' : 'Select')
          .onClick(() => {
            this.flavor = id;
            this.onClose();
            this.onOpen();
          });
        if (this.flavor === id) b.setCta();
      });
    }

    if (this.flavor === 'multi') {
      contentEl.createEl('h3', { text: 'Domains' });
      for (const d of KNOWN_DOMAINS) {
        new Setting(contentEl).setName(d.label).addToggle(t =>
          t.setValue(this.multi.has(d.id)).onChange(v => {
            if (v) this.multi.add(d.id);
            else this.multi.delete(d.id);
          }));
      }
    }

    new Setting(contentEl).addButton(b =>
      b.setButtonText('Initialize').setCta().onClick(() => this.initialize()));

    // Escape hatch: the user realized they want to start fresh in a
    // *different* Obsidian vault rather than initialize this one. Closes
    // the wizard and opens the cross-vault explainer.
    new Setting(contentEl)
      .setDesc('Want to start fresh somewhere else instead?')
      .addButton(b =>
        b.setButtonText('Create new Forge vault (in a different Obsidian vault)…')
          .onClick(() => {
            this.close();
            new CreateNewForgeVaultModal(this.app).open();
          }));
  }

  private chosenDomains(): string[] {
    switch (this.flavor) {
      case 'moda': return ['moda'];
      case 'music': return ['music'];
      case 'multi': return Array.from(this.multi);
      case 'quick':
      case 'empty':
      default: return [];
    }
  }

  private async initialize() {
    if (!isValidVaultName(this.vaultName)) {
      new Notice(
        'Forge: vault name must be lowercase letters/digits/dashes, ' +
        '3–64 chars (e.g. "my-forge-vault").');
      return;
    }
    const adapter = this.host.app.vault.adapter;
    if (await adapter.exists('forge.toml')) {
      new Notice('Forge: forge.toml already exists — not overwriting.');
      this.close();
      return;
    }

    const domains = this.chosenDomains();
    // 1. forge.toml
    await adapter.write('forge.toml',
      renderForgeToml(this.vaultName, domains));

    // 2. installs (sequential; stop on first failure, per spec)
    const toInstall = KNOWN_DOMAINS.filter(
      d => domains.includes(d.id) && d.vault);
    for (const d of toInstall) {
      const ok = await installVault(this.host, d.vault as string);
      if (!ok) {
        new Notice(
          `Forge: forge.toml written, but install of ${d.vault} did not ` +
          `complete. Fix the issue and use the Forge menu → Update.`);
        await this.host.reloadActiveDomains();
        this.close();
        return;
      }
    }

    // 3. starter content
    if (this.flavor === 'quick') {
      await this.createIfAbsent('forge-hello.md',
        '---\ntype: action\ninputs: []\ndescription: hello forge\n---\n\n' +
        "# English\n\nReturn the string 'hello forge'.\n\n# Python\n\n" +
        '```python\n```\n');
    } else if (this.flavor === 'moda' || this.flavor === 'music' ||
               (this.flavor === 'multi' && domains.length > 0)) {
      const where = domains.includes('moda')
        ? 'Open the Forge ribbon → "Open MoDa simulation" to launch the sim.'
        : 'Open the Forge ribbon for domain actions.';
      await this.createIfAbsent('welcome.md',
        `# Welcome to your Forge vault\n\nDomains: ${domains.join(', ') ||
        '(none)'}\n\n${where}\n`);
    }

    await this.host.reloadActiveDomains();
    this.close();
    new Notice(
      'Forge vault initialized. Click the Forge ribbon icon for actions.');
  }

  private async createIfAbsent(path: string, content: string) {
    const adapter = this.host.app.vault.adapter;
    if (!(await adapter.exists(path))) {
      await adapter.write(path, content);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
