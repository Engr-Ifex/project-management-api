import express from 'express';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';

import ApiResponse from '../utils/ApiResponse.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import { PROJECT_ROOT } from '../config/paths.js';

/*
 * Liveness and readiness probes.
 *
 * These are two different questions and conflating them is a common way to
 * turn a partial outage into a total one:
 *
 *   GET /api/v1/health        liveness  — "is this process alive?"
 *   GET /api/v1/health/ready  readiness — "should this instance receive traffic?"
 *
 * Liveness deliberately does NOT touch the database. If it did, a brief
 * database blip would fail the probe and the orchestrator would restart every
 * healthy instance, which cannot fix a database problem and guarantees an
 * outage.
 *
 * Readiness does check the database. An instance whose connection is down
 * should be taken out of the load-balancer pool but left running, so it can
 * recover on its own.
 *
 * Both are mounted ahead of the API rate limiter (see app.js). Probes run on a
 * fixed schedule from a single address; if they shared the request budget with
 * real traffic, a busy period could throttle a probe and cause the
 * orchestrator to kill a perfectly healthy instance.
 */
const router = express.Router();

/** Read once — the version does not change while the process runs. */
const readVersion = () => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

    return manifest.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const VERSION = readVersion();

/*
 * How long to wait for the database ping before declaring the instance
 * unready. Kept short: a readiness probe must answer quickly or it is useless
 * to the orchestrator.
 */
const DB_PING_TIMEOUT_MS = 2000;

/**
 * Ping the database.
 *
 * `readyState` alone is not enough — it can report "connected" while the
 * server is unreachable and the driver has not yet noticed. The explicit
 * `ping` is what actually proves a round trip.
 */
const checkDatabase = async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { status: 'down', reason: 'not connected' };
  }

  const startedAt = Date.now();

  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('ping timed out')), DB_PING_TIMEOUT_MS).unref()
      ),
    ]);

    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { status: 'down', reason: error.message };
  }
};

/**
 * Liveness. Answers as long as the event loop can serve a request.
 * Always 200 — the absence of a response is what signals a dead process.
 */
router.get('/health', (req, res) => {
  res.status(200).json(
    new ApiResponse(200, 'Service is healthy', {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.nodeEnv,
      version: VERSION,
    })
  );
});

/**
 * Readiness. 200 when the instance can serve traffic, 503 when it cannot.
 *
 * The body is built explicitly rather than with `ApiResponse`, which hardcodes
 * `success: true` — reporting success alongside a 503 would be a lie. The
 * envelope shape is otherwise identical, so a monitor can read both responses
 * the same way.
 */
router.get('/health/ready', async (req, res) => {
  const database = await checkDatabase();

  const isReady = database.status === 'up';
  const statusCode = isReady ? 200 : 503;

  if (!isReady) {
    /*
     * Logged at warn, not error: an unready instance is a state the
     * orchestrator is expected to handle, and a restart loop would otherwise
     * fill the log store.
     */
    logger.warn('Readiness check failed', { reason: database.reason });
  }

  res.status(statusCode).json({
    success: isReady,
    statusCode,
    message: isReady ? 'Service is ready' : 'Service is not ready',
    data: {
      status: isReady ? 'ready' : 'not_ready',
      checks: { database },
    },
  });
});

export default router;
