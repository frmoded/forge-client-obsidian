import { App, Menu, Modal, Notice, Setting, requestUrl } from 'obsidian';
import { ForgeGenerationModal } from './modal.ts';
import { connectVault, computeSnippet } from './server.ts';
import {
  KNOWN_DOMAINS,
  ForgeActionContext,
  forgeActionContext,
  parseDomainsField,
  isValidVaultName,
  renderForgeToml,
  replaceForgeTomlDomains,
  unionDomains,
  diffDomains,
} from './forge-action-core.ts';
import {
  computeDomainActivationActions,
  DOMAIN_INVENTORY,
} from './domain-activation-core.ts';
import { ensureBundledFor } from './welcome.ts';
import { forgeNotice } from './forge-notice.ts';

// Pure dispatcher logic lives in forge-action-core.ts so it can be
// unit-tested under `node --test` without an obsidian shim. Re-export it
// here so the rest of the plugin keeps a single import surface.
export {
  KNOWN_DOMAINS,
  forgeActionContext,
  parseDomainsField,
  isValidVaultName,
  renderForgeToml,
  replaceForgeTomlDomains,
  unionDomains,
  diffDomains,
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
  // Open the chip palette view (same path as the `forge-open-chips`
  // command). The menu entry is always visible — the view itself
  // renders an empty-state message when no `_chips.md` is present
  // in the vault, so users discover the affordance there rather
  // than being gated out by a hidden menu item.
  openChipsView(): void;
  // v0.2.45: snapshot of currently-active domains, used by
  // EditVaultDomainsModal.applyDiff to compute the activation diff
  // before reloadActiveDomains shifts the in-memory state. Returns a
  // copy so the caller can hold it across the reload.
  currentActiveDomains(): Set<string> | null;
  // v0.2.45: register the command-palette entries for a domain that
  // just became active. Idempotent — addCommand on a duplicate id
  // overwrites silently.
  registerDomainCommands(domain: string): void;
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
  }

  // Structural action — sits above the operational/domain-specific
  // entries because it changes what the vault *is*, not what it does.
  menu.addItem(i =>
    i.setTitle('Edit vault domains…').setIcon('plus-circle')
      .onClick(() => new EditVaultDomainsModal(host).open()));
  menu.addSeparator();

  // Chips palette — canonical entry point per the chips-v2 follow-up.
  // Always visible (was previously gated on hasChips, but that hid the
  // entry from any vault whose _chips.md hadn't been read into the
  // cached palette yet — a discoverability trap, since the view
  // itself renders an empty-state message that teaches users how to
  // add chips). The view's own onOpen always refreshes from disk, so
  // clicking this fetches the current palette state.
  menu.addItem(i =>
    i.setTitle('Open chips palette').setIcon('puzzle')
      .onClick(() => host.openChipsView()));
  menu.addSeparator();

  if (domainActive(declared, 'moda')) {
    menu.addItem(i =>
      i.setTitle('Open MoDa simulation').setIcon('atom')
        .onClick(() => host.openModaView()));
    // "Step MoDa simulation" removed from the menu — still reachable
    // via Cmd+P (forge-step-moda command stays registered in main.ts).
  }
  // (music actions land here when they exist)

  // v0.2.13: "Update installed domain vaults" menu item removed.
  // It dispatched to updateDeclaredVaults → installVault, which posts
  // to a hosted vault registry that V1 doesn't have. The bundled
  // forge-moda runs from plugin assets and is auto-extracted on first
  // run by welcome.ts:ensureBundledForgeModa — no install step needed.
  // updateDeclaredVaults + installVault become dead helpers; the v1.0
  // audit pass (see v1-deployment-plan task #19) handles the cleanup
  // along with the other tactical dead code.

  menu.addSeparator();
  menu.addItem(i =>
    i.setTitle('Create new Forge vault…').setIcon('folder-plus')
      .onClick(() => new CreateNewForgeVaultModal(host.app).open()));
  // "View forge.toml" removed — the file is reachable via Obsidian's
  // file tree if anyone needs it.

  menu.showAtMouseEvent(evt);
}

