# v0.2.6 — route connectVault through Pyodide so closed-beta needs no uvicorn

## Why this prompt exists

v0.2.5 fixed the inventory-helper regex, but Bluh smoke step 6 still
errors with `Forge Connect Error: Error: Request failed, status 404`.

Root cause: `computeSnippetWithArgs` (main.ts:1395-1416) calls
`connectVault(this.settings.serverUrl, vaultPath)` **before** every
compute. `connectVault` in `server.ts:35-46` is HTTP-only — it hits
`${serverUrl}/connect`. After the v0.2.4 endpoint swap users had to
set `serverUrl` to the α URL for /generate; but α exposes only
`/health` + `/generate`, so the pre-compute handshake gets 404.

This blocks closed-beta distribution regardless of token UX:
students have no `uvicorn` running locally and no engine-`/connect`
to hit. V1's whole promise — Pyodide handles everything — is broken
by this one residual HTTP call.

Fix: route `connectVault` through Pyodide the same way `computeSnippet`
already does. HTTP fallback stays in place for the no-Pyodide edge case.

## 1. Add `_forge_list_snippets` to the Pyodide helper

In `forge-client-obsidian/src/pyodide-host.ts`, in the inlined Python
block (next to `_forge_get_generate_inventory`, around line 392):

```python
def _forge_list_snippets():
    """Mirror of forge.core.snippet_registry.SnippetRegistry.list_snippets.
    Returns {vault_name: [{id, type, inputs}, ...]} sorted by id, using
    the same _forge_registry the compute path uses. Structured-clone-
    safe (plain dict + list of plain dicts + plain strings/lists)."""
    out = {}
    for vault in _forge_registry.loaded_vaults():
        items = []
        # SnippetRegistry has no public per-vault iterator, but
        # list_snippets() already produces the exact shape we need —
        # delegate and slice to our vault. Cheaper than re-walking.
        all_lists = _forge_registry.list_snippets()
        items = all_lists.get(vault, [])
        out[vault] = items
    return out
```

(If `list_snippets()` already returns the right shape directly, the
loop collapses to `return _forge_registry.list_snippets()`. Use that
simpler form — the wrapper is only needed if there's a per-vault
filter constraint I'm missing. Audit and pick the simpler one.)

Note: the engine's `/connect` also returns `warnings` (registry
errors during load) and `content_types`. Engine-side warnings would
have already been logged at Pyodide init when the registry built;
return `[]` here rather than re-surfacing them on every connect.
`content_types` is fine to omit — `ConnectResponse.content_types`
is already typed `optional` in server.ts:32 and callers fall back
to a hardcoded default.

## 2. TS surface: `host.getConnectInventory(vaultPath)`

In `pyodide-host.ts`, next to `getGenerateInventory` (around line
662), add:

```typescript
/** v0.2.6: serve connectVault from Pyodide. Returns the same
 *  {status, vault_path, warnings, snippets} envelope the engine's
 *  /connect produced so server.ts:connectVault can drop the HTTP
 *  call when a host is wired. */
async getConnectInventory(vaultPath: string): Promise<{
  status: string;
  vault_path: string;
  warnings: string[];
  snippets: Record<string, Array<{ id: string; type: string; inputs: string[] }>>;
}> {
  const proxy = this.pyodide.runPython(`_forge_list_snippets()`);
  const snippets = this._unwrap(proxy) as Record<string, Array<{ id: string; type: string; inputs: string[] }>>;
  return {
    status: 'connected',
    vault_path: vaultPath,
    warnings: [],
    snippets,
  };
}
```

Add the matching method signature to the `PyodideHost` interface
around line 599 alongside `getGenerateInventory`.

## 3. Route `connectVault` through Pyodide

In `forge-client-obsidian/src/server.ts:35-46`, rewrite to mirror the
`computeSnippet` pattern (the same `_pyodideHost` module-level var is
already in scope from v0.2.4):

```typescript
export async function connectVault(serverUrl: string, vaultPath: string): Promise<ConnectResponse> {
  // V1: when Pyodide is wired, build the inventory from the in-process
  // resolver instead of round-tripping through uvicorn. Matches the
  // computeSnippet pattern — same _pyodideHost module-level var.
  if (_pyodideHost) {
    const host = await _pyodideHost.getInstance();
    const inv = await host.getConnectInventory(vaultPath);
    if (inv.warnings?.length) {
      console.warn('Forge Connect warnings:', inv.warnings);
    }
    return inv as ConnectResponse;
  }

  // HTTP fallback — pre-V1 / no-Pyodide path.
  const res = await requestUrl({
    url: `${serverUrl}/connect`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath, force: true }),
  });
  if (res.json?.warnings?.length) {
    console.warn('Forge Connect warnings:', res.json.warnings);
  }
  return res.json as ConnectResponse;
}
```

No call-site changes needed — every existing caller already passes
`(serverUrl, vaultPath)` and consumes `ConnectResponse`.

## 4. Cross-check: are there other HTTP-only paths the smoke will hit?

Audit `server.ts` for other `requestUrl` callers using `serverUrl`:

- `syncDependencies` (line 48) — `/sync_dependencies`. **Check call
  sites.** If `main.ts` calls this anywhere on the Forge-click path
  before compute, route it through Pyodide too. If it's only used
  by an explicit "Sync dependencies" command/button, leave it on
  HTTP (defer to v1.1) and add a NOTE comment saying so.
