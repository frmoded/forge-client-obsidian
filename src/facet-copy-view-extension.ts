// Native-copy facet-heading support — CM6 extension. Drain
// 2026-07-23-1100 (attempt 2).
//
// A `copy` DOM event handler registered through CM6's own
// `EditorView.domEventHandlers`, which the library runs BEFORE its
// built-in clipboard behavior — this is the hybrid of the drain
// prompt's Approach A and B: the deterministic ordering of a DOM event
// (Approach B; also fires for context-menu Copy, answering the §8
// question) delivered through the same `registerEditorExtension`
// integration path as the plugin's six existing extensions
// (Approach A's cleanliness), with no dependence on keymap priority.
//
// WHAT IT WRITES: the SOURCE slice of the selection (plus adjacency
// headings, per facet-heading-copy-augment-core.ts) as `text/plain`
// ONLY. Obsidian's default writes text/plain + text/html; this
// handler intentionally does not reproduce the text/html variant —
// generating faithful HTML would require our own Markdown renderer.
// Drain §4.5 explicitly sanctions this path: "either preserve it or
// explicitly write plain-only with a rationale in FEEDBACK." The
// rationale, in one line: the copy semantic here is *source* copy,
// and pasting source markdown into a rich-text editor as plain text
// is coherent, whereas the old text/html variant was the corrupted
// artifact (styled body with the heading structure silently gone).
// Full rationale in the drain FEEDBACK.
//
// WHEN IT FIRES — every gate falls through to Obsidian's default:
//   1. the editor is not in Live Preview (source mode's default copy
//      is already byte-exact; injecting adjacency headings there
//      would surprise);
//   2. the note's frontmatter `type` is not `action`/`data` (§4.1 —
//      legacy V1 notes, plain markdown, library views untouched);
//   3. the body is not V2a-shaped (a `type: data` note with no facet
//      headings has nothing to augment);
//   4. the selection is empty (§4.2);
//   5. the event has no clipboardData to write to.
// The degradation mode of every gate — and of the whole extension, if
// a future Obsidian stops delivering the event — is Obsidian's
// pre-existing behavior, never a broken copy.
//
// NO OBSIDIAN IMPORTS. The Live Preview check reads Obsidian's
// runtime DOM classes (the CSS-class-gating pattern) and is INJECTED
// so the integration harness, which has no Obsidian DOM, can supply
// its own predicate — and can also exercise the default predicate by
// building a classed ancestor.

import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { augmentFacetHeadingCopy } from './facet-heading-copy-augment-core.ts';
import { readFrontmatterType } from './frontmatter-fold-view-plugin.ts';

export type EditorEligibility = (view: EditorView) => boolean;

/** Default gate: Obsidian marks Live Preview editors with
 *  `.markdown-source-view.is-live-preview` on an ancestor. Anywhere
 *  that ancestor is absent (source mode, embeds, unknown hosts) the
 *  answer is false and the default copy runs. */
export function isLivePreviewView(view: EditorView): boolean {
  const container = view.dom.closest('.markdown-source-view');
  return container?.classList.contains('is-live-preview') ?? false;
}

/** Decide the copy payload for a view, or null to fall through.
 *  Split from the event handler so tests can exercise the full gate
 *  chain without synthesizing an event. */
export function decideCopyPayload(view: EditorView): string | null {
  const body = view.state.doc.toString();
  const fmType = readFrontmatterType(body);
  if (fmType !== 'action' && fmType !== 'data') return null;
  const ranges = view.state.selection.ranges.map(r => ({ from: r.from, to: r.to }));
  const augmented = augmentFacetHeadingCopy(body, ranges);
  if (augmented === null || augmented === '') return null;
  return augmented;
}

export function makeFacetCopyExtension(
  isEligible: EditorEligibility = isLivePreviewView,
): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      copy: (event: ClipboardEvent, view: EditorView): boolean => {
        try {
          if (!isEligible(view)) return false;
          if (!event.clipboardData) return false;
          const payload = decideCopyPayload(view);
          if (payload === null) return false;
          event.clipboardData.setData('text/plain', payload);
          event.preventDefault();
          return true;
        } catch (e) {
          // Fall through to the default copy on ANY failure — a broken
          // clipboard is strictly worse than the pre-fix behavior.
          console.error('facet-copy-view-extension: copy handler failed; falling through to default copy', e);
          return false;
        }
      },
    }),
  );
}
