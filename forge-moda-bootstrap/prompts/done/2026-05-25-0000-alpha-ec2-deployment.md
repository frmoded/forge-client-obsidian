# α deployment — EC2 + Route 53 + Let's Encrypt for forge.thecodingarena.com

## Scope

Deploy `forge-transpile` to AWS EC2 (`us-west-2`, t3.micro, Ubuntu 22.04) with HTTPS via Let's Encrypt on the `forge.thecodingarena.com` domain. Production-ready for the closed-beta seminar.

CC scaffolds all deploy artifacts (AWS CLI provisioning script, cloud-init user-data, nginx config with `forge.thecodingarena.com` hardcoded, comprehensive DEPLOY.md with copy-paste commands, post-deploy smoke script). User runs the actual AWS commands with their credentials. **CC does as much work as possible via AWS CLI tooling so the user's copy-paste burden is minimized.**

What this prompt delivers (all in the `forge-transpile` repo):

1. **`deploy/provision-ec2.sh`** — AWS CLI shell script. Idempotent (safe to re-run). Creates: SSH key pair → security group (allow 22 from user's IP, 80+443 from anywhere) → EC2 t3.micro instance with cloud-init user-data → prints public IP + hostname + next-steps. Takes a single argument: the user's public IP for SSH allowlist (auto-detect via `curl ifconfig.me` if not provided).

2. **`deploy/user-data.sh`** — cloud-init script that runs automatically on first boot. Installs python3.11, nginx, certbot, git. Creates the `forge` system user. Sets up the venv skeleton. Does NOT clone the repo (deploy key not yet on the instance) and does NOT start the service (no .env yet). Logs to `/var/log/cloud-init-output.log` so user can debug.

3. **`deploy/nginx.conf`** — production nginx config (no placeholders). Hardcoded `server_name forge.thecodingarena.com;`. Includes proxy to `127.0.0.1:8001` with timeouts + CORS headers for `app://obsidian.md` origin. Both HTTP→HTTPS redirect block and HTTPS server block.

4. **`deploy/forge-transpile.service`** — systemd unit (no placeholders, paths committed). Production-ready: User=forge, WorkingDirectory=/home/forge/forge-transpile, EnvironmentFile=/home/forge/forge-transpile/.env (NOT inline env vars — keeps secrets out of unit file).

5. **`deploy/post-deploy-setup.sh`** — script the user runs ON THE EC2 INSTANCE after SSH'ing in. Clones the repo using the deploy key, sets up venv, prompts for .env values interactively (or reads from a scp'd .env), installs systemd unit, runs certbot for the HTTPS cert, starts the service.

6. **`deploy/smoke.sh`** — runs from user's LOCAL machine after deploy. Hits `https://forge.thecodingarena.com/health` (expect 200), `/generate` without auth (expect 401), `/generate` with wrong token (expect 401), `/generate` with correct token + a simple test snippet (expect valid Python returned). Compares response shapes to local smoke for parity.

7. **`deploy/DEPLOY.md`** — comprehensive step-by-step the user follows. Sections:
   - Prereqs (AWS CLI configured, forge.thecodingarena.com registered in Route 53).
   - One-time setup (generate GitHub deploy key, add to repo).
   - Provision EC2 (run provision-ec2.sh, copy public IP).
   - DNS (add A record in Route 53 console: forge.thecodingarena.com → EC2 IP).
   - SSH + post-deploy (scp .env, run post-deploy-setup.sh).
   - Smoke (run smoke.sh, expected outputs).
   - Operational notes (logs, restart, redeploy, cost ~$10-15/month).

8. **Update `forge-transpile/.gitignore`** — ensure no deploy artifacts (specifically the generated `deploy/aws-deploy-state.json` from provisioning) leak into git.

Does NOT:

- Run AWS commands from CC's sandbox (no creds; user runs).
- Touch the plugin (`forge-client-obsidian`). Plugin endpoint swap is the next prompt.
- Set up CI/CD for the service. Manual deploy for V1.
- Configure monitoring/alerting (CloudWatch alarms, etc.). Future hardening.
- Implement secrets-manager integration. .env on the EC2 box is fine for closed beta.
- Touch the forge-moda or forge-client-obsidian repos.

## Why

