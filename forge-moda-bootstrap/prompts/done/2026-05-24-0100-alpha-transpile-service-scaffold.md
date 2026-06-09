# α transpile service scaffold — FastAPI app + Anthropic proxy + auth

## Scope

Build the α transpile service from scratch in a new repo. Service-code only — deployment (nginx, EC2, Let's Encrypt) is a separate prompt blocked on the user's AWS account setup. This prompt produces a runnable-locally FastAPI service that mirrors the engine's `/generate` behavior, validates a shared-secret bearer token, and proxies to Anthropic's API.

What this prompt delivers:

1. **New private GitHub repo** `frmoded/forge-transpile`. Created via `gh repo create frmoded/forge-transpile --private --description "Forge transpile service: hosted /generate endpoint that proxies to Anthropic"`. **Explicit user authorization for repo creation in this prompt.**

2. **FastAPI app** at `main.py`:
   - `POST /generate` endpoint accepting the same request shape as `forge/api/server.py`'s existing `/generate` (CC reads that file to mirror exactly — request fields, response fields, error shapes).
   - `GET /health` endpoint returning `{status: "ok", version: <version>}` for ops monitoring.

3. **Auth module** at `auth.py`:
   - Bearer-token validation via `Authorization: Bearer <token>` header.
   - Token compared against `FORGE_TRANSPILE_SECRET` env var.
   - 401 on missing/wrong/malformed.
   - Constant-time comparison to avoid timing attacks (`hmac.compare_digest`).

4. **Anthropic client** at `anthropic_client.py`:
   - Wraps the official `anthropic` Python SDK.
   - Reads `ANTHROPIC_API_KEY` from env.
   - Model + prompt structure: mirror what the engine's `/generate` uses (CC reads `forge/core/llm_prompts.py` if it exists, or wherever the prompt is constructed today).
   - Returns just the Python code (extract from the LLM's response per engine conventions).

5. **Tests** at `tests/`:
   - `test_auth.py`: mocked HTTP requests, verify 401 on missing/wrong token, 200 on valid.
   - `test_generate.py`: mock the Anthropic SDK; verify the call is invoked with the expected prompt structure; verify response shape matches engine `/generate`.
   - `conftest.py`: pytest fixtures (test client, mock Anthropic).
   - No real Anthropic calls in tests.

6. **Project metadata**:
   - `pyproject.toml` with dependencies (`fastapi`, `uvicorn[standard]`, `anthropic`, `python-dotenv` for local dev; dev deps: `pytest`, `httpx` for TestClient).
   - `.env.example` with `FORGE_TRANSPILE_SECRET=<placeholder>` and `ANTHROPIC_API_KEY=<placeholder>`.
   - `.gitignore` (`.env`, `__pycache__`, `.pytest_cache`, etc.).
   - `README.md` covering: what this service does, local dev setup, running tests, curl examples against the local instance.

7. **Deploy placeholders** at `deploy/`:
   - `deploy/nginx.conf.template` with `<DOMAIN>` placeholder — production config sketch, to be filled when domain lands.
   - `deploy/forge-transpile.service.template` — systemd unit template.
   - `deploy/DEPLOY.md` — placeholder with "TODO: fill when EC2 + domain ready" markers. Sketches the deploy steps from local-tested artifact to running service.

Does NOT:

- Deploy to EC2. Separate prompt blocked on the user's AWS account.
- Configure a domain or Let's Encrypt. Same.
- Touch the plugin (`forge-client-obsidian`). The plugin's endpoint swap is a separate prompt that depends on (a) the service being deployed and (b) the production URL being known.
- Build per-user token management. Closed-beta uses a single shared secret; per-user tokens are a v1.1 feature.
- Touch the forge engine. The hosted service is independent.
- Add a plugin settings UI for the token. Separate.

## Why

V1 closed-beta seminar in ~1.5 weeks. `/generate` is currently the plugin's only `localhost:8000` dependency (uvicorn). Students can't run uvicorn locally. α replaces that path with a hosted service holding the Anthropic key on our side.

This prompt builds the service code so it can be tested locally NOW. Deployment, plugin endpoint swap, and plugin settings UI follow once AWS is set up and the domain is known.

## Files to create

All under the new `forge-transpile` repo, after `gh repo create` succeeds.

### `pyproject.toml`

Modern Python project metadata. Suggested shape:

```toml
[project]
name = "forge-transpile"
version = "0.1.0"
description = "Forge transpile service: hosted /generate endpoint"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.27",
    "anthropic>=0.25",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "httpx>=0.27",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

### `main.py`

FastAPI app with two endpoints. Structure:

```python
import os
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

from auth import require_bearer_token
from anthropic_client import transpile

app = FastAPI(title="forge-transpile", version="0.1.0")


class GenerateRequest(BaseModel):
    # Mirror forge/api/server.py /generate request shape exactly.
    # CC: read that file first to confirm exact field names + types.
    english_facet: str
    snippet_inventory: list[dict]  # or whatever the engine uses
    # ... other fields as engine has them
    # Note: NO auth_token in the body — auth flows through header.


class GenerateResponse(BaseModel):
    python_facet: str
    # ... other fields as engine returns


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, _: None = Depends(require_bearer_token)):
    try:
        python_facet = await transpile(
            english_facet=req.english_facet,
            snippet_inventory=req.snippet_inventory,
        )
    except Exception as e:
        # Anthropic errors, timeout, malformed response, etc.
        raise HTTPException(status_code=502, detail=f"transpile failed: {e}")
    return GenerateResponse(python_facet=python_facet)
```

**CRITICAL:** mirror the engine's existing `/generate` request/response shape. CC reads `~/projects/forge/forge/api/server.py` to find the existing endpoint, copies the field names and types. Any drift breaks the plugin's swap later.

### `auth.py`

```python
import os
import hmac
from fastapi import Header, HTTPException


def require_bearer_token(authorization: str | None = Header(default=None)):
    """FastAPI dependency. Validates the `Authorization: Bearer <token>` header
    against the FORGE_TRANSPILE_SECRET env var. Constant-time comparison."""
    expected = os.environ.get("FORGE_TRANSPILE_SECRET")
    if not expected:
        # Misconfiguration on the server side. Fail loudly.
        raise HTTPException(status_code=500, detail="FORGE_TRANSPILE_SECRET not configured")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing or malformed Authorization header")

    presented = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented, expected):
        raise HTTPException(status_code=401, detail="invalid token")
