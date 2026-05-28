import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from './output-view';
import { getPyodideHost } from './pyodide-host';
import type { ForgeSettings } from './settings';

export const MODA_VIEW_TYPE = 'forge-moda';

// V1 Phase 2: iframe loads from the plugin's bundled assets by
// default; the `useDevIframe` setting flips to the Vite dev server
// for iterative iframe development.
const DEV_IFRAME_URL = 'http://localhost:5173';

interface FeaturedSnippet {
  snippet_id: string;
  label: string;
}

// Settings accessor injected by main.ts via the registerView factory.
// Kept narrow (just the fields moda-view actually uses) so we don't
// need a circular import on the full plugin instance.
type ModaViewDeps = {
  getSettings: () => ForgeSettings;
  pluginId: string;
};

export class ForgeModaView extends ItemView {
  private iframeEl: HTMLIFrameElement | null = null;
  private readyListener: ((e: MessageEvent) => void) | null = null;
  private deps: ModaViewDeps;

  constructor(leaf: WorkspaceLeaf, deps: ModaViewDeps) {
    super(leaf);
    this.deps = deps;
  }

  /** Resolve the iframe source: dev (Vite at localhost:5173) when
   *  the `useDevIframe` setting is on, else the bundled iframe from
   *  the plugin's installed assets. */
  private iframeSrc(): string {
    if (this.deps.getSettings().useDevIframe) {
      return DEV_IFRAME_URL;
    }
    const relpath = `.obsidian/plugins/${this.deps.pluginId}/assets/iframe/index.html`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.app.vault.adapter as any).getResourcePath(relpath);
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
    iframe.src = this.iframeSrc();
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
        return;
      }
      // V1 Phase 2: iframe sends engine-request for /moda/* and the
      // generic /compute path. Dispatch via the plugin-side Pyodide
      // host; reply with engine-response carrying the matching
      // request_id.
      if (data.type === 'engine-request'
          && typeof data.request_id === 'string'
          && typeof data.op === 'string') {
        void this.handleEngineRequest(
          data.request_id,
          data.op,
          Array.isArray(data.args) ? data.args : [],
          typeof data.vault_name === 'string' ? data.vault_name : undefined,
        );
      }
    };
    window.addEventListener('message', this.readyListener);
  }

  /** Dispatch a single engine-request via the plugin's Pyodide host,
   *  then postMessage the result back to the iframe's contentWindow
   *  with the matching request_id. State for moda-compute / moda-click
   *  lives in Pyodide globals (per-instance) between calls — the
   *  iframe's adapter passes only dt/temperature and x/y; the Python
   *  side reads + updates `_forge_moda_state`. */
  private async handleEngineRequest(
    requestId: string,
    op: string,
    args: unknown[],
    vault_name: string | undefined,
  ): Promise<void> {
    const respond = (resp: { ok: boolean; result?: unknown; error?: string }) => {
      this.iframeEl?.contentWindow?.postMessage(
        { type: 'engine-response', request_id: requestId, ...resp },
        '*',
      );
    };
    try {
      const hostManager = getPyodideHost();
      if (!hostManager) {
        throw new Error('Pyodide host not initialized');
      }
      const host = await hostManager.getInstance();
      let result: unknown;
      switch (op) {
        case 'moda-init':
          result = await host.modaInit();
          break;
        case 'moda-compute': {
          const [dt, temperature] = args as [number, string];
          result = await host.modaCompute(dt, temperature);
          break;
        }
        case 'moda-click': {
          const [x, y] = args as [number, number];
          result = await host.modaClick(x, y);
          break;
        }
        case 'compute': {
          const [snippet_id] = args as [string];
          // v0.2.9: vault_name dropped from computeViaEngine — the
          // single-user-vault model resolves A4 + A5.1 the same
          // regardless of which vault the iframe announces. The
          // iframe-side `vault_name` parameter on the engine-request
          // postMessage payload is kept for now to avoid touching the
          // iframe contract; it just isn't forwarded into compute.
          void vault_name;
          const r = await host.computeViaEngine(snippet_id, []);
          // Shape to match the existing GenericComputeResponse the
          // iframe's computeSnippet consumer expects.
          result = { type: 'action', result: r.result, stdout: r.stdout };
          break;
        }
        default:
          throw new Error(`unknown engine-request op: ${op}`);
      }
      respond({ ok: true, result });
    } catch (e) {
      respond({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
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
    // Belt-and-braces: getOrOpenOutputView force-materializes the
    // view, but if Obsidian's deferred-view machinery still gives
    // us a placeholder (unlikely after the materialize step), fall
    // back to inlining the error/stdout as a regular append. Better
    // a missing red-styled error band than a hard TypeError.
    if (error) {
      if (typeof (view as unknown as { appendError?: unknown }).appendError === 'function') {
        view.appendError(snippetId, error, stdout);
      } else {
        const body = stdout ? `[error] ${error}\n${stdout}` : `[error] ${error}`;
        view.append?.(snippetId, body, null);
      }
    } else {
      if (typeof (view as unknown as { append?: unknown }).append === 'function') {
        view.append(snippetId, stdout, result);
      } else {
        console.error('Forge: OutputView.append not available; compute-result lost', { snippetId });
      }
    }
  }

  /** Resolve or open the Forge Output view. Replicates main.ts's
   *  `getOutputView` shape — the plugin's main class is the canonical
   *  owner, but this view doesn't have a handle to it and replicating
   *  the few lines is cleaner than wiring an injection. Picks the
   *  right-leaf convention to match the open-on-demand UX everywhere
   *  else in the plugin.
   *
   *  Obsidian lazy-loads leaves from prior sessions: leaf.view is a
   *  DeferredView placeholder until the leaf is activated or its
   *  view is explicitly loaded. The placeholder doesn't have
   *  ForgeOutputView's subclass methods (append, appendError), so a
   *  naive cast → method call throws "not a function". We
   *  force-materialize by calling setViewState with the same type;
   *  Obsidian then swaps in the real ForgeOutputView instance. */
  private async getOrOpenOutputView(): Promise<ForgeOutputView> {
    const existing = this.app.workspace.getLeavesOfType(OUTPUT_VIEW_TYPE)[0];
    if (existing) {
      if (!(existing.view instanceof ForgeOutputView)) {
        // Deferred view — force load by re-asserting the view state.
        await existing.setViewState({ type: OUTPUT_VIEW_TYPE, active: true });
      }
      this.app.workspace.revealLeaf(existing);
      return existing.view as ForgeOutputView;
    }
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