α service is locally verified (smoke passed end-to-end with real Anthropic). Need to ship it on a public HTTPS endpoint so the plugin can call it instead of `localhost:8000`. AWS account is ready (`us-west-2`); `forge.thecodingarena.com` is being registered in Route 53 in parallel.

After this lands: an HTTPS endpoint students can hit, with token auth, proxying to Anthropic on our budget.

## Files to create / modify (all in `forge-transpile` repo)

### `deploy/provision-ec2.sh`

AWS CLI shell script. Idempotent. Heavily commented so user understands what each step does. Suggested shape:

```bash
#!/usr/bin/env bash
# Provision the forge-transpile EC2 instance in us-west-2.
# Idempotent: safe to re-run; reuses existing resources by tag.
#
# Prereqs: AWS CLI configured with credentials. `jq` installed.
#
# Usage: bash provision-ec2.sh [user-ssh-ip]
#   user-ssh-ip: your public IP for SSH allowlist. Auto-detected via
#                curl ifconfig.me if not provided.

set -euo pipefail

REGION="us-west-2"
INSTANCE_TYPE="t3.micro"
AMI_ID="<latest Ubuntu 22.04 LTS in us-west-2; CC fills via `aws ec2 describe-images` query OR documents how to look up>"
KEY_NAME="forge-transpile-key"
SG_NAME="forge-transpile-sg"
INSTANCE_NAME="forge-transpile"
TAG_KEY="Project"
TAG_VAL="forge-transpile"

USER_IP="${1:-$(curl -sS ifconfig.me)}"

# Idempotency: reuse key pair if exists.
if ! aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
  aws ec2 create-key-pair --region "$REGION" --key-name "$KEY_NAME" \
    --query "KeyMaterial" --output text > "$HOME/.ssh/$KEY_NAME.pem"
  chmod 600 "$HOME/.ssh/$KEY_NAME.pem"
  echo "Created SSH key: ~/.ssh/$KEY_NAME.pem"
else
  echo "SSH key '$KEY_NAME' exists; reusing."
fi

# Security group: idempotent create + rules.
SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=$SG_NAME" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")
if [[ "$SG_ID" == "None" || -z "$SG_ID" ]]; then
  SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "forge-transpile service: SSH from user, HTTP/S from anywhere" \
    --query "GroupId" --output text)
  # Add rules: SSH from user IP, HTTP+HTTPS from anywhere.
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "${USER_IP}/32"
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 80 --cidr "0.0.0.0/0"
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 443 --cidr "0.0.0.0/0"
  echo "Created security group $SG_ID with SSH from $USER_IP, HTTP+HTTPS from anywhere."
else
  echo "Security group '$SG_NAME' exists ($SG_ID); reusing."
  # Re-add SSH rule for current IP if it's not already there (user's IP may have changed).
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "${USER_IP}/32" 2>/dev/null || echo "  SSH rule for $USER_IP already present."
fi

# Launch instance only if none tagged Project=forge-transpile exists + running.
EXISTING_INSTANCE=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:$TAG_KEY,Values=$TAG_VAL" "Name=instance-state-name,Values=running,pending" \
  --query "Reservations[0].Instances[0].InstanceId" --output text 2>/dev/null || echo "None")

if [[ "$EXISTING_INSTANCE" == "None" || -z "$EXISTING_INSTANCE" ]]; then
  echo "Launching new EC2 instance..."
  INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --user-data file://"$(dirname "$0")/user-data.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VAL},{Key=Name,Value=$INSTANCE_NAME}]" \
    --query "Instances[0].InstanceId" --output text)
  echo "Launched instance: $INSTANCE_ID"
  echo "Waiting for instance to be running..."
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
else
  INSTANCE_ID="$EXISTING_INSTANCE"
  echo "Existing instance found: $INSTANCE_ID; reusing."
fi

# Fetch public IP + DNS.
PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
PUBLIC_DNS=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicDnsName" --output text)

echo ""
echo "=== Provisioning complete ==="
echo "  Instance ID:  $INSTANCE_ID"
echo "  Public IP:    $PUBLIC_IP"
echo "  Public DNS:   $PUBLIC_DNS"
echo "  SSH key:      ~/.ssh/$KEY_NAME.pem"
echo ""
echo "Next steps:"
echo "  1. Add A record in Route 53: forge.thecodingarena.com → $PUBLIC_IP"
echo "     (See deploy/DEPLOY.md, Route 53 section.)"
echo "  2. Wait ~5 min for DNS propagation. Test with: dig forge.thecodingarena.com"
echo "  3. SSH in: ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP"
echo "  4. Run: bash deploy/post-deploy-setup.sh (script will guide you)"
```

