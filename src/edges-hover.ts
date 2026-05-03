import { App, MarkdownView, Notice } from 'obsidian';
import {
  absoluteTime,
  pathToSnippetId,
  readSnapshot,
  relativeTime,
  resolveLinkTarget,
  snapshotPath,
} from './edges';
import { freezeEdge } from './server';

const HOVER_DELAY_MS = 600;

// Attach a delegated mouseover listener that detects [[wikilinks]] in editor
// or reading mode and shows a custom popover. Returns a teardown function.
export function attachEdgeHover(app: App, getServerUrl: () => string): () => void {
  const popover = new EdgePopover(app, getServerUrl);
  let hoverTimer: number | null = null;

  function clearTimer() {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  const onOver = (ev: MouseEvent) => {
    const linkEl = findLinkElement(ev.target as Element | null);
    if (!linkEl) return;
    const linkText = extractLinkText(linkEl);
    if (!linkText) return;

    clearTimer();
    hoverTimer = window.setTimeout(() => {
      popover.showFor(linkEl, linkText, ev.clientX, ev.clientY);
    }, HOVER_DELAY_MS);
  };

  const onOut = (ev: MouseEvent) => {
    const linkEl = findLinkElement(ev.target as Element | null);
    if (!linkEl) return;
    clearTimer();
    // Allow a short window to move into the popover before dismissing.
    window.setTimeout(() => {
      if (!popover.isHovered()) popover.hide();
    }, 200);
  };

  document.body.addEventListener('mouseover', onOver, true);
  document.body.addEventListener('mouseout', onOut, true);

  return () => {
    document.body.removeEventListener('mouseover', onOver, true);
    document.body.removeEventListener('mouseout', onOut, true);
    popover.destroy();
  };
}

// Reading mode renders wikilinks as <a class="internal-link">. Live preview
// uses <span class="cm-hmd-internal-link">. Source mode shows raw [[...]] —
// no DOM hook there; that's an accepted gap.
function findLinkElement(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const internalLink = (el.closest('a.internal-link') as HTMLElement | null);
  if (internalLink) return internalLink;
  const cmLink = el.closest('.cm-hmd-internal-link, .cm-link') as HTMLElement | null;
  return cmLink;
}

function extractLinkText(el: HTMLElement): string | null {
  const dataHref = el.getAttribute('data-href');
  if (dataHref) return dataHref.trim();
  // Live preview elements carry the link text as innerText (no data-href).
  const text = el.innerText?.trim();
  if (text) return text;
  return null;
}


class EdgePopover {
  private el: HTMLElement;
  private hovered = false;
  private currentCaller: string | null = null;
  private currentCallee: string | null = null;

  constructor(private app: App, private getServerUrl: () => string) {
    this.el = document.body.createDiv({ cls: 'forge-edge-popover' });
    this.el.style.display = 'none';
    this.el.addEventListener('mouseenter', () => { this.hovered = true; });
    this.el.addEventListener('mouseleave', () => { this.hovered = false; this.hide(); });
  }

  isHovered() { return this.hovered; }

  destroy() {
    this.el.remove();
  }

  hide() {
    this.el.style.display = 'none';
    this.currentCaller = null;
    this.currentCallee = null;
  }

  async showFor(linkEl: HTMLElement, linkText: string, x: number, y: number) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;

    const callerId = await pathToSnippetId(this.app, view.file.path);
    const calleeId = resolveLinkTarget(linkText, callerId);
    this.currentCaller = callerId;
    this.currentCallee = calleeId;

    const snapshot = await readSnapshot(this.app, callerId, calleeId);
    this.render(callerId, calleeId, snapshot);
    this.position(x, y);
    this.el.style.display = 'block';
  }

  private render(callerId: string, calleeId: string, snapshot: any) {
    this.el.empty();

    // 1. State pill — top-most, most visually prominent.
    const pillRow = this.el.createDiv({ cls: 'forge-edge-popover-pill-row' });
    const pill = pillRow.createEl('span', { cls: 'forge-edge-popover-pill' });
    if (!snapshot) {
      pill.addClass('is-none');
      pill.createEl('span', { text: '◌', cls: 'forge-edge-popover-pill-icon' });
      pill.createEl('span', { text: 'NO SNAPSHOT' });
    } else if (snapshot.state === 'frozen') {
      pill.addClass('is-frozen');
      pill.createEl('span', { text: '🔒', cls: 'forge-edge-popover-pill-icon' });
      pill.createEl('span', { text: 'FROZEN' });
    } else {
      pill.addClass('is-live');
      pill.createEl('span', { text: '▶', cls: 'forge-edge-popover-pill-icon' });
      pill.createEl('span', { text: 'LIVE' });
    }

    // 2. caller → callee path, smaller, monospace.
    const path = this.el.createDiv({ cls: 'forge-edge-popover-path' });
    path.createEl('span', { text: callerId });
    path.createEl('span', { text: ' → ', cls: 'forge-edge-popover-arrow' });
    path.createEl('span', { text: calleeId });

    // 3. Captured-at line, smallest, with absolute time tooltip.
    if (snapshot) {
      const timeEl = this.el.createEl('div', {
        text: `captured ${relativeTime(snapshot.captured_at)}`,
        cls: 'forge-edge-popover-time',
      });
      timeEl.title = absoluteTime(snapshot.captured_at);
    } else {
      this.el.createEl('div', {
        text: 'Run the calling snippet to capture this edge.',
        cls: 'forge-edge-popover-empty',
      });
    }

    // 4. Actions: primary CTA + a quieter "open snapshot" link.
    const actions = this.el.createDiv({ cls: 'forge-edge-popover-actions' });
    if (!snapshot) {
      const btn = actions.createEl('button', { text: 'Freeze edge' });
      btn.disabled = true;
      btn.title = 'Freeze requires a captured snapshot';
      return;
    }
    const next = snapshot.state === 'frozen' ? 'live' : 'frozen';
    const btn = actions.createEl('button', {
      text: snapshot.state === 'frozen' ? 'Unfreeze edge' : 'Freeze edge',
      cls: 'mod-cta',
    });
    btn.onclick = () => this.toggle(callerId, calleeId, next);

    const open = actions.createEl('a', { text: 'open snapshot', cls: 'forge-edge-popover-open' });
    open.onclick = (ev) => {
      ev.preventDefault();
      this.app.workspace.openLinkText(snapshotPath(callerId, calleeId), '', false);
      this.hide();
    };
  }

  private async toggle(callerId: string, calleeId: string, state: 'frozen' | 'live') {
    const vaultPath = (this.app.vault.adapter as any).basePath as string;
    const res = await freezeEdge(this.getServerUrl(), vaultPath, callerId, calleeId, state);
    if (res.status !== 200) {
      new Notice(`Forge: toggle failed (${res.status})`);
      console.error('Forge edge toggle failed', res);
      return;
    }
    new Notice(`Forge: ${callerId} → ${calleeId} now ${state}`);
    // Re-fetch and re-render in place so the user can toggle again immediately.
    const fresh = await readSnapshot(this.app, callerId, calleeId);
    this.render(callerId, calleeId, fresh);
  }

  private position(x: number, y: number) {
    // Show below-right of the cursor by default, flip if it would clip.
    const margin = 8;
    this.el.style.left = '0';
    this.el.style.top = '0';
    // Force layout to read offsetWidth/Height with current content.
    this.el.style.display = 'block';
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    let left = x + margin;
    let top = y + margin;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin;
    if (top + h > window.innerHeight - margin) top = y - h - margin;
    this.el.style.left = `${Math.max(margin, left)}px`;
    this.el.style.top = `${Math.max(margin, top)}px`;
  }
}
