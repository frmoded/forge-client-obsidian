// Drain 2026-08-30-0945 — parse a Pyodide PythonError message for the
// engine's SlotCacheMissError payload.
//
// `forge/core/slot_cache.py`'s SlotCacheMissError deliberately
// JSON-encodes {"slot_cache_miss": [...]} into its own exception
// message, per its own docstring: "Encode the missing list as JSON in
// the message so the Pyodide -> JS exception boundary preserves the
// structure (Pyodide surfaces the str of the exception as the JS
// Error message)." Verified directly against the real exception in
// forge's own venv: `str(SlotCacheMissError(missing))` is exactly that
// JSON, nothing else.
//
// Pyodide's own PythonError wrapping adds a prefix (the qualified
// exception type name, and sometimes a full traceback above it) — the
// driver's live trace showed exactly that shape. This parser does not
// assume a fixed prefix or that the JSON is the whole message; it
// finds the first balanced `{...}` substring and validates its shape,
// so it survives whatever wrapping Pyodide adds around the payload the
// engine actually controls.

export interface MissingSlot {
  slot_text: string;
  snippet_id: string;
  surrounding_context: string;
}

/** Find the first top-level balanced `{...}` substring in `text`,
 *  starting the search from `text`'s first `{`. Returns null if braces
 *  never balance (truncated / malformed). */
function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function isMissingSlotShape(v: unknown): v is MissingSlot {
  return (
    typeof v === 'object' && v !== null
    && typeof (v as any).slot_text === 'string'
    && typeof (v as any).snippet_id === 'string'
    && typeof (v as any).surrounding_context === 'string'
  );
}

/** Parse a caught Pyodide error's message for a SlotCacheMissError
 *  payload. Returns the `missing` list (possibly empty) when the
 *  message contains a well-formed `{"slot_cache_miss": [...]}` object
 *  with array-of-MissingSlot shape; `null` for anything else
 *  (no JSON present, malformed JSON, wrong shape) — a null return
 *  means "this was not a slot-cache-miss failure," not "parsing
 *  failed," so callers can fall through to their existing
 *  error-swallow path unchanged. */
export function parseSlotCacheMissFromPythonError(
  message: string,
): MissingSlot[] | null {
  if (!message) return null;
  const jsonText = extractBalancedJsonObject(message);
  if (jsonText === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const missing = (parsed as Record<string, unknown>).slot_cache_miss;
  if (!Array.isArray(missing)) return null;
  if (!missing.every(isMissingSlotShape)) return null;
  return missing;
}