CC writes the actual AMI ID lookup via `aws ec2 describe-images --region us-west-2 --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" --query "sort_by(Images, &CreationDate)[-1].ImageId"` (or similar) — embed the actual current Ubuntu 22.04 LTS AMI ID in the script for `us-west-2` rather than a placeholder.

### `deploy/user-data.sh`

Cloud-init script that runs on first instance boot. Keep this MINIMAL — just system package installs + user creation. App-specific setup is post-deploy because the deploy key isn't on the instance yet at first boot.

```bash
#!/bin/bash
# Runs once on EC2 first boot via cloud-init.
# Logs to /var/log/cloud-init-output.log for debugging.

set -e
exec > >(tee /var/log/forge-transpile-userdata.log) 2>&1

apt-get update -y
apt-get install -y software-properties-common
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip \
                   nginx certbot python3-certbot-nginx git curl jq

# Create app user.
useradd -m -s /bin/bash forge || true

echo "User-data setup complete. Ready for post-deploy-setup.sh."
```

### `deploy/nginx.conf`

Production-ready, no placeholders.

```nginx
# forge-transpile nginx config — forge.thecodingarena.com
# Symlink to /etc/nginx/sites-enabled/ after copying to sites-available/.

server {
    listen 80;
    server_name forge.thecodingarena.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name forge.thecodingarena.com;

    ssl_certificate /etc/letsencrypt/live/forge.thecodingarena.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/forge.thecodingarena.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Plugin runs in Electron; allow its origin.
    add_header Access-Control-Allow-Origin "app://obsidian.md" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Allow-Methods "POST, OPTIONS" always;

    if ($request_method = OPTIONS) {
        return 204;
    }

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # /generate calls may take several seconds; allow generous timeout.
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
    }
}
```

### `deploy/forge-transpile.service`

Production systemd unit. No placeholders.

```ini
[Unit]
Description=Forge Transpile Service
After=network.target

[Service]
Type=simple
User=forge
WorkingDirectory=/home/forge/forge-transpile
EnvironmentFile=/home/forge/forge-transpile/.env
ExecStart=/home/forge/forge-transpile/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`EnvironmentFile` reads `.env` style — the same `.env` we set up locally for the smoke. systemd will refuse to start if it doesn't exist; that's the right failure mode (forces the user to create it before enabling).

### `deploy/post-deploy-setup.sh`

Runs ON the EC2 instance after SSH'ing in. Walks the user through repo clone + env setup + systemd + Let's Encrypt + service start.

```bash
#!/usr/bin/env bash
# Runs ON the EC2 instance, as the user (ubuntu), after first SSH.
# Handles repo clone, .env, systemd, nginx, Let's Encrypt, service start.

set -euo pipefail

REPO_URL="git@github.com:frmoded/forge-transpile.git"
REPO_DIR="/home/forge/forge-transpile"

echo "=== forge-transpile EC2 post-deploy setup ==="
echo ""

# Step 1: deploy key
echo "Step 1: deploy key for cloning the private repo."
echo "  If you haven't already scp'd a deploy key to this instance:"
echo "    From your local machine:"
echo "      scp -i ~/.ssh/forge-transpile-key.pem ~/.ssh/forge_deploy_key ubuntu@<this-ip>:/home/ubuntu/forge_deploy_key"
echo "      scp -i ~/.ssh/forge-transpile-key.pem ~/.ssh/forge_deploy_key.pub ubuntu@<this-ip>:/home/ubuntu/forge_deploy_key.pub"
echo "    Then add forge_deploy_key.pub to GitHub: Settings → Deploy keys → Add deploy key (read-only is fine)."
echo ""
read -p "Have you scp'd the deploy key + added it to GitHub? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Setup paused; complete the deploy key step first."
  exit 1
fi

