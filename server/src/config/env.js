import dotenv from 'dotenv';

dotenv.config();

/*
 * Environment configuration with fail-fast validation.
 *
 * Previously every value was read and coerced blindly: a missing
 * BCRYPT_SALT_ROUNDS became NaN (bcrypt then throws), and a missing
 * JWT_ACCESS_SECRET only surfaced as a 500 on the first login attempt.
 * Validating at boot turns those into a single, actionable startup error.
 */

const parseNumber = (value, fallback) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseList = (value) =>
  typeof value === 'string' && value.trim().length > 0
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/*
 * Parse a jsonwebtoken-style duration into milliseconds.
 *
 * `JWT_ACCESS_EXPIRES_IN` accepts `'15m'`, `'1h'`, `'900s'`, `'7d'` or a bare
 * number of **seconds** — that is jsonwebtoken's own grammar (`ms`), and
 * `COOKIE_MAX_AGE` is in **milliseconds**, a different unit with a different
 * scale. Nothing previously connected the two, so setting one without the other
 * silently produced a cookie that expired before its token (the user is logged
 * out early, which is exactly the "session ended too soon" symptom) or a token
 * that outlived its cookie.
 *
 * Returns null when the value cannot be understood, so the caller can warn
 * rather than guess.
 */
const DURATION_UNITS_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

const parseDurationMs = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value * 1000 : null;
  if (typeof value !== 'string') return null;

  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(value);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  // A bare number is seconds, matching jsonwebtoken.
  if (!unit) return amount * 1000;

  return unit === 'ms' ? amount : amount * DURATION_UNITS_MS[unit];
};

/*
 * Minimum JWT secret length. HS256 security is bounded by the key's entropy,
 * so a short secret is brute-forceable offline if a token is ever captured.
 */
const MIN_JWT_SECRET_LENGTH = 32;

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 15;

const nodeEnv = process.env.NODE_ENV || 'development';

const isProduction = nodeEnv === 'production';

/*
 * The token lifetime, resolved once, in milliseconds.
 *
 * The access token is what actually gates a request, so the cookie is only
 * transport for it. Deriving the cookie's lifetime from the token's — and
 * warning when they are set to disagree — means the two can never drift apart
 * in the direction that logs a user out while their token is still valid.
 */
const jwtAccessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';

const tokenLifetimeMs = parseDurationMs(jwtAccessExpiresIn);

const configuredCookieMaxAge = process.env.COOKIE_MAX_AGE
  ? parseNumber(process.env.COOKIE_MAX_AGE, null)
  : null;

const cookieMaxAge = configuredCookieMaxAge ?? tokenLifetimeMs ?? 15 * 60 * 1000;

/*
 * Log level. Defaults to `info` in production so debug noise never reaches a
 * log store by accident, and `debug` elsewhere so local work is verbose.
 */
const LOG_LEVELS = ['error', 'warn', 'info', 'http', 'debug'];

const requestedLogLevel = (process.env.LOG_LEVEL || '').trim().toLowerCase();

const logLevel = LOG_LEVELS.includes(requestedLogLevel)
  ? requestedLogLevel
  : isProduction
    ? 'info'
    : 'debug';

const env = {
  port: parseNumber(process.env.PORT, 5000),
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',

  logLevel,

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn,

  /*
   * Resolved above from `COOKIE_MAX_AGE` when set, otherwise from the token
   * lifetime so the two agree by construction.
   */
  cookieMaxAge,

  mongoUri: process.env.MONGODB_URI,

  /*
   * How long the driver waits to find a reachable server before giving up.
   * The default (30s) makes a misconfigured deployment look like a hang, so
   * it is shortened to fail fast and loudly.
   */
  mongoServerSelectionTimeoutMs: parseNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),

  /*
   * How long to wait for in-flight requests and the database connection to
   * finish during shutdown before exiting anyway. Must stay below the
   * orchestrator's own kill timeout, or it will SIGKILL first and the
   * graceful path never runs.
   */
  shutdownTimeoutMs: parseNumber(process.env.SHUTDOWN_TIMEOUT_MS, 10000),

  bcryptSaltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 10),

  /* ---------------------------------------------------------------- email */

  /*
   * Transactional email (Resend).
   *
   * `RESEND_API_KEY` and `EMAIL_FROM` are the provider credentials; `CLIENT_URL`
   * is the public frontend origin used to build verification and password-reset
   * links.
   *
   * `CLIENT_URL` is read from configuration and never from the request's `Host`
   * header. A Host header is attacker-controlled, so building a reset link from
   * it would let an attacker make the application email a link pointing at a
   * domain they own — which turns "reset your password" into a credential-theft
   * funnel. That is why there is a single trusted origin here and no
   * request-derived fallback anywhere in the email code.
   *
   * In development a sensible localhost default is used so the flows are
   * runnable without configuration. In production all three are required and
   * checked below.
   */
  resendApiKey: process.env.RESEND_API_KEY || null,
  emailFrom: process.env.EMAIL_FROM || null,
  clientUrl: (
    process.env.CLIENT_URL || (nodeEnv === 'production' ? '' : 'http://localhost:5173')
  ).replace(/\/+$/, ''),

  /*
   * Comma-separated list of allowed browser origins. When empty, cross-origin
   * browser access is refused rather than defaulting to a wildcard.
   */
  corsOrigins: parseList(process.env.CORS_ORIGINS),

  /*
   * Number of trusted proxy hops in front of the app. Required for `req.ip`
   * (and therefore rate limiting) to see the real client address.
   */
  trustProxy: parseNumber(process.env.TRUST_PROXY, 0),

  // Requests per window allowed from a single IP across the whole API.
  rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, 1000),
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
};

