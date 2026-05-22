import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';

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

    // Featured-snippet discovery handshake. The iframe posts
    // `{type:'iframe-ready'}` on mount; we respond with the
    // discovery info. Done as a handshake (not a fixed-delay post)
    // because the iframe's React mount + useEffect registration
    // happens AFTER the iframe `load` event, and a too-early post
    // would arrive before the listener attached. The iframe's
    // listener also ignores duplicates safely (single setState).
    this.readyListener = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== 'iframe-ready') return;
      // Confirm the message actually came from our iframe — drops
      // any stray cross-frame messages from other Obsidian content.
      if (e.source !== this.iframeEl?.contentWindow) return;
      void this.postFeaturedSnippet();
    };
    window.addEventListener('message', this.readyListener);
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
