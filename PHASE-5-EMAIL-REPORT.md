# PROJEX Phase 1 — Secure Email Infrastructure and Account Recovery

> **Superseded in part — see `PHASE-6-REMOVE-VERIFICATION-REPORT.md`.**
>
> Email verification, as described in §3.B and §3.E of this report, was later
> **removed at the product owner's request**, because no custom domain was
> configured for Resend and the feature was therefore blocking registration
> rather than protecting it.
>
> This file is kept as an accurate record of what was built and why. The
> password-reset work in §3.C, the email infrastructure in §3.A, and the
> reasoning in §4.1 and §4.2 all still stand and are still in the codebase.

Transactional email (Resend), email verification, and a complete
forgot/reset-password flow.

**No commit was made.** Every command below was run; the results are the actual
output, not a summary of intent. Where something could not be verified it is
stated plainly in §8 rather than implied to be covered.

---

## 1. Pre-change baseline

Established **before** any edit, per rule 4:

```
MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test
```

| | |
| --- | --- |
| Tests | **395** |
| Suites | 89 |
| Pass | **395** |
| Fail | **0** |
| Skipped | 0 |

**No pre-existing failures.** The suite was green before this work, so every
failure encountered during it was mine to fix and every final result is a
regression check against a clean starting point.

---

## 2. What was inspected first

Per rule 1, before editing anything:

| Area | Where it lives |
| --- | --- |
| Backend entry point | `server/server.js` (listen) → `server/app.js` (assembly) |
| Auth routes | `src/routes/auth.routes.js` — register, login, logout |
| Auth controller / service | `src/controllers/auth.controller.js`, `src/services/auth.service.js` |
| User model | `src/models/User.js` |
| Validation | `src/validators/auth.validator.js` (`zod`), `src/middlewares/validate.middleware.js` |
| Authentication middleware | `src/middlewares/authenticate.middleware.js` |
| Token / session strategy | HS256 JWT in an `httpOnly`, `SameSite=Strict` cookie, 15-minute absolute lifetime, **no refresh token** |
| Existing revocation | `passwordChangedAt`, compared against the token's `iat` |
| Frontend auth pages | `client/src/pages/{Login,Register,AcceptInvitation}.tsx`, `client/src/layouts/AuthShell.tsx` |
| API client | `client/src/lib/api/{client,endpoints,types}.ts` |
| Environment config | `server/src/config/env.js`, `scripts/preflight.js`, `.env.example` |
| Tests | `server/tests/*.test.js` (`node:test` + `supertest` + `mongodb-memory-server`) |

Two findings from that pass shaped the implementation:

1. **`sanitizeUser` already emitted `isVerified`** — but no such field existed on
   the model, so it serialised as `undefined` and `JSON.stringify` dropped it.
   The field had been anticipated; this phase fills it in.
2. **`client/src/routes/index.tsx` documented that no reset route existed
   "because the backend has no such endpoint"** — an accurate comment that this
   phase makes obsolete, and which was updated rather than left to mislead.

### Architecture followed, not replaced

- One new service (`email.service.js`) beside the existing ones, and one new
  middleware, rather than a second auth system.
- Password hashing, the password policy, the JWT strategy, the cookie
  attributes, the `ApiError`/`ApiResponse` envelope, the Zod validation layer and
  the rate limiter are all **reused unchanged**.
- **Session revocation uses `passwordChangedAt`** — the mechanism that already
  existed. No revocation system was invented.

---

## 3. What was built

### A. Email infrastructure

`src/services/email.service.js` — the single provider boundary. Every message
(verification, reset, and any invitation email later) goes through `sendEmail`.

- The Resend SDK does **not** throw for API rejections; it resolves with
  `{ data: null, error }`. Both that and a thrown transport failure are handled,
  and **both throw** from the service. Neither is swallowed.
- `sendEmail` deliberately does not return a boolean or a nullable id. A caller
  that forgot to check a return value would carry on as though mail had gone out,
  and "we told the user to check their inbox" over a message that does not exist
  is a dead end the user cannot recover from.
