---
timestamp: 2026-05-26T00:22:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-25T16:54:51Z
status: success
---

# v0.2.4 — V1 plugin α endpoint swap + settings UI for token

## 1. Settings panel diff

`forge-client-obsidian/src/settings.ts` (123 lines).

New fields on `ForgeSettings`:

- `transpileServiceUrl: string` — default `"https://forge.thecodingarena.com"`
- `transpileServiceToken: string` — default `""`

`DEFAULT_SETTINGS` updated to match. Both persist via Obsidian's
`loadData()`/`saveData()`.

`ForgeSettingTab.display()` rewritten so the **Transpile service**
section is the first block in the rendered settings tab. Two
`Setting` rows:

- **Transpile service URL** (plain text input).
- **Transpile service token** — text input with
  `text.inputEl.type = 'password'` so it renders masked (●●●●).

The existing local-engine fields (server URL, vault path) moved
under a "Local engine (dev)" subsection below the transpile block,
since the average closed-beta user never edits them.

## 2. Endpoint swap diff

`forge-client-obsidian/src/server.ts` — old `generateSnippet`
(vault-path-based, server-side registry walk) deleted. Replaced with:

```typescript
export interface AlphaDependencyInfo {
  snippet_id: string;
  description: string;
  inputs: string[];
}

export interface AlphaGenerateRequest {
  snippet_id: string;
  description: string;
  english: string;
  inputs: string[];
  generation_notes: string;
  deps: AlphaDependencyInfo[];
  active_domains: string[] | null;
}

export async function generateSnippetAlpha(
  serviceUrl: string,
  token: string,
  payload: AlphaGenerateRequest,
): Promise<GenerateResponse> {
  if (!token) {
    return {
      status: 0,
      json: {
        detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.',
      },
    };
  }
  const res = await requestUrl({
    url: `${serviceUrl}/generate`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    throw: false,
  });
  return { status: res.status, json: res.json };
}
```

Empty-token short-circuits to `status: 0` with an actionable detail
so the caller surfaces a Notice without hitting the network. All
other non-2xx responses pass through the same `{status, json}`
envelope the engine's `/generate` returned, so the existing caller
status branches still work.

`forge-client-obsidian/src/main.ts` — `this.generate(true)` and
`this.generate(true, '…')` call sites updated to the new
`this.generate(errorPrefix?)` signature (recursive flag dropped per
prompt §"Implementation notes → Drop the recursive flag"). The
method body now:

1. Reads `transpileServiceUrl` and `transpileServiceToken` from settings.
2. Fast-fails on empty token via the helper's status=0 path.
3. Materializes the inventory through `getPyodideHost().getGenerateInventory(snippet_id)`.
4. POSTs to α and unwraps the response.
5. On 200, wraps the returned `code` in the existing `{[snippet_id]: code}` shape so the legacy `writeGeneratedCode` path stays untouched.
6. On non-2xx, runs `formatAlphaErrorNotice(status, detail, settings)` (see §4).

## 3. Inventory materialization path chosen

**Pyodide-side helper.** Added to `pyodide-host.ts`:

```python
_FORGE_ID_CHARS = r"[\w./-]+"
def _forge_find_deps(body: str):
    """Mirror of forge.core.llm._find_deps — collects [[wikilinks]]
    and context.compute('id') calls from the snippet body, returns
    a deduplicated list."""
    ...

def _forge_get_generate_inventory(snippet_id):
    """Return {snippet_id, description, english, inputs,
    generation_notes, deps, active_domains} as a structured-clone-
    safe dict."""
    ...
```

TS side exposes:

```typescript
async getGenerateInventory(snippet_id: string): Promise<GenerateInventory> {
  this.pyodide.globals.set('_forge_gen_id', snippet_id);
  const proxy = this.pyodide.runPython(`_forge_get_generate_inventory(_forge_gen_id)`);
  return this._unwrap(proxy) as GenerateInventory;
}
```

**Rationale.** Pyodide already has the resolver loaded with A4
shadows + A5.1 library-subdir rules; reaching for `metadataCache`
on the JS side would duplicate that logic and would drift the
moment the resolver's lookup order changes. The Pyodide helper
re-uses the exact same resolver state the engine compute path uses,
so deps for `/generate` are guaranteed to match deps the engine
would have produced. One Pyodide round-trip per Forge-click is
cheap compared to the LLM call that follows.

## 4. Error mapping table

| Status | Message rendered in Forge Output |
| --- | --- |
| `0` (empty-token, no HTTP) | "Set your transpile token in Settings → Forge → Transpile token before using /generate." |
| `401` | "Transpile token rejected — check Settings → Forge → Transpile token, or contact the service operator if you believe it should be valid." |
| `502` (Anthropic non-retryable) | "Transpile service upstream error: \<detail>. Try again in a moment; if it persists, paste the error to the service operator." |
| `503` (Anthropic retryable) | Same as 502 plus the explicit retry hint "Retry in a few seconds." |
| network transport (no response, `requestUrl` rejection caught upstream) | "Could not reach transpile service at \<URL>. Check internet connection and Settings → Forge → Transpile service URL." |
| any other non-2xx | "Transpile service returned \<status>: \<body.detail or generic>". |