const problems = [];
const warnings = [];

if (!env.mongoUri) {
  problems.push('MONGODB_URI is required');
}

if (!env.jwtAccessSecret) {
  problems.push('JWT_ACCESS_SECRET is required');
} else if (env.jwtAccessSecret.length < MIN_JWT_SECRET_LENGTH) {
  const guidance =
    `JWT_ACCESS_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters ` +
    `(currently ${env.jwtAccessSecret.length}). Generate one with: openssl rand -hex 32`;

  /*
   * A weak secret is fatal in production but only a warning in development,
   * so local work is not blocked by the placeholder in `.env`.
   */
  if (env.isProduction) {
    problems.push(guidance);
  } else {
    warnings.push(guidance);
  }
}

if (env.bcryptSaltRounds < MIN_SALT_ROUNDS || env.bcryptSaltRounds > MAX_SALT_ROUNDS) {
  problems.push(
    `BCRYPT_SALT_ROUNDS must be between ${MIN_SALT_ROUNDS} and ${MAX_SALT_ROUNDS} ` +
      `(currently ${env.bcryptSaltRounds})`
  );
}

if (env.isProduction && env.corsOrigins.length === 0) {
  warnings.push('CORS_ORIGINS is empty: cross-origin browser requests will be refused');
}

/*
 * Transactional email configuration.
 *
 * A **warning**, not a fatal error, and that changed when email verification was
 * removed. While verification existed, an unconfigured provider meant nobody
 * could finish signing up — a broken product, and refusing to boot was right.
 *
 * Now the only thing that sends mail is the password-reset flow. An unconfigured
 * provider means users who forget their password cannot recover the account;
 * everything else, including registration and login, works. That is a degraded
 * feature, not a broken deployment, so it must not stop the process starting —
 * a fatal check here would block deploying on exactly the setup that motivated
 * removing verification in the first place.
 *
 * The warning is suppressed in test, where the suite runs without provider
 * credentials by design and the email service is replaced with a recording fake.
 * A warning per test file would be noise.
 */
const missingEmailConfig = [];

if (!env.resendApiKey) missingEmailConfig.push('RESEND_API_KEY');
if (!env.emailFrom) missingEmailConfig.push('EMAIL_FROM');
if (!env.clientUrl) missingEmailConfig.push('CLIENT_URL');

if (missingEmailConfig.length > 0 && !env.isTest) {
  warnings.push(
    `Email is not fully configured (missing: ${missingEmailConfig.join(', ')}). ` +
      'Password reset will not be able to send a link; registration and login are unaffected. ' +
      'Set RESEND_API_KEY and EMAIL_FROM from the Resend dashboard, and CLIENT_URL to the ' +
      'public frontend origin, to enable it.'
  );
}

/*
 * The cookie must not expire before the token it carries.
 *
 * A cookie with a shorter lifetime than the token ends the session while the
 * token is still valid — the user is signed out early and nothing in the logs
 * says why. The reverse (a cookie outliving its token) is merely pointless.
 * Both are configuration mistakes that are invisible until someone is logged
 * out mid-task, so they are reported at boot instead.
 */
if (tokenLifetimeMs === null) {
  warnings.push(
    `JWT_ACCESS_EXPIRES_IN "${jwtAccessExpiresIn}" is not a duration this app can ` +
      `interpret (expected forms like 15m, 1h, 900s). The cookie lifetime cannot be ` +
      `checked against it.`
  );
} else if (configuredCookieMaxAge !== null && configuredCookieMaxAge !== tokenLifetimeMs) {
  const direction =
    configuredCookieMaxAge < tokenLifetimeMs
      ? 'shorter than the token: users will be signed out while their token is still valid'
      : 'longer than the token: the extra time is unused';

  warnings.push(
    `COOKIE_MAX_AGE (${configuredCookieMaxAge}ms) does not match JWT_ACCESS_EXPIRES_IN ` +
      `(${jwtAccessExpiresIn} = ${tokenLifetimeMs}ms). The cookie is ${direction}. ` +
      `Set both to the same lifetime, or unset COOKIE_MAX_AGE to derive it from the token.`
  );
}

if (requestedLogLevel && !LOG_LEVELS.includes(requestedLogLevel)) {
  warnings.push(
    `LOG_LEVEL "${requestedLogLevel}" is not recognised; falling back to "${logLevel}". ` +
      `Valid values: ${LOG_LEVELS.join(', ')}`
  );
}

/*
 * Warnings are written with `console` rather than the logger on purpose: the
 * logger reads its configuration from this module, so importing it here would
 * create a cycle. These fire once, at boot, before any application logging
 * happens.
 */
if (warnings.length > 0) {
  for (const warning of warnings) {
    console.warn(`⚠️  Environment warning: ${warning}`);
  }
}

if (problems.length > 0) {
  throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
}

export { MIN_JWT_SECRET_LENGTH, MIN_SALT_ROUNDS, MAX_SALT_ROUNDS, parseDurationMs };
export default env;