- Logging is operational only: provider, subject, provider error name/status, and
  a **masked** recipient (`a***@example.com`). Not the API key, not the token,
  not the body. Provider messages are additionally scrubbed for `re_…` key
  patterns before they are written.
- Configuration is validated at boot (`env.js`, fatal in production) **and** at
  the service boundary (a 503 if a send is attempted unconfigured).

`src/emails/layout.js` + `verifyEmail.js` + `resetPassword.js` — PROJEX-branded
HTML with plain-text alternatives. The constraints of email HTML are handled
explicitly: inline styles (Gmail strips `<style>`), tables with
`role="presentation"`, a table-cell button (Outlook collapses padding on an
anchor), and a hidden preheader (otherwise every message previews as the
wordmark). Every interpolated value is HTML-escaped at the point of
interpolation — an unescaped display name is a phishing primitive, not a
rendering glitch.

### B. Email verification

- Registration creates the account **unverified** and sends a confirmation link.
- Tokens: 32 bytes of CSPRNG output (`crypto.randomBytes`), stored as a
  **SHA-256 digest only**, with a 24-hour expiry.
  - SHA-256 rather than bcrypt, and the reasoning is in `src/utils/emailTokens.js`:
    bcrypt exists to make *low-entropy* secrets expensive to guess. This token is
    256 bits of random; there is no dictionary to run, and a slow hash would be
    paid on every click. A fast digest is correct **because** the input is
    already unguessable — which is the property that has to hold for it to stay
    correct.
- Lookup is by digest with a unique index, so the database does the matching and
  there is no in-process comparison of a secret.
- Links are built from `CLIENT_URL` only — **never** the `Host` header. See
  `src/utils/emailLinks.js` for the attack this closes.
- Single use is enforced by clearing the digest on success.
- Resend is **authenticated** and takes no body; the address comes from the
  session.

### C. Forgot / reset password

- Request endpoint returns an identical response for a known address, an unknown
  address, and a provider failure.
- Reset tokens: same construction, **one-hour** expiry (shorter than
  verification, because a reset link is a credential).
- Token, expiry and single-use status are all validated **before** the password
  is touched. A validation failure does not consume the token.
- The new password is assigned as plaintext and saved, so the existing
  `pre('save')` hook applies `BCRYPT_SALT_ROUNDS` and stamps
  `passwordChangedAt` — one place owns the policy.
- Nothing changes until a valid token is submitted.

### D. Frontend

`/verify-email`, `/forgot-password`, `/reset-password`, a persistent
`VerificationNotice` in the app shell and on the workspace list, a "Forgot your
password?" link on the sign-in form, and client-side validation that mirrors the
server's rules.

Tokens are read from the query string and held in component state only — never
`localStorage`, `sessionStorage` or a cookie. The page uses the token once,
immediately; a durable copy would be a durable liability.

### E. The verification policy

An unverified account may **sign in and read**, but may not **obtain workspace
membership**. That is enforced on exactly two routes:

- `POST /workspaces`
- `PATCH /invitations/:token/accept`

Those are the only two ways membership is created, and every nested resource sits
behind `requireWorkspaceMember`. So two guards cover the whole surface **by
construction** rather than by remembering to add a third when a route is added.
A guard on every mutating route would have been a far larger change to unrelated
modules for no additional coverage.

`403`, not `401` — the caller is authenticated and their session is fine. A `401`
would tear the session down and bounce them to the login screen, which is both
wrong and confusing.

---

## 4. Two findings worth calling out

### 4.1 Mongoose applies schema defaults on **load**, not only on create

This was measured against a real database, not assumed, and it inverted the
original design.

The first version defaulted `isVerified` to `false` and treated a missing field
as "grandfathered, so verified". That reasoning is **wrong**: Mongoose hydrates a
document whose path is absent with the schema default, so every pre-existing
account would have read back `false` — and, with the enforcement above, every
existing user would have lost the ability to create a workspace or accept an
invitation. A schema change causing an outage for the entire user base.

The probe that established it:

```
after create:                  true
raw document has isVerified key: false    ← genuinely absent in MongoDB
hydrated isVerified:           false      ← the default is applied on load
```

