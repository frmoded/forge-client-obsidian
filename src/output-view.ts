import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { renderMusicXMLAndMIDI, getTimeForElement, TimeBucket } from './verovio';
import {
  readScoreViewMode,
  toggleScoreViewMode,
  type ScoreViewMode,
  type ScoreViewModeStorage,
} from './view-mode-core';
import { ForgeSaveDataModal, dataTemplate } from './modal';

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

    // A6 ordering: rendered return value on top, stdout text log below.
    // Stdout is the secondary band — print()-style debug output sits
    // under the result rather than above it so a glance lands on the
    // computed value first. Stdout block only renders when non-empty
    // (a snippet that prints nothing shouldn't bloat the panel).
    this.renderResult(entry, result, snippetId);

    if (stdout) {
      entry.createEl('pre', { text: stdout, cls: 'forge-output-stdout' });
    }

    // Offer "Save as data snippet" only when the result is something we know
    // how to capture — tagged musicxml/svg, plain string, or any
    // JSON-serializable value. Status messages (install) and null results
    // don't get the button.
    const captured = captureResult(result);
    if (captured) {
      const actions = entry.createDiv({ cls: 'forge-output-actions' });
      const saveBtn = actions.createEl('button', {
        text: 'Save as data snippet',
        cls: 'forge-output-save-btn',
      });
      saveBtn.onclick = () => {
        this.openSaveAsDataModal(`${snippetId}_output`, captured.contentType, captured.body);
      };
    }

    entry.scrollIntoView({ behavior: 'smooth' });
  }

  private openSaveAsDataModal(suggestedName: string, contentType: string, body: string) {
    const onCreate = async (name: string): Promise<boolean> => {
      const path = `${name}.md`;
      const md = dataTemplate(name, contentType, body);
      let file;
      try {
        file = await this.app.vault.create(path, md);
      } catch {
        new Notice(`Forge: could not create ${path} — does it already exist?`);
        return false;
      }
      new Notice(`Forge: Created ${path}`);
      try {
        await this.app.workspace.getLeaf(false).openFile(file);
      } catch (e) {
        console.error('openSaveAsDataModal: could not open new data snippet', e);
      }
      return true;
    };
    new ForgeSaveDataModal(this.app, suggestedName, contentType, onCreate).open();
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

  // Binary preview: payload lives in a sibling asset file at `contentRef`
  // (vault-relative). We don't load the bytes — we hand the asset's resource
  // URL to a native HTML element and let the browser do the work. Image/audio/
  // video each get their format-appropriate element.
  async previewBinarySnippet(snippetId: string, contentType: string, contentRef: string) {
    this.outputEl.empty();
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-data-preview');
    const resourceUrl = this.app.vault.adapter.getResourcePath(contentRef);

    if (contentType.startsWith('image/') || contentType === 'jpeg') {
      const host = entry.createDiv({ cls: 'forge-output-image' });
      const img = host.createEl('img', { cls: 'forge-output-image-img' });
      img.src = resourceUrl;
      return;
    }
    if (contentType.startsWith('audio/')) {
      const host = entry.createDiv({ cls: 'forge-output-audio' });
      const audio = host.createEl('audio') as HTMLAudioElement;
      audio.controls = true;
      audio.src = resourceUrl;
      return;
    }
    if (contentType.startsWith('video/')) {
      const host = entry.createDiv({ cls: 'forge-output-video' });
      const video = host.createEl('video') as HTMLVideoElement;
      video.controls = true;
      video.src = resourceUrl;
      return;
    }
    entry.createEl('p', {
      text: `No renderer for binary content_type '${contentType}'.`,
      cls: 'forge-output-error',
    });
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
        case 'musicxml': {
          // v0.2.150 — dual-XML opt-in. When the engine emits both
          // multi-staff + kit MusicXML (percussion piece), render with
          // the toggle toolbar. Otherwise fall back to the single-XML
          // path (legacy snippets + non-percussion music).
          const r = result as Record<string, unknown>;
          if (
            r.has_percussion === true
            && typeof r.kit_content === 'string'
            && typeof r.multi_staff_content === 'string'
          ) {
            this.renderMusicXMLWithToggle(
              entry,
              r.multi_staff_content,
              r.kit_content,
              snippetId,
            );
          } else {
            this.renderMusicXML(entry, (result as any).content as string, snippetId);
          }
          return;
        }
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

  /** v0.2.150 — wrap localStorage access for view-mode-core. Mirrors
   *  the v0.2.138 expandedStateStorage pattern in main.ts: try/catch
   *  the global, return null on SecurityError or sandbox absence so
   *  the pure-core's defensive default kicks in. */
  private scoreViewModeStorage(): ScoreViewModeStorage | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ls = (globalThis as any).localStorage;
      if (ls && typeof ls.getItem === 'function'
          && typeof ls.setItem === 'function') {
        return ls as ScoreViewModeStorage;
      }
    } catch {
      // SecurityError under some sandboxing configurations.
    }
    return null;
  }

  /** v0.2.150 — render a percussion score with a multi-staff ↔ kit
   *  toggle. Initial view comes from the persisted v0.2.143
   *  view-mode-core state (default 'multi_staff'); toggling re-renders
   *  the score area using the other XML and persists the choice. The
   *  MIDI export + click-to-play continue to work per view since
   *  v0.2.146/149 preserved note.id + storedInstrument through the
   *  kit fold. */
  private renderMusicXMLWithToggle(
    entry: HTMLElement,
    multiStaffXml: string,
    kitXml: string,
    snippetId: string,
  ) {
    const storage = this.scoreViewModeStorage();
    let mode: ScoreViewMode = readScoreViewMode(storage, snippetId, 'multi_staff');

    // Toolbar above the score-host so toggling doesn't tear down the
    // chrome along with the score.
    const toolbar = entry.createDiv({ cls: 'forge-output-toolbar' });
    const button = toolbar.createEl('button', {
      cls: 'forge-kit-toggle',
      attr: { 'aria-label': 'Toggle drum notation view' },
    });
    const updateLabel = (m: ScoreViewMode) => {
      button.setText(m === 'kit' ? '🎼 Multi-staff' : '🥁 Kit');
      button.title = m === 'kit'
        ? 'Switch to multi-staff orchestral percussion view'
        : 'Switch to drum-kit single-staff view';
    };
    updateLabel(mode);

    const scoreHost = entry.createDiv({ cls: 'forge-output-musicxml-host' });
    const renderInto = (m: ScoreViewMode) => {
      scoreHost.empty();
      // v0.2.151 — kit view: display from kit_xml; MIDI + click-to-play
      // from multi_staff_xml (canonical). Multi-staff view: both from
      // multi_staff_xml (single-render fast path inside renderMusicXML).
      if (m === 'kit') {
        this.renderMusicXML(scoreHost, kitXml, snippetId, multiStaffXml);
      } else {
        this.renderMusicXML(scoreHost, multiStaffXml, snippetId);
      }
    };
    renderInto(mode);

    button.addEventListener('click', () => {
      mode = toggleScoreViewMode(storage, snippetId);
      updateLabel(mode);
      renderInto(mode);
    });
  }

  private renderMusicXML(
    entry: HTMLElement,
    musicxml: string,
    snippetId: string,
    midiSourceXml?: string,
  ) {
    const host = entry.createDiv({ cls: 'forge-output-musicxml' });
    host.setText('Rendering score…');
    // Defer one frame so clientWidth reflects the actual layout width.
    requestAnimationFrame(async () => {
      try {
        // v0.2.151 — split rendering when `midiSourceXml` is provided.
        // v0.2.152 — kit-mode highlight fix: the multi-staff timeMap
        // carries Verovio-internal SVG IDs from the multi-staff render
        // which DON'T match the kit SVG's IDs (Verovio assigns fresh
        // internal IDs per render even when the input MusicXML carries
        // the same xml:id). So for kit mode we build the timeMap from
        // the DISPLAY render (kit XML → kit timeMap with kit SVG IDs)
        // and SCALE the times by (multi_total / kit_total) to roughly
        // align with the multi-staff MIDI player's wall-clock. Linear
        // scale is approximate for pieces with mid-piece tempo changes;
        // good enough for steady-tempo percussion charts which is the
        // current cohort use case.
        const sameXml = midiSourceXml === undefined || midiSourceXml === musicxml;
        const midiXml = midiSourceXml ?? musicxml;
        const displayRender = await renderMusicXMLAndMIDI(musicxml, host.clientWidth);
        const svg = displayRender.svg;
        const midiRender = sameXml
          ? displayRender
          : await renderMusicXMLAndMIDI(midiXml, host.clientWidth);
        const midiBase64 = midiRender.midiBase64;
        // For single-XML renders timeMap comes from displayRender directly.
        // For split renders use the display timeMap (matches the rendered
        // SVG's note IDs) but scale times to the MIDI XML's duration so
        // score-follower highlights track the audible playback.
        let timeMap = midiRender.timeMap;
        if (!sameXml) {
          const displayTotalMs = displayRender.timeMap.length
            ? displayRender.timeMap[displayRender.timeMap.length - 1].ms
            : 0;
          const midiTotalMs = midiRender.timeMap.length
            ? midiRender.timeMap[midiRender.timeMap.length - 1].ms
            : 0;
          const scale = (displayTotalMs > 0 && midiTotalMs > 0)
            ? midiTotalMs / displayTotalMs
            : 1;
          timeMap = displayRender.timeMap.map(b => ({
            ms: b.ms * scale,
            ids: b.ids,
          }));
        }
        host.empty();

        // Download links — always available, even if playback init fails.
        // Downloads the displayed XML + its corresponding MIDI (canonical).
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
          console.error('renderMusicXML: MIDI player init failed; score will render without playback.', e);
        }

        // v0.2.152 — zoom controls. Sit above the score so the user
        // can scale the SVG without recomputing. CSS transform on the
        // .forge-output-score wrap; transform-origin top-left so
        // scrolling works naturally with overflow: auto.
        const zoomBar = host.createDiv({ cls: 'forge-zoom-bar' });
        const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
        let zoomIdx = ZOOM_LEVELS.indexOf(1.0);
        const zoomOutBtn = zoomBar.createEl('button', {
          text: '−',
          cls: 'forge-zoom-button',
          attr: { 'aria-label': 'Zoom out' },
        });
        const zoomLabel = zoomBar.createEl('button', {
          text: '100%',
          cls: 'forge-zoom-button forge-zoom-reset',
          attr: { 'aria-label': 'Reset zoom to 100%' },
        });
        const zoomInBtn = zoomBar.createEl('button', {
          text: '+',
          cls: 'forge-zoom-button',
          attr: { 'aria-label': 'Zoom in' },
        });
        const scoreWrap = host.createDiv({ cls: 'forge-output-score' });
        scoreWrap.innerHTML = svg;
        // v0.2.153 — zoom scales the SVG elements' width/height
        // attributes directly. Pre-v0.2.153 used CSS transform: scale
        // on .forge-output-score, but I also set width: 100/z% which
        // INVERTED the scale (z=1.5 → width=66.67% → effective
        // 66.67% * 1.5 = 100% original size, no visual change). Driver
        // smoke against v0.2.152 surfaced that the buttons present but
        // notes didn't grow. Modifying SVG width directly preserves
        // viewBox-based proportional scaling + lets the .forge-output-
        // score's overflow: auto show scrollbars naturally.
        const svgEls = Array.from(scoreWrap.querySelectorAll('svg'));
        const naturalWidths = svgEls.map(svg => {
          const w = svg.getAttribute('width');
          // Verovio sets width="2100" (raw pixels). Strip trailing
          // 'px' if present. Fallback to bounding rect.
          if (w) {
            const n = parseFloat(w);
            if (!isNaN(n) && n > 0) return n;
          }
          return svg.getBoundingClientRect().width;
        });
        const applyZoom = () => {
          const z = ZOOM_LEVELS[zoomIdx];
          svgEls.forEach((svgEl, i) => {
            const w = naturalWidths[i] * z;
            // v0.2.154 — styles.css ships `.forge-output-score svg
            // { max-width: 100% }` which clamps any width above the
            // container's width back to 100%. v0.2.153 set
            // style.width = "Xpx" but the inline width was capped by
            // max-width, so the SVG never grew. Setting maxWidth =
            // 'none' here lets the explicit width win, and the
            // .forge-output-score wrapper's overflow-x: auto
            // surfaces a horizontal scrollbar.
            svgEl.style.maxWidth = 'none';
            svgEl.style.width = `${w}px`;
            svgEl.style.height = 'auto';
          });
          zoomLabel.setText(`${Math.round(z * 100)}%`);
        };
        applyZoom();
        zoomOutBtn.addEventListener('click', () => {
          if (zoomIdx > 0) { zoomIdx -= 1; applyZoom(); }
        });
        zoomInBtn.addEventListener('click', () => {
          if (zoomIdx < ZOOM_LEVELS.length - 1) { zoomIdx += 1; applyZoom(); }
        });
        zoomLabel.addEventListener('click', () => {
          zoomIdx = ZOOM_LEVELS.indexOf(1.0);
          applyZoom();
        });

        if (player) {
          scoreWrap.addEventListener('click', async (ev) => {
            const target = ev.target as Element | null;
            const noteEl = target?.closest('.note') as Element | null;
            if (!noteEl?.id) return;
            try {
              // v0.2.152 — click-to-play in split-render mode: the
              // click target lives in the DISPLAY SVG (kit) but the
              // player is on the MIDI XML (multi-staff) timeline.
              // Query the display XML for the clicked note's time,
              // then scale to MIDI-XML wall clock.
              const queryXml = sameXml ? midiXml : musicxml;
              const ms = await getTimeForElement(queryXml, noteEl.id);
              const scaledMs = sameXml
                ? ms
                : ms * (
                    midiRender.timeMap.length && displayRender.timeMap.length
                      ? (midiRender.timeMap[midiRender.timeMap.length - 1].ms
                         / Math.max(1, displayRender.timeMap[displayRender.timeMap.length - 1].ms))
                      : 1);
              player.currentTime = scaledMs / 1000;
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

// Decide whether a compute result is capturable as a data snippet, and if so,
// what content_type to declare and what body to write.
//
// - Tagged musicxml / svg payloads: use their content as-is, declare the tag
//   as the content_type.
// - Plain strings: stored as text. (We don't try to detect markdown — the user
//   can change content_type after saving if they want markdown rendering.)
// - Any JSON-serializable value (numbers, arrays, dicts): stored as json.
// - null/undefined and install-style {message: ...} payloads: not capturable.
//
// Binary results from /compute (a (bytes, content_type) tuple from a binary
// data snippet) aren't reachable today — /compute can't JSON-encode bytes —
// so binary save isn't wired up here. Pending phase 1's binary /compute path.
export function captureResult(result: unknown): { contentType: string; body: string } | null {
  if (result === null || result === undefined) return null;

  if (isTagged(result)) {
    const tag = (result as any).type;
    const content = (result as any).content;
    if (typeof content !== 'string') return null;
    if (tag === 'musicxml') return { contentType: 'musicxml', body: content };
    if (tag === 'svg') return { contentType: 'svg', body: content };
    return null;
  }

  if (isObjectWithMessage(result)) return null;

  if (typeof result === 'string') {
    return { contentType: 'text', body: result };
  }

  try {
    return { contentType: 'json', body: JSON.stringify(result, null, 2) };
  } catch {
    return null;
  }
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
