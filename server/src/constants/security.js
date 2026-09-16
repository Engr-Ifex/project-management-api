/*
 * Security-related constants.
 */

/*
 * The JWT algorithm is pinned rather than inferred.
 *
 * `jwt.verify` without an `algorithms` option accepts any algorithm the token
 * header claims. Pinning it removes that ambiguity entirely: a token must be
 * signed with HS256 using our secret, and nothing else is considered.
 */
export const JWT_ALGORITHM = 'HS256';

export const JWT_ALGORITHMS = Object.freeze([JWT_ALGORITHM]);

/*
 * Request body limits. These match the Express defaults but are declared
 * explicitly so the boundary is a deliberate choice rather than an accident
 * of the framework version.
 */
export const MAX_JSON_BODY_SIZE = '100kb';

export const MAX_URLENCODED_BODY_SIZE = '100kb';

/*
 * Authentication rate limit.
 *
 * Deliberately strict: it is the control that makes online password guessing
 * and account-enumeration probing impractical.
 */
export const AUTH_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again later.',
});

/*
 * Password policy. Length is the dominant factor in password strength, so the
 * minimum is enforced everywhere a password can be set.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const MAX_PASSWORD_LENGTH = 128;
