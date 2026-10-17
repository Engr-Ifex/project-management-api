/*
 * The shared shell for every transactional email.
 *
 * Email HTML is not web HTML, and the constraints are worth stating once here
 * rather than rediscovering them per template:
 *
 * - **Styles are inline.** Gmail strips `<style>` blocks in several contexts and
 *   Outlook's renderer ignores much of the cascade. A stylesheet would look
 *   correct in a preview and arrive unstyled for a real recipient, so every rule
 *   that matters is an attribute or an inline `style`.
 * - **Layout is tables.** Flexbox and grid are unsupported in Outlook and
 *   inconsistent elsewhere. `role="presentation"` marks the layout tables so a
 *   screen reader does not announce them as data.
 * - **The action is a table-cell button.** Padding on an `<a>` is ignored by
 *   Outlook, which collapses the button to bare text. A `bgcolor` cell wrapping
 *   the anchor survives.
 * - **The link is also printed in full.** Corporate mail scanners rewrite or
 *   block anchors, and people forward emails. A URL they can read and retype is
 *   the accessible fallback, not a nicety.
 *
 * Colours are the product's own tokens (see `client/src/styles/index.css`) so a
 * PROJEX email is recognisably the same product. They are hardcoded rather than
 * imported because this module runs in the backend, which has no access to the
 * frontend's stylesheet, and because email clients cannot resolve CSS variables.
 */

const BRAND = Object.freeze({
  canvas: '#f8f7f5',
  surface: '#ffffff',
  line: '#e0ded7',
  body: '#1c1b18',
  bodyMuted: '#5a5750',
  bodySubtle: '#6e6a63',
  accent: '#276b62',
  ink: '#121110',
});

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Escape a value for interpolation into HTML.
 *
 * Every dynamic value in these templates is either user-controlled (a name from
 * registration) or URL-derived. An unescaped `<` would let a crafted display
 * name inject markup into a message the application sends on its own behalf —
 * which is a phishing primitive, not a rendering glitch. Values are escaped at
 * the point of interpolation, so a template cannot forget to.
 */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Render the HTML body.
 *
 * `preheader` is the snippet inbox clients show next to the subject. Without it
 * they scrape the first visible text, which in a transactional email is usually
 * the wordmark — so every message previews identically. It is hidden by being
 * pushed off-canvas rather than `display:none`, because some clients ignore the
 * latter and would render it above the heading.
 */
export const renderEmailHtml = ({
  preheader,
  heading,
  paragraphs = [],
  action,
  note,
  footnote,
}) => {
  const paragraphHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:${BRAND.bodyMuted};">${paragraph}</p>`
    )
    .join('\n              ');

  const actionHtml = action
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
                <tr>
                  <td align="center" bgcolor="${BRAND.accent}" style="border-radius:6px;">
                    <a href="${escapeHtml(action.url)}" style="display:inline-block; padding:12px 24px; font-family:${FONT_STACK}; font-size:15px; font-weight:600; line-height:1.2; color:#ffffff; text-decoration:none; border-radius:6px;">${escapeHtml(action.label)}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px 0; font-size:12px; line-height:1.5; color:${BRAND.bodySubtle};">
                If the button does not work, copy this address into your browser:
              </p>
              <p style="margin:0 0 20px 0; font-size:12px; line-height:1.5; word-break:break-all;">
                <a href="${escapeHtml(action.url)}" style="color:${BRAND.accent}; text-decoration:underline;">${escapeHtml(action.url)}</a>
              </p>`
    : '';

  const noteHtml = note
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;">
                <tr>
                  <td style="background-color:${BRAND.canvas}; border:1px solid ${BRAND.line}; border-radius:6px; padding:12px 14px; font-family:${FONT_STACK}; font-size:13px; line-height:1.6; color:${BRAND.bodyMuted};">
                    ${note}
                  </td>
                </tr>
              </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0; padding:0; width:100%; background-color:${BRAND.canvas};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${BRAND.canvas}; font-size:1px; line-height:1px;">${escapeHtml(preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px; background-color:${BRAND.surface}; border:1px solid ${BRAND.line}; border-radius:10px;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">

              <!-- Wordmark. The monogram is a table cell so the square holds its
                   shape; an inline-block span collapses in Outlook. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="26" height="26" align="center" valign="middle" bgcolor="${BRAND.ink}" style="width:26px; height:26px; border-radius:6px; font-family:${FONT_STACK}; font-size:11px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">PX</td>
                  <td style="padding-left:8px; font-family:${FONT_STACK}; font-size:13px; font-weight:600; color:${BRAND.body}; letter-spacing:0.04em;">PROJEX</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 28px 28px; font-family:${FONT_STACK};">
              <h1 style="margin:0 0 16px 0; font-size:20px; line-height:1.3; font-weight:600; color:${BRAND.body};">${escapeHtml(heading)}</h1>

              ${paragraphHtml}
              ${actionHtml}
              ${noteHtml}
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:16px 4px 0 4px; font-family:${FONT_STACK}; font-size:12px; line-height:1.6; color:${BRAND.bodySubtle};">
              ${footnote}
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Render the plain-text alternative.
 *
 * Not a stripped copy of the HTML. A text part exists for clients that refuse
 * HTML, for screen readers, and for anyone reading the raw source — so it is
 * written to stand on its own: the action is spelled out as a URL on its own
 * line, and no information lives only in a button.
 */
export const renderEmailText = ({ heading, paragraphs = [], action, note, footnote }) => {
  const lines = [heading, '', ...paragraphs.map((paragraph) => stripTags(paragraph)), ''];

  if (action) {
    lines.push(`${action.label}:`, action.url, '');
  }

  if (note) {
    lines.push(stripTags(note), '');
  }

  lines.push(stripTags(footnote));

  return lines.join('\n');
};

/**
 * Reduce the small amount of inline markup templates use to plain text.
 *
 * Templates bold an address or a duration with `<strong>`, which is meaningful
 * in HTML and noise in a text part. Only the tags these templates actually
 * emit are handled.
 */
const stripTags = (value) =>
  String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export { BRAND };