The fix is the default itself: **`default: true`**, with `false` set
*explicitly* in the single place an unverified account is created
(`registerUser`). The default is now a decision about existing users, and it is
the backward-compatible one. `tests/auth-email.test.js` removes the field from a
real document and asserts the account still works — the guard against someone
"tidying" the default back to the intuitive-but-catastrophic `false`.

`migrateUserVerification.js` backfills the field so the stored state is explicit.
It is a tidiness measure, **not a prerequisite**: the application behaves
correctly with or without it.

### 4.2 A redirect race the codebase had already warned about

Sending a new registration to `/verify-email` from the form while
`RequireAnonymous` still sent authenticated users to `/workspaces` produced a
race — both fire at the moment the session is established, and whichever commits
last wins. The browser test caught it: the form's navigation was overridden and
the user landed on a workspace list they could not use.

`client/src/routes/guards.tsx` documents this exact hazard. The fix routes all
three destination decisions (the guard, the login form, the register form)
through one shared `postAuthDestination` helper, so they agree by construction.

---

## 5. Changed files

### New — backend

| File | Purpose |
| --- | --- |
| `src/services/email.service.js` | The Resend boundary; throws on every failure path |
| `src/emails/layout.js` | Shared HTML shell, brand palette, HTML escaping |
| `src/emails/verifyEmail.js` | Confirmation email |
| `src/emails/resetPassword.js` | Password-reset email |
| `src/utils/emailTokens.js` | Token minting, SHA-256 digest, expiry |
| `src/utils/emailLinks.js` | Link construction from `CLIENT_URL` only |
| `src/utils/verification.js` | The verified/unverified predicate |
| `src/middlewares/requireVerifiedEmail.middleware.js` | Enforcement |
| `src/migrations/migrateUserVerification.js` | Backfill for pre-existing accounts |

### New — frontend

| File | Purpose |
| --- | --- |
| `client/src/pages/VerifyEmail.tsx` | Pending, verifying, verified, invalid |
| `client/src/pages/ForgotPassword.tsx` | Request a reset link |
| `client/src/pages/ResetPassword.tsx` | Choose a new password |
| `client/src/components/VerificationNotice.tsx` | Standing notice for unverified accounts |

### New — tests and harnesses

| File | Purpose |
| --- | --- |
| `server/tests/auth-email.test.js` | 51 tests, all mocked |
| `server/tests/helpers/emailTransport.js` | Recording fake, two failure shapes |
| `client/dev/verify-email-flows.mjs` | 18 end-to-end browser checks |

### Modified — backend

`src/models/User.js` (isVerified + hashed token fields) · `src/services/auth.service.js`
(four new flows) · `src/controllers/auth.controller.js` · `src/routes/auth.routes.js`
(now a factory, so tests can mount the real routes with limiters on) ·
`src/validators/auth.validator.js` · `src/constants/security.js` · `src/config/env.js` ·
`src/utils/sanitizeUser.js` · `src/routes/workspace.routes.js` and
`src/routes/team.routes.js` (the two enforcement points) · `scripts/preflight.js` ·
`scripts/generate-openapi.js` · `scripts/openapi-operations.js` · `docs/openapi.json`
(regenerated) · `package.json` · `.env.example`

### Modified — frontend

`src/lib/api/{types,endpoints}.ts` · `src/lib/auth/AuthProvider.tsx` ·
`src/lib/auth/{redirect,validation}.ts` · `src/routes/{index,guards}.tsx` ·
`src/pages/{Register,Login,WorkspaceList}.tsx` · `src/layouts/AppShell.tsx` ·
`package.json`

### Modified — tests

`tests/helpers/setup.js` (env + installs the fake transport) ·
`tests/helpers/factories.js` (`isVerified` explicit)

### Modified — documentation

`README.md` · `server/docs/ENVIRONMENT.md` · `server/docs/API.md` ·
`client/README.md`

---

## 6. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | **Production** | Resend API key, starts with `re_` |
| `EMAIL_FROM` | **Production** | Verified sender, e.g. `PROJEX <no-reply@yourdomain.com>` |
| `CLIENT_URL` | **Production** | Public frontend origin, **no trailing slash** |

