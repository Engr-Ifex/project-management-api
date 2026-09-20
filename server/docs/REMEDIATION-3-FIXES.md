# Three-Fix Remediation Report

**Date:** 2026-09-20
**Scope:** exactly three confirmed audit findings — project-detail privacy,
upload content validation, and stale documentation. Nothing else was changed.
**Status:** all changes **uncommitted**, for the follow-up audit.

---

## 1. Project privacy

### What was exposing private information

Two endpoints are readable with **workspace membership alone**:
`GET …/projects` and `GET …/projects/:projectId`. Both populated
`members.user` with `'name email avatar'` and `createdBy` with
`'name email avatar'`.

So any workspace member could enumerate every project's membership in the
workspace — and read **every member's email address** — without being a member
of any of those projects.

### What was changed

Conditional response shaping, in one place (`shapeProjectForViewer` in
`src/services/project.service.js`), applied to both endpoints.

The access decision is read from `hasProjectOverride(workspaceRole)` — the same
helper `requireProjectPermission` uses — so the shaping and the guard cannot
disagree about who counts as a workspace owner/admin. The controller passes the
caller's id and elevation through `viewerOf(req)`.

Only those two functions needed changing. Every other project populate site
(`updateProject`, `archiveProject`, `restoreProject`, `addProjectMember`,
`removeProjectMember`, `changeProjectMemberRole`) sits behind
`ws:UPDATE_WORKSPACE`, so its caller is already elevated and keeps the full
response.

### What users can now see

| Caller                                                        | Response                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Project member / viewer / admin**                           | Unchanged. Full `members` array with names, emails and avatars; populated `createdBy`.                              |
| **Workspace owner or admin** (Policy A, not a project member) | Unchanged. Same as above.                                                                                           |
| **Workspace member, no project role**                         | Project metadata (name, description, status, deadline, colour, timestamps). `createdBy` is an **id**. No `members`. |

### What users can no longer see

A workspace member who is not on a project no longer receives, for that
project: the membership array, member names, member email addresses, member
avatars, member roles, or join dates. The creator is reduced to an opaque id.

### What was deliberately preserved

**Project discovery still works.** Both endpoints still return **200** for a
workspace member — the list still lists, the record still reads. Only the
membership data is withheld. This was an explicit requirement: the existing
policy intentionally allows workspace members to discover projects, and the
alternative reading (gating the detail route on `project:view`) would have
broken discovery and changed the authorization policy, which was out of scope.

No authorization policy changed. No route guard changed. Cross-workspace
isolation is untouched.

---

## 2. Upload validation

### Which file types are signature-validated

All of them. `src/utils/fileSignature.js` detects content by magic bytes and
maps each allowed MIME type to the content families it may legitimately have:

| Declared type                                                 | Detected by                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `image/jpeg`                                                  | `FF D8 FF`                                                                                                |
| `image/png`                                                   | the 8-byte PNG signature                                                                                  |
| `image/gif`                                                   | `GIF87a` / `GIF89a`                                                                                       |
| `image/webp`                                                  | `RIFF` … `WEBP`                                                                                           |
| `application/pdf`                                             | `%PDF-`                                                                                                   |
| `application/zip`, `.docx`, `.xlsx`, `.pptx`                  | a ZIP container (`PK` + local-file, empty-archive or spanned marker) — the OOXML formats are ZIP archives |
| `application/msword`, `.xls`, `.ppt`                          | an OLE2 compound file (`D0 CF 11 E0 A1 B1 1A E1`)                                                         |
| `text/plain`, `text/csv`, `text/markdown`, `application/json` | **no magic number exists** — see the limitations below                                                    |

### How the signature is checked

`detectContentType(buffer)` inspects the leading bytes and returns a family
(`png`, `jpeg`, `zip`, `ole2`, `text`, …). `isContentAllowedForMimeType` then
requires the detected family to be one of those declared for the MIME type the
file claims. A MIME type with no declared content rule is **refused** — an
unknown type has no expectation to check against.

**No dependency was added.** The allow-list is small and fixed, so the existing
dependencies were sufficient; a signature library would have been a larger
dependency for no gain.

