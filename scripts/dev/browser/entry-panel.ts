// The Forge output panel in a tiny stand-in for Obsidian's workspace, in real Chrome: the REAL `forgeNotice` and the REAL `ForgeOutputView` (its onOpen, its entries), a right sidebar
// that is collapsed until something expands or reveals it, and a workspace that records nothing but shows what a person would see: is the panel on screen, and what is in it.
// Used by measure.ts for the M4 P3 proof: a vault that is not score-first must show the panel opening on a message exactly as the previous commit's build does.
import './dom-helpers.ts';
import { ForgeOutputView, OUTPUT_VIEW_TYPE } from '@client/output-view.ts';
import { forgeNotice } from '@client/forge-notice.ts';

(window as any).__panelLab = {
  /** Build the lab inside `root` (an empty element): a main area and a collapsed right sidebar. */
  build(root: HTMLElement) {
    root.innerHTML = '<div id="lab-main" style="padding:6px">main area (the Score would be here)</div><aside id="lab-right" class="collapsed" style="border:1px solid #999;min-height:40px"></aside>';
    const aside = root.querySelector('#lab-right') as HTMLElement;
    const style = document.createElement('style'); style.textContent = '.collapsed{display:none}'; root.appendChild(style);
    const sidebarRoot = { collapsed: true, expand() { this.collapsed = false; aside.classList.remove('collapsed'); } };
    const leaves: any[] = [];
    const makeLeaf = () => {
      const containerEl = document.createElement('div'); aside.appendChild(containerEl);
      const leaf: any = {
        containerEl, viewType: 'empty', view: { getViewType: () => 'empty' }, app: null,
        getRoot: () => sidebarRoot,
        async setViewState(s: { type: string }) { leaf.viewType = s.type; leaf.view = new ForgeOutputView(leaf); await leaf.view.onOpen(); },
      };
      leaf.app = app; leaves.push(leaf); return leaf;
    };
    const ws: any = {
      getLeavesOfType: (t: string) => leaves.filter((l) => l.viewType === t),
      getRightLeaf: () => makeLeaf(),
      getLeaf: () => makeLeaf(),
      revealLeaf: () => { aside.classList.remove('collapsed'); sidebarRoot.collapsed = false; },
      on: () => ({}),
    };
    const app: any = { workspace: ws };
    return {
      notice: (text: string, kind: 'info' | 'error' | 'success' = 'info') => forgeNotice(app, text, kind),
      panelOnScreen: () => !aside.classList.contains('collapsed') && aside.querySelector('.forge-panel') !== null,
      sidebarHtml: () => aside.innerHTML.replace(/\d{1,2}:\d{2}:\d{2}\s?[AP]M|\d{1,2}:\d{2}:\d{2}/g, 'TIME'),
      panelText: () => (aside.querySelector('.forge-output-body') as HTMLElement | null)?.textContent ?? null,
      openPanelByGesture: async () => { const leaf = makeLeaf(); await leaf.setViewState({ type: OUTPUT_VIEW_TYPE, active: true }); ws.revealLeaf(leaf); return leaf; },
    };
  },
};
