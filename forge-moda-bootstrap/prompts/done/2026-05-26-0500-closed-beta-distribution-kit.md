# Closed-beta distribution kit — onboarding + operator one-pagers

## Why this prompt exists

v0.2.8 made the plugin closed-beta-ready (zero local processes
required). The remaining gap is the human-side handoff:

- **Students** need a self-contained recipe they can follow without
  Tamar or Oded in the room: download, install, paste token, verify.
  INSTALL.md inside the plugin repo is close but is repo-internal
  and doesn't cover the "Tamar emails this to a student" framing.
- **Operators** (Oded primarily) need a stable place that captures
  where the `FORGE_TRANSPILE_SECRET` lives, how to revoke + reissue
  if a student's machine is compromised, basic health-check curl
  commands, and the recipe for adding a new student. Right now this
  knowledge is spread across the EC2 instance, the deploy scripts,
  and CC's session memory.

Scope: two markdown deliverables in `forge-moda-bootstrap/` at the
top level (matching the existing convention — no `docs/` subdir
exists). No code changes. No version bump. Just durable, retrievable
documentation that closes the human-side loop before the seminar.

## 1. Deliverable A — `closed-beta-onboarding.md`

Target reader: a seminar student on a fresh laptop with no dev tools.
Reading level: not a developer. Length: aim for ~80-120 lines, scannable.

Required sections, in order:

### 1.1 What you'll have when you're done
One short paragraph: "An Obsidian vault with a working particle-
simulation playground, Forge-clickable snippets, and the ability to
generate Python from English descriptions." One screenshot reference
placeholder (`<<screenshot: forge-output-panel.png>>`) — Oded will
fill the actual image later; don't try to generate it.

### 1.2 What you need before you start
- A laptop running macOS or Windows.
- Obsidian installed (link to obsidian.md).
- A transpile token (provided by Tamar via email).
- ~30 minutes for the first install.

### 1.3 Install Forge (the plugin)
Three numbered steps. Mirror INSTALL.md in the plugin repo §3 but
rewritten for the "I just got an email from my teacher" audience:
- Download the v0.2.8 zip from the GitHub release page (full URL).
- Find your Obsidian vault's `.obsidian/plugins/` folder (Mac:
  Settings → About → Open vault folder; Windows: same path).
- Drop the unzipped folder there. Reload Obsidian.

Include the exact pinned URL:
`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.8`

### 1.4 Paste your token
Settings → Forge → Transpile service → Transpile service token. Token
is masked. Token came from Tamar's email. Don't share it.

### 1.5 First Forge-click — verify it works
Open the bundled `forge-moda/setup.md` snippet. Click the Forge
button. Expect: brief "Pyodide initializing…" then a result rendered
in the Forge Output panel on the right.

If you see something rendered → install is healthy, you're done.

### 1.6 If something went wrong
Three of the most likely failure modes, each with a one-line fix
pointer:
- "Plugin doesn't appear in Settings" → unzip landed in the wrong
  place; check the path.
- "Forge: Pyodide initializing… (hangs >30s)" → the assets/ folder
  didn't come along; re-do step 1.3.
- Anything else → screenshot the dev console (Cmd+Opt+I → Console)
  and email Tamar.

Explicitly **don't** include uvicorn, server URL, sync_dependencies,
or any architectural detail. Students never need to know.

### 1.7 What to try next
- Click around the moda simulator panel; try different temperatures.
- Open a snippet's English facet, edit it, click Forge — watch it
  regenerate Python.
- Read `forge-moda/README.md` for the curriculum sequence.

## 2. Deliverable B — `closed-beta-operator.md`

Target reader: Oded (and Tamar, secondarily). Length: ~150-200 lines.
Reference doc, not a tutorial — operator looks things up here when
something breaks or a new student joins.

Required sections:

### 2.1 Architecture in one paragraph
- Plugin is bundled (Pyodide + engine + content) and distributed via
  GH releases.
