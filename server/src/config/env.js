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

const env = {
  port: parseNumber(process.env.PORT, 5000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',

  cookieMaxAge: parseNumber(process.env.COOKIE_MAX_AGE, 15 * 60 * 1000),

  mongoUri: process.env.MONGODB_URI,

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
