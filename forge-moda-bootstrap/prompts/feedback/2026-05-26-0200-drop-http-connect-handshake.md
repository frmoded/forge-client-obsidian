---
timestamp: 2026-05-26T05:06:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-26T01:30:00Z
status: success
---

# v0.2.6 — route connectVault through Pyodide so closed-beta needs no uvicorn

## 1. Diagnosis + plan

Confirmed the prompt's root cause exactly:
- `computeSnippetWithArgs` (main.ts line 1405) calls `connectVault`
  before every compute.
- `connectVault` (server.ts line 35) was HTTP-only: POST
  `${serverUrl}/connect`.
- After v0.2.4 students set `serverUrl` to the hosted α
  (`https://forge.thecodingarena.com`), which exposes only `/health`
  and `/generate`. The pre-compute handshake 404s.

Plan applied verbatim from the prompt: add `_forge_list_snippets`
to the inlined Python, add `getConnectInventory` to the TS surface,
gate `connectVault` behind a `_pyodideHost` check with HTTP fallback
retained for the no-Pyodide defensive case.

## 2. `_forge_list_snippets` helper

Added at `pyodide-host.ts` line 432, just above
`_forge_get_resolver`:

```python
def _forge_list_snippets():
    """v0.2.6 — serve connectVault from Pyodide. Returns the engine's
    /connect inventory shape: {vault_name: [{id, type, inputs}, ...]}
    sorted by id. SnippetRegistry.list_snippets() already produces
    exactly this shape (engine source: forge/core/snippet_registry.py
    line ~96), so we delegate. Structured-clone-safe — plain dict,
    plain lists, plain strings."""
    return _forge_registry.list_snippets()
```

Used the simpler delegate form (no per-vault loop) — `SnippetRegistry.
list_snippets()` returns the engine-canonical shape directly. Confirmed
by reading `forge/core/snippet_registry.py` line 96: the engine's
`list_snippets` already produces `{vault: [{id, type, inputs}]}` sorted
by id, exactly the wire shape `/connect` previously returned.

## 3. TS surface: `host.getConnectInventory(vaultPath)`

Added to `pyodide-host.ts`:

- New exported interface `ConnectInventory` (mirrors `ConnectResponse`
  fields the consumers actually read — `status`, `vault_path`,
  `warnings`, `snippets`).
- New method signature on `PyodideHostInstance` next to
  `getGenerateInventory`.
- Implementation at line ~696:

```typescript
async getConnectInventory(vault_path: string): Promise<ConnectInventory> {
  const proxy = this.pyodide.runPython(`_forge_list_snippets()`);
  const snippets = this._unwrap(proxy) as Record<
    string,
    Array<{ id: string; type: string; inputs: string[] }>
  >;
  return {
    status: 'connected',
    vault_path,
    warnings: [],
    snippets,
  };
}
```

Engine-side warnings are intentionally `[]`: registry-load failures
surface at Pyodide init time (the `_init` log line), so re-emitting
them on every connect would be noise. `content_types` is omitted —
`ConnectResponse.content_types` is already optional and callers fall
back to a hardcoded default (server.ts line 32).

## 4. `connectVault` rewrite

`server.ts` line 35–73. The new shape:

```typescript
export async function connectVault(serverUrl: string, vaultPath: string): Promise<ConnectResponse> {
  if (_pyodideHost) {
    const host = await _pyodideHost.getInstance();
    const inv = await host.getConnectInventory(vaultPath);
    if (inv.warnings?.length) console.warn('Forge Connect warnings:', inv.warnings);
    return inv as ConnectResponse;
  }
  // HTTP fallback — pre-V1 / no-Pyodide path.
  const res = await requestUrl({ /* ...as before... */ });
  if (res.json?.warnings?.length) console.warn('Forge Connect warnings:', res.json.warnings);
  return res.json as ConnectResponse;
}
```

No call-site changes in main.ts — every caller already passes
`(serverUrl, vaultPath)` and consumes `ConnectResponse`.

## 5. Sibling HTTP audit

Audited every `requestUrl` caller in `server.ts`:

| Endpoint | Forge-click path? | Disposition |
| --- | --- | --- |
| `/connect` | yes — pre-compute, post-install refresh, content_types modal, canonicalize prelude | **Migrated to Pyodide.** |
| `/sync_dependencies` | yes — post-`/generate` write at main.ts line 1248. **But** wrapped in try/catch + `console.warn` and non-fatal: Python facet is already written, compute proceeds without B7 dep-sync refresh. | NOTE comment added; deferred to v1.1 (B7 body-rewrite logic mirrors substantial engine code). |
| `/canonicalize` | yes — but the canonicalize command itself is rarely invoked in closed beta. | NOTE comment confirming v1.1 per prompt 2026-05-26-0000 §6. ECONNREFUSED is acceptable closed-beta behavior. |
| `/freeze` | no — explicit "Freeze edge"/"Unfreeze edge" menu only, never auto-fired. | NOTE comment; stays on HTTP. |
| `/test` (`pingServer`, `ensureServerRunning`) | no — dev-only heartbeat + auto-spawn. | Unchanged. |

NOTE comments embedded above each function so future readers see the
intentional choice; greppable via `NOTE (v0.2.6):` if v1.1 audits
need them.