# Install deploy key for the forge user.
sudo mkdir -p /home/forge/.ssh
sudo cp /home/ubuntu/forge_deploy_key /home/forge/.ssh/id_ed25519  # or id_rsa
sudo cp /home/ubuntu/forge_deploy_key.pub /home/forge/.ssh/id_ed25519.pub
sudo chown -R forge:forge /home/forge/.ssh
sudo chmod 700 /home/forge/.ssh
sudo chmod 600 /home/forge/.ssh/id_ed25519
sudo -u forge ssh-keyscan -H github.com >> /home/forge/.ssh/known_hosts 2>/dev/null

# Step 2: clone repo
echo ""
echo "Step 2: cloning forge-transpile..."
sudo -u forge git clone "$REPO_URL" "$REPO_DIR"

# Step 3: venv + install
echo ""
echo "Step 3: setting up venv + installing deps..."
sudo -u forge python3.11 -m venv "$REPO_DIR/venv"
sudo -u forge "$REPO_DIR/venv/bin/pip" install --upgrade pip
sudo -u forge "$REPO_DIR/venv/bin/pip" install -e "$REPO_DIR"

# Step 4: .env
echo ""
echo "Step 4: .env setup."
echo "  Create $REPO_DIR/.env with your secrets:"
echo "    FORGE_TRANSPILE_SECRET=<long token, same as you used locally>"
echo "    ANTHROPIC_API_KEY=<your real Anthropic key>"
echo "    PORT=8001"
echo ""
echo "  Easiest path: scp .env from your local machine."
echo "    From local: scp -i ~/.ssh/forge-transpile-key.pem ~/projects/forge-transpile/.env ubuntu@<this-ip>:/tmp/.env"
echo "    Then on this instance: sudo mv /tmp/.env $REPO_DIR/.env && sudo chown forge:forge $REPO_DIR/.env && sudo chmod 600 $REPO_DIR/.env"
echo ""
read -p "Is .env in place at $REPO_DIR/.env? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Setup paused; create .env first."
  exit 1
fi

# Step 5: systemd
echo ""
echo "Step 5: installing systemd unit..."
sudo cp "$REPO_DIR/deploy/forge-transpile.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable forge-transpile
sudo systemctl start forge-transpile
sleep 2
sudo systemctl status forge-transpile --no-pager | head -20

# Step 6: nginx
echo ""
echo "Step 6: installing nginx config..."
sudo cp "$REPO_DIR/deploy/nginx.conf" /etc/nginx/sites-available/forge-transpile
sudo ln -sf /etc/nginx/sites-available/forge-transpile /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Step 7: Let's Encrypt
echo ""
echo "Step 7: Let's Encrypt cert for forge.thecodingarena.com."
echo "  This requires DNS to be resolving forge.thecodingarena.com → this instance's IP."
echo "  Verify with: dig forge.thecodingarena.com A +short"
echo ""
read -p "Is DNS resolving forge.thecodingarena.com to this instance? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Setup paused; wait for DNS propagation, then re-run from step 7."
  exit 1
fi
sudo certbot --nginx -d forge.thecodingarena.com --non-interactive --agree-tos -m <your-email-placeholder>

# Step 8: verify
echo ""
echo "=== Setup complete ==="
echo "  Test: curl https://forge.thecodingarena.com/health"
echo "  Expect: {\"status\":\"ok\",\"version\":\"0.1.0\"}"
echo "  Service logs: sudo journalctl -u forge-transpile -f"
echo "  Nginx logs: sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log"
```

CC fills the `<your-email-placeholder>` in the certbot line either via a script arg, an env var prompt, or leaves a clear marker for the user to edit before running.

### `deploy/smoke.sh`

Run from local machine after deploy completes.

```bash
#!/usr/bin/env bash
# Smoke-test the deployed forge-transpile service.
# Run from local machine after deploy.
#
# Prereqs:
#   - forge.thecodingarena.com resolves to the EC2 instance (dig forge.thecodingarena.com)
#   - .env has the same FORGE_TRANSPILE_SECRET as deployed

set -euo pipefail

URL="https://forge.thecodingarena.com"

# Load local .env to get the secret.
if [[ -f "$HOME/projects/forge-transpile/.env" ]]; then
  set -a; . "$HOME/projects/forge-transpile/.env"; set +a
fi
SECRET="${FORGE_TRANSPILE_SECRET:?FORGE_TRANSPILE_SECRET not set in env}"

