# Project Management API

A production-shaped REST API for team project management, built with Node.js,
Express and MongoDB. It covers authentication, multi-tenant workspaces, projects,
tasks with subtasks, comments, labels, file attachments, notifications, an audit
trail and dashboards — with layered authorization, strict input validation, a
full test suite and generated API documentation.

The `client/` directory is reserved for a future frontend and is currently empty;
this repository is the backend.

---

## Features

**Accounts and sessions**
- Registration and login with bcrypt-hashed passwords (cost 10–15)
- JWT sessions in an `httpOnly`, `SameSite=Strict` cookie — no bearer tokens
- Tokens are invalidated on password change
- Login timing is equalised so accounts cannot be enumerated
- Profile, avatar and notification settings

**Multi-tenant structure**
- Workspaces with `owner` / `admin` / `member` roles
- Projects with `owner` / `admin` / `member` / `viewer` roles
- Email invitations with an accept flow
- Workspace-level override: owners and admins hold authority over every project
  in their workspace

**Work**
- Tasks: status, priority, assignment, start/due dates, time estimates, ordering
- Subtasks as an embedded checklist
- Comments with author-only editing and role-based moderation
- Project-scoped labels with hex colours
- Archiving instead of deletion for tasks and projects

**Insight**
- Per-project and per-task audit trail, written by the service layer
- In-app notifications
- Workspace and project dashboards with task statistics

**Platform concerns**
- Zod validation of body, params and query on every route that accepts input
- Layered authorization with object-level rules
- Security headers, CORS allow-list, per-IP rate limiting, body size limits
- Fail-fast environment validation
- Uploads restricted by MIME type **and** extension, stored privately
- Standard success and error envelopes, consistent pagination
- 308 automated tests, generated OpenAPI 3.1 documentation

**Production readiness**
- Fail-fast environment validation plus a `preflight` readiness check
- Structured JSON logging in production, with sensitive fields redacted
- Graceful shutdown with a hard deadline, keep-alive handling and fatal-error traps
- Separate liveness and readiness probes
- Multi-stage Docker image running as a non-root user
- Migrations that never run on startup and exit non-zero on failure
- Zero known dependency vulnerabilities

---

## Technology stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20.19+ (developed on 22) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 9 |
| Validation | Zod 4 |
| Auth | `jsonwebtoken` (HS256) + `bcrypt` |
| Uploads | `multer` |
| Security | `helmet`, `cors`, custom rate limiter |
| Testing | `node:test`, `supertest`, `mongodb-memory-server` |
| Tooling | ESLint, Prettier |

---

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Then fill in `.env`:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/project-management
JWT_ACCESS_SECRET=change-me-to-at-least-32-characters
JWT_ACCESS_EXPIRES_IN=15m
COOKIE_MAX_AGE=900000
BCRYPT_SALT_ROUNDS=10
```

`MONGODB_URI` and `JWT_ACCESS_SECRET` are required. The app validates its
configuration at startup and refuses to boot on a fatal mistake — for example a
`JWT_ACCESS_SECRET` shorter than 32 characters in production.

Full details, including every variable and its behaviour, are in
[docs/API.md](server/docs/API.md#3-environment-variables).

---

## Scripts

Run from `server/`:

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with nodemon |
| `npm start` | Plain `node server.js` |
| `npm run start:prod` | Production: preflight check, then start |
| `npm run preflight` | Verify the environment is production-ready |
| `npm test` | Full test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage |
| `npm run migrate:task-comments` | Run a migration (see [DEPLOYMENT.md](server/docs/DEPLOYMENT.md#4-database-migrations)) |
| `npm run migrate:project-member-roles` | Run a migration |
| `npm run docs:generate` | Regenerate `docs/openapi.json` from the implementation |
| `npm run docs:verify` | Fail if the docs and the routes disagree |
| `npm run routes` | Print every route with its guard chain |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |

### Production

```bash
npm run preflight      # checks secrets, CORS, proxy config — exits non-zero if not ready
npm run start:prod     # preflight, then start
```

The app validates its own configuration at startup and refuses to boot on a
fatal mistake. `preflight` additionally catches the things that are legal but
wrong for production — a placeholder secret, an empty `CORS_ORIGINS`, a missing
`TRUST_PROXY` — and reports all of them at once.

### Docker

```bash
docker build -t project-management-api .
docker compose up -d --build     # API + MongoDB, for a single host
```

See [docs/DEPLOYMENT.md](server/docs/DEPLOYMENT.md) for the full procedure.

---

## Folder structure

```
project-management-api/
├── README.md
└── server/
    ├── app.js                  Express app: middleware, routes, error handling
    ├── server.js               Entry point: DB connection, timeouts, listen
    ├── Dockerfile              Multi-stage production image (runs as non-root)
    ├── docker-compose.yml      API + MongoDB for a single host
    ├── .dockerignore           Keeps .env and node_modules out of the image
    ├── scripts/
    │   ├── preflight.js          Production readiness check
    │   ├── route-inventory.js    Parses routes into a machine-readable list
    │   ├── generate-openapi.js   Builds docs/openapi.json
    │   ├── openapi-operations.js Per-endpoint summaries and grouping
    │   └── verify-docs.js        Asserts docs match the routes
    ├── docs/
    │   ├── API.md              Full API guide (the place to start)
    │   ├── DEPLOYMENT.md       Architecture, deploy steps, checklist
    │   ├── openapi.json        Generated OpenAPI 3.1 contract
    │   └── …                   Architecture, database, security, roadmap
    ├── tests/
    │   ├── helpers/            DB setup, factories, in-process data layer
    │   └── *.test.js           One suite per resource
    └── src/
        ├── config/             Environment, database, filesystem paths
        ├── constants/          Roles, permissions, upload policy
        ├── controllers/        HTTP layer
        ├── middlewares/        Auth, authorization, validation, uploads, errors
        ├── migrations/         One-off migrations (never run automatically)
        ├── models/             Mongoose schemas
        ├── routes/             Route definitions and guard chains
        ├── services/           Business logic and object-level authorization
        ├── storage/            Pluggable file storage provider
        ├── utils/              Logger, response envelopes, shutdown, pagination
        ├── validators/         Zod schemas
        ├── database/           Connection helper
        └── uploads/            Avatars (public) and attachments (private)