In development all three are optional: the application starts, logs a warning,
and registration reports `verificationEmailSent: false` rather than pretending.
In production a missing value is a **boot failure**, and `npm run preflight`
reports all three together with the reason.

`CLIENT_URL` has no request-derived fallback anywhere in the email code.

---

## 7. Resend dashboard setup

Required before any real email is delivered:

1. **Create an account** at <https://resend.com> and add the sending domain
   under **Domains → Add Domain**.
2. **Add the DNS records** Resend shows you (DKIM and SPF TXT/CNAME entries).
   Until these are verified, **every send is rejected with a 403** and no mail
   leaves Resend.
3. **Wait for verification** (usually minutes; DNS propagation can take longer).
4. **Create an API key** under **API Keys**, scoped to *Sending access*, and put
   it in `RESEND_API_KEY`.
5. **Set `EMAIL_FROM`** to an address **at the verified domain**.
   `onboarding@resend.dev` only delivers to the account owner's own address and
   is not suitable beyond a first smoke test.
6. **Optionally** add a webhook for `email.bounced` / `email.delivered`. Nothing
   in this codebase consumes webhooks yet — bounces are currently only visible in
   the Resend dashboard.

---

## 8. Verification: commands and actual results

All commands run from the repository root unless noted.

### Backend

| Command | Result |
| --- | --- |
| `cd server && MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test` | **446 / 446 pass, 0 fail, 0 skipped** (100 suites) — was 395 |
| `cd server && npm run lint` | **0 problems** |
| `cd server && npm run format:check` | **All matched files use Prettier code style** |
| `cd server && npm run docs:verify` | **86 routes / 86 operations / 531 references / 66 paths / 51 schemas — matches** |
| `cd server && npm run preflight` | Ran; reports the three email variables as failures for a production environment that does not set them — expected, since `.env` is development |

### Frontend

| Command | Result |
| --- | --- |
| `cd client && npm run typecheck` | **exit 0** |
| `cd client && npm run lint` | **0 errors, 16 warnings** (all pre-existing `react-refresh`) |
| `cd client && npm run format:check` | **All matched files use Prettier code style** |
| `cd client && npm run build` | **exit 0** |
| `cd client && npm run qa` | **145 / 145 pass** — no UI regressions |
| `cd client && npm run verify:fixes` | **20 / 20 pass** — the previous phase's fixes still hold |
| `cd client && npm run verify:email` | **18 / 18 pass** — new |

### What the new tests cover (brief §E)

All 51 in `tests/auth-email.test.js`, with Resend mocked throughout:

| Requirement | Covered |
| --- | --- |
| Registration creates the correct verification state | ✓ `isVerified: false`, `verificationEmailSent: true` |
| Verification email requested with the correct recipient and URL | ✓ asserts `to` and that the link starts with `CLIENT_URL` |
| Valid / expired / invalid / already-used verification tokens | ✓ all four, plus the digest being cleared |
| Resend throttling and verification enforcement | ✓ 429 past the budget; 403 on both membership routes |
| Forgot-password does not disclose account existence | ✓ **whole response body** compared, not just the message |
| Valid / expired / invalid / reused reset tokens | ✓ all four |
| Password hashing and subsequent login | ✓ bcrypt format asserted; new password works, old one 401s |
| Provider failures and missing configuration | ✓ both SDK failure shapes, and the 503 |
| Rate limits, validation errors, auth regressions | ✓ plus the existing 395-test suite |

Two things the suite does deliberately beyond the checklist:

- **A legacy account is simulated by removing the field from a real document**,
  and the account is then proved able to create a workspace. That is the
  migration-compatibility guarantee, asserted rather than asserted-about.
- **`existing sessions are revoked` waits 1.2 seconds** before resetting. The
  middleware allows a one-second `iat` tolerance by design, so resetting
  immediately would leave the old token valid for a correct reason and the test
  would be asserting the tolerance rather than the revocation.

### Browser verification (`npm run verify:email`)

Against the real build on `:4173` proxying to the real `server/app.js` on `:5000`,
driving real Chrome:

```
ok  registering sends a confirmation email and lands on the pending screen — link → /verify-email
ok  the unverified account is told it cannot create a workspace yet
ok  the app shell shows the verification notice
ok  an unverified account is not offered the create-workspace button
ok  opening the emailed link confirms the address
ok  the restriction is lifted and the notice is gone
ok  the link cannot be used a second time
ok  a fabricated token is refused
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
===== 18 passed, 0 failed =====
```

The token is never available to this test except **inside the email**, exactly as
it is for a user, so following the link exercises the whole chain rather than a
synthetic one.

---

## 9. Remaining limitations and manual verification

### Not verified — and cannot be, from here

- **No email was ever sent to a real inbox.** There is no Resend API key in this
  environment, and the test suite mocks the provider by design. The SDK call
  shape is exercised, the failure paths are exercised, and the links are correct
  — but **the integration with Resend's live API has not been proven**. Treat the
  first production send as the real test.
- **DNS verification and deliverability are untested.** Whether the domain is
  verified, whether mail lands in the inbox rather than spam, and whether the
  HTML renders correctly in Gmail, Outlook and Apple Mail are all unverified.
  The HTML follows the known constraints, but "follows the constraints" is not
  "renders correctly in every client".
- **Bounce and complaint handling does not exist.** A hard bounce is invisible to
  this application; Resend will keep accepting sends to a dead address.
- **The rate limiters remain per-process.** Unchanged from before this phase and
  documented in `DEPLOYMENT.md`: with N instances the effective limit is N × max.
- **Firefox and Safari are not covered** by the browser harness, which drives
  Chrome.

### Deliberate trade-offs

- **`forgot-password` reports a provider failure to nobody.** The brief requires
  both "a generic response that does not reveal whether an email address belongs
  to an account" and "never silently pretend an email was sent". Those conflict
  on this one endpoint: a distinct failure response would occur *only* for
  addresses that **do** have accounts, so the error path itself becomes the
  enumeration oracle the endpoint exists to prevent. The resolution is to keep
  the response generic and make the failure **loud in the logs** (error level,
  with the provider's own reason). It is not silent; it is just not visible to
  the caller. Registration and the authenticated resend endpoint both report
  failures honestly, because neither has an enumeration concern.
- **Revocation covers access tokens only.** There is no refresh token and no
  server-side session store, so `passwordChangedAt` is the complete set of
  credentials this architecture issues. It is effective, and it is the existing
  mechanism — but a deployment that later adds refresh tokens would need to
  revoke those separately.
- **`resend-verification` requires a session.** A user whose session lapsed must
  sign in again to request a new link. That is one extra step, and it is what
  buys honest error reporting and removes an unauthenticated mail-triggering
  endpoint.

### Operational

- **Run the migration before deploying**, or the default covers it:
  `npm run migrate:user-verification`. Not required for correctness — see §4.1.
- **`client/dev/boot-real-api.mjs` now also serves a dev mailbox** on
  `127.0.0.1:5051` so the browser harnesses can read emailed links. It is part of
  the harness, not the application: `server/app.js` has no such route, and an
  endpoint returning verification tokens would be an account-takeover primitive.
  It must never be reproduced in the product.
- **The previous phase's harnesses were updated** (`qa.mjs`, `verify-fixes.mjs`)
  to confirm their seeded account before creating a workspace, because
  registration is now unverified and workspace creation is refused. This is the
  enforcement working, not a harness workaround — the seed now does what a real
  user does.

---

## 10. Scope confirmation

- **No commit was made.**
- **No credentials in source.** `RESEND_API_KEY` is read from the environment;
  `.env.example` carries a placeholder. Tests set `RESEND_API_KEY` to the empty
  string, which is what stops a real key in `.env` from ever being picked up by a
  test run.
- **The authentication strategy is unchanged.** Same JWT, same cookie, same
  middleware, same lifetime.
- **No existing validation was removed or weakened.** The only validator change
  was making `resend-verification`'s body `optional()`, so a bodyless POST is
  accepted instead of rejected with "expected object, received undefined".
- **Unrelated modules were not rewritten.** The two enforcement points are
  one-line additions to existing route definitions.
- **Existing users are not locked out**, and that guarantee is asserted by a test
  rather than asserted in prose.