All messages echo the HTTP status so debugging stays grounded.

## 5. manifest.json + INSTALL.md diffs

`manifest.json`: `"version": "0.2.3"` → `"0.2.4"`.

`INSTALL.md`:
- All v0.2.3 references → v0.2.4 (download link, zip filename, closed-beta pin note).
- New "Token setup (one-time)" section inserted between the
  Community-plugins enable step and "Verifying it works".
- "No token yet?" callout explains that the moda simulator runs
  without one — only English → Python authoring (`Forge` button)
  needs the token.
- Verification section unchanged (still tests Run simulation;
  doesn't require a token).

## 6. Auto-smoke output

**Build + tests**
- `npm run build` → exit 0, `main.js` produced.
- `npm test` → 42/42 plugin tests pass.
- `npm run release-zip` → `dist/forge-client-obsidian-v0.2.4.zip`
  produced; preflight verified all required files.

**Release artifact**
- `dist/forge-client-obsidian-v0.2.4.zip` — 11,749,816 bytes.
- Local SHA-256: `eaad7e1d8ef372b8c1c1386434f4b4a989209620cb694260542181bb71afd69e`.
- GitHub API `releases/assets` digest:
  `sha256:eaad7e1d8ef372b8c1c1386434f4b4a989209620cb694260542181bb71afd69e` — matches.
- Re-download from the release URL via `curl -sSL`:
  `eaad7e1d8ef372b8c1c1386434f4b4a989209620cb694260542181bb71afd69e` — matches.
- The first verify curl right after `gh release create` got an
  empty body (CDN propagation lag); a second curl 2 minutes later
  matched. Release is healthy.

**Hosted-service reachability**
- `curl -sS https://forge.thecodingarena.com/health` →
  `{"status":"ok","version":"0.1.0"}`.
- `curl -sS -X POST https://forge.thecodingarena.com/generate` (no auth) → HTTP 401.

Both confirm α is reachable from the sandbox and that the plugin's
auth-header path will exercise the same surface.

## 7. Git ops summary

- Commit: `aa4be55` on `main` —
  `[2026-05-26-0000-v1-plugin-alpha-endpoint-swap] v0.2.4 — hosted α for /generate, settings UI for token`.
- Pushed to `origin/main`. Working tree clean.
- Tag: `v0.2.4`, pushed.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.4>
  with `forge-client-obsidian-v0.2.4.zip` (11.75 MB) attached.

## 8. Manual smoke guidance for user

These four steps require a real Obsidian instance and your real
transpile token; the sandbox can't exercise them.

1. **Token-paste UX.** Install v0.2.4 in Bluh (or your preferred
   test vault) via the INSTALL.md drag-and-drop flow. Open
   **Settings → Forge** → paste your real token into the
   **Transpile service token** field. Close + reopen Settings.
   The masked dots should still be there; the URL field should
   still be the default.

2. **Empty-token error path.** Temporarily clear the token field
   and Forge-click a snippet that has English but needs (re)gen
   (delete its Python facet first). Expect Forge Output to show
   **"Set your transpile token in Settings → Forge → Transpile token
   before using /generate."** — no stack trace, no network attempt.

3. **Real /generate path.** Restore your token. Delete the Python
   facet of a snippet under `forge-moda/`, then Forge-click. Expect
   the Python to come back from α, the plugin to write it into the
   snippet, and a subsequent compute via Pyodide to render the
   result in Forge Output. This is the load-bearing end-to-end test.

4. **Wrong-token error path.** Set the token to `"wrong-token-test"`
   and Forge-click. Expect the 401 message
   ("Transpile token rejected — check Settings…"). Reset to your
   real token before moving on.

## 9. Deviations

- **Recursive flag dropped.** Per the prompt's "Implementation
  notes → Drop the recursive flag" — α doesn't expose it and the
  prompt explicitly accepted single-snippet generate for V1. Two
  call sites in `main.ts` updated.
- **No "test connection" button** in settings, per "Don'ts".
- **`/canonicalize` left on `localhost:8000`**, per prompt §6.
- **Closed-beta token-issuance flow** unchanged (single shared
  bearer), per "Out of scope".

## 10. One observation

The Pyodide-side inventory helper is exactly the kind of duplicate-
the-resolver code that the prompt warned about. Centralizing it
inside `forge.core.llm` (so engine + plugin both call the same
materializer) is a low-cost refactor that would let v1.1 add
`/canonicalize` to α without re-deriving the inventory in a third
place. Logging this as a v1.1 follow-up rather than a v1 blocker —
the current approach is the right call for getting to ship.
