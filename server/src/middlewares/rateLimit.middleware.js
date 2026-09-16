import ApiError from '../utils/ApiError.js';

/*
 * Fixed-window, in-memory rate limiter.
 *
 * Why hand-rolled: the project has no rate-limiting dependency and the npm
 * registry is unreachable from this environment, so pulling in a vetted
 * package was not possible. This implementation is deliberately small and
 * easy to audit.
 *
 * LIMITATION — the counters live in this process's memory. Behind multiple
 * instances or a load balancer each process keeps its own counters, so the
 * effective limit is `max * instanceCount`. For a multi-instance deployment
 * this should be replaced by a shared store (Redis, or a vetted middleware
 * such as `express-rate-limit` with a Redis store). That trade-off is called
 * out in the security audit.
 *
 * The limiter is keyed on `req.ip`. Behind a proxy that requires `TRUST_PROXY`
 * to be configured, otherwise every request appears to come from the proxy and
 * a single client could exhaust everyone's budget.
 */

const CLEANUP_INTERVAL_MS = 60 * 1000;

export const createRateLimiter = ({
  windowMs,
  max,
  message = 'Too many requests, please try again later',
  keyGenerator = (req) => req.ip,
} = {}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('createRateLimiter: windowMs must be a positive number');
  }

  if (!Number.isFinite(max) || max <= 0) {
    throw new Error('createRateLimiter: max must be a positive number');
  }

  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  /*
   * Periodic sweep so the map cannot grow without bound. `unref` keeps the
   * timer from holding the process open (important for tests and graceful
   * shutdown).
   */
  const cleanup = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);

  if (typeof cleanup.unref === 'function') cleanup.unref();

  const middleware = (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    // Standard draft headers, so clients can back off proactively.
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));

      return next(new ApiError(429, message));
    }

    return next();
  };

  // Exposed for tests and for operational resets.
  middleware.reset = () => hits.clear();
  middleware.store = hits;

  return middleware;
};

export default createRateLimiter;
