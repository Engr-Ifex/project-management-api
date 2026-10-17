import env from '../config/env.js';

/*
 * Link construction for emailed actions.
 *
 * ## The one rule
 *
 * Every link is built from `env.clientUrl` — configuration — and **never** from
 * the request. No `req.headers.host`, no `req.protocol`, no `X-Forwarded-Host`.
 *
 * This is not defensive habit, it is the whole security property of the flow. A
 * `Host` header is supplied by the caller. An application that builds a
 * password-reset link from it will happily email a link pointing at a domain the
 * attacker controls — and the victim, who has every reason to trust a message
 * from the real product, clicks it and hands over the token. The attacker then
 * uses that token on the real site. That is a complete account-takeover chain
 * built out of one trusted-looking header.
 *
 * Reverse proxies make it worse rather than better: `X-Forwarded-Host` is
 * equally forgeable unless the proxy is known and trusted, which is exactly the
 * kind of assumption that holds in staging and not in production.
 *
 * So the origin is read once, at boot, from `CLIENT_URL`, and this function is
 * the only place a link is assembled. A future template cannot reintroduce the
 * vulnerability without editing this file.
 *
 * ## Query parameter, not path segment
 *
 * `/reset-password?token=…` rather than `/reset-password/…`. Two reasons: a
 * token in a path segment ends up in more places (access logs keyed by path,
 * referrer headers on any asset the page loads), and the query form makes the
 * page's "no token present" state a normal case rather than a route that fails
 * to match.
 */

const buildUrl = (path, token) => `${env.clientUrl}${path}?token=${encodeURIComponent(token)}`;

/** The link that lets a user choose a new password. */
export const buildPasswordResetUrl = (token) => buildUrl('/reset-password', token);

export default { buildPasswordResetUrl };
