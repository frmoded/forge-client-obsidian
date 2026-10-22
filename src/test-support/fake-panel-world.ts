// Test support for the M4 panel tests (drain 2026-10-21-2010): a fake workspace that records every call the REAL forgeNotice / ForgePlugin.getOutputView make on it.
import type { RealPlugin } from './bundle-real-plugin.ts';

export type Kind = 'none' | 'collapsed' | 'expanded';
export function world(real: RealPlugin, kind: Kind) {
  const calls: string[] = [];
  const view = Object.create(real.ForgeOutputView.prototype);
  view.appendMessage = (id: string, text: string, k: string) => calls.push(`view.appendMessage(${id},${text},${k})`);
  const mk = (root: any) => {
    const leaf: any = {
      view: null,
      getRoot: () => { calls.push('leaf.getRoot'); return root; },
      setViewState: async (s: any) => { calls.push(`leaf.setViewState(${s.type},active=${s.active})`); leaf.view = view; },
    };
    return leaf;
  };
  const root: any = { collapsed: kind === 'collapsed', expand: () => calls.push('root.expand') };
  const existing = mk(root); existing.view = view;
  const fresh = mk(root); fresh.view = { getViewType: () => 'empty' };
  const ws: any = {
    getLeavesOfType: (t: string) => { calls.push(`ws.getLeavesOfType(${t})`); return kind === 'none' ? [] : [existing]; },
    getRightLeaf: (split: boolean) => { calls.push(`ws.getRightLeaf(${split})`); return fresh; },
    getLeaf: (m: unknown) => { calls.push(`ws.getLeaf(${m})`); return fresh; },
    revealLeaf: (l: unknown) => { calls.push(`ws.revealLeaf(${l === existing ? 'existing' : 'fresh'})`); },
  };
  return { calls, ws, view };
}
export async function runGetOutputView(real: RealPlugin, w: ReturnType<typeof world>, opts: unknown[] = []) {
  const self = Object.assign(Object.create(real.ForgePlugin.prototype), { app: { workspace: w.ws }, refreshForgePanelStrip: async () => { w.calls.push('plugin.refreshForgePanelStrip'); } });
  const v = await real.ForgePlugin.prototype.getOutputView.call(self, ...opts);
  w.calls.push(`returned ${v === w.view ? 'the panel view' : 'something else'}`);
  return v;
}

