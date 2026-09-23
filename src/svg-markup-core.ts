// Drain 2026-09-23-1042 — parse SVG/HTML markup into DOM nodes WITHOUT
// assigning `.innerHTML`. Obsidian's community-plugin directory review
// (eslint `no-unsanitized/property`) rejects every raw `.innerHTML =`
// write regardless of trust boundary, so output-view.ts's two sites
// (a user's own SVG file; Verovio's generated score) go through here.
//
// Why the HTML parser (`text/html`) and not `image/svg+xml`: the
// Verovio multi-page score is `<div class="forge-verovio-pages">` (an
// HTML div carrying a CSS class that styles the page stack) wrapping
// several `<svg>` roots. That is not well-formed single-root XML, and
// the XML parser would also make the wrapper a non-HTML element. The
// HTML parser reproduces what `innerHTML` built: an HTML div with SVG-
// namespaced children, so the zoom code's `querySelectorAll('svg')`,
// `getAttribute('width')`, `.note` ids, and the `.forge-verovio-pages`
// CSS all see the same DOM as before.
//
// Parsing alone is not sanitizing, and moving parsed nodes into a live
// document would let inline `on*` handlers fire. So this also strips
// `<script>` elements, `on*` attributes, and `javascript:` URLs. That is
// a deliberate tightening vs the old `innerHTML` path (which kept `on*`
// attributes): neither Verovio output nor a well-formed authored SVG
// needs them.
//
// Pure-core: the parser is injected, no Obsidian or global DOM access,
// so tests run under happy-dom without an Obsidian shim.

export interface HtmlParser {
  parseFromString(markup: string, type: 'text/html'): Document;
}

const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

function isJavascriptUrl(value: string): boolean {
  // Browsers ignore leading whitespace/control chars and embedded tabs/
  // newlines inside a URL scheme, so compare with every char <= U+0020
  // removed. Stricter than a browser (also collapses interior spaces),
  // which only errs toward stripping.
  const compact = Array.from(value)
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join('')
    .toLowerCase();
  return compact.startsWith('javascript:');
}

function sanitizeTree(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.localName.toLowerCase() === 'script') {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.has(name) && isJavascriptUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/** Parse `markup` into sanitized top-level DOM nodes, ready for
 *  `host.append(...nodes)`. Never throws on malformed input — the HTML
 *  parser is error-tolerant, matching the old "render whatever the
 *  browser can parse" behavior. Empty/whitespace input yields `[]`. */
export function parseSvgMarkup(markup: string, parser: HtmlParser): Node[] {
  if (markup.trim() === '') return [];
  const doc = parser.parseFromString(markup, 'text/html');
  sanitizeTree(doc.documentElement);
  // A leading `<style>` is hoisted into <head> by the HTML parser;
  // keep those (they belong to the author's SVG), drop other head
  // furniture (meta/link/title/base) an SVG has no business carrying.
  const headStyles = Array.from(doc.head.children).filter(
    (c) => c.localName.toLowerCase() === 'style',
  );
  return [...headStyles, ...Array.from(doc.body.childNodes)];
}
