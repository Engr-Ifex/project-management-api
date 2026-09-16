import ApiError from '../utils/ApiError.js';

/*
 * Catch-all for unmatched routes.
 *
 * This file existed but was empty and never registered, so an unknown path
 * fell through to Express's default handler and returned an HTML 404 — an
 * inconsistent response shape, and a small framework fingerprint. Routing it
 * through ApiError means 404s look like every other API error.
 *
 * The requested path is deliberately not echoed back into the message.
 */
const notFound = (req, res, next) => {
  next(new ApiError(404, 'Route not found'));
};

export default notFound;
