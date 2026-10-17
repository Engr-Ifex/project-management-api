# Phase 2 — Independent Backend Verification and Test Hardening

**Date:** 2026-10-10
**Scope:** the backend (`server/`). No frontend or deployment changes.
**No commits were made.**

---

## 0. Bottom line

The backend suite now runs green **against a real MongoDB replica set** — the
thing every previous report said could not be done here. That run found defects
the in-process store had been hiding. Eleven defects were confirmed and fixed;
the suite grew from 329 tests (2 failing) to 375 (0 failing).

Two claims inherited from the earlier reports do **not** reproduce and are
called out in §7 rather than repeated.

---

## 1. Baseline, measured (not quoted)

Run against the inherited working tree, before any change in this phase.

| Check | Command | Actual result |
| --- | --- | --- |
| Unit/integration | `npm test` | **329 tests, 327 pass, 2 fail** |
| Lint | `npm run lint` | exit 0 — 0 errors, **6 warnings** (all in `tests/tmp-probe.test.js`) |
| Formatting | `npm run format:check` | **exit 1** — 3 files unformatted |
| Docs ↔ code | `npm run docs:verify` | pass — 82 routes = 82 operations, 517 refs, 62 paths, 50 schemas |
| Route inventory | `npm run routes` | 82 routes |
| Production config | `npm run preflight` | exit 1 against the dev `.env` (4 problems) — **correct**, not a defect |
| Coverage | `npm run test:coverage` | 87.87% lines / 77.68% branches / 84.93% functions |
| Real MongoDB | — | **unavailable**: no `mongod` on PATH, no cached binary, no Docker, no `MONGODB_URI_TEST` |

The 2 failures were **not** "flaky tests". `tests/indexes.test.js` and
`tests/transactions.test.js` never import `tests/helpers/setup.js`, so
`src/config/env.js` threw `Invalid environment configuration: MONGODB_URI is
required` at import time and neither file reached a single assertion. Both were
reported as passing in earlier documents.

---

## 2. Real MongoDB — provisioned and used

The blocker was real: this machine has no `mongod`, no Docker, and no MongoDB
service. It was resolved rather than reported:

- Downloaded MongoDB **6.0.14** (509.3 MB) through the project's existing
  `mongodb-memory-server` dev dependency (~22 min at 250–570 KB/s).
- Started a **single-node replica set** on `127.0.0.1:27018`
  (`replicaSet=testset`) — a replica set, not a standalone, so transactions are
  genuinely available.
- Tests ran against a **dedicated, disposable database**:
  `mongodb://127.0.0.1:27018/pmapi_test?replicaSet=testset`. This is loopback,
  not Atlas, and `tests/helpers/setup.js` independently refuses any
  `mongodb+srv:` / `.mongodb.net` URI, so a production cluster cannot be reached
  by a test run. No migration was ever pointed at a production database.

**Isolation caveat, stated plainly:** the "production" database for this project
is Atlas, and nothing here touched it. Every URI used in this phase was
loopback.

---

## 3. Exact test results

| Run | Command | Result |
| --- | --- | --- |
| Memory store (default) | `npm test` | **375 tests, 366 pass, 0 fail, 9 skipped** |
| **Real MongoDB replica set** | `TEST_DB=mongodb MONGODB_URI_TEST=… npm test` | **375 tests, 375 pass, 0 fail, 0 skipped** |
| Coverage (real MongoDB) | `… npm run test:coverage` | 88.64% lines / 76.90% branches / 86.34% functions |

The 9 skipped tests are `tests/mongodb-integrity.test.js`, which skips itself
with an explicit reason when no real database is in use rather than passing
vacuously.

**First real-MongoDB run, before the fixture fixes below: 364/367 — 3 failures.**
Those three are the most valuable output of this phase: they existed only
against a real server.

### 3.1 Replica-set transactions — verified

`src/utils/transactions.js` detects support via `hello` (`setName`). Against the
replica set it reports **true**, and `tests/mongodb-integrity.test.js` proves:

- the replica set reports transaction support;
- a committed transaction persists its writes;
- **a failed transaction rolls its writes back** (the write count is unchanged
  after the deliberate throw).

That last one is what `tests/transactions.test.js` explicitly said it could not
prove ("What this does NOT prove: that MongoDB rolls back correctly"). It is now
proven, end to end.

### 3.2 Transactions — what is and is not atomic

