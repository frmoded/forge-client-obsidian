// 2026-11-04-1170 (Scale Explorer 1 of 4) — the Obsidian-coupled half of the Scale Explorer: the `forge-scale` code-block processor, the side view and the command "Open Scale Explorer". Every decision is in scale-explorer-core.ts (the scale), scale-explorer-dom.ts
// (the picture) and scale-explorer-sound.ts (the tone). MUSIC EDITION ONLY: this file is imported by music-edition.full.ts alone, so the lean build never reaches it, nor Verovio through it (a build test greps lean main.js).
//
//     ```forge-scale
//     tonic: Bb
//     scale: lydian
//     ```
//
// Views follow the plugin's own side-panel pattern (output-view.ts / three-view.ts: an ItemView registered with registerView, opened in a right-sidebar leaf and revealed if it is already open) with one difference: a new leaf is made with
// getRightLeaf(true) (a split), never by reusing the sidebar's current leaf, so opening the Explorer cannot evict the Forge panel (right-leaf-eviction-core.ts's bug).

import { ItemView, MarkdownRenderChild, type MarkdownPostProcessorContext, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { renderMusicXMLAndMIDI } from './verovio.ts';
import { parseSvgMarkup } from './svg-markup-core.ts';
import { waitForWidth } from './host-width-core.ts';
import { DEFAULT_SCALE_OPTIONS, SCALE_EXPLORER_COMMAND_ID, SCALE_EXPLORER_LANGUAGE, SCALE_EXPLORER_VIEW_TYPE } from './scale-explorer-core.ts';
import { mountScaleBlock, mountScaleExplorer, showScaleError, type ScaleExplorerDeps, type ScaleExplorerHandle } from './scale-explorer-dom.ts';
import { createScaleSound } from './scale-explorer-sound.ts';

/** Engrave the staff with Verovio into `host`. The Score asks Verovio for a page 5x the host's width at scale 40 (an SVG twice the host, shown at half size); one bar of whole notes would then be drawn at a fifth of the size it has room for, so this asks
 *  for 2.5x: the SVG is as wide as the host and the notes are twice as large. A narrower host shrinks it by CSS (max-width: 100%). */
export async function renderStaff(host: HTMLElement, musicxml: string): Promise<void> {
  const rendered = await renderMusicXMLAndMIDI(musicxml, (await waitForWidth(host)) / 2);
  host.textContent = '';
  host.append(...parseSvgMarkup(rendered.svg, new DOMParser()));
}

function deps(): ScaleExplorerDeps {
  return { sound: createScaleSound(), renderStaff };
}

class ScaleBlock extends MarkdownRenderChild {
  private handle: ScaleExplorerHandle | null = null;
  private readonly host: HTMLElement;
  private readonly source: string;
  constructor(host: HTMLElement, source: string) { super(host); this.host = host; this.source = source; }

  onload(): void {
    this.host.empty();
    this.handle = mountScaleBlock(this.host, this.source, deps());
  }

  onunload(): void {
    this.handle?.destroy();
    this.handle = null;
  }
}

export class ScaleExplorerView extends ItemView {
  private handle: ScaleExplorerHandle | null = null;
  constructor(leaf: WorkspaceLeaf) { super(leaf); }

  getViewType(): string { return SCALE_EXPLORER_VIEW_TYPE; }
  getDisplayText(): string { return 'Scale Explorer'; }
  getIcon(): string { return 'piano'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('forge-scale-view');
    try {
      this.handle = mountScaleExplorer(this.contentEl, DEFAULT_SCALE_OPTIONS, deps());
    } catch (e) {
      console.error('Forge: scale explorer (view) —', e);
      showScaleError(this.contentEl, e instanceof Error ? e.message : String(e));
    }
  }

  async onClose(): Promise<void> {
    this.handle?.destroy();
    this.handle = null;
    this.contentEl.empty();
  }
}

/** Open the Explorer in the right sidebar: the leaf already showing it if there is one, else a NEW split leaf (never the sidebar's current one). */
export async function openScaleExplorer(plugin: Plugin): Promise<void> {
  const ws = plugin.app.workspace;
  const existing = ws.getLeavesOfType(SCALE_EXPLORER_VIEW_TYPE)[0];
  if (existing) { await ws.revealLeaf(existing); return; }
  const leaf = ws.getRightLeaf(true);
  if (!leaf) { console.error('Forge: scale explorer — no right sidebar leaf to open it in.'); return; }
  await leaf.setViewState({ type: SCALE_EXPLORER_VIEW_TYPE, active: true });
  await ws.revealLeaf(leaf);
}

export function registerScaleExplorer(plugin: Plugin): void {
  try {
    plugin.registerMarkdownCodeBlockProcessor(SCALE_EXPLORER_LANGUAGE, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      ctx.addChild(new ScaleBlock(el, source));
    });
  } catch (e) {
    console.error('Forge: the forge-scale code-block processor did not register:', e);
  }
  plugin.registerView(SCALE_EXPLORER_VIEW_TYPE, (leaf) => new ScaleExplorerView(leaf));
  plugin.addCommand({
    id: SCALE_EXPLORER_COMMAND_ID,
    name: 'Open Scale Explorer',
    callback: () => { void openScaleExplorer(plugin); },
  });
}
