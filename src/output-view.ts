import { ItemView, WorkspaceLeaf } from 'obsidian';
import { renderMusicXMLAndMIDI, getTimeForElement } from './verovio';

// html-midi-player registers <midi-player> as a custom element on import. We
// load it lazily and guard against re-registration (plugin reload would
// otherwise throw on the second import and crash the whole plugin).
let midiPlayerLoaded = false;
async function ensureMidiPlayerLoaded() {
  if (midiPlayerLoaded || customElements.get('midi-player')) {
    midiPlayerLoaded = true;
    return;
  }
  await import('html-midi-player');
  midiPlayerLoaded = true;
}

// We parse MIDI bytes to a NoteSequence ourselves and set player.noteSequence
// directly. The alternative — passing a `data:` URI as src — sends Magenta
// down a fetch() path that the bundled node-fetch can't follow ("Only HTTP(S)
// protocols are supported"). NoteSequence skips the fetch entirely.
async function midiBase64ToNoteSequence(midiBase64: string): Promise<any> {
  const mm: any = await import('@magenta/music/esm/core/midi_io');
  const bytes = Uint8Array.from(atob(midiBase64), c => c.charCodeAt(0));
  return mm.midiToSequenceProto(bytes);
}

export const OUTPUT_VIEW_TYPE = 'forge-output';

export class ForgeOutputView extends ItemView {
  private outputEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return OUTPUT_VIEW_TYPE; }
  getDisplayText() { return 'Forge Output'; }
  getIcon() { return 'zap'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: 'forge-output-header' });
    header.createEl('span', { text: 'Forge Output' });
    header.createEl('button', { text: 'Clear' }).onclick = () => {
      this.outputEl.empty();
    };

    this.outputEl = contentEl.createDiv({ cls: 'forge-output-body' });
  }

  async onClose() {
    this.contentEl.empty();
  }

  append(snippetId: string, stdout: string, result: unknown) {
    const entry = this.makeEntry(snippetId);

    if (stdout) {
      entry.createEl('pre', { text: stdout, cls: 'forge-output-stdout' });
    }

    this.renderResult(entry, result);
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  private renderResult(entry: HTMLElement, result: unknown) {
    if (result === null || result === undefined) return;

    // Tagged payloads from the backend (musicxml, future: svg, ifc, ...)
    if (isTagged(result)) {
      switch (result.type) {
        case 'musicxml':
          this.renderMusicXML(entry, (result as any).content as string);
          return;
        // case 'svg':  case 'ifc':  // when those land
      }
    }

    // Install-style messages: render as plain text.
    if (isObjectWithMessage(result)) {
      entry.createEl('p', { text: result.message, cls: 'forge-output-message' });
      return;
    }

    // Plain values fall through to a stringified preview.
    entry.createEl('pre', {
      text: `→ ${JSON.stringify(result)}`,
      cls: 'forge-output-result',
    });
  }

  private renderMusicXML(entry: HTMLElement, musicxml: string) {
    const host = entry.createDiv({ cls: 'forge-output-musicxml' });
    host.setText('Rendering score…');
    // Defer one frame so clientWidth reflects the actual layout width.
    requestAnimationFrame(async () => {
      try {
        const { svg, midiBase64 } = await renderMusicXMLAndMIDI(musicxml, host.clientWidth);
        host.empty();

        // Try to mount the player; if it fails, render the SVG without
        // playback rather than dropping the whole entry.
        let player: any = null;
        try {
          await ensureMidiPlayerLoaded();
          const noteSequence = await midiBase64ToNoteSequence(midiBase64);
          player = document.createElement('midi-player');
          player.soundFont = 'https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus';
          player.noteSequence = noteSequence;
          player.classList.add('forge-midi-player');
          host.appendChild(player);
        } catch (e) {
          console.warn('Forge: MIDI player init failed; score will render without playback.', e);
        }

        const scoreWrap = host.createDiv({ cls: 'forge-output-score' });
        scoreWrap.innerHTML = svg;

        if (player) {
          scoreWrap.addEventListener('click', async (ev) => {
            const target = ev.target as Element | null;
            const noteEl = target?.closest('.note') as Element | null;
            if (!noteEl?.id) return;
            try {
              const ms = await getTimeForElement(musicxml, noteEl.id);
              player.currentTime = ms / 1000;
              player.start();
            } catch (e) {
              console.error('Forge: click-to-play failed', e);
            }
          });
        }
      } catch (e) {
        console.error('Forge: Verovio render failed', e);
        host.empty();
        host.createEl('p', { text: 'Score render failed — see console.', cls: 'forge-output-error' });
        host.createEl('pre', { text: musicxml, cls: 'forge-output-stdout' });
      }
    });
  }

  appendError(snippetId: string, errorMsg: string, stdout: string) {
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-error');
    entry.createEl('p', { text: errorMsg, cls: 'forge-output-error' });
    if (stdout) {
      entry.createEl('pre', { text: stdout, cls: 'forge-output-stdout' });
    }
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  private makeEntry(snippetId: string): HTMLElement {
    const entry = this.outputEl.createDiv({ cls: 'forge-output-entry' });
    const meta = entry.createDiv({ cls: 'forge-output-meta' });
    meta.createEl('span', { text: snippetId, cls: 'forge-output-id' });
    meta.createEl('span', { text: new Date().toLocaleTimeString(), cls: 'forge-output-time' });
    return entry;
  }
}

function isObjectWithMessage(v: unknown): v is { message: string } {
  return typeof v === 'object' && v !== null && typeof (v as any).message === 'string';
}

function isTagged(v: unknown): v is { type: string } {
  return typeof v === 'object' && v !== null && typeof (v as any).type === 'string';
}