`runAtomically` is used in exactly **one** place: `acceptInvitation`
(`invitation.service.js`), which writes the Workspace membership and the
Invitation status. Every other multi-write flow is deliberately built on
**single-document atomic operations** and does not need a transaction:

- membership add/remove/role-change and ownership transfer — one
  `findOneAndUpdate` with `$push` / `$pull` / `arrayFilters`;
- label attach/detach — one conditional update with `$nin` + `$addToSet`;
- attachment upload/delete — file first then record (with compensating unlink),
  or record first then best-effort unlink; a transaction cannot cover the
  filesystem, so the compensation is explicit.

**On a standalone server** the fallback is explicit and safe: `runAtomically`
runs the work sequentially, logs once, and every invariant still holds because
it is enforced by the conditional update or a unique index — never by the
rollback. No multi-document atomicity is claimed for a standalone deployment.

---

## 4. Defects confirmed and fixed

### 4.1 Two test files could not load at all

`tests/indexes.test.js` and `tests/transactions.test.js` import models without
bootstrapping the test environment, so `src/config/env.js` threw before any
assertion. Both now import `./helpers/setup.js` for its side effect (with a
comment explaining why), and pass: **18/18** and **8/8**.

### 4.2 Three test files contained schema-invalid fixtures

`authorization.test.js`, `task.test.js` and `dashboard.test.js` created projects
and tasks named `'A'`/`'B'`/`'C'`/`'D'`. The models require `minlength: 2`, so
those fixtures are invalid — and real MongoDB rejected them, failing 3 suites.
They passed only because the in-process store never validated. Names lengthened
to `'Project A'`…`'Task B'`. (The intentional one-character *negative* tests —
"rejects a title that is too short" — are untouched.)

### 4.3 The in-process store never ran schema validation

`tests/helpers/memoryStore.js` documents `validate()` as one of the things it
does "for real", but `persist()` only ran the pre-save hooks. This is the root
cause of 4.2: an invalid fixture could never fail here. The store now validates
on **create** (the path where every required field is supplied), matching
Mongoose. Validating on update is deliberately not added — a hydrated row loaded
through a projection legitimately lacks fields (a User's `password` is
`select: false`) and reproducing Mongoose's projection-aware validation needs
more machinery than the suite warrants; that limit is now documented in place.

### 4.4 `migrate:drop-indexes` aborted on a fresh database

Against a real server the migration failed with
`MongoServerError: ns not found` (`code 26`, `NamespaceNotFound`) the moment a
collection did not exist. It only handled `IndexNotFound` (27). Its own claim —
"Idempotent: a missing index is reported and skipped, so re-running is safe" —
was therefore **false**: on a fresh database, or any database where a feature has
never been used, the migration exited 1 and would fail a deploy step. Both codes
are now treated as "not present".

Verified against the real replica set: 12/12 skipped on an empty database, exit
0, twice; then, after seeding `workspaces.owner_1` and `labels.project_1` by
hand, the migration **dropped both** and a re-read of the collection confirmed
they were gone. The other two migrations run clean and repeatably, and a
migration pointed at an unreachable server correctly exits **1**.

### 4.5 Rate limiting had no test, despite the code saying it did

`app.js` and `auth.routes.js` both state: *"The limiter itself is covered by
dedicated tests that mount their own instance."* No such test existed. Added
`tests/rate-limit.test.js` (**9 tests**): the budget, the 429 envelope, the
`RateLimit-*` / `Retry-After` headers, window refill, per-key isolation, the
manual reset, option validation, and the fact that the credential budget is the
strict one. The comments are now true.

### 4.6 Untested flows with real logic

- **Invitation expiry** — `acceptInvitation` returns **410** and marks the row
  `expired`; nothing tested it. Added 2 tests, including that an expired
  invitation does not block a re-invite (the behaviour the partial unique index
  exists for).
- **Attachment storage consistency** — deleting an attachment removes the record
  *and* the stored object. Added 1 test that checks the file on disk before and
  after via the storage provider.
- **Workspace member management** — `team.service.js` was **45% covered**;
  `removeWorkspaceMember` and `updateMemberRole` were reached only through
  denial paths (403s from the permission middleware), so the functions were
  never executed. Added **8 tests**: successful removal by owner and by admin,
  the admin-cannot-remove-admin guard, the owner-cannot-be-removed guard, the
  self-removal guard, successful role change, admin-cannot-change-role, and
  owner-role-cannot-be-changed. `team.service.js` coverage is now **89%**.