echo "=== Smoke testing $URL ==="

# /health
echo -n "GET /health: "
RES=$(curl -sS "$URL/health")
[[ "$RES" == *'"status":"ok"'* ]] && echo "✓ $RES" || { echo "✗ unexpected: $RES"; exit 1; }

# /generate without auth → 401
echo -n "POST /generate (no auth): "
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL/generate" -H "Content-Type: application/json" -d '{}')
[[ "$STATUS" == "401" ]] && echo "✓ 401" || { echo "✗ expected 401, got $STATUS"; exit 1; }

# /generate wrong token → 401
echo -n "POST /generate (wrong token): "
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL/generate" \
  -H "Authorization: Bearer wrong-token" -H "Content-Type: application/json" -d '{}')
[[ "$STATUS" == "401" ]] && echo "✓ 401" || { echo "✗ expected 401, got $STATUS"; exit 1; }

# /generate valid → expect Python with "42"
echo -n "POST /generate (valid auth, real Anthropic): "
RES=$(curl -sS -X POST "$URL/generate" \
  -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"snippet_id":"demo","description":"Return the integer 42.","english":"Return forty-two.","active_domains":[]}')
[[ "$RES" == *'"code":"def compute'* && "$RES" == *'42'* ]] && \
  echo "✓ valid Python returned" || { echo "✗ unexpected: $RES"; exit 1; }

