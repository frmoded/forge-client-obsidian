import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import { renderMusicXMLAndMIDI, getTimeForElement, TimeBucket } from './verovio';

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
  const ns = mm.midiToSequenceProto(bytes);
  // Magenta's parser leaves note.program at the default for non-piano
  // instruments, so the SoundFontPlayer only ever loads piano samples. Walk
  // the raw MIDI for program-change events and write the resulting program
  // onto every note that follows on the same channel.
  try {
    applyProgramChangesToNotes(ns, bytes);
  } catch (e) {
    console.error('Forge: applyProgramChangesToNotes threw —', e);
  }
  return ns;
}

interface ProgramEvent {
  ticks: number;
  channel: number;
  program: number;
}

function readProgramChanges(bytes: Uint8Array): ProgramEvent[] {
  const out: ProgramEvent[] = [];
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') return out;
  // header chunk: skip
  const headerLen = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  let i = 8 + headerLen;

  while (i < bytes.length) {
    if (i + 8 > bytes.length) break;
    const tag = String.fromCharCode(bytes[i], bytes[i+1], bytes[i+2], bytes[i+3]);
    const trackLen = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
    i += 8;
    const trackEnd = i + trackLen;
    if (tag !== 'MTrk') { i = trackEnd; continue; }

    let lastStatus = 0;
    let ticks = 0;
    while (i < trackEnd) {
      // var-length delta
      let delta = 0;
      let b = 0;
      do { b = bytes[i++]; delta = (delta << 7) | (b & 0x7F); } while (b & 0x80 && i < trackEnd);
      ticks += delta;
      if (i >= trackEnd) break;
      let status = bytes[i];
      if (status & 0x80) i++; else status = lastStatus;
      lastStatus = status;
      const type = status & 0xF0;
      const channel = status & 0x0F;
      if (status === 0xFF) {
        i++; // meta type
        let len = 0;
        do { b = bytes[i++]; len = (len << 7) | (b & 0x7F); } while (b & 0x80 && i < trackEnd);
        i += len;
      } else if (status === 0xF0 || status === 0xF7) {
        let len = 0;
        do { b = bytes[i++]; len = (len << 7) | (b & 0x7F); } while (b & 0x80 && i < trackEnd);
        i += len;
      } else if (type === 0xC0) {
        out.push({ ticks, channel, program: bytes[i] });
        i += 1;
      } else if (type === 0xD0) {
        i += 1;
      } else {
        // 2-byte channel events
        i += 2;
      }
    }
    i = trackEnd;
  }
  return out;
}

function applyProgramChangesToNotes(ns: any, midiBytes: Uint8Array): void {
  if (!ns?.notes?.length) return;
  const events = readProgramChanges(midiBytes);
  if (events.length === 0) return;

  // Single-program case (the common one — music21 emits one instrument per
  // part): stamp every note with the first program seen on the lowest
  // channel. No reliable tick→seconds mapping for a per-note pairing, so
  // this is the safe simplification for typical Forge snippets.
  const programByChannel = new Map<number, number>();
  for (const ev of events) {
    if (!programByChannel.has(ev.channel)) {
      programByChannel.set(ev.channel, ev.program);
    }
  }
  const defaultProgram = programByChannel.get(Math.min(...programByChannel.keys())) ?? 0;
  for (const note of ns.notes) {
    if (!note.isDrum) note.program = defaultProgram;
  }
}

// Magenta's SoundFont synth has a few tens of ms of startup latency when
// the audio context warms up. Notes scheduled at t=0 can be clipped or lost
// entirely. Shifting every note forward gives the synth a quiet lead-in so
// the first downbeat lands cleanly.
const PLAYBACK_LEAD_IN_SECS = 0.15;