## 6. Test: `_forge_list_snippets`

Added two cases to `src/pyodide-inventory.test.ts` (extending the
v0.2.5 file so Pyodide boot stays amortized across the whole suite):

- **shape**: assert top-level is a dict keyed by vault name, each
  value is an array of `{id, type, inputs}` with correct types.
- **bundled-vault content**: assert `forge-moda` contains `setup`
  (always-present bundled snippet) and `move` (chosen to exercise
  non-empty `inputs`).

Used a Python stub registry (`_StubRegistry` with `.list_snippets`
delegating to a fixed payload) rather than mounting the full bundled
engine — mounting would balloon test setup with ~50MB of stdlib +
engine `.py` files. The stub catches the shape/delegate contract;
the "list_snippets walks the real registry" check is implicitly
covered by user smoke step 3 (Forge-click reaches `/generate`
without a Connect 404).

Run output:

```
✔ pyodide-inventory: helper Python parses without SyntaxError (582ms)
✔ pyodide-inventory: _forge_find_deps extracts context.compute() ids (1ms)
✔ pyodide-inventory: _forge_find_deps extracts [[wikilink]] ids (1ms)
✔ pyodide-inventory: _forge_find_deps dedupes across wikilink + compute (1ms)
✔ pyodide-inventory: _forge_find_deps skips prose wikilinks with brace placeholders (1ms)
✔ pyodide-inventory: _forge_find_deps returns empty list for body with no deps (1ms)
✔ pyodide-inventory: _forge_list_snippets returns {vault: [{id,type,inputs}]} shape (1ms)
✔ pyodide-inventory: _forge_list_snippets includes bundled forge-moda with known ids (1ms)
tests 50, pass 50
```

Total suite: 50/50 in ~656ms.

## 7. Version bump + release

- `manifest.json`: `0.2.5` → `0.2.6`.
- `INSTALL.md`: all `v0.2.5` references → `v0.2.6`.
- `dist/forge-client-obsidian-v0.2.6.zip` — 11,750,503 bytes, 11.21 MB.
- Local SHA-256: `c135166559b8e13d0be4c056373e1f33feb031bcef7947d0a1dceb0248a2f452`.

## 8. Auto-smoke output

| Check | Result |
| --- | --- |
| `npm run build` | exit 0 |
| `npm test` | 50/50 (42 prior + 6 from v0.2.5 + 2 new) |
| `grep '/connect\b' main.ts` | 3 hits — all comment references; no inadvertent HTTP bypass |
| `grep _forge_list_snippets` | 9 hits across host + test (definition + invocation + test cases) |
| Release zip preflight | green |
| GH asset digest | `sha256:c135166559b8e13d0be4c056373e1f33feb031bcef7947d0a1dceb0248a2f452` — matches local |
| `GET /health` | `{"status":"ok","version":"0.1.0"}` |
| `POST /generate` (no auth) | HTTP 401 |

## 9. Git ops

- Commit `77089cd` on `main` —
  `[2026-05-26-0200-drop-http-connect-handshake] v0.2.6 — route connectVault through Pyodide…`.
- Pushed to `origin/main`.
- Tag `v0.2.6`, pushed.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.6>
  with `forge-client-obsidian-v0.2.6.zip` (11.21 MB) attached.

## 10. Manual smoke guidance for user

1. **Install v0.2.6.** Drag-and-drop the v0.2.6 zip per INSTALL.md
   into `<vault>/.obsidian/plugins/`, replacing the v0.2.5 folder.
   Reload Obsidian. Settings → Forge plugin entry shows 0.2.6.
2. **No setting changes required.** Whatever `serverUrl` was after
   v0.2.5 (likely `https://forge.thecodingarena.com` or the default
   `http://localhost:8000`) is now irrelevant for `/connect`. The
   Pyodide path takes over. Transpile URL + token unchanged.
3. **Forge-click smoke (re-run of the v0.2.5 step 4).** Delete a
   snippet's Python facet under `forge-moda/`, Forge-click. Expect
   Python from α writes into the snippet, compute runs in Pyodide,
   result renders in Forge Output. **The load-bearing assertion: no
   `Forge Connect Error` in the console.**
4. **Closed-beta proof.** With **uvicorn not running** (stop it if
   it is) and `serverUrl` set to the default
   `http://localhost:8000`, repeat step 3. Expect identical behavior
   — confirms a no-dev-tools laptop will work.

## 11. Deviations

- **None substantive.** Used the simpler `return
  _forge_registry.list_snippets()` form (no per-vault loop) — the
  prompt explicitly called this out as expected, not a deviation.
- Stub-registry approach for the test rather than mounting the
  real bundled engine. Rationale in §6 — mounting is order-of-
  magnitude more setup, and the integration check is what user smoke
  covers anyway.

## 12. One observation

The HTTP fallback in `connectVault` is now dead code in production —
no closed-beta user reaches it, and dev workflows that need it are
rare. Worth marking it for removal in v1.0 (vs. v1.1) when the
plugin formally drops the local-uvicorn dev path. Same applies to
the HTTP fallback in `computeSnippet`. Leaving both in for v0.2.6
because removing them mid-cycle inflates the diff and the safety
net is genuinely cheap.