echo ""
echo "=== All smoke checks passed ==="
echo "forge.thecodingarena.com is live and serving."
```

### `deploy/DEPLOY.md`

Comprehensive walkthrough. Sections (each with copy-paste commands + expected output):

1. **Prereqs** — AWS CLI configured (`aws configure list`), jq installed, AWS account has us-west-2 access, forge.thecodingarena.com registered in Route 53.
2. **Deploy key setup** — generate `~/.ssh/forge_deploy_key` (ssh-keygen), add `forge_deploy_key.pub` to forge-transpile repo's Deploy keys (read-only).
3. **Provision EC2** — `bash deploy/provision-ec2.sh`. Captures public IP printed at end.
4. **DNS** — AWS console: Route 53 → Hosted zones → forge.thecodingarena.com → Create record → A record → forge.thecodingarena.com → <EC2 IP> → 300s TTL. Verify with `dig forge.thecodingarena.com A +short`.
5. **scp deploy key + .env** — exact commands using the SSH key from step 3.
6. **SSH + post-deploy** — `ssh -i ~/.ssh/forge-transpile-key.pem ubuntu@<EC2-IP>`, then `bash forge-transpile/deploy/post-deploy-setup.sh` (or copy the script up first if not in repo path).
7. **Smoke** — back on local: `bash deploy/smoke.sh`. Expected outputs.
8. **Cost** — t3.micro ~$8/mo (free tier first year), Route 53 hosted zone ~$0.50/mo, domain $12/yr, data transfer minimal. Total ~$10-15/mo + $12/yr.
9. **Operational notes** — restart service (`sudo systemctl restart forge-transpile`), redeploy code (`git pull` + restart), view logs (`journalctl -u forge-transpile -f`), rotate auth token (edit .env + restart), update Pyodide via plugin's setup-assets (n/a — different repo).
10. **Tear-down** — if you ever need to destroy: terminate EC2 instance, delete security group, delete Route 53 record, free EIP. Each is a one-liner.

## Implementation notes

### What CC can verify in the sandbox

- `shellcheck` on each .sh script (if available) — catches syntax + common bash mistakes.
- `nginx -t -c deploy/nginx.conf` — syntax-check the nginx config if nginx is installed.
- `systemd-analyze verify deploy/forge-transpile.service` — syntax-check the systemd unit if systemd-analyze is available.
- `aws ec2 describe-images --dry-run` etc. won't work without creds — instead CC verifies the AWS CLI commands are syntactically correct by `aws ec2 describe-images help` or similar offline checks.
- Lookup of the actual current Ubuntu 22.04 LTS AMI ID for us-west-2 — CC documents the lookup query and includes the current ID at write-time.

### What only the user can verify

- AWS CLI commands actually run against AWS (creds in user's environment).
- The EC2 instance comes up, cloud-init completes.
- DNS propagates.
- Let's Encrypt cert issues.
- The smoke script returns 200 over HTTPS.

### Repo state hygiene

The `deploy/aws-deploy-state.json` (if any script generates state) goes in .gitignore. The deploy key NEVER goes in git — generated locally, added to repo via GitHub UI, copied to EC2 via scp.

The certbot email field in `post-deploy-setup.sh` should be a placeholder until the user fills it.

### Anthropic API key + token

The .env on the EC2 instance contains both:
- `FORGE_TRANSPILE_SECRET` — the same long hash the user generated locally for the smoke test
- `ANTHROPIC_API_KEY` — the user's existing capped key

User scp's their local .env file up. Easiest path. Document in DEPLOY.md.

## Tests + smoke

### Auto-verified by CC

- `shellcheck deploy/*.sh` clean (if shellcheck available in sandbox).
- `nginx -t -c deploy/nginx.conf` clean (if nginx installed; otherwise document the syntax-check command).
- `systemd-analyze verify deploy/forge-transpile.service` clean (if available).
- AWS CLI commands documented + cross-referenced against `aws ec2 ... help` (no live API calls).
- Current Ubuntu 22.04 LTS AMI ID for us-west-2 embedded in provision-ec2.sh — CC fetches via a documented lookup at write time (does not assume hardcoded value).
- All deploy artifacts in place under `deploy/`.
- Plugin tests in forge-transpile: 16/16 still pass (no service code changes).
- Git ops: commit with `[2026-05-25-0000-alpha-ec2-deployment]` prefix; push to main.

### Deferred to user (the actual deploy)

- `aws configure` if not already done (provide CLI access keys from AWS console).
- Register forge.thecodingarena.com in Route 53 if not already done.
- `ssh-keygen -t ed25519 -f ~/.ssh/forge_deploy_key -N ""` to generate deploy key.
- Add `forge_deploy_key.pub` to forge-transpile repo's Deploy keys via GitHub UI.
- `bash deploy/provision-ec2.sh` — provisions EC2 in us-west-2.
- Add A record in Route 53 console.
- `scp` deploy key + .env to instance.
- `ssh` in, run `post-deploy-setup.sh`.
- `bash deploy/smoke.sh` from local — verify all three checks pass.

## Out of scope

- Plugin endpoint swap. Next prompt after this deploys cleanly.
- Plugin settings UI for the token. Same.
- CI/CD pipeline for the service.
- CloudWatch monitoring / alerting.
- Secrets Manager integration.
- Auto-scaling, load balancer.
- Per-user token management.
- Service-level rate limiting.
- Anything in forge-client-obsidian or forge engine repos.

## Report when done

Per protocol 8-section.

1. **Files added/modified** — deploy/* tree, .gitignore.
2. **Static-check output** — shellcheck, nginx -t, systemd-analyze results.
3. **AMI ID lookup** — what CC found via `describe-images` query, what's embedded in the script.
4. **DEPLOY.md summary** — section headings + brief description of each.
5. **Manual deploy guidance for user** — high-level summary of the 9-step DEPLOY.md flow + estimated time per step.
6. **Git ops** — commit SHA on forge-transpile/main.
7. **Any deviation and why.**
8. **One observation** — anything worth flagging for ops or future hardening.

## Commits + push

Single forge-transpile commit per the default-on git ops protocol. Push to main. Tag NOT created (this is deploy infra, not a service release; tag when the service itself bumps version).

## Don'ts

- **Don't actually provision EC2 from CC's sandbox.** No AWS creds. Scaffold artifacts only.
- **Don't commit any .env, deploy key, or secrets.** .gitignore should already handle .env; verify deploy key files (`*.pem`, `*_deploy_key*`) are also covered.
- **Don't touch the plugin** or forge engine.
- **Don't set up CI/CD.**
- **Don't pre-create the Route 53 A record from CLI.** User does that in console — they need to verify the EC2 IP first.
- **Don't hardcode the user's email in the certbot command.** Placeholder; user fills before running.
- **Don't add deployment automation for monitoring, alerting, secrets manager.** All deferred.
- **Don't bundle anything from Phase 3 (music21).**
- **Don't proceed past a blocker** — if shellcheck/nginx -t/systemd-analyze reveals a syntax issue CC can't resolve cleanly, route to questions/ with the specific error.
