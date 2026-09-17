import env from '../config/env.js';
import { closeDatabase } from '../config/database.js';
import logger from './logger.js';

/*
 * Graceful shutdown.
 *
 * The original implementation awaited `server.close()` with no deadline. That
 * works locally and fails in production for two reasons:
 *
 *   1. `server.close()` waits for every open connection to end. HTTP keep-alive
 *      connections stay open after their response, so a handful of idle
 *      browsers can hold the server open indefinitely. The orchestrator waits
 *      for its own grace period, loses patience, and sends SIGKILL — which is
 *      exactly the ungraceful shutdown the handler existed to prevent.
 *
 *   2. There was no upper bound at all. If the database close hung, the
 *      process hung with it.
 *
 * This version: stops accepting connections, reaps idle keep-alive sockets,
 * lets in-flight requests finish, closes the database, and exits. If any of
 * that takes longer than SHUTDOWN_TIMEOUT_MS it exits anyway, so the process
 * always terminates on its own terms rather than being killed.
 */

/** Promisified `server.close()` that also reaps idle keep-alive sockets. */
const closeHttpServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));

    /*
     * Without this, sockets parked in keep-alive keep `close()` pending. Idle
     * connections are dropped immediately; in-flight requests are left alone
     * and still complete.
     */
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });

/**
 * Registers shutdown handlers for signals and for fatal process errors.
 *
 * @param {import('http').Server} server - HTTP server returned by app.listen()
 */
const registerGracefulShutdown = (server) => {
  let shuttingDown = false;

  const shutdown = async (reason, exitCode = 0) => {
    /*
     * A second signal means the operator (or the orchestrator) wants the
     * process gone now. Honour it rather than ignoring it — the previous
     * implementation would have run the whole shutdown sequence twice.
     */
    if (shuttingDown) {
      logger.warn('Second shutdown signal received; exiting immediately', { reason });
      process.exit(exitCode || 1);
    }

    shuttingDown = true;

    logger.info('Shutting down', { reason, timeoutMs: env.shutdownTimeoutMs });

    /*
     * Hard deadline. `unref()` so the timer itself cannot hold the process
     * open — if everything else finishes first, this never fires.
     */
    const deadline = setTimeout(() => {
      logger.error('Graceful shutdown timed out; exiting', {
        timeoutMs: env.shutdownTimeoutMs,
      });

      process.exit(1);
    }, env.shutdownTimeoutMs);

    deadline.unref();

    try {
      await closeHttpServer(server);
      logger.info('HTTP server closed');

      await closeDatabase();
      logger.info('Database connection closed');

      clearTimeout(deadline);

      logger.info('Shutdown complete');
      process.exit(exitCode);
    } catch (error) {
      logger.error('Error during shutdown', { error });

      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /*
   * An uncaught exception leaves the process in an undefined state — a
   * half-applied write, a corrupted in-memory cache — so continuing to serve
   * traffic is a worse bet than restarting. Log it and shut down cleanly,
   * giving in-flight requests a chance to finish.
   */
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    shutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason : { message: String(reason) },
    });

    shutdown('unhandledRejection', 1);
  });
};

export default registerGracefulShutdown;
