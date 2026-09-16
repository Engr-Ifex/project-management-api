import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';

import env from './src/config/env.js';
import ApiError from './src/utils/ApiError.js';

import indexRoutes from './src/routes/index.routes.js';
import errorHandler from './src/middlewares/error.middleware.js';
import notFound from './src/middlewares/notFound.middleware.js';
import { createRateLimiter } from './src/middlewares/rateLimit.middleware.js';

import { MAX_JSON_BODY_SIZE, MAX_URLENCODED_BODY_SIZE } from './src/constants/security.js';

const app = express();

/*
 * Do not advertise the framework in responses.
 */
app.disable('x-powered-by');

/*
 * Trust proxy.
 *
 * Rate limiting keys on `req.ip`. Behind a reverse proxy that address is the
 * proxy's unless the number of trusted hops is declared, which would make one
 * client's traffic exhaust everyone's budget. Disabled by default so a
 * directly exposed server cannot be tricked by a forged X-Forwarded-For.
 */
if (env.trustProxy > 0) {
  app.set('trust proxy', env.trustProxy);
}

// Security headers (CSP, HSTS, nosniff, frameguard, referrer policy, ...).
app.use(helmet());

/*
 * CORS.
 *
 * The previous configuration was a bare `cors()`, which answers every origin
 * with `Access-Control-Allow-Origin: *` and no credentials support.
 *
 * With an allow-list configured, only those origins are accepted and cookies
 * are allowed. Without one, production refuses cross-origin browser access
 * outright, while development keeps the previous wildcard behaviour (and says
 * so in the log) so local tooling is not broken.
 *
 * Note the wildcard is deliberately paired with `credentials: false`: a
 * wildcard origin must never be combined with credential support, or any site
 * could make authenticated requests on a user's behalf.
 */
const allowAnyOrigin = env.corsOrigins.length === 0 && !env.isProduction;

if (allowAnyOrigin) {
  console.warn(
    '⚠️  CORS_ORIGINS is not set: allowing any origin without credentials (development only). ' +
      'Set CORS_ORIGINS to the client origin(s) before deploying.'
  );
}

const corsOrigin = env.corsOrigins.length > 0 ? env.corsOrigins : allowAnyOrigin ? '*' : false;

app.use(
  cors({
    origin: corsOrigin,
    credentials: env.corsOrigins.length > 0,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  })
);

// Body parsers with explicit size limits.
app.use(express.json({ limit: MAX_JSON_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_URLENCODED_BODY_SIZE }));
app.use(cookieParser());

// Request logging. Verbose format is for development only.
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

/*
 * Static files.
 *
 * ONLY the avatar directory is exposed. It previously served the whole
 * `src/uploads` tree, which also contains `src/uploads/attachments` — the
 * private, per-project attachment store. That made every attachment readable
 * by anyone who knew or guessed the path, completely bypassing the
 * authenticated download endpoint and its project authorization.
 *
 * Mounting the public subtree explicitly means a new private storage
 * directory can never become world-readable by accident.
 */
const publicUploadsPath = path.join(process.cwd(), 'src', 'uploads', 'avatars');

app.use('/uploads/avatars', express.static(publicUploadsPath));

// Anything else under /uploads is not public.
app.use('/uploads', (req, res, next) => {
  next(new ApiError(404, 'Not found'));
});

/*
 * Broad API rate limit. Static assets are mounted above this so serving an
 * avatar never consumes a caller's request budget.
 */
app.use(
  '/api',
  createRateLimiter({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    message: 'Too many requests, please try again later.',
  })
);

// Routes
app.use('/api/v1', indexRoutes);

// Unknown routes get the same JSON error shape as everything else.
app.use(notFound);

app.use(errorHandler);

export default app;
