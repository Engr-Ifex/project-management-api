import env from './src/config/env.js';
import app from './app.js';
import { connectDB, closeDatabase } from './src/config/database.js';
import registerGracefulShutdown from './src/utils/gracefulShutdown.js';
import logger from './src/utils/logger.js';

/*
 * Entry point.
 *
 * Order matters: connect to the database first, then accept traffic. A process
 * that listens before its database is reachable would fail every request that
 * needs data, and — behind a load balancer — would look healthy to a liveness
 * probe while serving 500s.
 */

/*
 * HTTP server timeouts.
 *
 * Node's defaults are not tuned for running behind a proxy:
 *
 *   keepAliveTimeout  Node's 5s default is SHORTER than the idle timeout of
 *                     most load balancers (60s on an AWS ALB). When the server
 *                     closes a connection the balancer still believes is open,
 *                     the next request on it fails with a 502. Raising this
 *                     above the balancer's idle timeout removes that race.
 *
 *   headersTimeout    Must exceed keepAliveTimeout, or a keep-alive socket can
 *                     be reaped mid-request-header.
 *
 *   requestTimeout    Bounds the time to receive a complete request. The 300s
 *                     default would let a slow-loris client occupy a connection
 *                     for five minutes; 120s is generous for a 10 MB upload on
 *                     a slow link while still bounding the damage.
 */
const KEEP_ALIVE_TIMEOUT_MS = 65000;
const HEADERS_TIMEOUT_MS = 66000;
const REQUEST_TIMEOUT_MS = 120000;

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    /*
     * Fatal, and deliberately so: without a database this process can serve
     * almost nothing. Exiting lets the orchestrator restart it and surface the
     * failure, instead of running a zombie that fails every request.
     */
    logger.error('Failed to connect to MongoDB; refusing to start', { error });

    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info('Server listening', {
      url: `http://localhost:${env.port}`,
      environment: env.nodeEnv,
      apiBase: '/api/v1',
      logLevel: env.logLevel,
    });
  });

  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;

  /*
   * `listen` reports a failure (most often EADDRINUSE) as an event rather than
   * a rejection, so without this the process would emit an unhandled error and
   * exit with a stack trace instead of a clear message.
   */
  server.on('error', async (error) => {
    logger.error('HTTP server error', { error });

    await closeDatabase().catch(() => {});

    process.exit(1);
  });

  registerGracefulShutdown(server);
};

startServer();
