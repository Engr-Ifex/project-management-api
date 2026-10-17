import { setEmailTransport, resetEmailTransport } from '../../src/services/email.service.js';

/*
 * A recording stand-in for Resend.
 *
 * The suite must never reach the network: it would be slow, it would be flaky,
 * and it would need a real API key that cannot be committed. So the transport is
 * replaced for the entire run — `tests/helpers/setup.js` installs this before
 * the app is imported — and email assertions read what it recorded.
 *
 * This is deliberately a fake at the *transport* boundary rather than a stubbed
 * email service. The service under test is the real one: the same recipient
 * resolution, the same link construction, the same error handling. Only the
 * provider is fake, so a test that passes here says something about the code
 * that will run in production.
 *
 * Two failure shapes are supported because the SDK has two, and they take
 * different paths through the service:
 *
 *   - `error`  — the provider refused the message (resolves with `{error}`)
 *   - `throw`  — the request never completed (rejects)
 *
 * Covering only one would leave half the failure handling untested.
 */

const state = {
  sent: [],
  /** `null`, or `{ error }` / `{ thrown }`. */
  failure: null,
};

const transport = {
  emails: {
    send: async (payload) => {
      if (state.failure) {
        const { error, thrown } = state.failure;

        if (thrown) throw thrown;

        return { data: null, error };
      }

      const id = `test-email-${state.sent.length + 1}`;

      state.sent.push({ ...payload, id });

      return { data: { id }, error: null };
    },
  },
};

/** Installs the fake for the rest of the process. */
export const installEmailTransport = () => setEmailTransport(transport);

/** Removes the fake, so the service falls back to real Resend configuration. */
export const uninstallEmailTransport = () => resetEmailTransport();

/**
 * Make the next sends fail.
 *
 * @param {object} options
 * @param {object} [options.error]   provider-shaped rejection, e.g.
 *   `{ name: 'validation_error', statusCode: 403, message: '...' }`
 * @param {Error}  [options.thrown]  transport-shaped failure
 */
export const failSends = ({ error, thrown } = {}) => {
  state.failure = { error, thrown };
};

/** Every message the application has sent, oldest first. */
export const sentEmails = () => state.sent;

/** The most recent message, or `null`. */
export const lastEmail = () => state.sent.at(-1) ?? null;

/** Messages sent to a given address. */
export const emailsTo = (address) =>
  state.sent.filter((email) =>
    (Array.isArray(email.to) ? email.to : [email.to]).some(
      (recipient) => String(recipient).toLowerCase() === String(address).toLowerCase()
    )
  );

/** Clears the recording and any configured failure. */
export const resetEmails = () => {
  state.sent.length = 0;
  state.failure = null;
};

/**
 * The first URL in a message body.
 *
 * Reads the `text` part rather than the HTML. The text part is generated from
 * the same `action.url` as the HTML, and matching against it proves the link a
 * text-only client would show is the correct one — which is the property that
 * matters if the HTML is stripped.
 */
export const urlFromEmail = (email) => {
  if (!email) return null;

  const match = /https?:\/\/[^\s<>"')]+/.exec(email.text ?? '');

  return match ? match[0] : null;
};

/** The token from the first URL in a message body. */
export const tokenFromEmail = (email) => {
  const url = urlFromEmail(email);

  if (!url) return null;

  try {
    return new URL(url).searchParams.get('token');
  } catch {
    return null;
  }
};

export default {
  installEmailTransport,
  uninstallEmailTransport,
  failSends,
  sentEmails,
  lastEmail,
  emailsTo,
  resetEmails,
  urlFromEmail,
  tokenFromEmail,
};
