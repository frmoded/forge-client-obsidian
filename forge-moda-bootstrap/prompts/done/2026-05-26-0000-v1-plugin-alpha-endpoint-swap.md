# V1 plugin α endpoint swap + settings UI for token

## Scope

Cut `/generate` over from `localhost:8000` to the hosted α service at `https://forge.thecodingarena.com/generate`. Add a settings panel so students can paste their auth token. Ship as v0.2.4.

Single repo (`forge-client-obsidian`). Multi-file change but tightly bounded. After this lands, the V1 plugin no longer requires uvicorn for ANY user-facing flow.

What this prompt delivers:

1. **Settings panel additions.** Two new fields in `ForgeSettingTab`:
   - **Transpile service URL** (text input, default `https://forge.thecodingarena.com`). Editable so students or devs can point at a different service URL (dev EC2 instance, local α for testing, etc.).
   - **Transpile service token** (text input, masked if Obsidian supports `setAttribute("type", "password")`). Empty by default. Students paste their emailed token here.

   Both persist via Obsidian's `loadData()`/`saveData()`. Settings persist across plugin reloads.

2. **`/generate` endpoint swap.** Wherever the plugin currently calls `localhost:8000/generate` (likely `server.ts`'s `generate` function — CC reads to confirm), replace with a call to the configured transpile-service URL. Include `Authorization: Bearer <token>` header. Construct the new request body (per α's request shape — `snippet_id`, `description`, `english`, `inputs`, `generation_notes`, `deps`, `active_domains`).

3. **Inventory materialization.** α's `/generate` is stateless and expects the materialized snippet inventory in the request body. The plugin must construct this from its existing Pyodide MEMFS registry OR from Obsidian's vault API. Read the active snippet's frontmatter (`description`, `inputs`, `generation_notes`), the English facet body, the deps from the `# Dependencies` block (or compute from the existing Python facet if present), and `active_domains` from the user vault's `forge.toml`. CC reads the α service's `main.py` `GenerateRequest` shape to confirm field names + types — match exactly.

4. **Error UX.** Map α's error shapes to user-readable Forge Output messages:
   - 401 from α → "Transpile token rejected — check Settings → Forge → Transpile token, or contact the service operator if you believe it should be valid."
   - 502 (Anthropic non-retryable) → "Transpile service upstream error. Try again in a moment; if it persists, paste the error to the service operator."
   - 503 (Anthropic retryable) → same as 502 but with retry hint.
   - Network failure (no response at all) → "Could not reach transpile service at <URL>. Check internet connection and Settings → Forge → Transpile service URL."
   - Empty token in settings → "Set your transpile token in Settings → Forge → Transpile token before using /generate." Fail fast; don't even attempt the HTTP call.

5. **Drop localhost:8000 fallback for `/generate`.** No more "try the local uvicorn if the hosted service fails." Hosted is the only path; failure modes are surfaced cleanly. uvicorn dev workflow is unaffected for OTHER endpoints (engine compute is Pyodide-side now; only `/canonicalize` still hits localhost — see below).

6. **`/canonicalize`: defer.** The engine has a `/canonicalize` endpoint that's LLM-driven, also currently `localhost:8000`. α doesn't expose it yet. **For V1, leave `/canonicalize` on localhost:8000** — if a student triggers it (rare), it'll fail with ECONNREFUSED, which is OK for closed beta. Adding `/canonicalize` to α is a v1.1 follow-up.

7. **Version bump + release.** `manifest.json` 0.2.3 → 0.2.4. Cut a GitHub release with `forge-client-obsidian-v0.2.4.zip` per the existing `npm run release-zip` flow. Update INSTALL.md to pin link to v0.2.4 + add a section about the token settings step.

8. **Tests.** Existing 42 pass. Add pure-core tests if any extracted logic admits them (request body construction, error mapping). Settings UI itself is Obsidian-coupled; same Obsidian-shim limitation as prior phases — skip with a flag.

Does NOT:

- Add `/canonicalize` support to α. Separate v1.1 work.
- Build per-user token issuance flow. Single shared token for closed beta.
- Touch the iframe — `/generate` is plugin-side, not iframe-side.
- Migrate engine compute paths. They're already Pyodide-side post-Phase 1.
- Touch the α service repo. Service shape is fixed; this prompt consumes it.
- Add token rotation UI, multi-token management, or rate-limiting client-side.

## Why

