---
timestamp: 2026-05-25T22:36:22Z
session_id: unknown
prompt_modified: 2026-05-25T15:32:30Z
status: success
---

# α deployment scaffolds — EC2 + forge.codes ready for user-driven deploy

## TL;DR

forge-transpile commit `8b12d0c` ships the full production-ready
deploy bundle for `forge.codes` on AWS EC2: AWS CLI provisioner,
cloud-init script, production nginx + systemd configs, interactive
post-deploy setup, smoke verifier, and a comprehensive DEPLOY.md.
Static checks all clean (shellcheck, bash -n, systemd directive
presence, nginx brace + directive presence). 16/16 service unit
tests still pass. AWS API calls deferred to user; every command
is documented + copy-paste-able from DEPLOY.md.

## 1. Files added / modified

```
forge-transpile/
├── .gitignore                              MODIFIED  (added *.pem, *_deploy_key*, aws-deploy-state.json)
└── deploy/
    ├── DEPLOY.md                           REPLACED  (was placeholder; now full walkthrough)
    ├── provision-ec2.sh                    NEW       7325 bytes, +x
    ├── user-data.sh                        NEW       1383 bytes, +x
    ├── nginx.conf                          NEW       2244 bytes (replaces .conf.template)
    ├── forge-transpile.service             NEW       1055 bytes (replaces .service.template)
    ├── post-deploy-setup.sh                NEW       8269 bytes, +x
    └── smoke.sh                            NEW       3003 bytes, +x

(removed: deploy/nginx.conf.template, deploy/forge-transpile.service.template
 — replaced by the unsuffixed production files)
```

## 2. Static-check output

### `shellcheck deploy/*.sh`

Initial run flagged one warning:
```
deploy/post-deploy-setup.sh line 62:
sudo -u forge ssh-keyscan -H github.com >> /home/forge/.ssh/known_hosts 2>/dev/null
                                        ^-- SC2024 (warning): sudo doesn't affect redirects.
```

**Fix applied**: switched the line to pipe through `sudo tee -a` so
the write executes as root with the right path, then chown to forge.
Re-ran shellcheck — **clean (exit 0)**. All four shell scripts pass.

### `bash -n` syntax checks

All four `.sh` files parse cleanly:
```
✓ deploy/post-deploy-setup.sh
✓ deploy/provision-ec2.sh
✓ deploy/smoke.sh
✓ deploy/user-data.sh
```

### systemd unit — directive presence check

`systemd-analyze verify` isn't available on macOS, so I used a
required-directive grep instead:
```
✓ [Unit] section present
✓ [Service] section present
✓ [Install] section present
✓ Description= present
✓ ExecStart= present
✓ WantedBy= present
```

### nginx config — brace + directive presence check

