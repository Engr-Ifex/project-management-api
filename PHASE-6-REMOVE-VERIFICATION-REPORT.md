# PROJEX — Remove Email Verification Feature Safely

Email verification removed, so registration and login work on a deployment with
no custom domain configured for Resend. Everything else preserved.

**No commit was made.** Every command below was run and the results are the
actual output.

---

## 1. Files changed

### Deleted — verification-only, nothing else referenced them

| File | What it was |
| --- | --- |
| `server/src/middlewares/requireVerifiedEmail.middleware.js` | The enforcement guard |
| `server/src/utils/verification.js` | The verified/unverified predicate |
| `server/src/emails/verifyEmail.js` | The confirmation email template |
| `server/src/migrations/migrateUserVerification.js` | The backfill migration (superseded) |
| `client/src/pages/VerifyEmail.tsx` | The four-state confirmation screen |
| `client/src/components/VerificationNotice.tsx` | The standing banner |
| `client/dev/verify-email-flows.mjs` | The verification browser harness |

### Added

| File | Purpose |
| --- | --- |
| `server/src/migrations/migrateRemoveVerificationFields.js` | **Optional** cleanup of the leftover fields |
| `client/dev/verify-password-reset.mjs` | Replaces the deleted harness, reset-only (14 checks) |

### Modified — backend

`src/models/User.js` · `src/services/auth.service.js` ·
`src/controllers/auth.controller.js` · `src/routes/auth.routes.js` ·
`src/routes/workspace.routes.js` · `src/routes/team.routes.js` ·
`src/validators/auth.validator.js` · `src/constants/security.js` ·
`src/config/env.js` · `src/utils/sanitizeUser.js` · `src/utils/emailLinks.js` ·
`src/services/email.service.js` (comments only) · `scripts/preflight.js` ·
`scripts/generate-openapi.js` · `scripts/openapi-operations.js` ·
`docs/openapi.json` (regenerated) · `docs/API.md` · `docs/ENVIRONMENT.md` ·
`.env.example` · `package.json` · `tests/auth-email.test.js` ·
`tests/helpers/factories.js`

### Modified — frontend

`src/routes/index.tsx` · `src/routes/guards.tsx` · `src/pages/Register.tsx` ·
`src/pages/Login.tsx` · `src/pages/ResetPassword.tsx` (comment) ·
`src/pages/WorkspaceList.tsx` · `src/layouts/AppShell.tsx` ·
`src/lib/api/endpoints.ts` · `src/lib/api/types.ts` ·
`src/lib/auth/AuthProvider.tsx` · `src/lib/auth/redirect.ts` ·
`dev/qa.mjs` · `dev/verify-fixes.mjs` · `dev/boot-real-api.mjs` (comments) ·
`package.json`

### Modified — documentation

`README.md` · `client/README.md` · `PHASE-5-EMAIL-REPORT.md` (marked superseded)

---

## 2. Verification functionality removed

**Backend**

- The `isVerified` and `verificationToken` schema fields, and `verificationToken.hash` from the `toJSON` transform.
- `isVerified` and `verificationEmailSentAt` from `sanitizeUser` — so they are gone from every API response.
- The verification email send during registration, and the `verificationEmailSent` response flag with it.
- `issueVerificationEmail`, `verifyEmail` and `resendVerificationEmail` from the auth service.
- The `verifyEmail` and `resendVerification` controller handlers.
- `POST /auth/verify-email` and `POST /auth/resend-verification`.
- `verifyEmailSchema` and `resendVerificationSchema`.
- `requireVerifiedEmail` and its two call sites — the guard is off `POST /workspaces` and `PATCH /invitations/:token/accept`.
- `buildVerificationUrl` from the link builder.
- `VERIFICATION_TOKEN_TTL_MS`.

**Frontend**

- The `/verify-email` route and its lazy import.
- The verification-pending, verifying, verified and invalid-link screens.
- The resend-verification control.
- The `VerificationNotice` banner from the app shell and the workspace list.
- The `isVerified` gate that hid the "New workspace" button.
- The `verifyEmail` and `resendVerification` API client methods.
- The `isVerified` and `verificationEmailSentAt` fields on the `User` type.
- `postAuthDestination` and `VERIFICATION_DESTINATION` from the redirect helper.
- The `verify:email` npm script.

**No frontend screen was merely hidden.** The registration flow, the backend
guard chain, and the redirect logic were all changed together — a form that no
longer navigates to a page that no longer exists, against an API that no longer
has the endpoint.

---

## 3. Authentication and email features preserved

