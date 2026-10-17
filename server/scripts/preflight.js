/*
 * Production preflight.
 *
 * Run automatically by `npm run start:prod`, and available on its own as
 * `npm run preflight`.
 *
 * The application already validates its configuration at boot and refuses to
 * start on a fatal mistake. This checks the things that are *legal* but wrong
 * for a real deployment — a placeholder secret, a localhost database, a
 * missing CORS allow-list — and reports all of them at once rather than one
 * per restart.
 *
 * Exit codes: 0 = ready (possibly with warnings), 1 = not ready.
 *
 * It reads only `process.env`; it does not import the application config, so
 * it can report on a broken configuration rather than crashing on it. Secrets
 * are never printed — only their length and a pass/fail verdict.
 */
import dotenv from 'dotenv';

dotenv.config();

const failures = [];
const warnings = [];
const notes = [];

const get = (name) => (process.env[name] ?? '').trim();

const isSet = (name) => get(name).length > 0;

/* Placeholders that must never reach production. */
const PLACEHOLDERS = [
  'your_jwt_access_secret_at_least_32_characters',
  'your_mongodb_connection_string',
  'change-me',
  'changeme',
  'secret',
  'password',
];

const looksLikePlaceholder = (value) =>
  PLACEHOLDERS.some((placeholder) => value.toLowerCase().includes(placeholder));

/* ---------------- NODE_ENV ---------------- */
const nodeEnv = get('NODE_ENV') || 'development';

if (nodeEnv !== 'production') {
  failures.push(`NODE_ENV is "${nodeEnv}", expected "production".`);
}

/* ---------------- JWT secret ---------------- */
const secret = get('JWT_ACCESS_SECRET');

if (!isSet('JWT_ACCESS_SECRET')) {
  failures.push('JWT_ACCESS_SECRET is not set.');
} else if (secret.length < 32) {
  failures.push(
    `JWT_ACCESS_SECRET is ${secret.length} characters; at least 32 are required. ` +
      'Generate one with: openssl rand -hex 32'
  );
} else if (looksLikePlaceholder(secret)) {
  failures.push('JWT_ACCESS_SECRET still contains a placeholder value. Rotate it.');
} else {
  notes.push(`JWT_ACCESS_SECRET: ${secret.length} characters`);
}

/* ---------------- Database ---------------- */
const mongoUri = get('MONGODB_URI');

if (!mongoUri) {
  failures.push('MONGODB_URI is not set.');
} else if (looksLikePlaceholder(mongoUri)) {
  failures.push('MONGODB_URI still contains a placeholder value.');
} else {
  // Report the host only — never the credentials embedded in the URI.
  const host = mongoUri
    .replace(/^mongodb(\+srv)?:\/\//, '')
    .split('@')
    .pop()
    .split('/')[0];

  notes.push(`MONGODB_URI host: ${host}`);

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(host)) {
    warnings.push(
      `MONGODB_URI points at "${host}". A database on the same host as the app ` +
        'is a single point of failure and loses its data if the host is replaced.'
    );
  }

  if (!mongoUri.includes('retryWrites')) {
    notes.push('MONGODB_URI does not set retryWrites; the driver default applies.');
  }
}

/* ---------------- CORS ---------------- */
const corsOrigins = get('CORS_ORIGINS');

if (!corsOrigins) {
  failures.push(
    'CORS_ORIGINS is empty. In production this refuses every cross-origin browser ' +
      'request, so a browser client will not be able to call the API.'
  );
} else {
  const origins = corsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  notes.push(`CORS_ORIGINS: ${origins.length} origin(s)`);

  for (const origin of origins) {
    if (!/^https:\/\//.test(origin)) {
      warnings.push(`CORS origin "${origin}" is not HTTPS. Cookies are Secure in production.`);
    }

    if (origin === '*') {
      failures.push('CORS_ORIGINS contains "*", which is incompatible with credentialed requests.');
    }
  }
}