### 4.7 `tests/tmp-probe.test.js` — 222 lines, 7 tests, zero assertions

A self-described "throwaway probe" that only `console.log`ed values. It asserted
nothing, contributed 7 always-green tests, and produced 6 lint warnings. Removed.

### 4.8 Formatting

`npm run format:check` failed on 3 files (two of them left unformatted by the
Phase 1 edits). All are formatted; the gate now passes.

---

## 5. Security and authorization findings

**No exploitable vulnerability was found.** The established policy was preserved
exactly — nothing was weakened to make a test pass.

| Area | Status |
| --- | --- |
| Unauthenticated access | covered — 401 on protected routes (`api-contract`, `attachment`) |
| Invalid / tampered JWT | covered — malformed, wrong-secret, `alg:none` all 401 (`auth.test.js`) |
| Expired JWT | covered — 401 with `Access token has expired`, never a 500 |
| Token invalidation on password change | covered (`passwordChangedAt` + 1s `iat` tolerance) |
| Role / permission boundaries | covered — 66 tests in `authorization.test.js`, 9 in `permissions.test.js` |
| Cross-workspace access | covered — 403/404, and the override does not extend to another workspace |
| Cross-project access | covered — 404 through a foreign project's URL |
| Private attachment downloads | covered — 401 unauthenticated, cross-project 404, `nosniff` + `Content-Disposition` |
| Upload signature validation | covered — 24 tests, magic-byte checks both directions |
| Malformed query params / injection | covered — operator-shaped sort fields and nested operator objects rejected |
| Error responses leaking internals | covered — unexpected 5xx masked, deliberate `ApiError` messages kept |
| **Rate limiting** | **was untested — now 9 tests** (§4.5) |

Total security-focused tests: **140**, all passing against real MongoDB.

---

## 6. Indexes and migrations

- **Indexes**: every declared index was confirmed to exist in the real database,
  and the partial unique index on invitations was read back with its
  `partialFilterExpression: {status: 'pending'}` intact.
- **Uniqueness is enforced by the server**, not just declared: duplicate user
  email, duplicate label name within a project (but not across projects),
  duplicate pending invitation for one address, and a reused invitation token
  all raise `E11000`. That last set is the behaviour the in-process store
  **cannot** reproduce, and is why `mongodb-integrity.test.js` exists.
- **Migrations**: all three are repeatable; `drop-indexes` drops real indexes and
  skips absent ones; a failed connection exits non-zero. No migration was run
  against production.

---

## 7. Claims that did not reproduce

The instruction was not to trust prior reports. Two did not survive checking:

1. **`docs/AUDIT.md`** is explicitly a point-in-time report (2026-09-17, commit
   `b71c80a`), and its findings no longer describe the code: §2.4 "No
   multi-document transactions / zero uses of `startSession`" and §3.5 "No
   partial unique index on pending invitations" are both now false. Its §6 table
   (256 tests, "0 errors, 0 warnings", formatting clean) does not match the
   inherited tree either.
2. **`docs/REMEDIATION.md`** states: *"Verified by execution: 308 automated tests
   pass, lint and formatting are clean."* Measured on the inherited tree: 329
   tests with 2 failing, 6 lint warnings, and `format:check` failing on 3 files.

Both are historical documents rather than live assertions, but neither should be
cited as the current state.

---

## 8. Remaining bugs and known limitations

**Data integrity**

- `deleteWorkspace` calls only `workspace.deleteOne()`. It does **not** cascade,
  so deleting a workspace leaves orphaned projects, tasks, comments, labels,
  activities, invitations and attachment rows. The `purgeAttachmentsForProject`
  / `purgeAttachmentsForTask` helpers already exist in `attachment.service.js`
  and are never called. Orphans are unreachable (the workspace guard 404s) but
  they accumulate. Not fixed — it changes deletion semantics and needs a
  product decision.
- `team.service.js` lines 88-90 ("You cannot change your own role") are
  unreachable: the target-is-owner guard and the owner-only guard both fire
  first. Harmless defensive code, left alone.

**Test hygiene**

- `attachment.test.js` and `upload-validation.test.js` write real files into
  `src/uploads/attachments/` and never clean up — **91 stale directories** have
  accumulated. The path is gitignored so nothing is committed, but it grows on
  every run. Not fixed: the tests share the directory the dev app uses, so a
  blanket cleanup could delete a developer's own uploads.