```

---

## API documentation

**[server/docs/API.md](server/docs/API.md)** is the complete guide: overview,
setup, environment variables, authentication, the authorization model, role and
permission matrices, every endpoint grouped by resource, response formats,
validation rules, upload restrictions, status codes, worked examples and a
per-endpoint authorization table.

**[server/docs/openapi.json](server/docs/openapi.json)** is the machine-readable
contract (OpenAPI 3.1), importable into Postman, Insomnia or any OpenAPI
tooling. It is also served by the running API:

```bash
curl http://localhost:5000/api/v1/openapi.json
```

The document is **generated from the implementation** — paths, guards, request
bodies and query parameters all come from the routes, the Zod validators and the
Mongoose models — and then **verified** against the route table:

```bash
npm run docs:generate
npm run docs:verify
```

`docs:verify` fails if a route is undocumented, if something is documented that
does not exist, if a `$ref` is broken, or if an operation's authentication
requirement does not match the route's guard chain. Run it after changing a
route.

---

## Testing

```bash
cd server
npm test
```

308 tests across 64 suites, covering authentication, authorization, workspaces,
projects, tasks, subtasks, comments, labels, notifications, activity,
attachments, dashboards, query behaviour, the health/readiness probes and the
response envelope contract.

The suite is built on `node:test`, `supertest` and `mongodb-memory-server`. It
**never touches the application database**: the connection string is replaced
before configuration is loaded, and a guard rejects any URI that looks like a
remote cluster.

### Database selection

`TEST_DB` chooses the backend:

| Value | Behaviour |
|---|---|
| `auto` *(default)* | Real in-memory MongoDB when a cached `mongod` binary is available, otherwise the in-process store |
| `mongodb` | Require a real database; fail loudly if unavailable |
| `memory` | Force the in-process store |

The first run downloads a `mongod` binary (a few hundred MB) into
`~/.cache/mongodb-binaries`. To use a database you already have:

```bash
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/pm-test npm test
```

> The in-process store fakes the query transport. Schemas, defaults, validation
> and pre-save hooks are real, but index behaviour and query planning are not
> exercised. **Prefer `TEST_DB=mongodb` when a real database is available.**

---

## Deployment

Full procedure, architecture diagram, checklist and known limitations:
**[server/docs/DEPLOYMENT.md](server/docs/DEPLOYMENT.md)**.

```bash
# Container (API + MongoDB on one host)
docker compose up -d --build

# Or directly
npm run preflight     # exits non-zero if the environment is not production-ready
npm run start:prod
```

The essentials:

1. **Rotate `JWT_ACCESS_SECRET`** to at least 32 characters
   (`openssl rand -hex 32`). The app will not start in production otherwise, or
   if the value is still a placeholder.
2. **Set `CORS_ORIGINS`** to your client origin(s), comma-separated. With it
   empty, production refuses all cross-origin browser requests.
3. **Set `TRUST_PROXY`** to the number of proxy hops in front of the app.
   Rate limiting keys on `req.ip`, so without this every request appears to come
   from the proxy and one client can exhaust everyone's budget.
4. **Serve over HTTPS.** Cookies become `Secure` automatically when
   `NODE_ENV=production`, so without TLS no client can stay logged in.
5. **Persist the upload volume.** It must be mounted at `/app/src/uploads`;
   without it every deploy discards every avatar and attachment.
6. **Run migrations as a one-off job**, never in the start command. They do not
   run automatically.
7. **Keep `SHUTDOWN_TIMEOUT_MS` below the platform's grace period**, or the
   platform will SIGKILL before the graceful path finishes.
8. **Health checks:**
   - liveness → `GET /api/v1/health` (never touches the database)
   - readiness → `GET /api/v1/health/ready` (pings it; 503 when unreachable)

### Scaling

The API is **stateless** — sessions live in a cookie, so any instance can serve
any request and no sticky sessions are needed.

Two things do not scale horizontally as-is:

- **Rate limiting** counts per process, so N instances multiply the effective
  limit. Move it to a shared store (Redis) before running more than one.
- **Uploads** are written to local disk, so an upload served by instance A is
  invisible to instance B. Move to object storage before running more than one.

Both are explained in [Known limitations](server/docs/DEPLOYMENT.md#8-known-limitations).

---

## Roadmap

Development proceeds in phases, documented in
[server/docs/ROADMAP.md](server/docs/ROADMAP.md). Completed so far: core
resources, validation, security hardening, testing, API documentation and
production preparation.
