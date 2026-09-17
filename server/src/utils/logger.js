import env from '../config/env.js';

/*
 * Minimal structured logger.
 *
 * Why hand-rolled: the rest of the project avoids pulling in infrastructure
 * dependencies where a small, auditable implementation will do (see the rate
 * limiter), and this needs to do only three things — level filtering,
 * structured output, and redaction.
 *
 * Output format depends on the environment:
 *   - production: one JSON object per line, so log aggregators can parse it
 *   - otherwise:  human-readable single lines, for local work
 *
 * Every entry carries a timestamp and level. In production the message is
 * passed through unchanged but metadata is redacted, so a careless
 * `logger.info('login', { req })` cannot leak a password or a session cookie
 * into the log store.
 */

const LEVELS = Object.freeze({
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
});

/*
 * Keys whose values are never written, at any nesting depth. Matched
 * case-insensitively as substrings, so `newPassword`, `accessToken` and
 * `set-cookie` are all caught.
 */
const REDACTED_KEYS = Object.freeze([
  'password',
  'passwordhash',
  'passwordchangedat',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'jwt',
]);

const REDACTED = '[redacted]';

const isRedactedKey = (key) => {
  const normalised = key.toLowerCase().replace(/[-_]/g, '');

  return REDACTED_KEYS.some((candidate) => normalised.includes(candidate));
};

/** Recursively replace sensitive values. Bounded to avoid pathological input. */
const redact = (value, depth = 0) => {
  if (depth > 6 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  // Errors and other non-plain objects are reduced to a message.
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = isRedactedKey(key) ? REDACTED : redact(item, depth + 1);
  }

  return output;
};

const activeLevel = LEVELS[env.logLevel] ?? LEVELS.info;

const formatMeta = (meta) => {
  if (!meta || Object.keys(meta).length === 0) return '';

  return ` ${JSON.stringify(redact(meta))}`;
};

const write = (level, message, meta) => {
  if (LEVELS[level] > activeLevel) return;

  const timestamp = new Date().toISOString();

  /*
   * `console` is used directly rather than a stream so that output is captured
   * by the container runtime and by `node --test` alike. stdout for everything
   * except errors, which go to stderr so they can be routed separately.
   */
  const sink = level === 'error' ? console.error : console.log;

  if (env.isProduction) {
    sink(JSON.stringify({ timestamp, level, message, ...(meta && { meta: redact(meta) }) }));
    return;
  }

  sink(`${timestamp} ${level.toUpperCase().padEnd(5)} ${message}${formatMeta(meta)}`);
};

const logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  http: (message, meta) => write('http', message, meta),
  debug: (message, meta) => write('debug', message, meta),

  /** True when the level would produce output — avoids building expensive meta. */
  isLevelEnabled: (level) => LEVELS[level] <= activeLevel,
};

export default logger;