### What happens when content does not match

**Attachments** — `assertFileIsAllowed` (in `src/services/attachment.service.js`)
throws `ApiError(400, 'File content does not match its declared type…')`. That
function is the single validation choke point, and it runs **before** the
storage provider is called and **before** any database record is created. The
response is the standard error envelope with status 400.

**Avatars** — a new `validateAvatarContent` middleware, mounted after
`upload.single('avatar')`, reads the file header back from disk and rejects with
400 on a mismatch.

The existing checks are unchanged and still run **first**: the MIME allow-list,
the extension map, the blocked-extension list, the size limits and the
per-request file count. Content validation complements them; it replaces
nothing.

### How rejected temporary files are cleaned up

This differs between the two paths, and the difference matters:

- **Attachments use `multer.memoryStorage()`.** Multer never writes a file, so
  there is nothing to clean up. The buffer is validated in memory and the
  storage provider is never called — no stored object, no orphan.
- **Avatars use `multer.diskStorage()`**, so multer writes the file into the
  public avatars directory _before_ anything can inspect it. `validateAvatarContent`
  therefore **unlinks the file** on rejection (`discardUploadedFile`, which
  treats a missing file as the desired end state). Nothing else has happened at
  that point — no service call, no database write — so there is nothing else to
  undo.

### The hole this closed

The avatar filter only checked the **declared MIME type**. A file that was not
an image at all was written, under its original extension, into a directory
served statically — so an HTML document sent as `image/png` and named `.html`
was accepted and served. Signature validation means the content must be a real
image regardless of the name, which closes it.

---

## 3. Documentation

### Files updated

| File                          | Change                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `docs/ENVIRONMENT.md`         | Rewritten against `src/config/env.js` and `.env.example`                           |
| `docs/SECURITY.md`            | Password policy corrected; auth flow corrected                                     |
| `docs/SETUP.md`               | Environment example corrected                                                      |
| `docs/ARCHITECTURE.md`        | Example constants corrected                                                        |
| `docs/CONTRIBUTING.md`        | Example constants corrected                                                        |
| `docs/API.md`                 | Project response contract; upload content-validation section                       |
| `docs/openapi.json`           | Regenerated — the `Project.members` schema now documents when the field is present |
| `scripts/generate-openapi.js` | The schema description above                                                       |

### Obsolete variables and references removed

| Removed / corrected                        | Why                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                               | Never read. The real variable is `JWT_ACCESS_SECRET`.                                        |
| `JWT_EXPIRES_IN`                           | Never read. The real variable is `JWT_ACCESS_EXPIRES_IN`.                                    |
| `CLIENT_URL`                               | Never read. Superseded by `CORS_ORIGINS`.                                                    |
| `RATE_LIMIT_MAX_REQUESTS`                  | Never read. The real variable is `RATE_LIMIT_MAX`.                                           |
| `SMTP_HOST/PORT/USER/PASS`                 | Listed as `.env.example` content. They are not in that file and the app does not send email. |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Same — not in `.env.example`, no cloud storage exists.                                       |
| `REDIS_URL`                                | Same — no Redis, and rate-limit counters are in process memory.                              |
| `SENTRY_DSN`                               | Same — no error reporting integration.                                                       |
| `MAX_FILE_SIZE`, `DEFAULT_PAGE_SIZE`       | Used as naming-style examples. Not constants in this codebase; replaced with real ones.      |

`ENVIRONMENT.md` also **omitted 8 of the 14 real variables** and claimed the
application fails to start on any missing variable — it does not: three of the
conditions are warnings, not failures. It now separates fatal from warning and
matches `env.js` exactly.

`SECURITY.md` claimed password composition requirements (uppercase, lowercase,
digit, special character). **They do not exist.** The only rule is a minimum of
8 characters, enforced by the Zod validator and the model's `minlength`. The
document now says so, and explains what the password strength actually rests on
(bcrypt cost and login rate limiting).

### Not stale, deliberately left alone

`AUDIT.md` records these names historically; `README.md` warns that
`JWT_SECRET` is not read by anything; `ENVIRONMENT.md` has a **Not Implemented**
section that lists the obsolete names explicitly so a reader who finds one
elsewhere knows it does nothing. These are accurate and were kept.