```

### `anthropic_client.py`

Wraps the Anthropic SDK. Mirrors the engine's prompt construction.

```python
import os
from anthropic import AsyncAnthropic

_client = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not configured")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


async def transpile(*, english_facet: str, snippet_inventory: list[dict]) -> str:
    """Transpile English facet to Python via Anthropic. Mirrors the engine's
    /generate prompt structure — CC reads forge/core/llm_prompts.py (or
    wherever the prompt is constructed today) to ensure parity.
    """
    client = _get_client()
    prompt = _build_prompt(english_facet, snippet_inventory)
    # Use the same model the engine uses; CC reads to confirm.
    response = await client.messages.create(
        model="claude-...",  # CC fills from engine's actual model choice
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_python(response.content)


def _build_prompt(english_facet: str, snippet_inventory: list[dict]) -> str:
    """Mirror the engine's prompt construction. CC reads the engine's
    llm_prompts.py (or equivalent) and replicates here.
    """
    # ... (mirror engine)
    pass


def _extract_python(content) -> str:
    """Pull the Python code out of the LLM's response (strip markdown fences,
    explanations, etc.). Mirror the engine's extraction logic."""
    # ... (mirror engine)
    pass
```

**CRITICAL on the model + prompt:** the engine's `/generate` uses a specific Claude model + a structured prompt that includes domain hints, the authoring inventory (B5/B5.1), and instructions for output shape. CC reads `forge/core/llm_prompts.py` or wherever this lives. Replicate exactly. Any drift in the prompt → different transpiled output → behavior change.

### `tests/`

`tests/conftest.py`:

```python
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

# Set test env vars before importing app
os.environ["FORGE_TRANSPILE_SECRET"] = "test-secret-do-not-use-in-prod"
os.environ["ANTHROPIC_API_KEY"] = "test-key-mock-will-intercept"

from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_anthropic():
    with patch("anthropic_client._get_client") as m:
        mock_client = AsyncMock()
        m.return_value = mock_client
        yield mock_client
```

`tests/test_auth.py`:
- `test_missing_auth_header_returns_401`
- `test_malformed_auth_header_returns_401`
- `test_wrong_token_returns_401`
- `test_valid_token_allows_request`

`tests/test_generate.py`:
- `test_generate_calls_anthropic_with_expected_prompt`
- `test_generate_returns_python_facet`
- `test_generate_502s_on_anthropic_failure`
- `test_health_returns_200`

### `.env.example`

```bash
# Required: shared secret for closed-beta auth.
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
FORGE_TRANSPILE_SECRET=<long-random-string>

# Required: Anthropic API key with budget cap.
ANTHROPIC_API_KEY=<your-anthropic-key>

# Optional: port to listen on (default 8001 for local dev,
# avoids conflict with forge engine's default 8000).
PORT=8001
```

### `.gitignore`

```
.env
__pycache__/
.pytest_cache/
*.pyc
dist/
build/
.venv/
venv/
```

### `README.md`

Local dev guide. Sections:

- **What this is** — one-sentence description.
- **Local setup** — `python -m venv venv`, `pip install -e ".[dev]"`, `cp .env.example .env`, edit `.env` with real values, `uvicorn main:app --reload --port 8001`.
- **Running tests** — `pytest`.
- **Curl example** (local) — `curl -X POST http://localhost:8001/generate -H "Authorization: Bearer $FORGE_TRANSPILE_SECRET" -H "Content-Type: application/json" -d '{"english_facet": "...", "snippet_inventory": []}'`.
- **Deployment** — pointer to `deploy/DEPLOY.md`.

### `deploy/nginx.conf.template`

```nginx
# Production nginx config for forge-transpile.
# Replace <DOMAIN> with the actual domain when AWS + DNS are ready.

server {
    server_name <DOMAIN>;
    listen 443 ssl http2;

    ssl_certificate /etc/letsencrypt/live/<DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<DOMAIN>/privkey.pem;

    # Allow the Obsidian plugin (which runs in Electron) to call this.
    add_header Access-Control-Allow-Origin "app://obsidian.md" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Allow-Methods "POST, OPTIONS" always;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name <DOMAIN>;
    return 301 https://$server_name$request_uri;
}
```

### `deploy/forge-transpile.service.template`

```ini
[Unit]
Description=Forge Transpile Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/forge-transpile
Environment="FORGE_TRANSPILE_SECRET=<set-via-secrets>"
Environment="ANTHROPIC_API_KEY=<set-via-secrets>"
Environment="PORT=8001"
ExecStart=/home/ubuntu/forge-transpile/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### `deploy/DEPLOY.md`

Placeholder with TODO markers. Sketch the deployment steps so they're easy to fill when AWS is ready:

```markdown
# Deploying forge-transpile to EC2

**Status: TODO — blocked on AWS account setup and domain registration.**

## Prerequisites
- AWS account (TODO)
- EC2 instance (TODO: t3.micro, Ubuntu 22.04 LTS, public IP)
- Domain (TODO: pick + configure DNS A record → EC2 public IP)
- Anthropic API key with monthly budget cap

## Deploy steps (skeleton)
1. SSH to EC2: `ssh ubuntu@<EC2_IP>`
2. Install Python 3.11, nginx, certbot: `sudo apt update && sudo apt install ...`
3. Clone repo: `git clone https://github.com/frmoded/forge-transpile.git`
4. Set up venv + install: `cd forge-transpile && python3.11 -m venv venv && source venv/bin/activate && pip install -e .`
5. Configure env: copy `.env.example` to `.env`, fill in real secrets.
6. Install systemd unit: `sudo cp deploy/forge-transpile.service.template /etc/systemd/system/forge-transpile.service`, edit paths/env, `sudo systemctl daemon-reload && sudo systemctl enable --now forge-transpile`.
7. nginx: `sudo cp deploy/nginx.conf.template /etc/nginx/sites-available/forge-transpile`, replace `<DOMAIN>`, symlink to sites-enabled, `sudo nginx -t && sudo systemctl reload nginx`.
8. Let's Encrypt: `sudo certbot --nginx -d <DOMAIN>`.
9. Test: `curl https://<DOMAIN>/health`.
```

## Implementation notes

### Mirror the engine's /generate exactly

CC reads `~/projects/forge/forge/api/server.py` and `~/projects/forge/forge/core/llm_prompts.py` (or wherever the prompt construction lives) BEFORE writing `main.py`'s request shape and `anthropic_client.py`'s prompt builder. The hosted service must behave identically to the local engine's `/generate` so the plugin's eventual URL swap is a clean drop-in.

Specifically:
- Request body field names and types.
- Response body field names.
- Error response shape (HTTP status + body).
- The exact Claude model used.
- The full prompt template (system message + user message structure).
- Output extraction logic (markdown fence stripping, etc.).

If anything in the engine's `/generate` is unusual or unclear, flag in the feedback rather than improvising.

### Async vs sync

FastAPI + `AsyncAnthropic` is the right pairing — Anthropic calls are I/O bound, blocking sync routes would limit throughput. Use `async def` for the endpoint and `await client.messages.create(...)`.

### Logging

Add basic logging:
- INFO on each successful `/generate` call (no sensitive content; just timestamp + duration + maybe a hash of the request for tracing).
- WARN on auth failures (rate of failed auth attempts is useful).
- ERROR on Anthropic failures.
- Configure via Python's logging module; output to stdout (systemd captures via journalctl).

### Rate limiting

Out of scope for V1 closed beta (small audience, capped Anthropic budget). If abuse becomes a concern, add a token-bucket per-token in v1.1.

### Token format

Per the user's answer: long hash, sent via email. Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` — produces a ~43-char URL-safe base64 string. Each token is a single long string; users paste verbatim into the plugin's settings field (settings UI is a separate prompt).

## Tests + smoke

### Auto-verified by CC

- `pip install -e ".[dev]"` succeeds.
- `pytest` runs all tests, expect ~10+ passing (4 auth + 4 generate + 1 health + any extras).
- `uvicorn main:app --port 8001` starts cleanly (background process; CC kills after smoke).
- `curl http://localhost:8001/health` returns `{"status": "ok", "version": "0.1.0"}` with status 200.
- `curl -X POST http://localhost:8001/generate` without auth returns 401.
- `curl -X POST http://localhost:8001/generate` with wrong token returns 401.
- (CC sets a test-only FORGE_TRANSPILE_SECRET via env, NOT a real one.)
- Mock-based curl with the test token verifies the request reaches the generate handler (returning a controlled error since Anthropic key is also test-only, but proving the routing + auth flow works).
- Git ops: `gh repo create frmoded/forge-transpile --private`. Initial commit with all files. Push to main.

### Deferred to user

- Setting real `FORGE_TRANSPILE_SECRET` and `ANTHROPIC_API_KEY` in `.env` and verifying a real `/generate` call returns transpiled Python. Requires a real Anthropic key — user does this once locally to confirm end-to-end before EC2 deploy.
- Production deployment to EC2. Separate prompt.
- Plugin endpoint swap. Separate prompt.

## Out of scope

- Deployment to EC2.
- Domain configuration, DNS, Let's Encrypt.
- Plugin-side endpoint swap.
- Plugin settings UI for the token.
- Per-user token management.
- Rate limiting, request throttling.
- Multi-tenant token database.
- Logging to anywhere beyond stdout.
- Monitoring / alerting.
- CI/CD (GitHub Actions).

## Report when done

Per protocol 8-section.

1. **Repo creation confirmation** — `gh repo create` output, repo URL.
2. **File listing** — directory tree of the populated repo.
3. **Engine /generate mirror summary** — what CC found in the engine's existing `/generate` (model name, prompt structure, request/response shapes) and how the new service replicates each.
4. **Test results** — pytest pass count.
5. **Local smoke output** — uvicorn startup, curl /health, curl /generate without auth (401), curl /generate with auth (mock response).
6. **Commit SHA + push** — initial commit on main.
7. **Manual smoke guidance for user** — how to set up real `.env` and try a real /generate call locally.
8. **Any deviation and why.**
9. **One observation.**

## Commits + push

Repo creation + initial commit + push per the new default-on git ops protocol.

Commit message: `[2026-05-24-0100-alpha-scaffold] Initial forge-transpile service scaffold`

## Don'ts

- **Don't deploy to EC2.** Service-code only.
- **Don't touch the plugin.** Endpoint swap is a separate prompt.
- **Don't make real Anthropic calls in tests.** Mock the SDK.
- **Don't commit real secrets.** `.env` is gitignored; `.env.example` has placeholders only.
- **Don't drift from the engine's /generate shape.** Read first; replicate; flag any unclear parts.
- **Don't add per-user token management.** Single shared secret for closed beta.
- **Don't add rate limiting or monitoring.** v1.1 territory.
- **Don't add CI/CD.** Manual `pip install`, manual deploy for V1.
- **Don't make the repo public.** Private per the cowork protocol's α decision.
- **Don't proceed past a blocker.** If the engine's /generate is structurally too different to mirror in one prompt, route to questions/ with the specific gap.
