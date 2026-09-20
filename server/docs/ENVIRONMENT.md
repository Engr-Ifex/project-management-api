# Environment Variables

## Overview

The API is configured entirely through environment variables. They are read
once, at startup, by `src/config/env.js`, which validates them and either starts
or refuses to start.

`server/.env.example` is the authoritative list. This document explains what
each variable does and what happens when it is missing or wrong.

---

# Environment Files

### `.env`

Holds local values. It is gitignored and must never be committed — in
particular never commit a JWT secret or a database URI containing credentials.

### `.env.example`

The template, committed, with placeholder values. Copy it to get started:

```bash
cp .env.example .env
```

---

# Environment Types

`NODE_ENV` selects one of three modes and changes behaviour beyond logging:

| Value         | Effect                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `development` | Session cookies are **not** `Secure`. An empty `CORS_ORIGINS` allows any origin, without credentials. Human-readable logs at `debug`. A short JWT secret is a warning, not a failure. |
| `test`        | Rate limiting is skipped, so the suite is not throttled by its own requests.                                                                                                          |
| `production`  | Cookies are `Secure`. An empty `CORS_ORIGINS` refuses every cross-origin browser request. One JSON object per log line at `info`. A short JWT secret is fatal.                        |

`NODE_ENV` defaults to `development`. It is **not** fatal to omit it, which is
exactly why it is easy to forget: the app will run, with cookies that are not
`Secure` and a CORS policy you did not intend. `npm run preflight` fails on
anything other than `production`, and `npm run start:prod` runs that check
before starting.

---

# Variables

## Application

### PORT

Port the HTTP server listens on. Default `5000`. One port serves everything —
API, health endpoints and public avatars.

### NODE_ENV