/* ---------------- Transactional email ---------------- */
/*
 * Warnings, not failures.
 *
 * Email verification was removed, so nothing sends mail during registration and
 * an unconfigured provider no longer breaks sign-up. The only flow that sends is
 * password reset, so a missing key degrades one recovery path rather than
 * blocking the product — and blocking the deploy for it would prevent exactly
 * the deployment this change exists to enable.
 *
 * They are still reported loudly, because "users cannot reset a forgotten
 * password" is something an operator should be told before it happens, not
 * discovered from a support ticket.
 */
const resendKey = get('RESEND_API_KEY');
const emailFrom = get('EMAIL_FROM');
const clientUrl = get('CLIENT_URL');

if (!resendKey) {
  warnings.push(
    'RESEND_API_KEY is not set: password reset cannot send a link. Registration and login ' +
      'are unaffected. Get a key from https://resend.com/api-keys'
  );
} else if (looksLikePlaceholder(resendKey)) {
  warnings.push('RESEND_API_KEY still contains a placeholder value. Replace it.');
} else if (!/^re_/.test(resendKey)) {
  /*
   * A key that does not look like one is far more often the wrong value pasted
   * into the wrong variable than a deliberate choice, and the failure it
   * produces at runtime is an opaque 401 from the provider.
   */
  warnings.push(
    'RESEND_API_KEY does not start with "re_". Check it is the API key, not a domain id.'
  );
} else {
  notes.push(`RESEND_API_KEY: ${resendKey.length} characters`);
}

if (!emailFrom) {
  warnings.push(
    'EMAIL_FROM is not set: the provider will reject every send for want of a verified sender.'
  );
} else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$|^.+<[^@\s]+@[^@\s]+\.[^@\s]+>$/.test(emailFrom)) {
  warnings.push(`EMAIL_FROM "${emailFrom}" is not a valid address or "Name <address>" pair.`);
} else {
  notes.push(`EMAIL_FROM: ${emailFrom}`);
}

if (!clientUrl) {
  warnings.push(
    'CLIENT_URL is not set: password-reset links are built from it, and there is deliberately ' +
      'no request-derived fallback.'
  );
} else if (!/^https?:\/\//.test(clientUrl)) {
  warnings.push(`CLIENT_URL "${clientUrl}" must be an absolute URL, e.g. https://app.example.com`);
} else if (!/^https:\/\//.test(clientUrl)) {
  warnings.push(
    `CLIENT_URL "${clientUrl}" is not HTTPS. Reset links travel through email and should not ` +
      'be downgradeable to plaintext.'
  );
} else if (clientUrl.endsWith('/')) {
  warnings.push('CLIENT_URL ends with "/", which produces a doubled slash in emailed links.');
} else {
  notes.push(`CLIENT_URL: ${clientUrl}`);
}

/* ---------------- Proxy ---------------- */
const trustProxy = Number(get('TRUST_PROXY') || 0);

if (trustProxy === 0) {
  warnings.push(
    'TRUST_PROXY is 0. If the app runs behind a load balancer or reverse proxy, ' +
      'rate limiting will see the proxy address and one client can exhaust the budget ' +
      'for everyone.'
  );
} else {
  notes.push(`TRUST_PROXY: ${trustProxy} hop(s)`);
}

/* ---------------- Shutdown budget ---------------- */
const shutdownTimeout = Number(get('SHUTDOWN_TIMEOUT_MS') || 10000);

notes.push(`SHUTDOWN_TIMEOUT_MS: ${shutdownTimeout}`);

if (shutdownTimeout > 30000) {
  warnings.push(
    `SHUTDOWN_TIMEOUT_MS is ${shutdownTimeout}ms. Most orchestrators SIGKILL well before ` +
      'that, so the graceful path would never complete. Keep it below the platform grace period.'
  );
}

/* ---------------- Cookies ---------------- */
notes.push('Cookies are Secure and SameSite=Strict in production (set from NODE_ENV).');

/* ---------------- Report ---------------- */
const line = '─'.repeat(58);

console.log('Production preflight');
console.log(line);

for (const note of notes) console.log(`  ok    ${note}`);
for (const warning of warnings) console.log(`  warn  ${warning}`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);

console.log(line);

if (failures.length > 0) {
  console.log(
    `Not ready for production: ${failures.length} problem(s), ${warnings.length} warning(s).`
  );
  process.exit(1);
}

console.log(`Ready. ${warnings.length} warning(s) to review.`);