- `canonicalizeSnippet` (line 66) — `/canonicalize`. Per
  prompt-2026-05-26-0000 §6, canonicalize stays on `localhost:8000`
  for V1. Leave as-is, add NOTE comment confirming this is
  intentional and citing the prompt.
- `freezeEdge` (line 81) — `/freeze`. Same triage as
  syncDependencies — check whether Forge-click reaches it.
- `pingServer` + `ensureServerRunning` (lines 216-237) — dev-only
  heartbeat / auto-spawn. Leave as-is.

Report findings in feedback §3 even if no changes were needed. The
audit is the deliverable, not just the code edits.

## 5. Test: Pyodide-in-Node assert on `_forge_list_snippets`

Same pattern as the v0.2.5 inventory-helper test
(`src/pyodide-inventory.test.ts`). Add to that file (don't make a new
one — the Pyodide boot cost is shared) two cases:

| Case | Asserts |
| --- | --- |
| `_forge_list_snippets` returns shape | dict where each value is a list of `{id, type, inputs}` dicts |
| `_forge_list_snippets` includes bundled `forge-moda` | the `forge-moda` key exists and its list contains at least one known id (e.g. `setup`) with `type` in `{action, data, snapshot}` and `inputs` as a list |

Use the same helper-Python-as-test-fixture pattern (verbatim duplicate
guarded by the drift-protection comment). The NOTE comment at the top
of the test file already documents the drift constraint — extend the
verbatim block to include `_forge_list_snippets`.

Run output should look like:

```
✔ pyodide-inventory: _forge_list_snippets returns {vault: [{id,type,inputs}]} shape (1ms)
✔ pyodide-inventory: _forge_list_snippets includes bundled forge-moda with known ids (1ms)
```

Total suite target: 50 pass (42 prior + 6 from v0.2.5 + 2 new).

## 6. Version bump + release

- `manifest.json`: `0.2.5` → `0.2.6`.
- `INSTALL.md`: `0.2.5` → `0.2.6` (download link, zip filename,
  closed-beta pin note). No new "what's new" copy required — V1
  users don't need to know about the connection-handshake mechanics;
  this is purely a stop-being-broken release.
- `npm run release-zip` → `dist/forge-client-obsidian-v0.2.6.zip`.
- Push commit, tag `v0.2.6`, GitHub release with the zip attached.
- SHA-256 verify the uploaded asset matches the local zip.

## 7. Auto-smoke required (in this order)

1. `npm run build` → exit 0.
2. `npm test` → 50/50 (42 prior + 6 from v0.2.5 + 2 new).
3. Static check: `grep -n '/connect\b' src/main.ts` should show only
   the existing `connectVault(...)` call sites (no inadvertent
   bypass of the helper).
4. Static check: `grep -n '_forge_list_snippets' src/pyodide-host.ts
   src/pyodide-inventory.test.ts` should show ≥3 hits (definition
   in host, verbatim duplicate in test, ≥1 invocation in test).
5. Release zip preflight (existing).
6. SHA-256: local vs. GitHub asset match.
7. Hosted-service reachability: `GET /health` → 200, `POST /generate`
   (no auth) → 401. **This time** the v0.2.6 plugin should be able
   to point `serverUrl` at literally anything (including the α URL,
   or the default `http://localhost:8000` even with no uvicorn
   running) and **Forge-click on a no-Python-facet snippet** should
   succeed through the /generate path. If the sandbox can't fake an
   Obsidian env, leave this for the user-side manual smoke and just
   note it.

## 8. Manual smoke guidance for user

1. **Install v0.2.6** via INSTALL.md drag-and-drop. Reload Obsidian.
   Settings → Forge plugin entry shows 0.2.6.
2. **No setting changes required.** Whatever `serverUrl` was after
   v0.2.5 (likely `https://forge.thecodingarena.com` from the α
   setup) is now irrelevant for `/connect` — the Pyodide path takes
   over. Transpile URL + token unchanged.
3. **Forge-click smoke from §7 of the v0.2.5 prompt.** Delete a
   snippet's Python facet under `forge-moda/`, Forge-click. Expect
   the v0.2.4 α flow end-to-end: Python from α writes into the
   snippet, compute runs in Pyodide, result renders in Forge Output.
   **No `Forge Connect Error` in the console** is the load-bearing
   assertion.
4. **Closed-beta proof.** With **uvicorn not running** (stop it if
   it is) and `serverUrl` set to `http://localhost:8000` (the
   default), repeat step 3. Expect identical behavior — confirms a
   no-dev-tools laptop will work.

## 9. Deviations

Standard "deviations" §; flag anything you took differently from the
shape above. The simpler `return _forge_registry.list_snippets()`
form (no per-vault loop) if you confirmed it's safe is **expected**
— not a deviation. Anything else is.

## 10. Out of scope (do not do)

- Centralizing the Pyodide helper in `forge.core.llm` (still v1.1).
- Migrating `/canonicalize` to α (still v1.1).
- Removing the HTTP fallback in `connectVault` — keep it for the
  defensive no-Pyodide case.
- Removing the HTTP fallback in `computeSnippet` for the same reason.

## 11. Feedback file format

Standard. Fresh-enumerated sections matching the headings here
(diagnosis + plan, list_snippets helper, TS surface, connectVault
edit, sibling-HTTP audit, test, version bump, auto-smoke, manual
smoke, deviations, observation). Frontmatter timestamp +
session_id + status. File at
`prompts/feedback/2026-05-26-0200-drop-http-connect-handshake.md`.