Also verified: all 15 `npm run` scripts referenced anywhere in the docs exist in
`package.json`, and no obsolete variable name remains in active documentation.

---

## Tests

```
npm test:
337 passed
0 failed
0 skipped
   (70 suites)

Lint:
PASS   (0 errors, 0 warnings)

Format:
PASS

Docs verification:
PASS   (82 routes = 82 operations, 513 references, 48 schemas)

Route inventory (npm run routes):
PASS   (82 routes; no route added, removed or re-guarded — the avatar route
        gained a middleware, not a new route)

Production preflight (npm run preflight):
EXPECTED FAILURE   (2 problems, 1 warning, against the development .env —
        NODE_ENV is not production and CORS_ORIGINS is empty. This is the
        documented behaviour, not a defect.)

Coverage (npm run test:coverage):
337 passed / 0 failed   —   all files 90.93% statements

  src/utils/fileSignature.js        100.00% stmts   90.91% branch   100% funcs
  src/controllers/project.controller.js  100.00% stmts   93.33% branch   100% funcs
  src/services/project.service.js    94.58% stmts   60.00% branch   100% funcs
  src/middlewares/upload.middleware.js   90.77% stmts   63.64% branch    85.71% funcs
```

The new signature module is fully covered at the statement and function level.

### Tests added

| File                              | Count | Covers                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/authorization.test.js`     | +8    | Privacy: no `members` for a workspace member on the record and on the list; no email anywhere in the response; `createdBy` reduced to an id; project member, project viewer, workspace admin and project owner all keep the unredacted record; discovery still returns 200                                                                            |
| `tests/upload-validation.test.js` | +21   | Ten valid fixtures accepted; seven mismatches rejected (executable as `.png` and as `.pdf`, PNG bytes as a PDF, a PDF as a PNG, text as an image, a ZIP as a PNG, a binary as text); no attachment record after a rejection; existing checks still reject first; a rejected avatar leaves no file on disk; every allowed MIME type has a content rule |

### Both fixes were verified discriminating

A test that passes both before and after a fix proves nothing, so each was
checked by disabling the fix:

- **Privacy** — making `shapeProjectForViewer` return the project unchanged
  fails 4 tests, including _"no email may appear"_. Restoring it passes 66/66.
- **Upload content** — removing `assertContentMatchesType` fails 7 rejection
  tests plus the cleanup test. Restoring it passes 21/21.

The avatar rejection test passed even with the attachment check disabled, which
confirms the avatar middleware is doing its own independent check.

### One test-helper change, comment-only

`tests/helpers/memoryStore.js` had a comment stating that nested array populate
was "not required by the suite". That is no longer true, and the real reason it
is not implemented is more specific: the double hydrates rows through
`Model.hydrate`, which casts the array against the subdocument schema and
cannot represent a populated element. Implementing it made fidelity _worse_, so
it was reverted. The comment now records the limitation and its consequence for
tests. **No behaviour changed** — the diff is a comment block and nothing else.

---

## Files changed

### Created (2)

| File                              | Why                                                                   |
| --------------------------------- | --------------------------------------------------------------------- |
| `src/utils/fileSignature.js`      | Magic-byte detection and the content rules for each allowed MIME type |
| `tests/upload-validation.test.js` | Upload content-validation regression tests                            |

### Modified (15)

| File                                    | Why                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/services/project.service.js`       | `shapeProjectForViewer` / `canSeeProjectMembers`; viewer argument on the two reads |
| `src/controllers/project.controller.js` | `viewerOf(req)`; passes the viewer to both reads                                   |
| `src/services/attachment.service.js`    | Content check in `assertFileIsAllowed`                                             |
| `src/middlewares/upload.middleware.js`  | `validateAvatarContent` and the unlink-on-reject helper                            |
| `src/routes/user.routes.js`             | Mounts `validateAvatarContent` on `PATCH /users/avatar`                            |
| `tests/authorization.test.js`           | +8 privacy tests                                                                   |
| `tests/helpers/memoryStore.js`          | Comment only (above)                                                               |
| `docs/ENVIRONMENT.md`                   | Rewritten against the code                                                         |
| `docs/SECURITY.md`                      | Password policy and auth flow corrected                                            |
| `docs/SETUP.md`                         | Env example corrected                                                              |
| `docs/ARCHITECTURE.md`                  | Example constants corrected                                                        |
| `docs/CONTRIBUTING.md`                  | Example constants corrected                                                        |
| `docs/API.md`                           | Project response contract; upload validation section                               |
| `docs/openapi.json`                     | Regenerated                                                                        |
| `scripts/generate-openapi.js`           | `Project.members` schema description                                               |

