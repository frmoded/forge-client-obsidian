import { ItemView, MarkdownRenderer, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import {
  parseMcqOutput,
  renderMcqCard,
  type McqDocument,
  type McqElement,
} from './mcq-widget-core.ts';
import { renderMusicXMLAndMIDI, getTimeForElement, TimeBucket } from './verovio.ts';
import { shouldRenderEntryMeta } from './output-entry-meta-core.ts';
import {
  readScoreViewMode,
  toggleScoreViewMode,
  pickDefaultScoreViewMode,
  type ScoreViewMode,
  type ScoreViewModeStorage,
} from './view-mode-core.ts';
import { ForgeSaveDataModal, dataTemplate } from './modal.ts';
import { forgeNotice } from './forge-notice.ts';
import {
  deriveLlmRejectionGuidance,
  truncateLlmOutput,
  type RejectionFailureMode,
} from './llm-rejection-guidance-core.ts';
import {
  deriveSlotCacheNotFoundGuidance,
  type SlotCacheNotFoundInput,
} from './slot-cache-not-found-guidance-core.ts';
import { stopMidiPlayersIn } from './midi-player-teardown-core.ts';
// Drain 2026-08-22-2300 (Forge panel F1) — the Inputs strip. The field
// models come from the SAME loop the Run dialog renders from, so the
// strip inherits its dropdowns, pre-fill and required-input handling
// rather than imitating them.
import {
  buildInputFieldModels,
  deriveStripState,
  submitStrip,
  type InputFieldModel,
  type InputFieldSources,
  type StripNote,
  type StripState,
} from './forge-panel-strip-core.ts';
import { collectWidgetInput, renderWidget } from './input-widget-core.ts';
import type { InputDefaults } from './run-input-defaults-core.ts';
import type { ForgeError } from './forge-error-core.ts';
import { renderForgeError } from './forge-error-core.ts';

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

/** What the strip needs from the plugin. The view owns the DOM; the
 *  plugin owns running snippets and persisting state, and neither has
 *  to import the other. */
export interface ForgeStripHost {
  /** Run the strip's note with the strip's values. */
  run(snippetId: string, kwargs: Record<string, unknown>, raw: Record<string, string>): void;
  /** Persist this note's last-used values (per-note memory). */
  remember(snippetId: string, raw: Record<string, string>): void;
  /** Drop this note's memory — "reset to defaults". */
  forget(snippetId: string): void;
  /** Collapsed state, persisted in plugin data across restarts. */
  isCollapsed(): boolean;
  setCollapsed(collapsed: boolean): void;
}

/** An action note as the strip needs it: the field models to render,
 *  plus the declarations they were built from — the submit path needs
 *  the defaults to tell "left blank on purpose" from "required and
 *  missing", and "reset to defaults" rebuilds from the same
 *  declarations with no remembered values. */
export interface StripNoteWithDefaults extends StripNote {
  sources: InputFieldSources;
}

export class ForgeOutputView extends ItemView {
  private outputEl: HTMLElement;

  // ---- Inputs strip (drain 2026-08-22-2300, plan F1)
  private stripEl: HTMLElement | null = null;
  private stripBodyEl: HTMLElement | null = null;
  private stripHost: ForgeStripHost | null = null;
  private stripState: StripState = deriveStripState(null, null);
  /** The last ACTION note the strip showed. It stays on screen, greyed,
   *  when the user moves to a note that isn't one — the strip never
   *  vanishes, which is the whole point of the panel. */
  private lastNote: StripNoteWithDefaults | null = null;
  private stripValues: Record<string, string> = {};
  private stripDefaults: InputDefaults = {};
  /** Inputs whose value lives in a widget's DOM; read back at submit,
   *  exactly as the dialog does. */
  private stripWidgetHosts: Record<string, HTMLElement> = {};

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return OUTPUT_VIEW_TYPE; }
  // v0.2.365 (plan F1) — the tab is just "Forge": the view stopped
  // being a passive log when the Inputs strip arrived. OUTPUT_VIEW_TYPE
  // keeps its 'forge-output' string on purpose — see the note there.
  getDisplayText() { return 'Forge'; }
  getIcon() { return 'zap'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('forge-panel');

    // The panel is ONE leaf with two regions it owns, not a workspace
    // split: it cannot be dragged apart, it persists with the leaf, and
    // it works identically docked, tabbed, or popped out.
    const outputRegion = contentEl.createDiv({ cls: 'forge-panel-output-region' });

    const header = outputRegion.createDiv({ cls: 'forge-output-header' });
    header.createEl('span', { text: 'Forge' });
    // v0.2.228 — Stop button removed per user direction 2026-07-01.
    // Stop/Clear distinction added marginal UI complexity; cohort can
    // silence-and-re-render via Clear. The teardown machinery
    // (stopMidiPlayersIn at every empty point) stays — only the
    // standalone button DOM goes.
    header.createEl('button', { text: 'Clear' }).onclick = () => {
      // v0.2.224 — silence audio before tearing down DOM. Removing a
      // <midi-player> from the DOM doesn't dispose its audio context;
      // the music kept playing post-Clear pre-fix (driver 2026-07-01).
      stopMidiPlayersIn(this.outputEl, (m, e) => console.error(m, e));
      this.outputEl.empty();
    };

    this.outputEl = outputRegion.createDiv({ cls: 'forge-output-body' });

    this.stripEl = contentEl.createDiv({ cls: 'forge-panel-inputs' });
    this.renderStrip();
  }

  // ------------------------------------------------- Inputs strip

  /** Wire the strip to the plugin. Called once, right after the view
   *  materializes. */
  setStripHost(host: ForgeStripHost) {
    // Identity-checked: this is called on every leaf change, and a
    // re-render would tear down the widget hosts (a piano's selection
    // lives in its DOM) for no reason. The plugin passes one host
    // object for the life of the plugin, so this settles after the
    // first call.
    if (this.stripHost === host) return;
    this.stripHost = host;
    this.renderStrip();
  }

  /**
   * Point the strip at the active note.
   *
   * `note` is null when the active note is not an action note; the
   * strip then greys the last one rather than emptying. Re-entrant and
   * cheap: it runs on every active-leaf-change.
   */
  showNoteInputs(note: StripNoteWithDefaults | null) {
    // A leaf change that lands on the note already showing is not a
    // note switch: re-rendering would discard half-typed values and
    // any widget selection (which lives in the widget's own DOM).
    if (note
        && this.stripState.mode === 'active'
        && this.stripState.snippetId === note.snippetId) {
      this.lastNote = note;
      return;
    }

    this.stripState = deriveStripState(note, this.lastNote);
    if (note) this.lastNote = note;
    this.stripDefaults =
      (this.stripState.note as StripNoteWithDefaults | null)?.sources.defaults ?? {};
    this.stripValues = {};
    for (const field of this.stripState.fields) {
      if (field.kind !== 'widget') this.stripValues[field.name] = field.value;
    }
    this.renderStrip();
  }

  private renderStrip() {
    const strip = this.stripEl;
    if (!strip) return;
    strip.empty();
    this.stripWidgetHosts = {};

    const state = this.stripState;
    strip.toggleClass('is-stale', state.disabled);

    const head = strip.createDiv({ cls: 'forge-panel-inputs-header' });
    head.createEl('span', { cls: 'forge-panel-inputs-title', text: state.header });

    // Drain 2026-08-27-0230 — the collapse toggle is gone at the driver's
    // request. THE `if (collapsed) return` GATE HAD TO GO WITH IT, and that
    // is not cosmetic: `panelStripCollapsed` is PERSISTED (main.ts:5949-5951),
    // so anyone who had collapsed the strip before this change would have
    // been left with a permanently hidden input strip and no control to
    // bring it back. The strip now always renders expanded; the stale
    // setting is inert. `stripHost.isCollapsed/setCollapsed` are left in
    // place rather than ripped out, so re-introducing a collapse affordance
    // is a UI change and not a plumbing change.

    const body = strip.createDiv({ cls: 'forge-panel-inputs-body' });
    this.stripBodyEl = body;

    if (state.hint) {
      body.createEl('div', { cls: 'forge-panel-inputs-hint', text: state.hint });
    }

    for (const field of state.fields) this.renderStripField(body, field, state.disabled);

    const actions = new Setting(body).setClass('forge-panel-inputs-actions');
    if (state.snippetId) {
      actions.addExtraButton(btn =>
        btn.setIcon('rotate-ccw')
          .setTooltip('Reset to defaults')
          .setDisabled(state.disabled)
          .onClick(() => this.resetStripToDefaults()));
    }
    actions.addButton(btn => {
      btn.setButtonText('Run').setCta().onClick(() => this.runFromStrip());
      if (state.disabled) btn.setDisabled(true);
    });
  }

  private renderStripField(body: HTMLElement, field: InputFieldModel, disabled: boolean) {
    if (field.kind === 'widget') {
      new Setting(body).setName(field.name).setDesc(`${field.widget} widget`);
      const host = body.createDiv({ cls: 'forge-widget-host' });
      const outcome = renderWidget(field.widget, field.name, host, field.seed);
      if (outcome.rendered === 'fallback-text') {
        // Diagnostics HARD RULE: an unregistered widget type is
        // visible, never a silently plain text box.
        void forgeNotice(this.app, `Forge: ${outcome.message}`);
      }
      this.stripWidgetHosts[field.name] = host;
      return;
    }

    if (field.kind === 'enum') {
      new Setting(body)
        .setName(field.name)
        .addDropdown(dd => {
          if (field.blankOption) dd.addOption('', '');
          for (const o of field.options) dd.addOption(o.value, o.label);
          dd.setValue(this.stripValues[field.name] ?? field.value)
            .setDisabled(disabled)
            .onChange(v => { this.stripValues[field.name] = v; });
        });
      return;
    }

    new Setting(body)
      .setName(field.name)
      .addText(text => {
        text.setValue(this.stripValues[field.name] ?? field.value)
          .setPlaceholder(field.placeholder)
          .setDisabled(disabled)
          .onChange(v => { this.stripValues[field.name] = v; });
      });
  }

  private resetStripToDefaults() {
    const note = this.lastNote;
    if (!note) return;
    this.stripHost?.forget(note.snippetId);
    // Rebuild from the note's own declarations with no remembered
    // values — which is exactly what a first-ever open renders.
    const fresh: StripNoteWithDefaults = {
      snippetId: note.snippetId,
      sources: note.sources,
      fields: buildInputFieldModels({ ...note.sources, cached: {} }),
    };
    this.lastNote = fresh;
    this.stripState = deriveStripState(
      this.stripState.mode === 'active' ? fresh : null, fresh);
    this.stripDefaults = fresh.sources.defaults ?? {};
    this.stripValues = {};
    for (const field of fresh.fields) {
      if (field.kind !== 'widget') this.stripValues[field.name] = field.value;
    }
    this.renderStrip();
  }

  private runFromStrip() {
    for (const [name, host] of Object.entries(this.stripWidgetHosts)) {
      this.stripValues[name] = collectWidgetInput(name, host);
    }
    const outcome = submitStrip(
      {
        snippetId: this.stripState.snippetId,
        disabled: this.stripState.disabled,
        values: this.stripValues,
        defaults: this.stripDefaults,
      },
      (snippetId, kwargs, raw) => {
        this.stripHost?.remember(snippetId, raw);
        this.stripHost?.run(snippetId, kwargs, raw);
      },
      message => { void forgeNotice(this.app, message); },
    );
    if (outcome.ran) return;
    if (outcome.missingRequired.length === 0
        && (this.stripState.disabled || !this.stripState.snippetId)) {
      // Belt-and-braces: the button is disabled in this state, so this
      // is only reachable if a future edit re-enables it by accident.
      void forgeNotice(this.app, 'Forge: open an action note to run it.');
    }
  }

  async onClose() {
    // v0.2.224 — silence audio before tearing down DOM (per Clear).
    stopMidiPlayersIn(this.contentEl, (m, e) => console.error(m, e));
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
        void forgeNotice(this.app, `Forge: could not create ${path} — does it already exist?`);
        return false;
      }
      void forgeNotice(this.app, `Forge: Created ${path}`);
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
    // v0.2.224 — silence any active midi-player before swapping content.
    stopMidiPlayersIn(this.outputEl, (m, e) => console.error(m, e));
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
    // v0.2.224 — silence any active midi-player before swapping content.
    stopMidiPlayersIn(this.outputEl, (m, e) => console.error(m, e));
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
            // v0.2.157 — engine ships music21-direct MIDI bytes alongside
            // the dual XMLs when a percussion score is detected. The
            // plugin uses these for audio (correct per-instrument percMap
            // pitches on channel 10) instead of Verovio's renderToMIDI
            // (which defaults all percussion to MIDI pitch 60 = bongo).
            const engineMidi = typeof r.multi_staff_midi_base64 === 'string'
              ? r.multi_staff_midi_base64
              : null;
            this.renderMusicXMLWithToggle(
              entry,
              r.multi_staff_content,
              r.kit_content,
              snippetId,
              engineMidi,
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

    // Drain 2026-08-05-1300 — MCQ output gets a card instead of a
    // stringified line. View-side only: `result` is untouched, so the
    // Save-as-data button below and anything that reads the note still
    // see the original string.
    //
    // Placed as the LAST check before the generic fallback on purpose.
    // Every earlier branch is a known payload shape; this one is a
    // guess about the contents of an arbitrary string, so it should
    // never get the chance to shadow something more specific.
    const mcq = parseMcqOutput(result);
    if (mcq) {
      renderMcqCard(mcq, entry as unknown as McqElement, document as unknown as McqDocument);
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
    engineMidiBase64: string | null = null,
  ) {
    const storage = this.scoreViewModeStorage();
    // v0.2.226 — default to drum-kit for percussion-domain snippets
    // (path includes /percussion/, /percussion_lab/, or filename
    // starts with drum_/drums_). Per-snippet persisted preference
    // (writeScoreViewMode via the toggle button) still wins over
    // the path heuristic; this only sets the FIRST-render default.
    const initialDefault = pickDefaultScoreViewMode(snippetId);
    let mode: ScoreViewMode = readScoreViewMode(storage, snippetId, initialDefault);

    // Toolbar above the score-host so toggling doesn't tear down the
    // chrome along with the score. v0.2.162 — zoom-bar slot lives in
    // the same toolbar as the kit toggle so the controls are
    // co-located at the top of the score area.
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
    // Zoom-bar slot — renderMusicXML populates it per render.
    // Same .forge-zoom-bar class as the inline (non-toggle) path so
    // child buttons inherit the existing zoom-button styles.
    const zoomBarHost = toolbar.createDiv({ cls: 'forge-zoom-bar' });

    const scoreHost = entry.createDiv({ cls: 'forge-output-musicxml-host' });

    // v0.2.155 — share multi-staff MIDI bytes across both display modes
    // so audio is bit-identical regardless of which mode the user
    // toggles to.
    //
    // v0.2.157 — prefer the engine-provided MIDI bytes (from music21's
    // direct streamToMidiFile export) when the payload carries them.
    // Verovio's renderToMIDI emits every Unpitched percussion note at
    // pitch 60 (High Bongo on channel 10) because it falls back to the
    // default display position instead of honoring per-Part <midi-
    // unpitched>NN</midi-unpitched> from the MusicXML's <midi-
    // instrument> blocks. music21's MIDI export uses each Instrument's
    // percMapPitch directly (kick=35, snare=38, hi-hat=42/44/46, etc.)
    // so SoundFont drums fire the right samples. Falls back to Verovio
    // MIDI when the engine bytes aren't available (older engine).
    let sharedMultiStaffMidi: { midiBase64: string; totalMs: number } | null = null;
    const ensureSharedMidi = async (): Promise<{ midiBase64: string; totalMs: number } | null> => {
      if (sharedMultiStaffMidi) return sharedMultiStaffMidi;
      if (engineMidiBase64) {
        try {
          const ns = await midiBase64ToNoteSequence(engineMidiBase64);
          const totalMs = (ns?.totalTime ?? 0) * 1000;
          sharedMultiStaffMidi = { midiBase64: engineMidiBase64, totalMs };
          return sharedMultiStaffMidi;
        } catch (e) {
          console.error('Forge: engine MIDI parse failed; falling back to Verovio render', e);
        }
      }
      try {
        const r = await renderMusicXMLAndMIDI(multiStaffXml, scoreHost.clientWidth);
        const totalMs = r.timeMap.length ? r.timeMap[r.timeMap.length - 1].ms : 0;
        sharedMultiStaffMidi = { midiBase64: r.midiBase64, totalMs };
      } catch (e) {
        console.error('Forge: shared multi-staff MIDI pre-render failed', e);
      }
      return sharedMultiStaffMidi;
    };

    const renderInto = async (m: ScoreViewMode) => {
      // v0.2.224 — silence any active midi-player on display-mode switch.
      // The kit ↔ multi-staff toggle re-renders into scoreHost; without
      // stopping the prior render's player first, two audio streams
      // would play simultaneously (or the prior one keeps running with
      // no UI to stop it).
      stopMidiPlayersIn(scoreHost, (m, e) => console.error(m, e));
      scoreHost.empty();
      const shared = await ensureSharedMidi();
      // v0.2.155 — both modes use shared multi-staff MIDI bytes. Kit
      // mode displays kit_xml but plays multi-staff audio (canonical
      // routing). Multi-staff mode displays multi-staff XML and plays
      // the SAME bytes (cache hit). If the pre-render failed, fall
      // back to per-mode render (legacy v0.2.151+ behaviour) so the
      // user still gets audio.
      if (m === 'kit') {
        this.renderMusicXML(scoreHost, kitXml, snippetId, multiStaffXml, shared ?? undefined, zoomBarHost);
      } else {
        this.renderMusicXML(scoreHost, multiStaffXml, snippetId, undefined, shared ?? undefined, zoomBarHost);
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
    sharedMidi?: { midiBase64: string; totalMs: number; source?: string },
    externalZoomBar?: HTMLElement,
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
        // v0.2.155 — when `sharedMidi` is provided (by toggle wrapper),
        // skip the second Verovio MIDI render and use the precomputed
        // multi-staff bytes. Guarantees mode-toggle audio identity by
        // construction.
        const sameXml = midiSourceXml === undefined || midiSourceXml === musicxml;
        const midiXml = midiSourceXml ?? musicxml;
        const displayRender = await renderMusicXMLAndMIDI(musicxml, host.clientWidth);
        const svg = displayRender.svg;
        let midiBase64: string;
        let midiTotalMs: number;
        // v0.2.207 — Build-step hardening: tsc caught `midiRender`
        // referenced at line ~698 in the click-to-play handler but
        // its `const midiRender = ...` declaration was inside the
        // `else` block below — out of scope by the time the handler
        // ran. Hoist the binding to function scope so the handler's
        // scaledMs calculation (split-render mode) actually has the
        // MIDI render available. Pre-v0.2.207, click-to-play in
        // split-render mode would have thrown a ReferenceError at
        // every click. The path may have been unreachable for cohort
        // (single-XML mode is the default), but the dead path was
        // a landmine.
        let midiRender: Awaited<ReturnType<typeof renderMusicXMLAndMIDI>> | null = null;
        if (sharedMidi) {
          midiBase64 = sharedMidi.midiBase64;
          midiTotalMs = sharedMidi.totalMs;
        } else {
          midiRender = sameXml
            ? displayRender
            : await renderMusicXMLAndMIDI(midiXml, host.clientWidth);
          midiBase64 = midiRender.midiBase64;
          midiTotalMs = midiRender.timeMap.length
            ? midiRender.timeMap[midiRender.timeMap.length - 1].ms
            : 0;
        }
        // For single-XML renders timeMap comes from displayRender directly.
        // For split renders use the display timeMap (matches the rendered
        // SVG's note IDs) but scale times to the MIDI XML's duration so
        // score-follower highlights track the audible playback.
        let timeMap = displayRender.timeMap;
        if (!sameXml) {
          const displayTotalMs = displayRender.timeMap.length
            ? displayRender.timeMap[displayRender.timeMap.length - 1].ms
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
        // can scale the SVG without recomputing.
        // v0.2.162 — when `externalZoomBar` is provided (by the
        // kit-toggle wrapper), mount the zoom controls into the
        // shared top toolbar instead of inline above the score.
        // Empty the slot first so toggling modes doesn't stack
        // duplicate button sets.
        let zoomBar: HTMLElement;
        if (externalZoomBar) {
          externalZoomBar.empty();
          zoomBar = externalZoomBar;
        } else {
          zoomBar = host.createDiv({ cls: 'forge-zoom-bar' });
        }
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
                    midiRender && midiRender.timeMap.length && displayRender.timeMap.length
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

  /** Drain 2026-08-08-1300 — structured 3-field error rendering
   *  (cause + suggested fix always visible; traceback collapsed
   *  behind a native <details> disclosure). Only migrated error
   *  classes route here (classifyForgeError); everything else keeps
   *  the plain appendError path. Layout lives in the pure-core so the
   *  shape is headlessly test-pinned. */
  appendForgeError(snippetId: string, err: ForgeError) {
    const entry = this.makeEntry(snippetId);
    renderForgeError(entry, err);
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  /** v0.2.184 — generic-message append. Replaces Notice toasts per
   *  driver preference. `kind="error"` styles the line in red (same
   *  class as appendError uses); other kinds render as plain prose.
   *  `snippetId` is the attribution label; pass "Forge" when the
   *  message isn't tied to a specific snippet.
   */
  appendMessage(snippetId: string, text: string, kind: 'info' | 'error' | 'success' = 'info') {
    const entry = this.makeEntry(snippetId);
    if (kind === 'error') {
      entry.addClass('is-error');
      entry.createEl('p', { text, cls: 'forge-output-error' });
    } else {
      entry.createEl('p', { text, cls: 'forge-output-message' });
    }
    entry.scrollIntoView({ behavior: 'smooth' });
  }

  /** CW-description-prose-hallucination-forge-output-visibility
   *  (2026-07-17). First-class rejection report for LLM Recipe
   *  generation failures (closure fail / sanitize fail).
   *
   *  Pre-drain the failure surface was a `console.warn` + brief
   *  Notice toast — invisible to cohort users who don't open DevTools.
   *  This method makes the panel the primary UX surface, matching the
   *  existing appendError shape but with a structured layout:
   *
   *    - failure mode label
   *    - unresolved wikilinks list (closure-fail only)
   *    - LLM raw output preview (first ~500 chars)
   *    - "Likely cause" prose (from llm-rejection-guidance-core)
   *    - Fix options list
   *
   *  The guidance derivation lives in the pure-core so a refactor
   *  can't silently drop the "prose-landmine" naming quality (§3.2
   *  test case #5). */
  appendLlmRecipeRejection(
    snippetId: string,
    input: {
      failureMode: RejectionFailureMode;
      unresolvedWikilinks: readonly string[];
      // Drain 2026-08-24-2310 — populated for 'free-variable-fail'.
      undeclaredNames?: readonly string[];
      // Drain 2026-08-26-1000 — populated for 'cycle-fail'.
      cyclicCallees?: readonly string[];
      // Drain 2026-08-26-1020 — populated for 'recursion-shape-fail'.
      recursionFailure?: 'no-base-case' | 'no-progress' | 'both';
      llmRawOutput: string;
      descriptionBody: string;
      // Drain 2026-08-24-2360 — lets the guidance recognise a
      // self-call instead of reporting the open note as an
      // unregistered chip.
      targetSnippetId?: string;
    },
  ) {
    const guidance = deriveLlmRejectionGuidance({
      failureMode: input.failureMode,
      unresolvedWikilinks: input.unresolvedWikilinks,
      undeclaredNames: input.undeclaredNames,
      cyclicCallees: input.cyclicCallees,
      recursionFailure: input.recursionFailure,
      descriptionBody: input.descriptionBody,
      targetSnippetId: input.targetSnippetId,
    });
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-error');
    entry.addClass('forge-output-llm-rejection');

    entry.createEl('p', {
      text: '⚠  Description → Recipe generation rejected',
      cls: 'forge-output-error',
    });

    // Compact structured block: mode + unresolved (when applicable).
    // Drain 2026-08-24-2310 — a ternary could not grow a third arm
    // without saying something false about one of them, so this is a
    // lookup now. A mode with no label would render "undefined" to the
    // cohort, which is why the fallback names the mode itself.
    const MODE_LABELS: Record<string, string> = {
      'closure-fail': 'closure-fail (LLM referenced unknown chips)',
      'sanitize-fail': 'sanitize-fail (LLM emitted no valid Let/Return)',
      'free-variable-fail':
        'free-variable-fail (LLM used a name it never declared as an Input)',
    };
    const modeLabel = MODE_LABELS[input.failureMode] ?? input.failureMode;
    entry.createEl('p', {
      text: `Failure mode: ${modeLabel}`,
      cls: 'forge-output-message',
    });
    if (input.unresolvedWikilinks.length > 0) {
      const unresolvedText = input.unresolvedWikilinks
        .map((w) => `[[${w}]]`)
        .join(', ');
      entry.createEl('p', {
        text: `Unresolved: ${unresolvedText}`,
        cls: 'forge-output-message',
      });
    }

    // LLM raw output preview — pre-formatted so multiline output stays
    // legible.
    if (input.llmRawOutput) {
      entry.createEl('p', {
        text: 'LLM raw output:',
        cls: 'forge-output-message',
      });
      entry.createEl('pre', {
        text: truncateLlmOutput(input.llmRawOutput),
        cls: 'forge-output-stdout',
      });
    }

    entry.createEl('p', {
      text: `Likely cause: ${guidance.likelyCause}`,
      cls: 'forge-output-message',
    });

    entry.createEl('p', {
      text: 'Fix options:',
      cls: 'forge-output-message',
    });
    const ul = entry.createEl('ul', { cls: 'forge-output-fix-options' });
    for (const opt of guidance.fixOptions) {
      ul.createEl('li', { text: opt });
    }

    entry.createEl('p', {
      text:
        'Prior Recipe preserved. Widget will show "out of date" until '
        + 'the Description re-forges cleanly.',
      cls: 'forge-output-message',
    });

    entry.scrollIntoView({ behavior: 'smooth' });
  }

  /** CW-slot-cache-panel-treatment (2026-07-20-1710).
   *  Render a slot-cache-writer file-not-found miss as a persistent
   *  entry in the Forge Output panel. Mirror of
   *  `appendLlmRecipeRejection` for the sibling load-bearing surface.
   *
   *  Layout:
   *    - Header: "⚠  Slot cache write skipped — source file not found"
   *    - Attempts trace (one <p> per LocateAttempt, in-order): shows
   *      exactly which lookup was tried and whether it matched.
   *    - Vault scan size (`.md file count`) for context.
   *    - "Likely cause" prose from the pure-core guidance derivation.
   *    - "Fix options" list from the same. */
  appendSlotCacheNotFound(
    snippetId: string,
    input: SlotCacheNotFoundInput,
  ) {
    const guidance = deriveSlotCacheNotFoundGuidance(input);
    const entry = this.makeEntry(snippetId);
    entry.addClass('is-error');
    entry.addClass('forge-output-slot-cache-not-found');

    entry.createEl('p', {
      text: '⚠  Slot cache write skipped — source file not found',
      cls: 'forge-output-error',
    });

    // Attempts trace — one line per step.
    entry.createEl('p', {
      text: 'Lookup attempts:',
      cls: 'forge-output-message',
    });
    const ul = entry.createEl('ul', { cls: 'forge-output-attempts' });
    for (const a of input.attempts) {
      const marker = a.matched ? '✓' : '✗';
      const label = a.step === 'provided-file'
        ? 'caller-supplied file'
        : (a.step === 'exact-path' ? 'exact path' : 'basename walk');
      ul.createEl('li', {
        text: `${marker}  ${label}: ${a.tried}`,
      });
    }
    entry.createEl('p', {
      text: `Vault scanned: ${input.markdownFileCount} .md files.`,
      cls: 'forge-output-message',
    });

    entry.createEl('p', {
      text: `Likely cause: ${guidance.likelyCause}`,
      cls: 'forge-output-message',
    });

    entry.createEl('p', {
      text: 'Fix options:',
      cls: 'forge-output-message',
    });
    const fixUl = entry.createEl('ul', { cls: 'forge-output-fix-options' });
    for (const opt of guidance.fixOptions) {
      fixUl.createEl('li', { text: opt });
    }

    entry.scrollIntoView({ behavior: 'smooth' });
  }

  private makeEntry(snippetId: string): HTMLElement {
    const entry = this.outputEl.createDiv({ cls: 'forge-output-entry' });
    // Drain 2026-08-27-0230 — ONE guard, at the writer, not per call site.
    // All eight makeEntry callers pass a variable; the generic/real
    // distinction is made by whoever called them, and generic messages
    // arrive through forgeNotice / forgeOutput whose snippetId DEFAULTS to
    // 'Forge'. Deciding here covers every current caller and every future
    // one — the same reasoning as drain 1620's write guard.
    if (shouldRenderEntryMeta(snippetId)) {
      const meta = entry.createDiv({ cls: 'forge-output-meta' });
      meta.createEl('span', { text: snippetId, cls: 'forge-output-id' });
      meta.createEl('span', { text: new Date().toLocaleTimeString(), cls: 'forge-output-time' });
    }
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

  // v0.2.161 — "Open in GarageBand" button (macOS desktop only).
  // Obsidian on macOS Electron has full Node.js access; we write
  // the MIDI bytes to a temp file and `open -a GarageBand` it.
  // Hidden on iOS/Android (no node), Windows/Linux (no GarageBand).
  // If GarageBand isn't installed, the macOS `open` command surfaces
  // the system error in a notice.
  try {
    const isMacDesktop = (typeof process !== 'undefined')
      && process.platform === 'darwin';
    if (isMacDesktop) {
      const gbBtn = bar.createEl('button', {
        text: 'Open in Garage Band',
        cls: 'forge-output-download',
      });
      gbBtn.addEventListener('click', async () => {
        try {
          const fs = require('fs');
          const os = require('os');
          const path = require('path');
          const { exec } = require('child_process');
          // Sanitize snippetId for filesystem — keep only alnum + dash + underscore.
          const safeId = snippetId.replace(/[^a-zA-Z0-9_-]/g, '_');
          const tmpDir = os.tmpdir();
          const filePath = path.join(tmpDir, `forge-${safeId}.mid`);
          fs.writeFileSync(filePath, Buffer.from(midiBase64, 'base64'));
          exec(`open -a "GarageBand" "${filePath}"`, (err: any) => {
            if (err) {
              // Fall back to default app (Logic, MainStage, QuickTime, etc.)
              // so the user gets *some* app to open in even without GB.
              exec(`open "${filePath}"`, (err2: any) => {
                if (err2) {
                  console.error('Forge: failed to open MIDI in any app', err2);
                }
              });
            }
          });
        } catch (e) {
          console.error('Forge: GarageBand open failed', e);
        }
      });
    }
  } catch (_e) {
    // process global unavailable (e.g., Obsidian mobile) — no button.
  }

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
