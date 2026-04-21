# SECURITY.md — EMR

This document tracks security posture and known incidents that require
remediation. Treat every entry here as audit-relevant.

## Reporting a vulnerability

Please report security issues privately to the IT / DevSecOps lead rather
than opening a public GitHub issue. Include:

- Affected component(s) and version/commit
- Reproduction steps
- Observed vs. expected behaviour
- (If applicable) proof-of-concept — redacted of real patient data

## Known incidents

### 2026-04-20 — TLS private key committed to git (`infra/ssl/medical.npa.local.key`)

**Status:** remediated on disk; **history rewrite + key rotation still required.**

**What happened.** A TLS private key + certificate pair for the internal host
`medical.npa.local` was committed under `infra/ssl/`:

- `infra/ssl/medical.npa.local.crt`
- `infra/ssl/medical.npa.local.key`  ← **private key**

Both files were tracked in git for at least one commit, meaning the private
key is retrievable by anyone with clone access to any mirror of this
repository, even after the files have been removed from `HEAD`.

**What has been done.**

- `git rm -r infra/ssl` staged for the next commit — the files are no
  longer in the working tree.
- `.gitignore` updated with `ssl/`, `*.key`, `*.pem` so they can't be
  recommitted by accident.
- `infra/` folder removed entirely (along with leaked backups, stale
  compose files, and runtime logs that were also tracked — see below).

**What still needs to be done.**

1. **Rotate the certificate and key.** Treat the leaked key as compromised
   and issue a new certificate for `medical.npa.local`. The new private
   key MUST be stored out-of-repo (e.g. injected via the
   `ssl/` bind mount on the production host, which is now gitignored).
2. **Scrub the leaked key from git history** on every copy of this repo
   (local clones, mirrors, CI caches). Typical options:

   ```bash
   # using git filter-repo (recommended)
   git filter-repo --path infra/ssl/medical.npa.local.key --invert-paths
   git filter-repo --path infra/ssl/medical.npa.local.crt --invert-paths

   # or BFG:
   bfg --delete-files medical.npa.local.key
   bfg --delete-files medical.npa.local.crt
   ```

   Then force-push to the remote and have every collaborator re-clone.
3. **Invalidate any sessions / tokens** issued while the compromised key
   was in use, in case an attacker intercepted traffic.
4. **Audit access logs** on `medical.npa.local` for anomalous TLS
   sessions during the period the key was exposed.

Until steps 1–3 are complete, this incident remains **open**.

### 2026-04-20 — Runtime artifacts previously committed under `infra/`

In the same cleanup pass we also removed the following, which were never
supposed to be in the repo:

- `infra/backups/` — two production DB dumps (`*.sql`) and the backup cron
  log. These may contain PHI. Verify they exist in the authoritative backup
  location and then destroy any personal copies.
- `infra/logs/production/gunicorn-*.log` — production access/error logs.
  Low sensitivity, but may contain PII in URLs / error payloads.
- `infra/deployment/docker-compose.*.yml` — stale duplicates of the compose
  files at the repo root. No secrets, just configuration drift.

All of the above are now git-ignored via the `backups/`, `logs/`, and
`ssl/` rules in `.gitignore`. Same history-scrub steps apply if you need
the `.sql` files fully purged from the git history.

## Baseline expectations

- **Never commit** real secrets, PHI, private keys, or production dumps.
  `.gitignore` covers the obvious patterns; review it before moving
  generated/runtime content into a new directory.
- Runtime secrets live in `backend/env/{local,stag,prod}.env` and
  `frontend/.env.{local,stag,prod}` — these are `.env.*`-gitignored.
  Public vars (`NEXT_PUBLIC_*`) are the only env values that enter the
  image, and they do so via build args from `docker-compose.prod.yml`.
- TLS material is injected on the host at deploy time via an `ssl/` bind
  mount (see `docker-compose.prod.yml`). The contents of that directory
  are gitignored.
- Backups are written to a bind-mounted `backups/` directory by the
  `emr-backup-prod` sidecar. That directory is gitignored.
- Production deploys go through `scripts/production/env-manager.sh deploy`,
  which takes a pre-deploy DB snapshot and rolls back automatically on
  health check failure.
