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
