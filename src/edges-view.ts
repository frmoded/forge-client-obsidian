import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import {
  SnapshotMeta,
  listIncoming,
  listOutgoing,
  pathToSnippetId,
  relativeTime,
  snapshotPath,
} from './edges.ts';
import { detectDrift } from './dependencies.ts';
import { freezeEdge, syncDependencies } from './server.ts';
import { forgeNotice } from './forge-notice.ts';

export const EDGES_VIEW_TYPE = 'forge-edges-view';

export class ForgeEdgesView extends ItemView {
  private bodyEl!: HTMLElement;
  private currentSnippetId: string | null = null;
  // Tracks the last markdown file the user looked at. Updated only when
  // a real markdown leaf is active, so clicking the panel's own Refresh
  // button (which makes the edges leaf active) doesn't clobber the
  // shown snippet to "no markdown view → empty state".
  private currentFile: TFile | null = null;
  // Single-flight guard. active-leaf-change can fire twice in rapid
  // succession during tab switching; without this, two refresh() calls
  // race past each other's bodyEl.empty() and the panel renders doubled.
  private refreshing = false;

  constructor(leaf: WorkspaceLeaf, private serverUrl: () => string) {
    super(leaf);
  }

  getViewType() { return EDGES_VIEW_TYPE; }
  getDisplayText() { return 'Forge Edges'; }
  getIcon() { return 'git-branch'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('forge-edges-view');

    const header = contentEl.createDiv({ cls: 'forge-edges-header' });
    header.createEl('span', { text: 'Forge Edges', cls: 'forge-edges-title' });
    header.createEl('button', { text: 'Refresh', cls: 'forge-edges-refresh' })
      .onclick = () => this.refresh();

    this.bodyEl = contentEl.createDiv({ cls: 'forge-edges-body' });

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refresh()));
    await this.refresh();
  }

  async onClose() {
    this.contentEl.empty();
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      // Only adopt the active leaf's file when it really is a markdown view.
      // Clicking Refresh focuses this panel, which makes
      // getActiveViewOfType(MarkdownView) return null — without the
      // currentFile fallback we'd flip to "Open a snippet to see its
      // edges." every time the user hit Refresh.
      const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeMd?.file) {
        this.currentFile = activeMd.file;
      } else if (!this.currentFile) {
        // First-open / post-hot-reload case: no markdown is the active
        // leaf, currentFile was never set. Walk the open markdown leaves
        // and pick the first one's file so we have something to query.
        const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of mdLeaves) {
          const v = leaf.view;
          if (v instanceof MarkdownView && v.file) {
            this.currentFile = v.file;
            break;
          }
        }
      }

      if (!this.currentFile) {
        this.bodyEl.empty();
        this.bodyEl.createEl('p', { text: 'Open a snippet to see its edges.', cls: 'forge-edges-empty' });
        this.currentSnippetId = null;
        return;
      }

      this.currentSnippetId = await pathToSnippetId(this.app, this.currentFile.path);
      const [outgoing, incoming] = await Promise.all([
        listOutgoing(this.app, this.currentSnippetId),
        listIncoming(this.app, this.currentSnippetId),
      ]);

      this.bodyEl.empty();
      this.bodyEl.createEl('p', { text: this.currentSnippetId, cls: 'forge-edges-active' });

      if (activeMd) {
        await this.renderDriftBanner(activeMd);
      }

      this.renderSection('Outgoing', outgoing, 'caller', this.currentSnippetId);
      this.renderSection('Incoming', incoming, 'callee', this.currentSnippetId);
    } finally {
      this.refreshing = false;
    }
  }

  private async renderDriftBanner(view: MarkdownView) {
    if (!view.file) return;
    const content = await this.app.vault.read(view.file);
    const drift = detectDrift(content);
    if (!drift.hasDrift) return;

    const banner = this.bodyEl.createDiv({ cls: 'forge-edges-drift' });
    const icon = banner.createEl('span', { text: '⚠', cls: 'forge-edges-drift-icon' });
    void icon;
    const msg = banner.createDiv({ cls: 'forge-edges-drift-msg' });

    if (drift.missingFromDeps.length > 0) {
      const ids = drift.missingFromDeps.map(s => `[[${s}]]`).join(' ');
      msg.createEl('div', { text: `Python uses ${ids} which isn't in Dependencies.` });
    }
    if (drift.stale.length > 0) {
      const ids = drift.stale.map(s => `[[${s}]]`).join(' ');
      msg.createEl('div', { text: `Dependencies still lists ${ids} but Python no longer calls it.` });
    }

    const actions = banner.createDiv({ cls: 'forge-edges-drift-actions' });
    const sync = actions.createEl('button', { text: 'Sync edges', cls: 'mod-cta' });
    sync.onclick = async () => {
      if (!this.currentSnippetId) return;
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      const res = await syncDependencies(this.serverUrl(), vaultPath, this.currentSnippetId);
      if (res.status === 200) {
        void forgeNotice(this.app, 'Forge: edges synced.');
        await this.refresh();
      } else {
        void forgeNotice(this.app, `Forge: sync failed (${res.status})`);
      }
    };
  }

  private renderSection(
    label: 'Outgoing' | 'Incoming',
    edges: SnapshotMeta[],
    pivotField: 'caller' | 'callee',
    activeId: string,
  ) {
    const wrap = this.bodyEl.createDiv({ cls: 'forge-edges-section' });
    const head = wrap.createDiv({ cls: 'forge-edges-section-head' });
    head.createEl('h4', { text: `${label} (${edges.length})` });

    if (edges.length > 0) {
      const bulk = head.createDiv({ cls: 'forge-edges-bulk' });
      bulk.createEl('button', { text: 'Freeze all' })
        .onclick = () => this.bulkSet(edges, 'frozen');
      bulk.createEl('button', { text: 'Unfreeze all' })
        .onclick = () => this.bulkSet(edges, 'live');
    }

    if (edges.length === 0) {
      wrap.createEl('p', {
        text: label === 'Outgoing'
          ? 'No outgoing edges yet — run this snippet to capture some.'
          : 'No snippet has called this one yet.',
        cls: 'forge-edges-empty',
      });
      return;
    }

    const list = wrap.createEl('ul', { cls: 'forge-edges-list' });
    for (const edge of edges) {
      this.renderEdgeRow(list, edge, pivotField, activeId);
    }
  }

  private renderEdgeRow(
    list: HTMLElement,
    edge: SnapshotMeta,
    pivotField: 'caller' | 'callee',
    activeId: string,
  ) {
    const li = list.createEl('li', { cls: 'forge-edges-row' });
    li.toggleClass('is-frozen', edge.state === 'frozen');

    // Show the OTHER side of the edge — for outgoing, the callee; for incoming, the caller.
    const otherId = pivotField === 'caller' ? edge.callee : edge.caller;
    const link = li.createEl('a', { text: otherId, cls: 'forge-edges-link' });
    link.onclick = (ev) => {
      ev.preventDefault();
      this.app.workspace.openLinkText(otherId, '', false);
    };

    li.createEl('span', { text: edge.state, cls: `forge-edges-state forge-edges-state-${edge.state}` });
    li.createEl('span', { text: relativeTime(edge.captured_at), cls: 'forge-edges-time' });

    const btn = li.createEl('button', {
      text: edge.state === 'frozen' ? 'Unfreeze' : 'Freeze',
      cls: 'forge-edges-toggle',
    });
    btn.onclick = () => this.toggleEdge(edge);

    const open = li.createEl('a', { text: 'snapshot', cls: 'forge-edges-snapshot-link' });
    open.onclick = (ev) => {
      ev.preventDefault();
      const path = snapshotPath(edge.caller, edge.callee);
      this.app.workspace.openLinkText(path, '', false);
    };
  }

  private async toggleEdge(edge: SnapshotMeta) {
    const next = edge.state === 'frozen' ? 'live' : 'frozen';
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const res = await freezeEdge(this.serverUrl(), vaultPath, edge.caller, edge.callee, next);
    if (res.status === 200) {
      void forgeNotice(this.app, `Forge: ${edge.caller} → ${edge.callee} now ${next}`);
      await this.refresh();
    } else {
      void forgeNotice(this.app, `Forge: toggle failed (${res.status}) — ${res.json?.detail ?? 'see console'}`);
      console.error('Forge edge toggle failed', res);
    }
  }

  private async bulkSet(edges: SnapshotMeta[], state: 'frozen' | 'live') {
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const url = this.serverUrl();
    let ok = 0, fail = 0;
    for (const e of edges) {
      if (e.state === state) continue;
      const res = await freezeEdge(url, vaultPath, e.caller, e.callee, state);
      if (res.status === 200) ok++; else fail++;
    }
    void forgeNotice(this.app, `Forge: bulk ${state} → ${ok} ok, ${fail} failed`);
    await this.refresh();
  }
}