- α service (forge-transpile) runs on EC2 t3.micro in us-west-2 as
  `forge.thecodingarena.com`, proxies `/generate` to Anthropic.
- Bearer-token auth between plugin and α.
- Plugin Python-compute runs entirely in Pyodide; α is only called
  for English → Python transpilation.

### 2.2 Where the FORGE_TRANSPILE_SECRET lives
- **Source of truth**: 1Password (or sealed note — Oded picks).
  Write the entry name as a placeholder: `<<1password entry:
  forge-transpile-secret>>`. Oded fills the actual entry name after
  saving it.
- **Mirrored copies** (degrade gracefully if 1Password is unavailable):
  - EC2 instance: `/home/forge/.env` (`FORGE_TRANSPILE_SECRET=…`).
  - Local dev: `~/projects/forge-transpile/.env` (same key).
- **How to retrieve from EC2**:
  ```bash
  ssh -i ~/.ssh/forge-transpile-key.pem ubuntu@<EC2-IP>
  sudo cat /home/forge/.env | grep FORGE_TRANSPILE_SECRET
  ```

### 2.3 Adding a new student
For closed beta, all students share one token (per Oded's call in
session — shared is fine for ~5-10 testers).

Steps:
1. Confirm the student has Obsidian.
2. Email them:
   - GitHub release URL: `https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.8`
   - The shared token (paste from 1Password).
   - A link to `closed-beta-onboarding.md` (rendered however —
     GitHub gist, Drive doc, etc.; Oded picks the delivery).
3. (Optional) Schedule a 15-min call to walk through first install.

### 2.4 Rotating / revoking the token
When to rotate:
- A student's laptop is compromised.
- End of closed beta (before opening to a wider audience).
- Annually as hygiene.

Steps:
```bash
# Generate new secret
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# On EC2:
ssh -i ~/.ssh/forge-transpile-key.pem ubuntu@<EC2-IP>
sudo nano /home/forge/.env  # replace FORGE_TRANSPILE_SECRET=...
sudo systemctl restart forge-transpile
sudo systemctl status forge-transpile  # confirm "active (running)"

# Verify old token is rejected:
curl -X POST https://forge.thecodingarena.com/generate \
  -H "Authorization: Bearer <OLD-TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expect: 401 Unauthorized

# Verify new token works (header echo from /generate without body):
curl -X POST https://forge.thecodingarena.com/generate \
  -H "Authorization: Bearer <NEW-TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expect: 4xx with validation detail (not 401) — proves auth passed
```

Then update 1Password and email students the new token.

### 2.5 Health check curls (run any time, from anywhere)
```bash
# 1. Service is up?
curl -sS https://forge.thecodingarena.com/health
# Expect: {"status":"ok","version":"..."}

# 2. Auth is enforced?
curl -sS -X POST https://forge.thecodingarena.com/generate
# Expect: HTTP 401

# 3. TLS cert valid?
echo | openssl s_client -connect forge.thecodingarena.com:443 -servername forge.thecodingarena.com 2>/dev/null \
  | openssl x509 -noout -dates
# Expect: notAfter date > 30 days from today
```

### 2.6 What to watch on the EC2 instance
- **Disk usage**: `df -h` on the box. t3.micro EBS is 8GB by default;
  if `/` exceeds 80%, prune logs or upsize.
- **Service logs**: `journalctl -u forge-transpile -n 100 --no-pager`.
  Look for 5xx Anthropic errors or rate-limit messages.
- **Cert renewal**: certbot auto-renew runs via systemd timer.
  Verify with: `sudo systemctl status certbot.timer`.
- **Anthropic budget**: monthly cap is at console.anthropic.com →
  Settings → Limits. Currently set to: `<<TODO: Oded fills>>`.

### 2.7 If forge.thecodingarena.com is down
- Triage curl (§2.5 #1). If TLS fails → cert problem (run
  `sudo certbot renew --dry-run`).
