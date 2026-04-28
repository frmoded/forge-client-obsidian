// Parses a single line for Zap syntax: `[[snippet_id]]` followed by zero or more
// arguments. Arguments may be:
//   - "double-quoted strings"
//   - bare-words (treated as strings)
//   - key=value or key="value" (named inputs)
// Examples:
//   [[install]] "forge-core"             → { snippetId: "install", args: ["forge-core"], inputs: {} }
//   [[forge-core/hello_registry]]        → { snippetId: "forge-core/hello_registry", args: [], inputs: {} }
//   [[greet]] "Alice" name="Bob"         → { snippetId: "greet", args: ["Alice"], inputs: { name: "Bob" } }
//
// Returns null if the line contains no [[wikilink]] at the start of a token.
export interface ParsedZap {
  snippetId: string;
  args: string[];
  inputs: Record<string, string>;
}

const WIKILINK_RE = /\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/;

export function parseZapLine(line: string): ParsedZap | null {
  const m = line.match(WIKILINK_RE);
  if (!m) return null;

  const snippetId = m[1].trim();
  const tail = line.slice((m.index ?? 0) + m[0].length);

  const args: string[] = [];
  const inputs: Record<string, string> = {};

  for (const tok of tokenize(tail)) {
    if (tok.kind === 'kv') {
      inputs[tok.key] = tok.value;
    } else {
      args.push(tok.value);
    }
  }

  return { snippetId, args, inputs };
}

type Token =
  | { kind: 'positional'; value: string }
  | { kind: 'kv'; key: string; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;

    // Try key=... first
    const kvMatch = text.slice(i).match(/^([a-zA-Z_][\w-]*)\s*=/);
    if (kvMatch) {
      const key = kvMatch[1];
      i += kvMatch[0].length;
      const value = readValue(text, i);
      tokens.push({ kind: 'kv', key, value: value.value });
      i = value.end;
      continue;
    }

    // Otherwise positional: a quoted string or a bareword
    const value = readValue(text, i);
    tokens.push({ kind: 'positional', value: value.value });
    i = value.end;
  }

  return tokens;
}

function readValue(text: string, start: number): { value: string; end: number } {
  if (text[start] === '"') {
    // Quoted — read until closing quote (no escape support for v1).
    const end = text.indexOf('"', start + 1);
    if (end === -1) {
      return { value: text.slice(start + 1), end: text.length };
    }
    return { value: text.slice(start + 1, end), end: end + 1 };
  }
  // Bareword — read until whitespace.
  let i = start;
  while (i < text.length && !/\s/.test(text[i])) i++;
  return { value: text.slice(start, i), end: i };
}