α is deployed and verified (smoke 4/4 green). The plugin currently can't reach it — `/generate` still points at `localhost:8000`. After this swap, students can install plugin v0.2.4, paste their token, and the full authoring flow works without any local server. This is the last load-bearing piece of V1 deployment.

After this lands, only first-run UX polish + final docs + clean-machine smoke remain before the seminar.

## Files to modify

### `forge-client-obsidian/src/settings.ts` (or wherever settings live)

Add two persistent fields to the settings interface (likely `ForgeSettings` type):

```typescript
interface ForgeSettings {
  // ... existing fields
  transpileServiceUrl: string;     // default "https://forge.thecodingarena.com"
  transpileServiceToken: string;   // default ""
}
```

Defaults in the `DEFAULT_SETTINGS` const:
- `transpileServiceUrl: "https://forge.thecodingarena.com"`
- `transpileServiceToken: ""`

### `forge-client-obsidian/src/ForgeSettingTab.ts` (or wherever the settings UI lives)

Add a new section in the rendered settings tab. Suggested structure:

```typescript
containerEl.createEl("h3", { text: "Transpile service" });

new Setting(containerEl)
  .setName("Transpile service URL")
  .setDesc("Hosted /generate endpoint. Default is the seminar service. Change only if pointing at a different α instance.")
  .addText((text) =>
    text
      .setPlaceholder("https://forge.thecodingarena.com")
      .setValue(this.plugin.settings.transpileServiceUrl)
      .onChange(async (value) => {
        this.plugin.settings.transpileServiceUrl = value.trim();
        await this.plugin.saveSettings();
      }),
  );

new Setting(containerEl)
  .setName("Transpile service token")
  .setDesc("Paste the auth token you received by email. Required for /generate (English → Python transpilation). Stored locally; never shared.")
  .addText((text) => {
    text
      .setPlaceholder("paste token here")
      .setValue(this.plugin.settings.transpileServiceToken)
      .onChange(async (value) => {
        this.plugin.settings.transpileServiceToken = value.trim();
        await this.plugin.saveSettings();
      });
    // Mask the input visually if Obsidian's API allows.
    text.inputEl.type = "password";
  });
```

Add a brief note via `containerEl.createEl("p", ...)` linking to the install guide OR explaining that the token is one-time setup per student per machine.

### `forge-client-obsidian/src/server.ts` (or wherever `/generate` calls happen)

Find the function that POSTs to `/generate` today (likely named `generate` or similar). Replace the HTTP call:

**Before** (approximate shape):
```typescript
async generate(snippetId: string, recursive: boolean) {
  const res = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault_path: this.vaultPath, snippet_id: snippetId, recursive }),
  });
  // ... handle response
}
```

**After:**
```typescript
async generate(snippetId: string) {
  const settings = this.plugin.settings;
  if (!settings.transpileServiceToken) {
    throw new ForgeUserError(
      "Set your transpile token in Settings → Forge → Transpile token before using /generate.",
    );
  }

  // Materialize the inventory the stateless α service needs.
  const payload = await this.buildGenerateRequest(snippetId);

  const res = await fetch(`${settings.transpileServiceUrl}/generate`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.transpileServiceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await this.mapGenerateError(res, settings);
  }

  const body = await res.json() as { snippet_id: string; code: string };
  return body;
}
```

**`buildGenerateRequest(snippetId)`** — new helper that materializes the inventory. Reads from the Pyodide MEMFS registry (preferred — it's already loaded and matches the engine's resolver) OR from Obsidian's vault API directly. Returns:

```typescript
{
  snippet_id: string,
  description: string,
  english: string,
  inputs: string[],
  generation_notes: string | null,
  deps: Array<{ id: string; description: string; signature: string }>,
  active_domains: string[],
}
```

CC reads `forge-transpile/main.py`'s `GenerateRequest` model + `forge-transpile/anthropic_client.py`'s `build_user_prompt` to confirm exact field names and structure. Drift here means the prompt the LLM sees differs from what the engine would produce → transpiled output diverges silently. Mirror exactly.

For the deps array specifically: the engine's `_build_prompt` includes each direct callee's description + signature. The plugin can extract these from the dependency snippets' frontmatter via the same MEMFS-mounted registry (Pyodide can answer this; if the JS side has direct access to Obsidian's parsed frontmatter via metadataCache, that's even simpler).

**`mapGenerateError(res, settings)`** — new helper. Maps HTTP status to user-readable errors per the "Error UX" section above.

### `forge-client-obsidian/src/output-view.ts` (or wherever errors render)

