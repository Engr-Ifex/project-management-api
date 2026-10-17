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

/*
 * Email token policy — the password-reset link.
 *
 * The flow issues a single-use bearer token that arrives by email, so it needs
 * three properties: enough entropy that it cannot be guessed, a short enough
 * life that a leaked inbox is not a permanent liability, and single use so a
 * replayed link cannot be spent twice.
 *
 * 32 bytes (256 bits) of CSPRNG output. Far beyond guessing range, and it makes
 * the SHA-256 storage hash sufficient on its own: a fast hash is only unsafe
 * for low-entropy secrets, and this is not one.
 */
export const EMAIL_TOKEN_BYTES = 32;

/*
 * How long a password-reset link stays valid.
 *
 * Short on purpose: a reset link is a credential, and every extra hour is
 * another hour a forwarded or shoulder-surfed email remains spendable.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/*
 * Rate limits for the email-sending endpoints.
 *
 * These are separate from `AUTH_RATE_LIMIT` because the threat is different.
 * Login and registration are brute-forced; these endpoints are *amplifiers* —
 * one request makes the application send one email to an address the caller
 * chose. Without a limit they are an open relay for harassing a third party and
 * for burning the provider's sending quota.
 *
 * Tighter than the credential limit for that reason: a legitimate user needs a
 * handful of resends, not ten in a quarter of an hour.
 */
export const EMAIL_SEND_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many email requests. Please try again later.',
});

/** Reset submission gets its own budget — it is a token-guessing surface. */
export const PASSWORD_RESET_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again later.',
});
