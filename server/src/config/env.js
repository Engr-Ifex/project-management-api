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
 * Minimum JWT secret length. HS256 security is bounded by the key's entropy,
 * so a short secret is brute-forceable offline if a token is ever captured.
 */
const MIN_JWT_SECRET_LENGTH = 32;

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 15;

const nodeEnv = process.env.NODE_ENV || 'development';

const isProduction = nodeEnv === 'production';

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
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',

  cookieMaxAge: parseNumber(process.env.COOKIE_MAX_AGE, 15 * 60 * 1000),

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

export { MIN_JWT_SECRET_LENGTH, MIN_SALT_ROUNDS, MAX_SALT_ROUNDS };
export default env;
