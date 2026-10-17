import crypto from 'crypto';

import { EMAIL_TOKEN_BYTES } from '../constants/security.js';

/*
 * Single-use email tokens — the shared primitive behind email verification and
 * password reset.
 *
 * Both flows are the same shape: mint a random bearer token, email it, accept it
 * once, then throw it away. Keeping that in one module means the two flows
 * cannot drift into different security properties.
 *
 * ## Why the database stores a hash
 *
 * The token in the email *is* the credential — whoever holds it can verify an
 * address or take over an account. Storing it verbatim means a read-only leak of
 * the database (a backup, a log dump, an over-broad support query) hands an
 * attacker a set of working links. Storing a digest means the leak is inert: the
 * attacker can read hashes but cannot turn one back into a link.
 *
 * ## Why SHA-256 and not bcrypt
 *
 * Passwords are hashed with bcrypt because they are *low entropy* — a human
 * choice, drawn from a small space, so the hash has to be slow to make guessing
 * expensive. A token here is 32 bytes of CSPRNG output. There is no dictionary
 * to run, so slowness buys nothing, while a deliberately slow hash would be paid
 * on every verification click and every reset submission.
 *
 * A fast digest is the correct choice *because* the input is already
 * unguessable — and that is the property that has to hold for it to stay
 * correct. It does: `EMAIL_TOKEN_BYTES` is not user-influenced.
 *
 * ## Why lookup is by hash rather than by comparison
 *
 * The digest is stored as a unique-indexed field and queried directly, so the
 * database does the matching. That removes the timing-comparison question
 * entirely — there is no in-process `===` on a secret to leak length or prefix
 * information through.
 */

/** A fresh, unguessable token. The only moment the raw value exists. */
export const generateEmailToken = () => crypto.randomBytes(EMAIL_TOKEN_BYTES).toString('hex');

/**
 * The digest stored in place of the token.
 *
 * Deterministic and unsalted, so the same token always maps to the same lookup
 * key. Unsalted is safe here for the reason above — there is nothing to
 * rainbow-table.
 */
export const hashEmailToken = (rawToken) =>
  crypto.createHash('sha256').update(String(rawToken)).digest('hex');

/** The expiry timestamp for a token issued now, given its lifetime. */
export const emailTokenExpiry = (ttlMs) => new Date(Date.now() + ttlMs);

/**
 * Whether a stored expiry has passed.
 *
 * Treats a missing expiry as expired rather than as "never expires": a token row
 * without a deadline is a bug, and failing closed is the safe reading of it.
 */
export const isExpired = (expiresAt) => !expiresAt || new Date(expiresAt).getTime() <= Date.now();

export default {
  generateEmailToken,
  hashEmailToken,
  emailTokenExpiry,
  isExpired,
};
