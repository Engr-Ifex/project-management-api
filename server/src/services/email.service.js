import { Resend } from 'resend';

import env from '../config/env.js';
import logger from '../utils/logger.js';
import ApiError from '../utils/ApiError.js';

/*
 * The transactional email service.
 *
 * Every message the product sends — the password reset today, and any
 * invitation email added later — goes through `sendEmail`. One boundary means
 * one place that knows about the provider, one place that decides what a
 * failure means, and one place to swap when the provider changes.
 *
 * It is deliberately **not** tied to any one flow, which is why removing email
 * verification left this module almost untouched: it was never the
 * verification service, it was the mail transport.
 *
 * ## Failures are never swallowed
 *
 * `sendEmail` **throws** on every failure path. It does not return a boolean or
 * a nullable id, because a caller that forgets to check a return value would
 * carry on as though the mail had gone out — and "we told the user to check
 * their inbox" when no message exists is a dead end they cannot recover from,
 * since they have no reason to suspect anything went wrong.
 *
 * Throwing lets the caller choose the right product behaviour. The password
 * reset is now the only caller, and it responds **generically** regardless of
 * what happens here, because reporting a failure would leak account existence —
 * see `auth.service.js` for that reasoning. The error is logged either way.
 *
 * The Resend SDK does not throw for API-level rejections — it resolves with
 * `{ data: null, error }` — so both shapes have to be handled. Missing either
 * one would be exactly the silent failure this module exists to prevent.
 *
 * ## What is logged
 *
 * Operational detail only: the provider, the subject, the provider's error name
 * and status, and a **masked** recipient. Not the API key, not the token, not
 * the message body, and not the full address. A support engineer can act on
 * "resend rejected the message, 403, domain not verified" without the log store
 * becoming a copy of the user table. The logger redacts by key as a second line
 * of defence, but the right values are simply never passed in.
 */

/** The Resend client, created on first use so a test run never constructs one. */
let cachedClient = null;

/**
 * A replacement transport, set by tests.
 *
 * The suite must never reach the network — it would be slow, flaky, and would
 * require a real API key — so `tests/helpers/setup.js` installs a recording fake
 * here for the whole run. Keeping the seam explicit (rather than reaching into
 * the SDK) means the code under test is the real service, not a stub of it.
 */
let injectedTransport = null;

/** Replaces the transport. Intended for tests. */
export const setEmailTransport = (transport) => {
  injectedTransport = transport;
};

/** Removes an injected transport, restoring real Resend behaviour. */
export const resetEmailTransport = () => {
  injectedTransport = null;
  cachedClient = null;
};

/**
 * Whether a message can actually be sent right now.
 *
 * Used by callers to decide whether to attempt a send at all, so an
 * unconfigured environment produces one clear message instead of a provider
 * error per request.
 *
 * An injected transport counts. The question this answers is "can we deliver?",
 * not "is the production provider configured?" — and in a test run a recording
 * fake delivers perfectly well. Treating the fake as unconfigured would make
 * every test exercise the "email is off" branch, which is the opposite of what
 * the suite needs to cover.
 */
export const isEmailConfigured = () =>
  Boolean(injectedTransport || (env.resendApiKey && env.emailFrom));

const getTransport = () => {
  if (injectedTransport) return injectedTransport;

  if (!isEmailConfigured()) {
    /*
     * Not configured. Thrown rather than defaulted: silently dropping the
     * message would leave registration looking successful while the account
     * could never be verified.
     */
    throw new ApiError(503, 'Email delivery is not configured on this server.');
  }

  if (!cachedClient) cachedClient = new Resend(env.resendApiKey);

  return cachedClient;
};

/**
 * Reduce an address to something useful in a log without storing the whole
 * thing: `ada.lovelace@example.com` becomes `a***@example.com`.
 *
 * The domain is kept because deliverability problems are almost always
 * per-domain, and that is the part an operator needs.
 */
export const maskEmail = (email) => {
  const value = String(email ?? '');
  const at = value.lastIndexOf('@');

  if (at <= 0) return '[invalid]';

  return `${value[0]}***${value.slice(at)}`;
};

/*
 * Strip anything shaped like a provider credential from a message before it is
 * logged. Resend keys are prefixed `re_`; if one ever appears inside an error
 * string, it must not reach the log store.
 */
const scrubSecrets = (value) =>
  String(value ?? '').replace(/\bre_[A-Za-z0-9_-]{8,}/g, '[redacted]');

/**
 * Send one transactional message.
 *
 * @returns {Promise<string>} the provider's message id, so a caller can record
 *   something actionable if delivery is later questioned.
 * @throws {ApiError} 503 when unconfigured, 502 when the provider rejects or
 *   the request fails.
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) throw new Error('sendEmail requires a recipient');
  if (!subject) throw new Error('sendEmail requires a subject');
  if (!html && !text) throw new Error('sendEmail requires an html or text body');

  const transport = getTransport();

  let result;

  try {
    result = await transport.emails.send({
      from: env.emailFrom,
      to,
      subject,
      html,
      text,
    });
  } catch (thrown) {
    /*
     * A thrown error means the request never produced a provider verdict —
     * a DNS failure, a timeout, a socket reset. Still a failure: the message
     * was not sent.
     */
    logger.error('Email could not be delivered', {
      provider: 'resend',
      to: maskEmail(to),
      subject,
      reason: scrubSecrets(thrown?.message ?? thrown),
      errorName: thrown?.name ?? 'Error',
    });

    throw new ApiError(502, 'Could not send the email. Please try again later.');
  }

  if (result?.error) {
    /*
     * The provider accepted the request and refused the message — an unverified
     * sending domain, a suppressed address, a malformed payload. This is the
     * case the SDK signals in the resolved value rather than by throwing, and
     * the case most easily mistaken for success.
     */
    logger.error('Email was rejected by the provider', {
      provider: 'resend',
      to: maskEmail(to),
      subject,
      statusCode: result.error.statusCode ?? null,
      errorName: result.error.name ?? null,
      reason: scrubSecrets(result.error.message),
    });

    throw new ApiError(502, 'Could not send the email. Please try again later.');
  }

  const id = result?.data?.id ?? null;

  logger.info('Email sent', {
    provider: 'resend',
    to: maskEmail(to),
    subject,
    messageId: id,
  });

  return id;
};

export default { sendEmail, isEmailConfigured, maskEmail, setEmailTransport, resetEmailTransport };
