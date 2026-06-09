---
timestamp: 2026-05-25T00:31:16Z
session_id: unknown
prompt_modified: 2026-05-24T17:21:20Z
status: success
---

# α transpile service scaffold — service-code ready for local + EC2 deploy

## TL;DR

New private repo `frmoded/forge-transpile` created with a FastAPI
service that mirrors the engine's `/generate` semantics, validates
a shared-secret bearer token, and proxies to Anthropic. 16/16 tests
pass; live uvicorn smoke verified all four auth/routing branches
end-to-end including a real Anthropic call (resolves to a 502
non-retryable upstream-401 — same translation as the engine).
Deployment placeholders ready for EC2 when AWS unblocks.

## 1. Repo creation

```
gh repo create frmoded/forge-transpile --private \
  --description "Forge transpile service: hosted /generate endpoint that proxies to Anthropic" \
  --source=. --remote=origin

→ https://github.com/frmoded/forge-transpile
```

Initial commit `0677f74` pushed to `main` with 18 tracked files
(venv, egg-info, .env all correctly gitignored).

## 2. File listing

```
forge-transpile/
├── README.md
├── .env.example
├── .gitignore
├── pyproject.toml
├── main.py               FastAPI app (2 endpoints)
├── auth.py               Bearer-token dependency
├── anthropic_client.py   transpile() — mirrors engine's prompt construction
├── prompts/              Vendored from forge/ (source of truth lives there)
│   ├── __init__.py
│   ├── llm_prompts.py    ← forge/core/llm_prompts.py
│   ├── moda_prompt.py    ← forge/moda/llm_prompt.py
│   └── music_prompt.py   ← forge/music/llm_prompt.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_auth.py      6 cases
│   └── test_generate.py  10 cases (prompt-construction + Anthropic translation)
└── deploy/
    ├── nginx.conf.template
    ├── forge-transpile.service.template
    └── DEPLOY.md
```

## 3. Engine /generate mirror summary

| Aspect | Engine | Hosted service |
|---|---|---|
| **Request shape** | `{vault_path, snippet_id, recursive}` — server has vault state via VaultSessionManager | `{snippet_id, description, inputs, english, generation_notes, deps, active_domains}` — client materializes registry inventory locally |
| **Response shape** | `{snippet_id, recursive, generated, dependencies}` (dict for recursive walks) | `{snippet_id, code}` (single-snippet; client owns recursive walk if needed) |
| **System prompt** | `build_system_prompt(active_domains)` from `forge.core.llm_prompts` | Same code, vendored at `prompts/llm_prompts.py`. moda + music fragments auto-register on import. |
| **User prompt construction** | `_build_prompt(snippet_id, meta, body, deps, registry)` | `build_user_prompt(snippet_id, description, inputs, english, generation_notes, deps)` — line-for-line port of `_build_prompt`'s string formatting |
| **Model** | `claude-sonnet-4-6` | Same |
| **Max tokens** | 8192 | Same |
| **Anthropic-error translation** | `_translate_anthropic_error`: 503 retryable (network/429/5xx), 502 non-retryable | Identical translation logic in `main.py`'s exception handler |
| **Cache** | Engine caches by prompt hash | Service does not cache (every call hits Anthropic). Add later if cost becomes a concern. |
| **Recursive generation** | Server-side dep walk | Client-side (one POST per snippet). Removes the server's need for a registry. |

### Why the request shape inverts

The engine's `/generate` is fundamentally tied to a vault session — it
looks up snippet meta + body + deps from a `VaultSessionManager` that's
populated by an earlier `/connect`. A hosted service can't have that
state (no per-user vaults; the service is stateless). So the client
materializes the inventory locally (from its own plugin-side registry)
and sends it in the request body.

The PROMPT the LLM sees is still byte-identical to what the engine
would build, provided the client's payload mirrors the engine's
registry. The `tests/test_generate.py::test_build_user_prompt_*`
cases lock this in.

### Drift surface (documented for V1.1 re-sync)

When the engine's prompt construction changes, three vendored files +
one client mirror need re-sync:

- `forge/core/llm_prompts.py` → `prompts/llm_prompts.py`
- `forge/moda/llm_prompt.py` → `prompts/moda_prompt.py`
- `forge/music/llm_prompt.py` → `prompts/music_prompt.py`
- `forge/core/llm._build_prompt` ↔ `anthropic_client.build_user_prompt`

No automated drift check. README documents the pattern.

## 4. Smoke verification

### Auto-verified by CC

