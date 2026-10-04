// Music edition — FULL implementation of the music-edition seam (see music-edition.ts).
//
// Everything in this file was moved VERBATIM out of output-view.ts / main.ts, where it lived
// until the lean-branch strip (787961d) deleted it: score rendering (Verovio), the MIDI player
// and its teardown, the multi-staff <-> kit view toggle, program-change/lead-in helpers, the
// download bar, the score follower, and the music input-widget registration. The only edits
// are mechanical: former ForgeOutputView private methods are now module functions (their
// `this.` self-references became direct calls), and they are exposed through `musicEdition`.
//
// Bundled ONLY when FORGE_EDITION=music (scripts/build-main.mjs points the seam selector at this
// file). The lean build never reaches this module, so verovio / html-midi-player and their
// transitive audio chain are absent from lean main.js.

import { renderMusicXMLAndMIDI, getTimeForElement, TimeBucket } from './verovio.ts';
import {
  readScoreViewMode,
  toggleScoreViewMode,
  pickDefaultScoreViewMode,
  type ScoreViewMode,
  type ScoreViewModeStorage,
} from './view-mode-core.ts';
import { stopMidiPlayersIn } from './midi-player-teardown-core.ts';
import { registerWidget } from './input-widget-core.ts';
import { pianoWidget } from './input-widget-piano.ts';
import { guitarFretboardWidget } from './input-widget-guitar-fretboard.ts';
import { chordBuilderWidget } from './input-widget-chord-builder.ts';
import { parseSvgMarkup } from './svg-markup-core.ts';
import type { MusicEdition } from './music-edition.ts';

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


/** v0.2.150 — wrap localStorage access for view-mode-core. Mirrors
 *  the v0.2.138 expandedStateStorage pattern in main.ts: try/catch
 *  the global, return null on SecurityError or sandbox absence so
 *  the pure-core's defensive default kicks in. */
function scoreViewModeStorage(): ScoreViewModeStorage | null {
  try {
    const ls = globalThis.localStorage;
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
function renderMusicXMLWithToggle(
  entry: HTMLElement,
  multiStaffXml: string,
  kitXml: string,
  snippetId: string,
  engineMidiBase64: string | null = null,
) {
  const storage = scoreViewModeStorage();
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
      renderMusicXML(scoreHost, kitXml, snippetId, multiStaffXml, shared ?? undefined, zoomBarHost);
    } else {
      renderMusicXML(scoreHost, multiStaffXml, snippetId, undefined, shared ?? undefined, zoomBarHost);
    }
  };
  renderInto(mode);

  button.addEventListener('click', () => {
    mode = toggleScoreViewMode(storage, snippetId);
    updateLabel(mode);
    renderInto(mode);
  });
}

function renderMusicXML(
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
      scoreWrap.append(...parseSvgMarkup(svg, new DOMParser()));
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
          // max-width, so the SVG never grew. The `.forge-zoomable`
          // class (higher specificity than the base rule) lets the
          // explicit width win, and the .forge-output-score
          // wrapper's overflow-x: auto surfaces a horizontal
          // scrollbar. `height: auto` is already the base rule's
          // default, so no inline override is needed for it.
          svgEl.classList.add('forge-zoomable');
          svgEl.style.width = `${w}px`;
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
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only Node builtin, loaded via require so bundlers don't try to resolve it for non-desktop targets.
          const fs = require('fs');
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only Node builtin, loaded via require so bundlers don't try to resolve it for non-desktop targets.
          const os = require('os');
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only Node builtin, loaded via require so bundlers don't try to resolve it for non-desktop targets.
          const path = require('path');
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only Node builtin, loaded via require so bundlers don't try to resolve it for non-desktop targets.
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

export const musicEdition: MusicEdition = {
  id: 'music',
  registerInputWidgets() {
    // Drains 2026-08-05-1500/-1530/-1600 — register the run-input widgets. All three
    // WidgetType names have renderers; an unknown type in frontmatter still gets the
    // fallback text box plus a Notice naming it.
    registerWidget(pianoWidget);
    registerWidget(guitarFretboardWidget);
    registerWidget(chordBuilderWidget);
  },
  stopPlayers(root, onError) {
    // v0.2.224 — silence audio before tearing down DOM. Removing a <midi-player> from the DOM
    // doesn't dispose its audio context; the music kept playing post-Clear pre-fix.
    stopMidiPlayersIn(root, onError);
  },
  renderMusicXML(entry, musicxml, snippetId) {
    renderMusicXML(entry, musicxml, snippetId);
    return true;
  },
  renderTaggedMusicXML(entry, result, snippetId) {
    // v0.2.150 — dual-XML opt-in. When the engine emits both multi-staff + kit MusicXML
    // (percussion piece), render with the toggle toolbar. Otherwise fall back to the single-XML
    // path (legacy snippets + non-percussion music).
    const r = result;
    if (
      r.has_percussion === true
      && typeof r.kit_content === 'string'
      && typeof r.multi_staff_content === 'string'
    ) {
      // v0.2.157 — engine ships music21-direct MIDI bytes alongside the dual XMLs when a
      // percussion score is detected; used for audio (correct per-instrument percMap pitches on
      // channel 10) instead of Verovio's renderToMIDI (all percussion -> MIDI pitch 60 = bongo).
      const engineMidi = typeof r.multi_staff_midi_base64 === 'string'
        ? r.multi_staff_midi_base64
        : null;
      renderMusicXMLWithToggle(entry, r.multi_staff_content, r.kit_content, snippetId, engineMidi);
    } else {
      renderMusicXML(entry, r.content as string, snippetId);
    }
    return true;
  },
};