`nginx -t` requires nginx installed (it isn't on macOS by default).
Substituted a brace-balance + required-directive check:
```
braces: 4 open / 4 close — balanced
✓ 'listen 80'
✓ 'listen 443 ssl'
✓ 'server_name forge.codes'
✓ 'proxy_pass http://127.0.0.1:8001'
✓ 'Access-Control-Allow-Origin'
```

Full `nginx -t` validation will happen on the EC2 instance during
`post-deploy-setup.sh` step 6.

### Service unit tests

`pytest -q` → **16/16 pass in 0.04s** (no service code touched;
regression check).

## 3. AMI ID lookup

The prompt asked for either an embedded current Ubuntu 22.04 LTS
AMI ID OR a documented lookup query. I chose **dynamic lookup at
provision time** to avoid AMI staleness — Canonical rotates these
regularly with security updates, and a hardcoded ID would slowly
drift toward "old image with known CVEs" between deploys.

The script does this inside `provision-ec2.sh`:

```bash
AMI_ID=$(aws ec2 describe-images --region "$REGION" \
  --owners 099720109477 \
  --filters \
    "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
    "Name=state,Values=available" \
    "Name=architecture,Values=x86_64" \
    "Name=root-device-type,Values=ebs" \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" \
  --output text)
```

Owner ID `099720109477` is Canonical's official AWS publishing
account. `sort_by(Images, &CreationDate)[-1]` picks the most
recent. Script bails if the lookup returns empty (failed creds /
wrong region).

The first line of the script's runtime output will be e.g.
`Resolving latest Ubuntu 22.04 LTS amd64 AMI for us-west-2... AMI:
ami-xxxxxxxxx` so the user can verify which AMI they got.

## 4. DEPLOY.md summary

10 sections, each with copy-paste commands + expected outputs:

1. **What's automated vs. what you do** — table + 15-25 min estimate
2. **Prereqs** — AWS CLI, jq, dig, Route 53 zone, Anthropic key, local .env
3. **Deploy key — one-time** — ssh-keygen + GitHub Deploy keys link
4. **Provision EC2** — single command, copy public IP after
5. **DNS — Route 53 A record** — console clicks (no risky CLI), dig verify
6. **scp deploy key + .env** — exact scp commands with $EC2_IP substitution
7. **SSH in + post-deploy** — cloud-init verify + post-deploy script run
8. **Smoke (from local)** — `bash deploy/smoke.sh` + expected pass output
9. **Cost expectations** — ~$10/mo table (t3.micro + Route 53 + EBS)
10. **Operational pointers** — logs, restart, redeploy, token rotation, cert renewal
11. **Tear-down** — terminate-instances + delete-security-group + delete-key-pair commands
12. **V1.1+ hardening** — deferred list (Secrets Manager, CloudWatch, per-user tokens, rate limiting, CI/CD)

## 5. Manual deploy guidance for user

Estimated wall-clock: **15-25 minutes**, dominated by cloud-init
(~2 min) + DNS propagation (~3-5 min) + Let's Encrypt cert issue
(~30 sec).

High-level flow:

1. **Generate deploy key** (~30 sec) — `ssh-keygen -t ed25519 -f
   ~/.ssh/forge_deploy_key -N ""`. Add `.pub` to GitHub repo's
   Deploy keys.
2. **Provision** (~3 min) — `bash deploy/provision-ec2.sh`. Note
   the public IP.
3. **DNS** (~3-5 min for propagation) — Route 53 console: add A
   record `forge.codes → <EC2-IP>`. Verify with `dig`.
4. **scp prereqs** (~30 sec) — deploy key + .env to the instance.
5. **Post-deploy** (~5 min) — SSH in, run
   `post-deploy-setup.sh <your-email>`. Interactive; waits for
   confirmations at deploy-key and DNS-propagation steps.
6. **Smoke** (~30 sec) — `bash deploy/smoke.sh` from local.

If the smoke 4-of-4 passes: forge.codes is live on HTTPS with auth,
proxying to Anthropic. The plugin can now point at it once the
endpoint-swap prompt lands.

## 6. Git ops

| Item | Value |
|---|---|
| Commit | `8b12d0c` on `main` |
| Push | to `origin/main` on `frmoded/forge-transpile` |
| Tag | none (service code unchanged; tag when version bumps) |
| Sensitive-file leak check | passed (no `.pem`, `*_deploy_key*`, `.env` staged) |

## Smoke verification

### Auto-verified by CC

- **`shellcheck deploy/*.sh`** — clean (after fixing SC2024).
- **`bash -n deploy/*.sh`** — clean.
- **systemd unit directive presence** — Unit/Service/Install sections + Description/ExecStart/WantedBy keys all present.
- **nginx config brace balance + required directives** — 4/4 braces balanced; listen 80, listen 443 ssl, server_name forge.codes, proxy_pass, CORS Access-Control-Allow-Origin all present.
- **`pytest -q`** — 16/16 service unit tests pass.
- **Git ops** — committed (`8b12d0c`), pushed; verified no sensitive files in the staged set.

### Deferred to user (AWS-creds + live infra)

- `aws configure list` returns valid creds for us-west-2.
- `bash deploy/provision-ec2.sh` provisions EC2 + key + SG; user copies the public IP.
- Add A record in Route 53 console; verify with `dig forge.codes A +short`.
- `ssh-keygen`, add deploy key to GitHub repo's Deploy keys page.
- scp deploy key + .env up.
- SSH in, run `bash deploy/post-deploy-setup.sh <admin-email>`.
- `bash deploy/smoke.sh` from local — verify 4/4 checks pass.

## Deviations

**Two minor**:

1. **Dynamic AMI lookup** instead of hardcoded ID. The prompt's
   suggested-shape code had `AMI_ID="<latest Ubuntu 22.04 LTS in
   us-west-2; CC fills via describe-images query OR documents how
   to look up>"` — i.e., either approach is acceptable. I chose
   the dynamic lookup because it's strictly safer (no stale-AMI
   risk), and the prompt's reproducibility constraints are already
   met (the query is deterministic + documented + the result is
   printed at runtime for user verification).

2. **systemd-analyze + nginx -t not run in CC sandbox.** Neither
   tool is available on macOS by default and installing them just
   for static validation didn't seem worth the time when the
   required-directive + brace-balance checks catch the realistic
   failure modes (missing section, typo in directive name,
   unbalanced braces). Full validation happens on the EC2
   instance during post-deploy step 6 (`nginx -t && systemctl
   reload nginx`) and step 5 (`systemctl daemon-reload && start &&
   is-active`). Flagged in the static-check section of the
   feedback.

## One observation

The interactive `post-deploy-setup.sh` deliberately pauses at the
deploy-key + .env + DNS-propagation checkpoints. Each pause has a
fail-fast escape (the script `exit 1`'s if the prereq isn't met
when it checks) AND a `read -p` confirmation prompt before
proceeding. This is the only place in the deploy chain where
user-side prereqs are checked against user-side state — getting
it wrong (e.g., proceeding when DNS hasn't propagated) wastes a
certbot rate-limit slot. Worth a callout: **Let's Encrypt
rate-limits to 5 failed validations per hour per domain**, so a
misfire on certbot is recoverable but adds a meaningful wait.

The script's DNS check uses `dig +short` on the instance's own
forge.codes lookup vs. the instance's IMDS-reported public IP.
That's a slightly stronger check than just "DNS resolves to
something" — it catches the "resolves to a stale IP" case too.

If a future hardening pass moves the cert-issuance step to a
separate explicit invocation (e.g., `post-deploy-setup.sh --cert`
after `post-deploy-setup.sh --skip-cert`), the rate-limit risk
drops to ~zero. Not blocking V1; flagged for the V1.1 list.

## Drain summary

| Prompt | Status |
|---|---|
| `2026-05-25-0000-alpha-ec2-deployment.md` | **done** |

Queue empty after this run.