- **`pip install -e ".[dev]"` succeeds.** Python 3.9 (system default;
  pyproject.toml lowered from `>=3.11` to `>=3.9` for local-dev compat;
  production EC2 will use 3.11+ via the systemd unit's venv).
- **`pytest -q` → 16 passed in 0.03s.** Breakdown:
  - Auth: 6 cases (unauth/health, missing header, malformed header,
    empty bearer, wrong token, valid token passes through)
  - build_user_prompt mirror: 5 cases (minimal, full meta, generation_notes
    label, deps block with signatures, deps-empty skips block)
  - /generate endpoint: 5 cases (shape verification, domain filtering
    [], domain filtering ["moda"], 502 non-retryable, 503 retryable)
- **Live uvicorn smoke** (background process on port 8101, killed after):
  - `/health` → `{"status":"ok","version":"0.1.0"}` ✓
  - `/generate` no auth → 401 + expected detail ✓
  - `/generate` wrong token → 401 `"invalid token"` ✓
  - `/generate` correct token + fake Anthropic key → 502 with detail
    `{retryable: false, upstream_status: 401, kind: "AuthenticationError"}`
    — same translation as engine's `_translate_anthropic_error` ✓
- **Git ops**:
  - `gh repo create frmoded/forge-transpile --private` succeeded.
  - Initial commit `0677f74` on `main`, pushed.
  - `venv/`, `*.egg-info/`, `.env` correctly gitignored — verified
    via `git ls-files | grep -E "venv|egg-info|\.env$"` returning empty.

### Deferred to user

- Set real `FORGE_TRANSPILE_SECRET` (`python -c "import secrets;
  print(secrets.token_urlsafe(32))"`) and real `ANTHROPIC_API_KEY`
  in a local `.env`, restart `uvicorn main:app --port 8001`, hit
  `/generate` with the real key, confirm transpiled Python comes
  back. One-time local verification before EC2 deploy.
- Set the monthly budget cap at console.anthropic.com.
- EC2 deployment per `deploy/DEPLOY.md` (separate prompt, blocked
  on AWS).
- Plugin endpoint swap (separate prompt, blocked on deployment +
  the production URL being known).

## 5. Git ops summary

| Item | Value |
|---|---|
| Repo | https://github.com/frmoded/forge-transpile (private) |
| Initial commit | `0677f74` on `main` |
| Files committed | 18 (no venv/egg-info/.env leakage verified) |
| Tag / release | None (service-code only; tagged release lands when EC2 deploy ships) |

## 6. Manual smoke guidance for user

Local end-to-end test with a real Anthropic key:

```bash
cd ~/projects/forge-transpile
. venv/bin/activate
cp .env.example .env
# Edit .env:
#   FORGE_TRANSPILE_SECRET=<paste output of: python -c "import secrets; print(secrets.token_urlsafe(32))">
#   ANTHROPIC_API_KEY=<your real Anthropic key>
uvicorn main:app --reload --port 8001
```

In another terminal:

```bash
# Replace $SECRET with your .env value
curl -sS -X POST http://localhost:8001/generate \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "snippet_id": "demo",
    "description": "Return the integer 42.",
    "english": "Return forty-two.",
    "active_domains": []
  }'
# → {"snippet_id":"demo","code":"def compute(context):\n  return 42"}
```

If the response is a real `def compute(...)` block, the service is
working end-to-end. Stop uvicorn (`Ctrl-C`).

## 7. Deviations

**One scoped down**: lowered `requires-python` from `>=3.11` (per the
prompt's pyproject example) to `>=3.9` because the system Python is
3.9.6 and brew Python 3.11+ isn't installed. **Production deploy
still uses Python 3.11+** via the EC2 systemd unit's own venv —
`deploy/DEPLOY.md` step 2 installs `python3.11`. The lower local
floor is dev-machine compat only.

Verified the lower floor doesn't compromise the code: no Python
3.10+ syntax (no match statements, no `|` union types in annotations
beyond what `typing.Optional` covers); `list[str]` etc. work on 3.9
via PEP 585.

**One choice surfaced for visibility**, not a true deviation: chose
to drop the engine's `recursive` flag from the V1 hosted-service
request shape. The engine's recursive mode walks the dep graph
server-side; doing the same hosted-side would force the service to
either (a) cache snippets between calls (state we don't want), or
(b) accept a massive inventory blob with every snippet's content.
Cleaner: plugin walks the dep graph locally, makes N hosted POSTs.
Documented in `main.py`'s `GenerateResponse` docstring.

## 8. One observation

The vendoring pattern (`prompts/llm_prompts.py` etc.) is the
crux of the service's correctness story. **If the engine's
prompts change and this repo doesn't re-sync, the generated Python
diverges silently** — same auth, same Anthropic call, different
output. Worth a short follow-up prompt: a script in this repo that
diffs the vendored files against the engine source and fails CI if
they drift. Could live at `scripts/check-vendor-sync.sh` and run as
a pre-commit hook or GitHub Action. Sub-30-line guard.

The same drift concern applies to `anthropic_client.build_user_prompt`
vs. `forge.core.llm._build_prompt` — and that one's harder to
machine-check because the engine code constructs the same string a
different way (using a registry lookup mid-loop). A unit test that
asserts byte-equality between the two for a representative input
might be the right shape; would import the engine as a dev
dependency (in `dev` optionals) and call `_build_prompt` against a
hand-crafted registry, comparing to `build_user_prompt`'s output.
~50 lines + the dev dep. Worth a future prompt.

## Notes

The prompt's file-naming pattern (`YYYY-MM-DD-HHMM-name.md`)
conforms. No non-conformance flag needed.

## Drain summary

| Prompt | Status |
|---|---|
| `2026-05-24-0100-alpha-transpile-service-scaffold.md` | **done** |

Queue empty after this run.