function applyPlaybackLeadIn(ns: any, secs: number): void {
  if (!ns?.notes) return;
  for (const note of ns.notes) {
    if (typeof note.startTime === 'number') note.startTime += secs;
    if (typeof note.endTime === 'number') note.endTime += secs;
  }
  if (typeof ns.totalTime === 'number') ns.totalTime += secs;
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

    this.renderResult(entry, result, snippetId);
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  // Replace (not append) the panel with a rendering of a hand-authored data
  // snippet's body. Called from the file-open hook when the active note is a
  // type:data snippet. Replace semantics match the user mental model — the
  // panel reflects what they're looking at, not a log of every preview.
  async previewDataSnippet(snippetId: string, contentType: string, body: string, sourcePath: string) {
    this.outputEl.empty();
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-data-preview');
    await this.renderDataBody(entry, contentType, body, snippetId, sourcePath);
  }

  private async renderDataBody(
    entry: HTMLElement,
    contentType: string,
    body: string,
    snippetId: string,
    sourcePath: string,
  ) {
    switch (contentType) {
      case 'musicxml':
        this.renderMusicXML(entry, body, snippetId);
        return;
      case 'json':
        this.renderJSON(entry, body);
        return;
      case 'text':
        this.renderText(entry, body);
        return;
      case 'markdown':
        await this.renderMarkdown(entry, body, sourcePath);
        return;
      case 'svg':
        this.renderSVG(entry, body);
        return;
      default:
        entry.createEl('p', {
          text: `No renderer for content_type '${contentType}'.`,
          cls: 'forge-output-error',
        });
        entry.createEl('pre', { text: body, cls: 'forge-output-stdout' });
    }
  }

  private renderJSON(entry: HTMLElement, body: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      entry.createEl('p', {
        text: `Invalid JSON: ${(e as Error).message}`,
        cls: 'forge-output-error',
      });
      entry.createEl('pre', { text: body, cls: 'forge-output-stdout' });
      return;
    }
    entry.createEl('pre', {
      text: JSON.stringify(parsed, null, 2),
      cls: 'forge-output-result',
    });
  }

  private renderText(entry: HTMLElement, body: string) {
    entry.createEl('pre', { text: body, cls: 'forge-output-result' });
  }

  private async renderMarkdown(entry: HTMLElement, body: string, sourcePath: string) {
    const host = entry.createDiv({ cls: 'forge-output-markdown' });
    await MarkdownRenderer.render(this.app, body, host, sourcePath, this);
  }

  private renderSVG(entry: HTMLElement, body: string) {
    const host = entry.createDiv({ cls: 'forge-output-svg' });
    // The body is the user's own SVG markup from a file they authored — same
    // trust boundary as any other content in their vault. innerHTML is fine
    // here. If the markup is invalid, the browser will silently render
    // whatever it can parse.
    host.innerHTML = body.trim();
  }

  private renderResult(entry: HTMLElement, result: unknown, snippetId: string) {
    if (result === null || result === undefined) return;

    // Tagged payloads from the backend (musicxml, future: svg, ifc, ...)
    if (isTagged(result)) {
      switch (result.type) {
        case 'musicxml':
          this.renderMusicXML(entry, (result as any).content as string, snippetId);
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

  private renderMusicXML(entry: HTMLElement, musicxml: string, snippetId: string) {
    const host = entry.createDiv({ cls: 'forge-output-musicxml' });
    host.setText('Rendering score…');
    // Defer one frame so clientWidth reflects the actual layout width.
    requestAnimationFrame(async () => {
      try {
        const { svg, midiBase64, timeMap } = await renderMusicXMLAndMIDI(musicxml, host.clientWidth);
        host.empty();

        // Download links — always available, even if playback init fails.
        host.appendChild(makeDownloadBar(snippetId, musicxml, midiBase64));

        // Try to mount the player; if it fails, render the SVG without
        // playback rather than dropping the whole entry.
        let player: any = null;
        try {
          await ensureMidiPlayerLoaded();
          const noteSequence = await midiBase64ToNoteSequence(midiBase64);
          applyPlaybackLeadIn(noteSequence, PLAYBACK_LEAD_IN_SECS);
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

          attachScoreFollower(scoreWrap, player, timeMap);
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

function makeDownloadBar(snippetId: string, musicxml: string, midiBase64: string): HTMLElement {
  const bar = document.createElement('div');
  bar.addClass('forge-output-downloads');

  const xmlBlob = new Blob([musicxml], { type: 'application/vnd.recordare.musicxml+xml' });
  const xmlLink = bar.createEl('a', { text: 'MusicXML', cls: 'forge-output-download' });
  xmlLink.href = URL.createObjectURL(xmlBlob);
  xmlLink.download = `${snippetId}.musicxml`;

  const midiBytes = Uint8Array.from(atob(midiBase64), c => c.charCodeAt(0));
  const midiBlob = new Blob([midiBytes], { type: 'audio/midi' });
  const midiLink = bar.createEl('a', { text: 'MIDI', cls: 'forge-output-download' });
  midiLink.href = URL.createObjectURL(midiBlob);
  midiLink.download = `${snippetId}.mid`;

  return bar;
}

function attachScoreFollower(scoreWrap: HTMLElement, player: any, timeMap: TimeBucket[]): void {
  let highlighted: Element[] = [];
  let timer: number | null = null;

  const clearHighlights = () => {
    for (const el of highlighted) el.classList.remove('is-playing');
    highlighted = [];
  };

  // Active = the latest bucket whose start time has already elapsed.
  // Notes are highlighted from their start-time forward until the next bucket.
  // This is an approximation; overlapping voices with different start times
  // won't all light up at once, but for monophonic-like passages it's clean.
  const findActiveIds = (currentMs: number): string[] => {
    let active: string[] = [];
    for (const bucket of timeMap) {
      if (bucket.ms > currentMs) break;
      active = bucket.ids;
    }
    return active;
  };

  const highlight = () => {
    // Subtract the same lead-in we added to the noteSequence so timeMap
    // (which is in original Verovio MIDI time) lines up with player time.
    const sec = ((player.currentTime ?? 0) as number) - PLAYBACK_LEAD_IN_SECS;
    if (sec < 0) {
      // Still in the silent lead-in — no notes are sounding yet.
      clearHighlights();
      return;
    }
    const ids = findActiveIds(sec * 1000);
    clearHighlights();
    for (const id of ids) {
      const el = scoreWrap.querySelector(`#${CSS.escape(id)}`);
      if (el) {
        el.classList.add('is-playing');
        highlighted.push(el);
      }
    }
  };

  const start = () => {
    if (timer === null) timer = window.setInterval(highlight, 33);
  };
  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    clearHighlights();
  };

  player.addEventListener('start', start);
  player.addEventListener('stop', stop);
}