If the existing error rendering can't surface the new `ForgeUserError` cleanly, extend it. Goal: when generate fails because of an empty token, the user sees the actionable message in Forge Output (and ideally a Notice popup), not a stack trace.

### `forge-client-obsidian/manifest.json`

Version bump: `0.2.3` → `0.2.4`.

### `forge-client-obsidian/INSTALL.md`

Update sections:

1. **Pin the download link to v0.2.4** (per the existing v0.2.3 pin pattern; replace).
2. **Add a "Token setup" section** between "Three-step install" and "Verifying it works":

```markdown
## Token setup (one-time)

The plugin uses a hosted service to transpile English snippet
descriptions into Python via an LLM. You'll receive a token by email.

1. Open Obsidian → **Settings** → **Forge** (in the Community plugins
   list under the toggle).
2. Scroll to **Transpile service**.
3. Paste your token into **Transpile service token** field.
4. Leave **Transpile service URL** at the default
   (`https://forge.thecodingarena.com`) unless instructed otherwise.

The token is stored locally in Obsidian's plugin data; it never leaves
your machine except as the Authorization header on /generate requests.

If you don't have a token yet, contact the service operator.
```

3. **Update "Verifying it works"** to note that the token must be set before /generate works:

```markdown
## Verifying it works

After install + token setup:

- Open the command palette (Cmd-P) and type "Forge: Open MoDa simulation".
  Click. A panel opens with a simulation canvas.
- Click "Run simulation". After a few seconds (Pyodide initializing
  for the first time), particles appear and disperse. No token needed
  for the simulator — it uses bundled snippets that run locally.
- To author new snippets (English → Python via LLM), the token must
  be set first.