async function updateDeclaredVaults(host: ForgeHost, declared: string[]) {
  const targets = KNOWN_DOMAINS.filter(
    d => declared.includes(d.id) && d.vault,
  );
  if (targets.length === 0) {
    void forgeNotice(this.app, 'Forge: no registry-installable domain vaults to update.');
    return;
  }
  for (const d of targets) {
    const ok = await installVault(host, d.vault as string);
    if (!ok) return; // stop on first failure (per spec)
    // Two-vault refactor: after each install completes, walk the
    // freshly-extracted library for any `role: root` snippets
    // (constitution A5.2) and copy missing ones to the vault root.
    // This closes the upgrade-path gap — a vault installed at a
    // pre-role-tagged version (e.g. forge-moda 0.4.0) that's now
    // bumped to a role-tagged version (0.5.0+) picks up the
    // shadow entry points without the user having to re-run the
    // wizard. Existing root files are NOT clobbered (skipped, with
    // a per-conflict Notice via copyLibraryRoots).
    const { copied, skipped } = await copyLibraryRoots(host, d.vault as string);
    if (copied.length > 0) {
      void forgeNotice(this.app, `Forge: ${d.vault}: copied ${copied.length} new ` +
        `role:root snippet(s) to vault root (${copied.join(', ')}).`);
    }
    if (skipped.length > 0) {
      void forgeNotice(this.app, `Forge: ${d.vault}: ${skipped.length} role:root ` +
        `snippet(s) already at vault root — preserved (${skipped.join(', ')}).`);
    }
  }
  void forgeNotice(this.app, 'Forge: domain vaults updated to latest.');
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

// Full registry vault map (description + latest), fetched lazily when a
// UI that needs descriptions opens. Returns null on network failure so
// callers can surface that honestly rather than show a stale/empty list.
async function fetchRegistryVaults(): Promise<
  Record<string, { description?: string; latest?: string }> | null
> {
  try {
    const res = await requestUrl({ url: REGISTRY_URL, method: 'GET' });
    const idx = res.json as {
      vaults?: Record<string, { description?: string; latest?: string }>;
    };
    return idx.vaults ?? {};
  } catch (e) {
    console.error('Forge: registry fetch failed', e);
    return null;
  }
}

// v0.2.14: installVault neutered. V1 closed-beta has no hosted vault
// registry; the engine's `install` snippet that this routed to isn't
// bundled into assets/engine/ either. Three call sites still reach
// here via the "Edit vault domains" modal and the
// InitializeForgeVaultWizard. Rather than rip out each call site
// (bigger UX surgery — see v1.0 audit task #19), neuter the function
// and surface a clear Notice to the user, then return false so the
// existing call-site failure branches handle the "didn't install"
// case gracefully.
//
// v0.2.15: bundled vaults (forge-moda, forge-music) need no install —
// their content already ships at assets/vaults/<name>/. Return true
// for them so the EditVaultDomainsModal proceeds with the forge.toml
// declaration write. welcome.ts:ensureBundledForgeMusic extracts the
// content into the vault root on next plugin load, gated on the new
// domain declaration. v1.0 audit (task #19) consolidates the BUNDLED
// set with pyodide-host.ts's BUNDLED_LIBRARY_NAMES — currently three
// copies hand-synced.
//
// `host` is kept on the signature so the call sites don't need
// touching; underscored to silence unused-param.
const BUNDLED_VAULTS = new Set(['forge-moda', 'forge-music']);

async function installVault(_host: ForgeHost, vaultName: string): Promise<boolean> {
  if (BUNDLED_VAULTS.has(vaultName)) {
    console.log(`Forge: ${vaultName} bundled — no install needed.`);
    return true;
  }

  console.warn(
    `Forge: install requested for "${vaultName}" — V1 closed beta `
    + 'does not support remote vault install.',
  );
  // v0.2.230 — forgeNotice's 3rd arg is `kind` ('info'|'error'|'success'),
  // not a duration. Pre-fix the 10000 was a leftover from the legacy
  // toast API (Notice takes ms). forgeNotice renders into the output
  // panel and has no per-call duration. Dropped the bad arg.
  void forgeNotice(this.app,
    `Forge: install of "${vaultName}" skipped — V1 closed beta has `
    + 'no remote vault registry. Only bundled vaults (forge-moda, '
    + 'forge-music) are available; additional vaults are deferred to v1.1+.',
  );
  return false;
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
      void forgeNotice(this.app, 'Forge: forge.toml unreadable.');
      return;
    }
    const next = replaceForgeTomlDomains(toml, Array.from(this.picked));
    await adapter.write('forge.toml', next);
    await this.host.reloadActiveDomains();
    this.close();
    void forgeNotice(this.app, 'Forge: domains declared. Reopen the Forge menu for scoped actions.');
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Edit-vault-domains dialog (add + remove against the manifest)
//
// Replaces the earlier add-only AddDomainToVaultModal. Toggle a row to
// express the desired final state; Save computes the diff. Removals
// trigger a NameError-warning confirmation. Removed domains are wiped
// from forge.toml only — installed subdirectories stay on disk so we
// never destroy data the user might still reference.
// ---------------------------------------------------------------------------

class EditVaultDomainsModal extends Modal {
  private prev: string[] = [];                  // domains in forge.toml at open
  private state = new Map<string, boolean>();   // domain id → desired-checked
  private rows = new Map<string, HTMLElement>(); // domain id → status cell
  private saveBtn?: { setDisabled(v: boolean): unknown };

  constructor(private host: ForgeHost) {
    super(host.app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Edit vault domains' });
    const loading = contentEl.createEl('p', { text: 'Fetching registry…' });

    // Snapshot current domains once at open (read-once constraint).
    // The final write does a fresh read so concurrent edits aren't
    // clobbered.
    try {
      const toml = await this.host.app.vault.adapter.read('forge.toml');
      this.prev = parseDomainsField(toml) ?? [];
    } catch {
      this.prev = [];
    }
    for (const d of KNOWN_DOMAINS) {
      this.state.set(d.id, this.prev.includes(d.id));
    }

    const registry = await fetchRegistryVaults();
    loading.remove();
    if (registry === null) {
      void forgeNotice(this.app, 'Forge: could not reach the registry — try again later.');
      this.close();
      return;
    }

    contentEl.createEl('p', {
      text:
        'Check a domain to add it (Forge will install the matching ' +
        'registry vault). Uncheck to remove it from forge.toml. ' +
        'Removing a domain edits forge.toml only — installed vault ' +
        'files stay on disk in case you want to keep them as ' +
        'reference. Delete the subdirectory manually if you want it gone.',
    });

    for (const d of KNOWN_DOMAINS) {
      const desc = d.vault ? registry[d.vault]?.description ?? '' : '';
      const name = desc ? `${d.id} — ${desc}` : d.id;
      const s = new Setting(contentEl)
        .setName(name)
        .addToggle(t =>
          t.setValue(this.state.get(d.id) ?? false).onChange(v => {
            this.state.set(d.id, v);
            this.refreshSaveBtn();
          }));
      const status = s.controlEl.createSpan({ cls: 'forge-add-domain-status' });
      this.rows.set(d.id, status);
    }

    new Setting(contentEl)
      .addButton(b => {
        this.saveBtn = b;
        b.setButtonText('Save').setCta().setDisabled(true)
          .onClick(() => this.onSaveClicked());
      })
      .addButton(b =>
        b.setButtonText('Cancel').onClick(() => this.close()));
  }

  private desiredNext(): string[] {
    // Retained: prev domains the user didn't uncheck, in original
    // order. Added: known domains the user just checked that weren't
    // in prev, in KNOWN_DOMAINS order. Unknown-extra domains from the
    // manifest (e.g., a future domain the plugin doesn't know about
    // yet) are preserved as retained too.
    const retained = this.prev.filter(id => {
      // If we don't render a toggle for it (unknown domain), keep it.
      if (!this.state.has(id)) return true;
      return this.state.get(id) === true;
    });
    const added = KNOWN_DOMAINS
      .map(d => d.id)
      .filter(id => this.state.get(id) === true && !this.prev.includes(id));
    return [...retained, ...added];
  }

  private currentDiff() {
    return diffDomains(this.prev, this.desiredNext());
  }

  private refreshSaveBtn() {
    const { to_add, to_remove } = this.currentDiff();
    this.saveBtn?.setDisabled(to_add.length === 0 && to_remove.length === 0);
  }

  private onSaveClicked() {
    const diff = this.currentDiff();
    if (diff.to_remove.length > 0) {
      new ConfirmRemoveDomainsModal(
        this.host.app, diff.to_remove,
        () => this.applyDiff(diff),
      ).open();
      return;
    }
    this.applyDiff(diff);
  }

  private async applyDiff(diff: { to_add: string[]; to_remove: string[] }) {
    this.saveBtn?.setDisabled(true);

    // Run adds sequentially first — same stop-on-failure-without-write
    // pattern as the previous add-only modal. Removals happen as part
    // of the single forge.toml rewrite once installs succeed.
    for (const id of diff.to_add) {
      const d = KNOWN_DOMAINS.find(x => x.id === id);
      const status = this.rows.get(id);
      if (!d?.vault) {
        if (status) status.setText(`— ${id}: not registry-installable`);
        continue;
      }
      if (status) status.setText(`Installing ${d.vault} …`);
      const ok = await installVault(this.host, d.vault);
      if (!ok) {
        if (status) status.setText(`Installing ${d.vault} … failed`);
        // v0.2.14: secondary Notice removed. installVault's v0.2.14
        // neuter already surfaced "V1 closed beta has no remote vault
        // registry…" — the previous "Fix the issue and retry" message
        // is confusing because there's no issue to fix. The in-modal
        // status update above stays so the user sees which row failed.
        this.refreshSaveBtn();
        return; // modal stays open; no manifest write
      }
      if (status) status.setText(`Installing ${d.vault} … done`);
    }

    // Write the final domain list (desired state). Fresh read so an
    // external edit during the session isn't clobbered; we still
    // compute "final" from this.desiredNext() because that reflects
    // the user's intent vs. what may have changed on disk.
    const adapter = this.host.app.vault.adapter;
    let toml = '';
    try {
      toml = await adapter.read('forge.toml');
    } catch {
      void forgeNotice(this.app, 'Forge: forge.toml unreadable — installs done but ' +
        'manifest not updated.');
      return;
    }
    const next = this.desiredNext();
    // v0.2.45: capture the active-domain set BEFORE reloadActiveDomains
    // so we can compute which activation actions need to fire for
    // newly-added domains.
    const oldActive = this.host.currentActiveDomains();
    await adapter.write('forge.toml', replaceForgeTomlDomains(toml, next));
    await this.host.reloadActiveDomains();
    const newActive = this.host.currentActiveDomains();

    // v0.2.45: re-fire domain-gated onload paths for newly-active
    // domains. Without this, EditVaultDomainsModal updated forge.toml
    // and refreshed activeDomains but never fired registerDomainCommands
    // or ensureBundledFor — user had to fully quit + reopen Obsidian
    // to see the effect. Surfaced by the mint-laptop V1 smoke
    // (2026-06-03 evening). Decision: domain-activation-core's pure-
    // core helper computes the action list; this glue dispatches each
    // action via the host or via the welcome-flow's ensureBundledFor.
    const actions = computeDomainActivationActions(
      oldActive, newActive, DOMAIN_INVENTORY,
    );
    let extractFailures = 0;
    for (const action of actions) {
      try {
        if (action.type === 'extract') {
          await ensureBundledFor(action.domain, this.host.app);
        } else if (action.type === 'register-commands') {
          this.host.registerDomainCommands(action.domain);
        }
      } catch (e) {
        console.error(`applyDiff: domain-activation action ${action.type}/${action.domain} failed`, e);
        if (action.type === 'extract') extractFailures += 1;
      }
    }
    this.close();
    // v0.2.45: Notice text aligned with the new behavior. The
    // pre-v0.2.45 "Reopen the Forge menu for the new domain actions"
    // was misleading — reopening the menu didn't help; only a full
    // Cmd-Q + reopen did. Now activation is in-band; the Notice just
    // confirms the update.
    if (extractFailures > 0) {
      void forgeNotice(this.app, 
        `Forge: vault updated, but ${extractFailures} bundled-vault ` +
        `extraction(s) failed. Check DevTools console; you may need ` +
        `to fully quit Obsidian (Cmd-Q) and reopen.`,
      );
    } else if (actions.length > 0) {
      void forgeNotice(this.app, 'Forge: vault updated. New domain actions are now available.');
    } else {
      void forgeNotice(this.app, 'Forge: vault updated.');
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Confirmation shown when an Edit-vault-domains save would remove one
// or more domains. Spelled out as its own modal class so the warning
// wording lives in one place and the parent's checkbox state stays put
// if the user backs out.
class ConfirmRemoveDomainsModal extends Modal {
  constructor(
    app: App,
    private toRemove: string[],
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Remove domains?' });
    const n = this.toRemove.length;
    contentEl.createEl('p', {
      text:
        `Removing ${n} domain${n === 1 ? '' : 's'} (` +
        this.toRemove.join(', ') +
        `) — snippets in this vault that use injected names from ` +
        `${n === 1 ? 'that domain' : 'those domains'} (e.g. ` +
        `\`Particle\`, \`music21\`) will fail at compute time with ` +
        `NameError after this change. Installed vault files stay on ` +
        `disk; only forge.toml is edited. Continue?`,
    });
    new Setting(contentEl)
      .addButton(b =>
        b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b =>
        b.setButtonText('Remove anyway').setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }));
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
          void forgeNotice(this.app, 'Copied!');
        } catch {
          void forgeNotice(this.app, 'Copy failed — select the URL in step 5 manually.');
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
            console.error('openForgeAction (open-vault button): app:open-vault failed', e);
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

type Flavor = 'quick' | 'moda' | 'moda-learning' | 'music' | 'multi' | 'empty';

/** Copy every `role: root` snippet from a freshly-installed library
 *  subdir into the vault root. Returns the list of files copied vs
 *  skipped (conflict — a same-named file already exists at root, and
 *  we never clobber user content). Consumed by the moda-learning
 *  wizard flavor (constitution A5.2). */
async function copyLibraryRoots(
  host: ForgeHost,
  libraryDirName: string,
): Promise<{ copied: string[]; skipped: string[] }> {
  const adapter = host.app.vault.adapter;
  const out = { copied: [] as string[], skipped: [] as string[] };
  let listing;
  try {
    listing = await adapter.list(libraryDirName);
  } catch (e) {
    console.error(`copyLibraryRoots: could not list library dir ${libraryDirName}`, e);
    return out;
  }
  for (const filePath of listing.files) {
    if (!filePath.endsWith('.md')) continue;
    let content: string;
    try {
      content = await adapter.read(filePath);
    } catch {
      continue;
    }
    if (!hasRoleRoot(content)) continue;
    const name = filePath.split('/').pop()!;
    if (await adapter.exists(name)) {
      out.skipped.push(name);
      continue;
    }
    await adapter.write(name, content);
    out.copied.push(name);
  }
  return out;
}

/** Quick YAML-frontmatter check for `role: root` without dragging in
 *  a YAML parser. Frontmatter is the leading `---`...`---` block;
 *  anywhere inside that block, a line matching `role: root` (with
 *  optional surrounding whitespace) qualifies. */
function hasRoleRoot(content: string): boolean {
  if (!content.startsWith('---')) return false;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return false;
  return /^\s*role:\s*root\s*$/m.test(content.slice(0, end));
}

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
      ['moda', 'MoDa (library only)',
        'domains = ["moda"], installs forge-moda from the registry, drops a welcome note. Library snippets stay in forge-moda/ — for vaults that author against the library without editing it.'],
      ['moda-learning', 'MoDa learning vault (recommended for new users)',
        'Same as MoDa, plus copies the library\'s role: root snippets (setup, on_mouse_click, go) to the vault root as your editable entry points. Library leaves stay in forge-moda/ and can be customized later.'],
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
      case 'moda':
      case 'moda-learning': return ['moda'];
      case 'music': return ['music'];
      case 'multi': return Array.from(this.multi);
      case 'quick':
      case 'empty':
      default: return [];
    }
  }

  private async initialize() {
    if (!isValidVaultName(this.vaultName)) {
      void forgeNotice(this.app, 
        'Forge: vault name must be lowercase letters/digits/dashes, ' +
        '3–64 chars (e.g. "my-forge-vault").');
      return;
    }
    const adapter = this.host.app.vault.adapter;
    if (await adapter.exists('forge.toml')) {
      void forgeNotice(this.app, 'Forge: forge.toml already exists — not overwriting.');
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
        // v0.2.14: secondary Notice removed. installVault's v0.2.14
        // neuter Notice already explains "V1 has no remote registry";
        // the previous "use the Forge menu → Update" message pointed
        // at the same broken path. Reload domains + close the wizard
        // so the user can move on without confusion.
        await this.host.reloadActiveDomains();
        this.close();
        return;
      }
    }

    // 3. moda-learning flavor: copy role:root snippets from the
    //    installed library subdir to the vault root, where the user
    //    can edit them and they'll shadow the library via A4. The
    //    library's leaves stay in forge-moda/ and become customizable
    //    later via the "Customize" affordance. Per constitution A5.2.
    if (this.flavor === 'moda-learning') {
      const { copied, skipped } = await copyLibraryRoots(this.host, 'forge-moda');
      if (copied.length > 0) {
        void forgeNotice(this.app, `Forge: copied ${copied.length} role:root snippet(s) ` +
          `to vault root (${copied.join(', ')}).`);
      }
      if (skipped.length > 0) {
        void forgeNotice(this.app, `Forge: skipped ${skipped.length} role:root copy ` +
          `(conflict — same name already at vault root): ${skipped.join(', ')}`);
      }
    }

    // 4. starter content
    if (this.flavor === 'quick') {
      // v0.2.231 — V2 shape. Description is intent-level prose; Recipe
      // is empty so cohort can Forge-click and watch implicit-locking
      // generate Python from a [[print]] call they author themselves.
      await this.createIfAbsent('forge-hello.md',
        '---\ntype: action\ndescription: hello forge\n---\n\n' +
        '# Description\n\nReturn the string "hello forge".\n\n' +
        '# Recipe\n\nCall [[print]] with text="hello forge".\n');
    } else if (this.flavor === 'moda' || this.flavor === 'moda-learning' ||
               this.flavor === 'music' ||
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
    void forgeNotice(this.app, 
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