**Documentation drift**

- `docs/DATABASE.md` describes fields and indexes that do not match the models
  (`assignedTo` vs `assigned`, `estimatedHours` vs `estimatedTime`, `isVerified`,
  `membersCount`, `archived` vs `isArchived`). It reads as an early design doc;
  left as-is rather than rewritten, but it should not be treated as a schema
  reference.

**Known, documented limitations (not defects)**

- Rate-limit counters are per-process; `max × instanceCount` behind N instances.
- Logout clears the cookie but does not revoke the token (valid until expiry).
- No TTL index on `Invitation.expiresAt`; expired invitations accumulate and
  expiry is applied lazily on accept.
- The in-process store still does not enforce unique indexes and does not
  validate updates. `TEST_DB=mongodb` is what covers those.

---

## 9. Tests that could not run

**None were left unrun** — a real MongoDB was provisioned, so the real-database
checks that every prior report deferred were executed.

**Still unverified:** the Docker build and container runtime (`Dockerfile`,
`docker-compose.yml`). Docker is not installed on this machine, and that remains
the one gate that has never been executed.

**Do not read this as production readiness.** The suite passes, lint and
formatting are clean, and the OpenAPI document matches the code — but the
deployment path is still unexercised, and the data-integrity items in §8 are
open.

---

## 10. Files changed

**Source**

| File | Change |
| --- | --- |
| `server/src/migrations/dropRedundantIndexes.js` | Treat `NamespaceNotFound` (26) like `IndexNotFound` (27) so the migration is genuinely idempotent on a fresh database |

**Test harness**

| File | Change |
| --- | --- |
| `server/tests/helpers/memoryStore.js` | Validate on create, matching Mongoose; documents why update is not validated |

**Tests — fixed**

| File | Change |
| --- | --- |
| `server/tests/indexes.test.js` | Import the env bootstrap (file previously could not load) |
| `server/tests/transactions.test.js` | Import the env bootstrap (file previously could not load) |
| `server/tests/authorization.test.js` | Fixture names lengthened to satisfy `minlength: 2` |
| `server/tests/task.test.js` | Fixture names lengthened to satisfy `minlength: 2` |
| `server/tests/dashboard.test.js` | Fixture names lengthened to satisfy `minlength: 2` |
| `server/scripts/generate-openapi.js` | Prettier formatting only (content from Phase 1) |
| `server/tests/contract-regression.test.js` | Prettier formatting only (new file from Phase 1) |

**Tests — extended**

| File | Change |
| --- | --- |
| `server/tests/workspace.test.js` | +10 tests — invitation expiry (2) and workspace member management (8) |
| `server/tests/attachment.test.js` | +1 test — deleting an attachment removes its stored object |

**Tests — added**

| File | Change |
| --- | --- |
| `server/tests/rate-limit.test.js` | **New, 9 tests** — the limiter, mounted on its own instance |
| `server/tests/mongodb-integrity.test.js` | **New, 9 tests** — real-database index/uniqueness/transaction integrity; skips without a real MongoDB |

**Tests — removed**

| File | Change |
| --- | --- |
| `server/tests/tmp-probe.test.js` | **Deleted** — 222 lines, 7 tests, zero assertions |

**Not touched by this phase:** the Phase 1 edits (`client/API-INTEGRATION.md`,
`client/src/lib/api/endpoints.ts`, `client/src/lib/api/types.ts`,
`server/docs/openapi.json`, `server/scripts/openapi-operations.js`) remain in the
working tree from the previous phase; only `generate-openapi.js` was touched
here, and only to format it.

---

## 11. How to reproduce

```bash
cd server

# Default run — in-process store, no database required.
npm test                      # 375 tests, 366 pass, 9 skipped

# Real MongoDB. Needs a reachable server; mongodb-memory-server will fetch one
# on first use (~509 MB) and cache it in ~/.cache/mongodb-binaries.
TEST_DB=mongodb npm test      # 375 tests, 375 pass, 0 skipped

# Against an already-running replica set:
MONGODB_URI_TEST="mongodb://127.0.0.1:27018/pmapi_test?replicaSet=testset" \
  TEST_DB=mongodb npm test

npm run test:coverage
npm run lint
npm run format:check
npm run docs:verify
npm run routes
npm run preflight
```
