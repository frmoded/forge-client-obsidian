import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';

export const MODA_VIEW_TYPE = 'forge-moda';

// TODO: surface the iframe URL as a plugin setting once forge-moda-client is
// hosted somewhere other than the local Vite dev server.
const MODA_CLIENT_URL = 'http://localhost:5173';

interface FeaturedSnippet {
  snippet_id: string;
  label: string;
}

export class ForgeModaView extends ItemView {
  private iframeEl: HTMLIFrameElement | null = null;
  private readyListener: ((e: MessageEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return MODA_VIEW_TYPE; }
  getDisplayText() { return 'MoDa simulation'; }
  getIcon() { return 'atom'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.style.padding = '0';
    container.style.overflow = 'hidden';

    const iframe = container.createEl('iframe');
    iframe.src = MODA_CLIENT_URL;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    this.iframeEl = iframe;

    // Featured-snippet discovery handshake + compute-result relay.
    // Two message types arrive from the iframe on this channel:
    //   - `iframe-ready` (sent on mount) — we respond with the
    //     featured-snippet discovery info. Done as a handshake
    //     because the iframe's React mount + useEffect listener
    //     registration happens AFTER the iframe `load` event; a
    //     too-early post would arrive before the listener attached.
    //   - `compute-result` (sent after a featured-button click) —
    //     we forward snippet_id + stdout + result into Forge Output
    //     via OutputView.append(). This is the plugin-side half of
    //     the unify-stdout-sink wiring: featured-button stdout no
    //     longer lands on the floor.
    // Both filter on `e.source === iframeEl.contentWindow` to drop
    // stray cross-frame messages from other Obsidian content.
    this.readyListener = (e: MessageEvent) => {
      if (e.source !== this.iframeEl?.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'iframe-ready') {
        void this.postFeaturedSnippet();
        return;
      }
      if (data.type === 'compute-result'
          && typeof data.snippet_id === 'string') {
        void this.relayComputeResult(
          data.snippet_id,
          typeof data.stdout === 'string' ? data.stdout : '',
          data.result,
          typeof data.error === 'string' ? data.error : undefined,
        );
      }
    };
    window.addEventListener('message', this.readyListener);
  }

  /** Forward a compute-result from the iframe into Forge Output. Mirrors
   *  the convention of `getOutputView` in main.ts — open the output
   *  panel on demand if none is present, then append. Errors get
   *  routed through appendError; otherwise the success append carries
   *  the stdout + structured result for OutputView.renderResult to
   *  pick its renderer (raw JSON fallback for `moda_sim_state` today;
   *  the canvas in the iframe is the visual surface for that shape). */
  private async relayComputeResult(
    snippetId: string,
    stdout: string,
    result: unknown,
    error?: string,
  ): Promise<void> {
    const view = await this.getOrOpenOutputView();
    if (error) {
      view.appendError(snippetId, error, stdout);
    } else {
      view.append(snippetId, stdout, result);
    }
  }

  /** Resolve or open the Forge Output view. Replicates main.ts's
   *  `getOutputView` shape — the plugin's main class is the canonical
   *  owner, but this view doesn't have a handle to it and replicating
   *  the few lines is cleaner than wiring an injection. Picks the
   *  right-leaf convention to match the open-on-demand UX everywhere
   *  else in the plugin. */
  private async getOrOpenOutputView(): Promise<ForgeOutputView> {
    const existing = this.app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (existing) return existing.view as ForgeOutputView;
    const leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf;
    await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view as ForgeOutputView;
  }

  /** Advance the embedded simulator one tick. The React app listens for
   *  `{type:'step'}` and calls its existing handleStep (one /moda/compute
   *  tick). No backend round-trip from the plugin side. Returns false if
   *  the iframe isn't ready (caller surfaces a Notice). */
  step(): boolean {
    const win = this.iframeEl?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'step' }, '*');
    return true;
  }

  /** Scan the active vault for snippets with `featured: true` in
   *  frontmatter, pick the first by snippet ID (alphabetical, so
   *  resolution stays deterministic across runs), and postMessage
   *  the result to the iframe. Warns once in the developer console
   *  if multiple featured snippets exist (current scope is
   *  one-button-per-vault per the spec). */
  private async postFeaturedSnippet() {
    const win = this.iframeEl?.contentWindow;
    if (!win) return;
    const featured = this.findFeaturedSnippet();
    if (!featured) return;
    const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath;
    if (!vaultPath) {
      console.warn('Forge: cannot postMessage featured-snippet — vault adapter has no basePath');
      return;
    }
    win.postMessage(
      {
        type: 'featured-snippet',
        snippet_id: featured.snippet_id,
        label: featured.label,
        vault_path: vaultPath,
      },
      '*',
    );
  }

  /** Walk every markdown file in the vault (root + library subdirs);
   *  collect any with `featured: true` in frontmatter; return the
   *  first by snippet ID. metadataCache holds parsed frontmatter for
   *  every file Obsidian has indexed, so this is a synchronous
   *  in-memory walk — no disk I/O. */
  private findFeaturedSnippet(): FeaturedSnippet | null {
    const matches: FeaturedSnippet[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.featured !== true) continue;
      matches.push({
        snippet_id: file.basename,
        label: typeof fm.forge_action_label === 'string' && fm.forge_action_label
          ? fm.forge_action_label
          : (typeof fm.description === 'string' && fm.description
              ? fm.description
              : 'Run'),
      });
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.snippet_id.localeCompare(b.snippet_id));
    if (matches.length > 1) {
      console.warn(
        'Forge: multiple featured snippets found; using first by id. ' +
        `picked=${matches[0].snippet_id}, all=${matches.map(m => m.snippet_id).join(', ')}`,
      );
    }
    return matches[0];
  }

  async onClose() {
    if (this.readyListener) {
      window.removeEventListener('message', this.readyListener);
      this.readyListener = null;
    }
    this.iframeEl = null;
    this.contentEl.empty();
  }

  // Tiny silencer to keep TS happy about TFile unused while still
  // hinting that getMarkdownFiles returns TFile[] (referenced in
  // findFeaturedSnippet). No-op at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _typeHintTFile?: TFile;
}