### Confirmed untouched

Authentication, JWT handling, password handling, workspace authorization,
project permissions, task logic, comments, labels, notifications, the dashboard,
search, rate limiting, the Docker configuration, and the frontend (`client/` is
empty and was not touched). No dependency was added or removed. No route path,
method, validator or status code changed.

---

## Remaining limitations

### Text formats are not signature-validated — and cannot be

`text/plain`, `text/csv`, `text/markdown` and `application/json` have no magic
number. They are checked only for being **plausibly text**: no NUL bytes and no
control characters other than tab, newline and carriage return. That rejects a
binary renamed to `.txt`; it does not and cannot prove the text is harmless.

The protection for those formats is the allow-list, not this check. `.svg`,
`.html`, `.xml` and `.js` are refused outright, so no active markup reaches the
store. This is documented in `API.md` and in the module, and it is not dressed
up as more than it is.

### This is not malware scanning

A structurally valid PNG, PDF or ZIP that contains something malicious passes,
because nothing inspects a file's payload. No antivirus, cloud scanning or
external service was introduced — that was explicitly out of scope.

### The avatar filename extension is still client-influenced

`avatarStorage.filename` uses `path.extname(file.originalname)` unsanitised. It
is no longer a security problem — the content must now be a real image, so an
HTML payload cannot be stored — and `X-Content-Type-Options: nosniff` prevents
the browser reinterpreting the bytes. It remains a robustness wart rather than a
hole, and it was left alone to keep this change scoped to the three findings.

### The nested-populate gap in the test double

The privacy tests assert that `members` is present or absent, and that
`createdBy` is populated or not, rather than asserting member emails — because
the in-process store cannot represent a populated reference inside an embedded
array. The behaviour is identical in production; the _assertion_ is weaker than
it would be against a real database. Running the suite with
`TEST_DB=mongodb` would close that gap.

### Verification not performed

- **Docker was not run.** Docker is not installed in this environment, so the
  container build, startup, health checks and shutdown were not exercised. The
  Docker configuration was not changed by this work.
- **No real MongoDB.** Index and query-planner behaviour, and true
  populate behaviour, are not covered by the in-process store.
- **No manual end-to-end check** of the privacy fix against a browser client;
  there is no frontend to exercise.

---

## Final assessment

| Finding                                | Status                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Project-detail privacy              | **Fixed.** Member identities are withheld from workspace members who are not on the project; discovery is preserved; authorized callers are unaffected. Covered by 8 tests, verified discriminating. |
| 2. Upload content/signature validation | **Fixed.** Content is validated for every allowed type; the check runs before persistence; rejections leave no record and no file. Covered by 21 tests, verified discriminating.                     |
| 3. Stale documentation                 | **Fixed.** No obsolete variable name remains in active documentation; the environment, security and setup documents now match the code; the OpenAPI document is regenerated and synchronized.        |

### Still requires manual verification

Two things cannot be confirmed from this environment, and neither is a defect in
the fixes themselves:

1. **Populate behaviour against a real MongoDB** — that `members` genuinely
   contains populated user records for an authorized caller, and genuinely does
   not for an unauthorized one, on a real deployment. The tests prove the
   decision; a real database would prove the contents.
2. **The upload fix in a real deployment** — that the storage provider writes
   nothing for a rejected attachment and that the avatar unlink behaves as
   expected on the deployment filesystem. Both are exercised in-process, but not
   against the production storage layout.

Everything else in this report was verified by execution, and the exact results
are given above.
