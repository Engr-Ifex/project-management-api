import { escapeHtml, renderEmailHtml, renderEmailText } from './layout.js';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../constants/security.js';

/*
 * The password-reset email.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not include the password, or any hint of it. The account's
 *     password is only ever set by the recipient, on the site, after the token
 *     is validated. An email is stored, forwarded and indexed; a password in one
 *     is a password disclosed.
 *   - It does not say whether the request came from the account holder. That is
 *     unknowable, and implying it ("you requested this") reads as confirmation
 *     to someone whose address was typed in by mistake.
 */

const MINUTES = Math.round(PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000));

const expiryPhrase = MINUTES === 1 ? '1 minute' : `${MINUTES} minutes`;

export const buildPasswordResetEmail = ({ name, url }) => {
  const heading = 'Reset your password';

  const paragraphs = [
    `Hi ${escapeHtml(name)},`,
    'Use the button below to choose a new password for your PROJEX account.',
    `This link works for <strong>${expiryPhrase}</strong> and can only be used once. Your password will not change until you submit a new one.`,
  ];

  const note =
    '<strong>Did not request this?</strong><br>Nothing has changed and nothing will. You can ignore this message — your current password stays valid until this link is used. If you keep receiving these, someone may be trying to reach your account; consider changing your password.';

  const footnote =
    'You are receiving this because a password reset was requested for this email address. This message was sent automatically; replies are not monitored.';

  return {
    subject: 'Reset your PROJEX password',
    html: renderEmailHtml({
      preheader: `Choose a new PROJEX password. This link expires in ${expiryPhrase}.`,
      heading,
      paragraphs,
      action: { label: 'Choose a new password', url },
      note,
      footnote,
    }),
    text: renderEmailText({
      heading,
      paragraphs,
      action: { label: 'Choose a new password', url },
      note,
      footnote,
    }),
  };
};

export default buildPasswordResetEmail;