- If 5xx → check `journalctl -u forge-transpile -n 50`.
- If nginx hung → `sudo systemctl restart nginx`.
- If everything looks fine but plugin can't reach it → check student's
  network (corporate firewall blocking ?), or the α-side rate limit
  on Anthropic.

### 2.8 Closed-beta sunset (when applicable)
When the closed beta ends or the seminar wraps:
- Rotate the shared token (§2.4).
- Decide: keep EC2 running for v1.1, or tear down via
  `deploy/DEPLOY.md` §"Tear-down" section.
- Archive the closed-beta-onboarding.md as `closed-beta-onboarding.v1.md`
  for posterity.

## 3. Cross-references to add

In `closed-beta-onboarding.md` §1.6 ("If something went wrong"), point
to `closed-beta-operator.md` for any "still broken" path so students
have one escalation route to Oded/Tamar.

In `closed-beta-operator.md`, reference `forge-transpile/deploy/DEPLOY.md`
for the full provisioning + redeploy procedure (don't duplicate; just
link).

In `forge-moda-bootstrap/cowork-forge-protocol.md` — add a one-line
pointer to `closed-beta-onboarding.md` and `closed-beta-operator.md`
in whatever "Where things live" section makes sense.

## 4. Things explicitly NOT in scope

- Generating screenshots — placeholder references only; Oded fills
  later.
- Setting up a CI/CD pipeline for the plugin or service.
- Per-student tokens — shared token is the closed-beta call.
- Anything that requires running EC2 commands now (token rotation,
  cert checks). The deliverables document HOW; Oded runs them when
  needed.
- Creating a `docs/` subdir — match existing flat convention.

## 5. Auto-smoke required

Cheap because these are docs:

1. Both files exist at the expected paths with non-trivial size
   (≥80 lines each).
2. Markdown lints cleanly — no broken headers, no malformed link
   syntax. (`npx markdownlint-cli2` or equivalent; if no linter is
   set up locally, skip and note in feedback.)
3. No accidental token / credential / IP leak. Grep both files for:
   - `secrets.token_urlsafe` output shape (`[A-Za-z0-9_-]{43}`)
   - `pem`
   - any IPv4 literal
   Confirm only `<<placeholder>>` style markers exist where Oded fills.

## 6. Git ops

- One commit on `forge-moda-bootstrap` `main`:
  `[2026-05-26-0500-closed-beta-distribution-kit] closed-beta-onboarding.md + closed-beta-operator.md`.
- Push to origin/main.
- No tag, no release (docs-only).

## 7. Manual smoke guidance for user (Oded)

After CC finishes:

1. Skim `closed-beta-onboarding.md`. Imagine yourself as a non-dev
   student. Anything ambiguous → flag for revision.
2. Skim `closed-beta-operator.md`. Try ONE thing from §2.5 (a curl)
   to verify the command is right. Try ONE thing from §2.4 to verify
   the rotation recipe makes sense (don't actually rotate).
3. Fill the `<<placeholder>>` markers:
   - `<<1password entry: forge-transpile-secret>>` → save the token,
     write the entry name back.
   - `<<TODO: Oded fills>>` → the Anthropic monthly budget cap.
4. Decide where `closed-beta-onboarding.md` will live for student
   access (GitHub gist? Drive? Email it?) and note that decision
   somewhere durable.

## 8. Deviations

Standard "deviations" section. Specific things to call out if they
happen:

- If the markdown linter isn't installed → skip and note. Don't
  install a global linter just for this.
- If `cowork-forge-protocol.md` doesn't have an obvious "where things
  live" section to extend → add the cross-references to a new section
  at the bottom (`## Closed-beta docs`) and note this in deviations.

## 9. Feedback file format

Standard. Fresh-enumerated sections matching this prompt's headings.
Frontmatter timestamp + session_id + status. File at
`prompts/feedback/2026-05-26-0500-closed-beta-distribution-kit.md`.

Feedback §4 should include a short stat for each deliverable: line
count, section count. Feedback §5 should report the cross-reference
edits applied to `cowork-forge-protocol.md` (verbatim or diff snippet).