See [Environment Types](#environment-types). Default `development`.

## Database

### MONGODB_URI

**Required.** The application refuses to start without it.

```env
# Local
MONGODB_URI=mongodb://127.0.0.1:27017/project_management

# Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
```

### MONGODB_SERVER_SELECTION_TIMEOUT_MS

How long the driver searches for a reachable server before giving up. Default
`5000`. The driver's own default is 30s, which makes a misconfigured host look
like a hang rather than a failure.

## Authentication

### JWT_ACCESS_SECRET

**Required.** The HS256 signing key. Must be **at least 32 characters** — HS256
security is bounded by the key's entropy, so a short secret is brute-forceable
offline if a token is ever captured.

A secret that is missing, or shorter than 32 characters **in production**, stops
the process. In development a short secret only warns, so the placeholder in
`.env.example` does not block local work.

```bash
openssl rand -hex 32
```

The value is never logged and never returned in a response.

### JWT_ACCESS_EXPIRES_IN

Token lifetime. Default `15m`. There is no refresh token: when it expires, the
user logs in again.

### COOKIE_MAX_AGE

Session cookie lifetime, in **milliseconds**. Default `900000` (15 minutes).
Keep it in step with `JWT_ACCESS_EXPIRES_IN`, or the cookie outlives the token
it carries and the browser keeps sending a token that is already dead.

### BCRYPT_SALT_ROUNDS

bcrypt cost factor, `10`–`15`. Default `10`. Outside that range the application
refuses to start: too low weakens the hash, too high makes every login
noticeably slow.

## CORS

### CORS_ORIGINS

Comma-separated browser origins allowed to call the API **with credentials**.

```env
CORS_ORIGINS=https://app.example.com,https://staging.example.com
```

Empty means no cross-origin browser client can call the API in production. That
is the safe default and it is deliberate — a wildcard cannot be combined with
credentialed requests, so an empty list is refused rather than widened. Leave it
empty only for a server-to-server deployment.

## Proxy

### TRUST_PROXY

Number of trusted reverse-proxy hops in front of the application. Default `0`,
for a directly exposed app.

Set this correctly or rate limiting is broken: `req.ip` becomes the proxy's
address, so every client shares a single budget and one abusive client locks
everyone out. Use `1` for a single nginx or load balancer in front.

## Rate limiting

### RATE_LIMIT_MAX

Requests per IP per window across the whole API. Default `1000`.

### RATE_LIMIT_WINDOW_MS

Window length in milliseconds. Default `900000` (15 minutes).

The authentication endpoints have a separate, stricter limit — 10 requests per
15 minutes per IP — which is not configurable here.

Counters live in **process memory**. With N instances the effective limit is
N × `RATE_LIMIT_MAX`. See `DEPLOYMENT.md` → Known limitations.

## Operations

### LOG_LEVEL

One of `error`, `warn`, `info`, `http`, `debug`. Defaults to `info` in
production and `debug` elsewhere. An unrecognised value warns and falls back.
Production output is one JSON object per line; other environments are
human-readable.

### SHUTDOWN_TIMEOUT_MS

How long to wait for in-flight requests and the database connection during
shutdown before exiting anyway. Default `10000`.

**Must be lower than the orchestrator's own grace period** — Docker's
`stop_grace_period`, Kubernetes' `terminationGracePeriodSeconds`. If it is
higher, the platform sends `SIGKILL` first and the graceful path never runs.

---

# Validation

Configuration is validated at boot by `src/config/env.js`, before the server
listens. Problems are one of two kinds.

**Fatal** — the process exits with a list of everything that is wrong, rather
than failing later on the first request that needs the value:

```
Invalid environment configuration:
  - MONGODB_URI is required
  - JWT_ACCESS_SECRET must be at least 32 characters (currently 12). Generate one with: openssl rand -hex 32
```

| Condition                                                    | Result |
| ------------------------------------------------------------ | ------ |
| `MONGODB_URI` missing                                        | fatal  |
| `JWT_ACCESS_SECRET` missing                                  | fatal  |
| `JWT_ACCESS_SECRET` shorter than 32 characters in production | fatal  |
| `BCRYPT_SALT_ROUNDS` outside 10–15                           | fatal  |

**Warning** — the process starts, and the problem is printed once with a `⚠️`
prefix. These are legal but wrong for production:

| Condition                                                         | Result  |
| ----------------------------------------------------------------- | ------- |
| `JWT_ACCESS_SECRET` shorter than 32 characters outside production | warning |
| `CORS_ORIGINS` empty in production                                | warning |
| `LOG_LEVEL` not recognised                                        | warning |

`npm run preflight` checks a production environment before you start, including
things that are legal but wrong — `NODE_ENV` not set to `production`, an empty
`CORS_ORIGINS`, a `TRUST_PROXY` that looks unset. Run it as part of a deploy.

---

# Security Guidelines

- Never commit `.env`. It is gitignored; keep it that way.
- Never log secrets, and never return them in a response.
- Never hardcode a secret in source.
- Use a secret manager in production rather than shipping a file.
- Generate secrets with a CSPRNG: `openssl rand -hex 32`.
- Rotate secrets periodically. Changing `JWT_ACCESS_SECRET` invalidates every
  issued token, which is also the fastest way to force a global re-login.

---

# Not Implemented

These appear in older revisions of this document and in some planning notes.
They are **not** configuration options — the application does not read them, and
setting them has no effect:

`CLIENT_URL` (superseded by `CORS_ORIGINS`), `JWT_SECRET` and
`JWT_EXPIRES_IN` (renamed to `JWT_ACCESS_SECRET` and `JWT_ACCESS_EXPIRES_IN`),
`RATE_LIMIT_MAX_REQUESTS` (renamed to `RATE_LIMIT_MAX`), `SMTP_*`,
`CLOUDINARY_*`, `REDIS_URL`, `SENTRY_DSN`.

Email delivery, cloud storage, a shared rate-limit store and error reporting are
not features of this API. They are listed in `DEPLOYMENT.md` as things a future
version might add, not as things that exist.

---

# Summary

Every variable the application reads is documented above and present in
`.env.example` — fourteen in total, with no orphans in either direction. The
code is the source of truth: if this document and `src/config/env.js` ever
disagree, the code is right and this file is the bug.
