import { ItemView, MarkdownRenderer, Notice, Setting, WorkspaceLeaf } from 'obsidian';
import {
  parseMcqOutput,
  renderMcqCard,
  type McqDocument,
  type McqElement,
} from './mcq-widget-core.ts';
import { clampStripFraction, stripFractionFromDrag, stripFlexBasis, DEFAULT_STRIP_FRACTION } from './forge-panel-split-core.ts';
import { shouldRenderEntryMeta } from './output-entry-meta-core.ts';
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
import { parseSvgMarkup } from './svg-markup-core.ts';
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
  /** Split fraction, persisted. The GETTER is responsible for clamping —
   *  see forge-panel-split-core.ts for why the read path owns it. */
  getStripFraction(): number;
  setStripFraction(fraction: number): void;
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
    // clear and re-render via Clear. Only the standalone button DOM goes.
    header.createEl('button', { text: 'Clear' }).onclick = () => {
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
    // Drain 2026-08-27-0410 — Gate T. The collapse toggle was removed in
    // drain 0230 with the ▶ glyph beside it, on the reading that the two
    // complaints were one. They were not: the ▶ was a fake run-button
    // look-alike (gone, and staying gone); this is a real control. Restored
    // verbatim from 160278b^ rather than reconstructed. The plumbing was
    // deliberately left in place at the time so this would be wiring, not a
    // re-implementation — `if (collapsed) return` comes back with it,
    // because without that gate the button toggles a class and nothing
    // hides.
    const collapsed = this.stripHost?.isCollapsed() ?? false;
    strip.toggleClass('is-collapsed', collapsed);
    strip.toggleClass('is-stale', state.disabled);

    // Drain 2026-08-27-0700 — apply the persisted split. Clamped by the
    // host's getter, so a hand-edited or stale data.json cannot hide a
    // region here.
    strip.style.flexBasis = stripFlexBasis(
      this.stripHost?.getStripFraction() ?? DEFAULT_STRIP_FRACTION,
    );
    // the 33% cap is now a DEFAULT, not a cap — see .has-persisted-split.
    strip.addClass('has-persisted-split');

    this.renderSplitDivider(strip);

    const head = strip.createDiv({ cls: 'forge-panel-inputs-header' });
    const toggle = head.createEl('button', {
      cls: 'forge-panel-inputs-toggle',
      text: collapsed ? '▸' : '▾',
    });
    toggle.setAttribute('aria-label', collapsed ? 'Expand inputs' : 'Collapse inputs');
    toggle.onclick = () => {
      this.stripHost?.setCollapsed(!collapsed);
      this.renderStrip();
    };
    head.createEl('span', { cls: 'forge-panel-inputs-title', text: state.header });

    if (collapsed) return;

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
        this.renderText(entry, body);
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
    // The body is the user's own SVG markup from a file they authored.
    // Parsed via parseSvgMarkup (not `.innerHTML =`, which Obsidian's
    // directory review rejects outright) — invalid markup still renders
    // whatever the HTML parser can recover, and script / on* / javascript:
    // content is stripped on the way in.
    host.append(...parseSvgMarkup(body, new DOMParser()));
  }

  private renderResult(entry: HTMLElement, result: unknown, snippetId: string) {
    if (result === null || result === undefined) return;

    // Tagged payloads from the backend (musicxml, future: svg, ifc, ...)
    if (isTagged(result)) {
      switch (result.type) {
        case 'musicxml':
          // Score rendering (Verovio) is music-domain and is not shipped on
          // this lean branch; show the payload source as plain text.
          this.renderText(entry, String((result as { content?: unknown }).content ?? ''));
          return;
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
      'closure-fail': 'closure-fail (LLM referenced unknown library notes)',
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

  /** Draggable separator between the output region and the input strip.
   *  Drag sets the strip's flex-basis; the output region absorbs the rest
   *  through its existing `flex: 1 1 auto`. Double-click resets. */
  private renderSplitDivider(strip: HTMLElement) {
    const panel = strip.parentElement;
    if (!panel) return;
    const divider = strip.createDiv({ cls: 'forge-panel-split-divider' });
    divider.setAttribute('aria-label', 'Resize input strip (double-click to reset)');

    const applyFromPointer = (clientY: number) => {
      const box = panel.getBoundingClientRect();
      const fraction = stripFractionFromDrag(clientY, box.top, box.height);
      strip.style.flexBasis = stripFlexBasis(fraction);
      return fraction;
    };

    divider.onpointerdown = (down: PointerEvent) => {
      down.preventDefault();
      let latest = this.stripHost?.getStripFraction() ?? DEFAULT_STRIP_FRACTION;
      const move = (e: PointerEvent) => { latest = applyFromPointer(e.clientY); };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        // Persist ONCE, on release — a drag is many events and each one
        // would otherwise be a settings write.
        this.stripHost?.setStripFraction(latest);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    divider.ondblclick = () => {
      strip.style.flexBasis = stripFlexBasis(DEFAULT_STRIP_FRACTION);
      this.stripHost?.setStripFraction(DEFAULT_STRIP_FRACTION);
    };
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
