# Deployment Guide

How to run the Project Management API in production. Written for a developer
who has the repository and needs to get it serving traffic safely.

Nothing here assumes a particular cloud provider, and no credentials are
included. Substitute your own host names and secrets.

---

## Contents

1. [Production architecture](#1-production-architecture)
2. [Required environment variables](#2-required-environment-variables)
3. [Deployment steps](#3-deployment-steps)
4. [Database migrations](#4-database-migrations)
5. [Commands reference](#5-commands-reference)
6. [Health checks](#6-health-checks)
7. [Production checklist](#7-production-checklist)
8. [Known limitations](#8-known-limitations)

---

## 1. Production architecture

```
                    ┌──────────────────────────┐
   browser ────────▶│  TLS terminator / proxy  │  nginx, Caddy, ALB, ...
                    │  (HTTPS, HTTP/1.1, HSTS) │
                    └────────────┬─────────────┘
                                 │ http (private network)
                    ┌────────────▼─────────────┐
                    │   API instance(s)        │  node server.js
                    │   :5000                  │  stateless
                    │                          │
                    │  /api/v1/**              │  JSON API
                    │  /api/v1/health          │  liveness  (no DB)
                    │  /api/v1/health/ready    │  readiness (pings DB)
                    │  /uploads/avatars/**     │  public, static
                    │  /uploads/*  (else)      │  404 — attachments are private
                    └───┬──────────────────┬───┘
                        │                  │
        ┌───────────────▼──────┐   ┌───────▼────────────────┐
        │  MongoDB             │   │  Upload volume         │
        │  replica set / Atlas │   │  /app/src/uploads      │
        └──────────────────────┘   └────────────────────────┘
```

### Properties that matter for how you deploy

**The API is stateless.** No sessions are stored server-side: the JWT lives in
the client's cookie, and every request is authenticated from the token alone.
Any instance can serve any request, so horizontal scaling needs no sticky
sessions. (The one exception is the rate limiter — see
[Known limitations](#8-known-limitations).)

**Two stores must persist.** MongoDB, and the upload volume. A container
replacement that loses the upload volume silently discards every avatar and
attachment.

**One port.** The process listens on `PORT` (default 5000) and serves
everything — API, health, and public avatars — from that single port. There is
no second port to expose.

**TLS is terminated in front.** The app speaks plain HTTP and relies on the
proxy for HTTPS. Cookies are `Secure` in production, so **without HTTPS no
client can stay logged in.**

**The database is never public.** Only the API needs to reach MongoDB. Do not
publish the database port on a public host.

### Choosing a target

| Target                                                       | When it fits                       | Notes                                                      |
| ------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------- |
| Docker on a single VPS                                       | Small teams, staging, self-hosting | `docker-compose.yml` in this repository covers it          |
| Managed container platform (ECS, Cloud Run, App Platform, …) | Most production use                | Point it at the `Dockerfile`; use a managed MongoDB        |
| Bare metal / systemd                                         | Existing infrastructure            | Run `node server.js` under systemd; set `WorkingDirectory` |

**Use a managed MongoDB** (Atlas, DocumentDB, …) for anything real. A database
on the same host as the app is a single point of failure and is lost when the
host is replaced. `npm run preflight` warns about this.

---

## 2. Required environment variables

The app validates its configuration at startup and **refuses to boot** on a
fatal mistake. `npm run preflight` checks the same values, plus the things that
are legal but wrong for production, before you start.

### Required

| Variable            | Notes                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | Must be `production`.                                                                          |
| `MONGODB_URI`       | Connection string. Include credentials.                                                        |
| `JWT_ACCESS_SECRET` | **At least 32 characters.** `openssl rand -hex 32`. Must not be a placeholder.                 |
| `CORS_ORIGINS`      | Comma-separated browser origins. **Empty in production = no browser client can call the API.** |

### Strongly recommended

| Variable                              | Default              | Why                                                                                                                                |
| ------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`                         | `0`                  | Set to the number of proxy hops. Without it, rate limiting sees the proxy's IP and one client can exhaust the budget for everyone. |
| `PORT`                                | `5000`               | Must match what the platform routes to.                                                                                            |
| `SHUTDOWN_TIMEOUT_MS`                 | `10000`              | Must be **below** the platform's grace period, or the platform SIGKILLs before the graceful path finishes.                         |
| `LOG_LEVEL`                           | `info` in production | Raise to `debug` only while diagnosing.                                                                                            |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `5000`               | How long to wait for a reachable database before failing.                                                                          |

### Optional (defaults are usually fine)

| Variable                | Default              |
| ----------------------- | -------------------- |
| `JWT_ACCESS_EXPIRES_IN` | `15m`                |
| `COOKIE_MAX_AGE`        | `900000` (15 min)    |
| `BCRYPT_SALT_ROUNDS`    | `10` (must be 10–15) |
| `RATE_LIMIT_MAX`        | `1000`               |
| `RATE_LIMIT_WINDOW_MS`  | `900000` (15 min)    |

### Handling secrets

- **Never commit a real value.** `.env` is gitignored; `.env.example` documents
  the shape only.
- Prefer the platform's secret manager over an env file. If you must use a file,
  `chmod 600` it and keep it outside the image.
- **`JWT_ACCESS_SECRET` rotation logs everyone out.** There is no key rollover:
  all tokens are signed with the current secret, so changing it invalidates
  every session at once. Rotate during a maintenance window.
- `npm run preflight` never prints a secret — only its length and a verdict.

---

## 3. Deployment steps

### Option A — Docker on a host

```bash
# 1. Get the code
git clone <your-repository-url> project-management-api
cd project-management-api/server

# 2. Create the production environment file (never commit it)
cp .env.example .env.production
chmod 600 .env.production
#    Fill in: JWT_ACCESS_SECRET, MONGODB_URI, CORS_ORIGINS, TRUST_PROXY
#    Generate the secret with: openssl rand -hex 32

# 3. Add the compose-only variables
#    MONGO_ROOT_PASSWORD=<a strong password>   (only if you use the bundled mongo)

# 4. Check the configuration before building
npm ci
npm run preflight

# 5. Build and start
docker compose up -d --build

# 6. Run migrations, if this is not a fresh database
docker compose exec api npm run migrate:task-comments
docker compose exec api npm run migrate:project-member-roles

# 7. Verify
curl -fsS https://your-api-host/api/v1/health
curl -fsS https://your-api-host/api/v1/health/ready
```

### Option B — Platform build (managed container host)

1. Point the platform at `server/Dockerfile`.
2. Set the environment variables from [section 2](#2-required-environment-variables)
   in the platform's configuration.
3. Set the health check to **`GET /api/v1/health`** (liveness) and, if the
   platform distinguishes them, **`GET /api/v1/health/ready`** for readiness.
4. Attach a **persistent volume mounted at `/app/src/uploads`**. Without this,
   uploads are lost on every deploy.
5. Set the termination grace period **above** `SHUTDOWN_TIMEOUT_MS`.
6. Run migrations as a one-off job — **not** in the start command. See
   [section 4](#4-database-migrations).

### Option C — systemd (bare metal)

```ini
# /etc/systemd/system/project-management-api.service
[Unit]
Description=Project Management API
After=network.target

[Service]
Type=simple
User=pmapi
Group=pmapi

# MUST be set: the app resolves upload paths relative to the project, but a
# service without this runs from / and log/output paths become confusing.
WorkingDirectory=/srv/project-management-api/server

# Secrets come from a file outside the repository, readable only by this user.
EnvironmentFile=/etc/project-management-api/env

ExecStart=/usr/bin/node server.js

Restart=on-failure
RestartSec=5

# Give the graceful shutdown handler time to drain. Must exceed
# SHUTDOWN_TIMEOUT_MS (default 10s).
TimeoutStopSec=30

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/project-management-api/server/src/uploads

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now project-management-api
sudo journalctl -u project-management-api -f
```

Note `ReadWritePaths`: `ProtectSystem=strict` makes the filesystem read-only,
so the upload directory must be listed explicitly or uploads fail.

### Zero-downtime deploys

The API is stateless, so a rolling replace works: start the new instance, wait
for `/api/v1/health/ready` to return 200, move traffic, then stop the old one.
The old instance drains in-flight requests on SIGTERM.

**The one thing that breaks this** is a schema change that is not
backward-compatible. Migrations that add fields are safe; ones that rename or
remove them are not. Expand first, migrate, then contract.

---

## 4. Database migrations

### They do not run automatically

**Migrations are never executed on application start.** They live in
`src/migrations/` as standalone scripts that nothing imports — verified by
`grep -r "migrations/" src/ app.js server.js`, which returns no import.

This is deliberate. An app that migrates on boot runs the migration once per
instance, in parallel, on every deploy — including the deploys that are just a
config change. On a multi-instance rollout that means several processes racing
to mutate the same collection, with no way to abort a bad migration before it
has already touched production data.

### Running one safely

Each migration is idempotent and can be re-run. The procedure:

```bash
# 1. BACK UP FIRST. This is not optional — a migration is a bulk write.
mongodump --uri "$MONGODB_URI" --out ./backup-$(date +%F-%H%M)

# 2. Announce a maintenance window if the migration is not additive.

# 3. Run against a copy of production data first, and check the row counts
#    the script reports against what you expect.

# 4. Run the migration. It exits non-zero on failure, so `&&` is meaningful.
MONGODB_URI="<production-uri>" npm run migrate:task-comments

# 5. Verify in the database, not just in the log output.

# 6. Only then deploy the application version that depends on it.
```

In Docker:

```bash
docker compose exec api npm run migrate:task-comments
```

### Available migrations

| Command                                | Purpose                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run migrate:task-comments`        | Backfills the Phase 10 comment model: `user` → `author`, derives `project` from the task, and sets the soft-delete defaults. |
| `npm run migrate:project-member-roles` | Backfills project member roles.                                                                                              |

Both read `MONGODB_URI` directly from the environment. They deliberately do not
load the application config, so they can run without a full production
environment (no JWT secret needed) — which also means **`MONGODB_URI` must be
set explicitly** when you run them.

### Writing a new migration

1. Add a file to `src/migrations/`, self-contained and runnable via `node`.
2. Make it **idempotent** — re-running it must not corrupt data.
3. Set `process.exitCode = 1` on failure. A migration that exits 0 after
   failing will be treated as a success by every deploy script that calls it.
4. Log counts, so an operator can sanity-check the result.
5. Add an npm script and a row in the table above.

---

## 5. Commands reference

Run from `server/`.

| Purpose                            | Command                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| **Startup (production)**           | `npm run start:prod` — runs the preflight, then `node server.js` |
| Startup (platform sets `NODE_ENV`) | `npm start`                                                      |
| Development                        | `npm run dev`                                                    |
| **Tests**                          | `npm test`                                                       |
| Tests, watch mode                  | `npm run test:watch`                                             |
| Tests with coverage                | `npm run test:coverage`                                          |
| **Preflight check**                | `npm run preflight`                                              |
| Migrations                         | `npm run migrate:task-comments`                                  |
| Docs verification                  | `npm run docs:verify`                                            |
| Route inventory                    | `npm run routes`                                                 |
| Lint / format                      | `npm run lint`, `npm run format:check`                           |

`start:prod` is a plain `&&` chain, so it works on Windows and Linux alike and
does not need `cross-env`. It relies on `NODE_ENV` being set by the platform —
the preflight fails loudly if it is not `production`.

---

## 6. Health checks

Two endpoints, answering different questions. Using the wrong one is a common
way to turn a partial outage into a total one.

### `GET /api/v1/health` — liveness

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy",
  "data": { "status": "ok", "uptimeSeconds": 812, "environment": "production", "version": "1.0.0" }
}
```

**Always 200 while the process can serve a request. Does not touch the
database.**

Use this as the container liveness probe. It deliberately ignores the database:
if liveness depended on the database, a brief blip would fail the probe and the
orchestrator would restart every healthy instance — which cannot fix a database
problem, and guarantees an outage.

### `GET /api/v1/health/ready` — readiness

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is ready",
  "data": { "status": "ready", "checks": { "database": { "status": "up", "latencyMs": 3 } } }
}
```

Returns **503** when the database is unreachable:

```json
{
  "success": false,
  "statusCode": 503,
  "message": "Service is not ready",
  "data": {
    "status": "not_ready",
    "checks": { "database": { "status": "down", "reason": "not connected" } }
  }
}
```

Use this for **load-balancer readiness**. An instance whose database connection
is down is removed from the pool but left running, so it can recover by itself.

It pings the database rather than reading the driver's connection state, which
can report "connected" while the server is unreachable. The ping is bounded to
2 seconds.

Both endpoints are mounted **ahead of the rate limiter**, so probes always get
through even under heavy traffic. Successful probes are not logged, to keep
them out of the log store; failing probes are.

### `GET /api/v1/openapi.json`

Serves the OpenAPI 3.1 document. Returns **503** if the document was not
generated (`npm run docs:generate`).

---

## 7. Production checklist

Work through this before the first deploy, and re-run it after any
infrastructure change.

### Configuration

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` is at least 32 random characters, **not** the
      placeholder. Rotated away from anything used in development.
- [ ] `MONGODB_URI` points at the production database and includes credentials.
- [ ] `CORS_ORIGINS` lists the real browser origins, all HTTPS, no `*`.
- [ ] `TRUST_PROXY` matches the actual number of proxy hops.
- [ ] `SHUTDOWN_TIMEOUT_MS` is **below** the platform's grace period.
- [ ] `npm run preflight` exits 0.

### Secrets

- [ ] No secret is committed: `git log -p -- .env` shows nothing, and
      `git ls-files | grep -i env` lists only `.env.example`.
- [ ] The production environment file is `chmod 600` and outside the repository.
- [ ] The `.env` file is not in the Docker image:
      `docker run --rm <image> ls -a /app` shows no `.env`.
- [ ] Database credentials are scoped to the application database, not an
      admin account.

### Data

- [ ] MongoDB is a replica set or managed service with backups enabled.
- [ ] A **restore** has been tested — an untested backup is not a backup.
- [ ] The upload volume is mounted at `/app/src/uploads` and is persistent.
- [ ] Backups cover the upload volume too, not only the database.

### Network and TLS

- [ ] HTTPS terminates in front of the API; HTTP redirects to it.
- [ ] The database port is **not** reachable from the public internet.
- [ ] `HSTS` is present in responses (helmet sets it).

### Runtime

- [ ] Liveness probe → `GET /api/v1/health`
- [ ] Readiness probe → `GET /api/v1/health/ready`
- [ ] Container runs as a non-root user (`USER node` in the Dockerfile).
- [ ] The platform restarts the process on failure.
- [ ] Logs are collected and retained; production output is JSON, one object
      per line.
- [ ] `LOG_LEVEL` is `info` (not `debug`).

### Before announcing

- [ ] `npm test` passes.
- [ ] `npm run docs:verify` passes.
- [ ] Migrations have been run and verified (section 4).
- [ ] A full user journey works against the deployed URL: register, log in,
      create a workspace, create a project, create a task, upload a file.
- [ ] A failed login returns 401 and a validation error returns 400 with the
      standard envelope.

---

## 8. Known limitations

Stated plainly, because each one affects how you should operate this service.

### Rate limiting is per-process

The limiter keeps counters in the memory of each process. With **N** instances,
the effective limit is **N × `RATE_LIMIT_MAX`**, and a client that is throttled
on one instance is not throttled on another.

For a single instance this is correct and adequate. For horizontal scaling,
replace it with a shared store (Redis) or a vetted middleware with a Redis
store. The trade-off is documented in `src/middlewares/rateLimit.middleware.js`.

### Logout does not revoke the token

There is no server-side session store, so `POST /auth/logout` clears the cookie
but the token stays valid until it expires (15 minutes by default). A captured
token remains usable for that window.

The only early invalidation is a **password change**, which invalidates every
token issued before it. Lowering `JWT_ACCESS_EXPIRES_IN` narrows the window at
the cost of more frequent re-authentication.

### The rate-limit budget is shared per IP

Because the limiter keys on IP, all users behind one NAT or corporate proxy
share a single budget. `TRUST_PROXY` must be correct for the real client IP to
be used at all.

### Uploads are on local disk

The storage provider writes to the container filesystem. This is correct for a
single host with a persistent volume, but it does **not** work across multiple
hosts: an upload served by instance A is invisible to instance B.

Scaling beyond one host requires replacing the storage provider with object
storage (S3 or equivalent). The interface in `src/storage/storageProvider.js`
exists to make that swap contained.

### Graceful shutdown cannot be exercised on Windows

The shutdown handler is registered for `SIGTERM` and `SIGINT`. Node on Windows
**does not deliver POSIX signals**: `process.kill(pid, 'SIGTERM')` terminates the
process immediately instead of running the handler.

This does not affect production — Linux hosts and Docker deliver `SIGTERM`
normally, and both shutdown paths have been verified there:

| Path    | Behaviour                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal  | Drains in-flight requests, closes the database, exits 0. Verified at ~300 ms with an idle keep-alive socket held open — the case the original implementation hung on. |
| Timeout | If a request never completes, exits 1 at `SHUTDOWN_TIMEOUT_MS` rather than hanging. Verified at exactly the configured deadline.                                      |

If you develop on Windows, do not conclude from a local `Ctrl+C` that the
handler is broken — test shutdown in the container.

### No pagination on some lists

Labels, subtasks, workspace members and comment lists are returned in full.
They are naturally bounded in practice, but a project with tens of thousands of
labels would return them all in one response.

### Search is a regex scan

`search` is a case-insensitive regex over title and description. It is correct
and safe (metacharacters are escaped), but it cannot use an index and will slow
down as the task collection grows. A text index or a search service is the
eventual answer.

### `task:delete` exists but is unreachable

The permission is defined in the project role table, but no delete endpoint is
exposed — tasks are archived instead. The permission is currently inert.

### Documentation gaps

- Response schemas in the OpenAPI document are hand-authored from the models.
  Request schemas are generated from the validators; a change to a _response_
  shape would not be caught automatically.
- The other files in `docs/` (`ARCHITECTURE.md`, `SECURITY.md`, `ROADMAP.md`,
  …) predate the current implementation and have not been brought up to date.