```

## Implementation notes

### Inventory materialization, in detail

The α service's `/generate` expects the materialized inventory the engine would have looked up via VaultSessionManager. CC reads the α repo's `anthropic_client.py::build_user_prompt` first to confirm exact field shape:

- `description: str` — from the snippet's frontmatter `description` field. May be empty.
- `english: str` — the English facet body. The plugin can extract this from the snippet's markdown (everything between `# English` and the next `#` header, OR everything that's not Python facet / dependencies block).
- `inputs: list[str]` — from frontmatter `inputs:`. May be empty list.
- `generation_notes: str | None` — from frontmatter `generation_notes:` (multi-line string). None if absent.
- `deps: list[dict]` — derived from the snippet's existing Python facet's `context.compute(...)` calls (engine's B7 logic), each with `id`, `description`, `signature` from the callee snippet's frontmatter. If the plugin's MEMFS registry can answer this via a Pyodide call, that's the cleanest path; otherwise extract via Obsidian's vault traversal.
- `active_domains: list[str]` — from the user vault's `forge.toml`'s `domains` field. May be empty list.

Pyodide-side path (preferred): expose a helper in `pyodide-host.ts` that returns this materialized blob given a snippet ID. The Python side already has the resolver loaded; one query.

JS-side path (fallback): use Obsidian's `metadataCache.getFileCache(file).frontmatter` for the active snippet + each dep. Tractable but more code.

CC picks the cleaner path based on what the existing pyodide-host infrastructure exposes.

### Error shape mirroring

α's error responses follow FastAPI defaults: `{detail: "..."}` with appropriate HTTP status. The plugin's error mapping should:

- Extract `body.detail` if present for the user-facing message.
- Default to generic "Service returned an error" if the body shape is unexpected.
- Always include the HTTP status in the rendered error so debugging is easier.

### Drop the `recursive` flag

Engine's old `/generate` supported `recursive: true` to walk the dep graph server-side. α doesn't — per its main.py docstring, recursive walks are a client concern. For V1 plugin: drop recursive entirely. If the user wants to regenerate dependents, they do it one at a time, or we add client-side walking later.

If the plugin's current Forge-action has a "regenerate recursively" option, hide it or remove it for v0.2.4. Document in the release notes that recursive regen is a v1.1 feature.

### Settings precedence

If the user has set `transpileServiceUrl` to something custom (e.g., `http://localhost:8001` for local α dev), respect it. The default is the production URL but the field is mutable.

## Tests + smoke

### Auto-verified by CC

- `npm run build` exits 0.
- `npm test` → 42/42 plugin tests pass.
- Any new pure-core helpers (request body construction, error mapping) get unit tests if cleanly extractable.
- `npm run release-zip` produces `dist/forge-client-obsidian-v0.2.4.zip`.
- Zip preflight verifies all 7 required files present (per existing script).
- **Clean-vault smoke** per the release-shipping rule:
  - Create `~/test-vaults/v1-smoke-0.2.4/`.
  - Download from GH release via `gh release download v0.2.4 -p '*.zip' -D ...`.
  - Unzip into the test vault's `.obsidian/plugins/`.
  - Verify manifest version, assets/ subdirs.
- **Hosted-service reachability** (curl from sandbox):
  - `curl -sS https://forge.thecodingarena.com/health` → 200 with status:ok.
  - `curl -sS -X POST https://forge.thecodingarena.com/generate` (no auth) → 401.
  - These prove α is reachable from CC's environment; the plugin's actual call works the same way.
- Git ops: commit with `[2026-05-26-0000-v1-plugin-alpha-endpoint-swap]` prefix. Push to main. Tag `v0.2.4`. Create GH release with the zip attached. All per the default-on git ops protocol.

### Deferred to user

- **Token-paste UX:** install the v0.2.4 plugin in Bluh (or a test vault), open Settings → Forge, paste your real token in the Transpile service token field. Verify it persists (close + reopen settings).
- **Empty-token error path:** with no token set, trigger Forge-click on a snippet that has English but needs (re)generation. Expect a clear actionable error in Forge Output ("Set your transpile token..."), not a stack trace.
- **Real /generate path:** with token set, trigger Forge-click on a snippet that needs regenerating English → Python (e.g., delete the Python facet and click Forge). Expect Python comes back from α, plugin writes it to the snippet, compute runs via Pyodide, Forge Output shows the compute result. This is the load-bearing end-to-end test.
- **Wrong-token error path:** set token to "wrong-token-test", trigger Forge-click. Expect the 401 error mapping ("Transpile token rejected — check Settings..."). Then reset to your real token.

## Out of scope

- /canonicalize support. Defer.
- Per-user token issuance/management. Single shared secret for closed beta.
- Recursive regeneration. Drop the flag; add back in v1.1 if needed.
- Client-side rate limiting.
- Token rotation UI.
- Multi-environment settings profiles (dev/staging/prod toggle in settings).
- Iframe-side changes. Iframe doesn't call /generate.
- Engine compute migration (already done via Pyodide).
- Anything in forge-transpile, forge-moda, or other repos.
- First-run welcome view that auto-opens settings. Separate UX polish prompt.

## Report when done

Per protocol 8-section.

1. **Settings panel diff** — files touched, new fields, default values.
2. **Endpoint swap diff** — before/after of the generate function; new helper signatures (buildGenerateRequest, mapGenerateError).
3. **Inventory materialization path chosen** — Pyodide-side helper vs JS-side metadataCache walk. With rationale.
4. **Error mapping table** — status code → user-facing message.
5. **manifest.json + INSTALL.md diffs** — version bump, new Token setup section, updated download link.
6. **Auto-smoke output** — build pass, test count, zip size + SHA, clean-vault verification, hosted-service curl results.
7. **Git ops summary** — commit SHA, tag, GH release URL.
8. **Manual smoke guidance for user** — the 4-step user-side checklist above.
9. **Any deviation and why.**
10. **One observation.**

## Commits + push

Per the default-on git ops protocol. Commit with `[2026-05-26-0000-v1-plugin-alpha-endpoint-swap] v0.2.4 — hosted α for /generate, settings UI for token` header. Push to main. Tag `v0.2.4`. Create GH release with the release-zip attached. Update INSTALL.md (pinned link to v0.2.4).

## Don'ts

- **Don't add /canonicalize support.** v1.1 territory.
- **Don't drop uvicorn fallback for other endpoints.** Only /generate is migrating.
- **Don't change the α service's request shape.** Plugin adapts; service is fixed.
- **Don't bundle in unrelated changes** (Phase 3 music, first-run UX, etc.).
- **Don't store the token in plaintext logs.** If you add request-tracing logs in the plugin, redact the Authorization header.
- **Don't add a "test connection" button** in settings. Polish; defer.
- **Don't add the recursive flag back.** Single-snippet generate only for V1.
- **Don't make the default URL anything other than `https://forge.thecodingarena.com`.** Students should not need to know or change this.
- **Don't break the existing Forge Output rendering** — additive change only.
- **Don't proceed past a blocker.** If the inventory materialization is structurally harder than expected (e.g., Pyodide-side helper can't easily expose the data), route to questions/ with the specific gap.