| Preserved | Evidence |
| --- | --- |
| Registration | 201, cookie set, user returned |
| Login | 200, cookie set; wrong password still 401 |
| Logout | 200, cookie cleared |
| Password hashing | bcrypt, `BCRYPT_SALT_ROUNDS`, still asserted |
| JWT / session handling | Unchanged — same secret, algorithm, 15-minute lifetime, cookie attributes |
| Protected routes | `authenticate` untouched; `npm run qa` passes |
| Forgot / reset password | **Fully preserved** — 30 of the 40 tests in `auth-email.test.js`, plus the whole `verify:reset` browser harness |
| Reset token security | Single-use hashed tokens, 1-hour expiry, session revocation via `passwordChangedAt` |
| Workspace invitations | `POST /workspaces/:id/invitations` and `PATCH /invitations/:token/accept` work unchanged, now without a verification precondition |
| The shared Resend service | `email.service.js` kept — it was never the verification service, it was the mail transport. Only its comments changed |
| Invitation email | Never existed as an email; invitations return a `token` the inviter copies. **Nothing removed** |
| Other security controls | Rate limits, validation, authorization, the `passwordChangedAt` check — all untouched |

**Nothing was weakened to make a test pass.** The only validator change was
removing two now-unused schemas; no existing rule was relaxed.

---

## 4. Database and environment changes

### The database needs no migration, and no reset

Mongoose **ignores document paths its schema no longer declares**. A leftover
`isVerified` or `verificationToken` is inert: not read, not written, not
serialised. So:

- **No user is deleted.** No account is reset. No password is affected.
- **Existing users can still log in** — and this is asserted, not assumed. Five
  tests in `auth-email.test.js` write exactly the legacy shape into a real
  document and prove login, workspace creation, the API response, and the reset
  flow are all unaffected.
- **No database reset is required.**

The one thing to be aware of: a document left with `isVerified: false` from the
previous version is now simply an ignored field. Under the old code that value
would have blocked workspace creation. It no longer can, because nothing reads
it.

### `migrateRemoveVerificationFields.js` — optional

`npm run migrate:remove-verification-fields`

It `$unset`s `isVerified` and `verificationToken` and touches **nothing else** —
no user, no credential, no membership, no `passwordResetToken`. It is idempotent.

**It is a tidy-up, not a fix.** The application is correct with or without it.
Run it when you want the stored documents to match the schema. Because `$unset`
cannot be undone, take a backup first if you want the option — the command is in
the file's header comment.

### Environment variables — now optional, and no longer fatal

`RESEND_API_KEY`, `EMAIL_FROM` and `CLIENT_URL` are **kept**, because password
reset still uses them. They are **not** verification-only.

What changed is their **severity**, and this matters for deploying:

| | Before | Now |
| --- | --- | --- |
| `env.js` at boot | Missing email config was a **fatal** error in production | A **warning** |
| `preflight.js` | Three **failures** | Three **warnings** |

This was not cosmetic. While verification existed, an unconfigured provider meant
nobody could finish signing up, so refusing to boot was right. Now the only
sender is password reset, so an unconfigured provider degrades one recovery path
— and a fatal check would have **blocked the very deployment this change exists
to enable**. The warning is still explicit about what is lost.

**So: you can deploy with no email configuration at all.** Registration, login,
workspaces, projects, tasks and invitations all work. Only "forgot password"
will not deliver a link, and the boot warning and `npm run preflight` both say so.

---

## 5. Tests run — actual results

### A note on the pre-change baseline

The brief asks for a baseline before editing. My first attempt was **invalid and
I am not reporting it as a baseline**: I launched it and then began editing while
it ran, so it picked up half-deleted modules and reported `131 pass, 315
cancelled`. The cancellation was a module-load error from a file I was deleting
mid-run, not a product failure.

The real pre-change baseline is **446 / 446 pass, 0 fail** — established at the
end of the previous phase and unchanged since, as the only intervening writes
were to report and memory files.

### Final results

| Command | Result |
| --- | --- |
| `cd server && MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test` | **435 / 435 pass, 0 fail, 0 skipped** (97 suites) |
| `cd server && npm run lint` | **0 problems** |
| `cd server && npm run format:check` | **All matched files use Prettier code style** |
| `cd server && npm run docs:verify` | **84 routes / 84 operations / 523 refs / 64 paths / 50 schemas — matches** |
| `cd server && npm run preflight` | Runs; email reported as warnings, not failures — the intended change |
| `cd client && npm run typecheck` | **exit 0** |
| `cd client && npm run lint` | **0 errors, 16 warnings** (all pre-existing `react-refresh`) |
| `cd client && npm run format:check` | **All matched files use Prettier code style** |
| `cd client && npm run build` | **exit 0** — built in 38.6 s |
| `cd client && npm run qa` | **145 / 145 pass, 0 skipped** |
| `cd client && npm run verify:fixes` | **20 / 20 pass** |
| `cd client && npm run verify:reset` | **14 / 14 pass** |

**The test count moved 446 → 435 (−11), and every one of those is a removed
verification test.** `auth-email.test.js` went 51 → 40. No other file changed its
count. The 40 remaining tests are:

- **10** asserting the removal: registration sends no email, reports no
  verification state, and produces an immediately usable account; the schema no
  longer declares the fields; both endpoints return **404**.
- **5** asserting existing-account compatibility (the legacy-data tests above).
- **25** covering password reset, email configuration, and rate limiting.

The browser harness `verify:reset` was rewritten from 18 checks to 14 — the four
verification scenarios dropped, and checks added for "registration sends no email
and asks for no confirmation" and "a brand-new account can create a workspace
immediately". Both pass.

### What the harnesses proved, end to end

```
ok  registering signs the user in and lands in the app — landed on /workspaces
ok  registration sends no email and asks for no confirmation
ok  a brand-new account can create a workspace immediately
ok  the old verification route no longer exists
ok  the sign-in screen offers a way to recover the password
ok  requesting a reset says nothing about whether the account exists
ok  the reset email is sent to the right address — link → /reset-password
ok  an unknown address gets the identical response
ok  the emailed link opens the reset form
ok  a mismatched confirmation is refused before it reaches the API
ok  a valid reset sets the new password
ok  the new password signs in and the old one does not — landed on /workspaces
ok  a reused reset link is refused
ok  a reset link with no token explains itself
===== 14 passed, 0 failed =====
```

Against the real build on `:4173` proxying to the real `server/app.js`, driving
real Chrome. The reset token is available to the test only **inside the email**,
exactly as it is for a user.

---

## 6. Remaining references to email verification

Every remaining occurrence is intentional, and each falls into one of four
categories. A repo-wide search for `isVerified`, `verificationToken`,
`verificationEmailSent`, `requireVerifiedEmail`, `verify-email`,
`resend-verification` and `VERIFICATION_TOKEN` across `server/src`, `server/tests`,
`server/scripts`, `server/docs`, `client/src`, `client/dev` and both READMEs
returns **no unexpected hits**.

| Where | Why it remains |
| --- | --- |
| `auth.controller.js`, `auth.service.js`, `email.service.js` | **Comments explaining the removal** — why registration sends nothing, why the email config is now a warning. Deleting the explanation would leave the next reader wondering. |
| `migrateRemoveVerificationFields.js` | The cleanup migration must name the fields it removes, and describe the legacy shape. |
| `tests/auth-email.test.js` | Tests that **assert the removal**: the fields are absent from the payload, the schema no longer declares them, the endpoints 404, and legacy data is inert. These are the guard against the feature being reintroduced by accident. |
| `client/dev/verify-password-reset.mjs` | One check that `/verify-email` now shows a not-found screen. |

### One reference I did **not** change

`server/docs/DATABASE.md` line 67 lists `isVerified` under the Users fields.

**I left it alone deliberately.** It is not a leftover of this feature:
`git show HEAD:server/docs/DATABASE.md` shows the line was already there before
verification was ever built. The file is documented in the project's own notes as
stale and not to be used as a reference — its field list does not match the
models (it omits `settings`, `isDeleted`, `passwordChangedAt` and
`passwordResetToken` entirely).

Correcting that one line would mean editing a file whose whole field list is
wrong, which is outside this task. **Flagging it so you can decide**: either
delete the line, or regenerate the file from the models.

---

## 7. Outstanding issues

- **Password reset cannot deliver email until Resend is configured with a
  verified domain.** This is the trade you chose and it is the right one —
  registration is unblocked — but a user who forgets their password currently has
  no way back in. The server warns at boot and `npm run preflight` reports it, so
  it will not be a surprise. When you have a domain, set `RESEND_API_KEY`,
  `EMAIL_FROM` and `CLIENT_URL` and the flow works with no code change.
- **Invitations still do not send email.** That was true before this change too —
  the endpoint returns a `token` and the inviter copies the link. Nothing was
  removed; if you want invitation emails later, `email.service.js` is the
  transport and a template is all that is missing.
- **`docs/DATABASE.md` is stale** — see §6.
- **`docs/openapi.json` is regenerated** and now describes 84 operations rather
  than 86. It is generated from the implementation, so it cannot drift silently.
- **The pre-change baseline in §5 is quoted from the end of the previous phase**,
  not re-measured, for the reason given there. If you want a fresh one, it would
  require reverting this change, running the suite, and re-applying it.

---

## 8. Scope confirmation

- **No commit was made.**
- **Only the email verification feature was removed.** No unrelated module was
  rewritten, and the two enforcement call sites are one-line removals from
  existing route definitions.
- **The authentication strategy is unchanged.** Same JWT, same cookie, same
  middleware, same lifetime, same hashing.
- **Nothing was hidden rather than removed.** The backend endpoints are gone, not
  disabled; the frontend route is gone, not guarded.
- **No security control was weakened.** Rate limits, validation, authorization,
  reset-token hashing and session revocation are all intact and still tested.
- **No data was destroyed.** No user, credential, workspace or membership was
  touched, and the cleanup migration is optional.
