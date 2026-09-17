import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';

import { startTestDatabase, stopTestDatabase, isUsingRealDatabase } from './helpers/setup.js';

/*
 * Liveness and readiness probes.
 *
 * These are the endpoints an orchestrator uses to decide whether to restart an
 * instance and whether to send it traffic, so getting them wrong is expensive:
 * a liveness probe that depends on the database turns a brief blip into a
 * restart loop, and a readiness probe that does not check the database routes
 * traffic to an instance that cannot serve it.
 *
 * The suite runs against either a real database or the in-process store
 * depending on TEST_DB, so the readiness assertions are written to hold in
 * both — a connected database must report ready, a disconnected one must
 * report not-ready.
 */
let app;

before(async () => {
  app = await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

describe('GET /api/v1/health (liveness)', () => {
  test('returns 200 and the standard envelope', async () => {
    const response = await request(app).get('/api/v1/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.statusCode, 200);
    assert.equal(response.body.data.status, 'ok');
    assert.equal(typeof response.body.data.uptimeSeconds, 'number');
    assert.equal(response.body.data.version, '1.0.0');
  });

  test('does not depend on the database', async () => {
    /*
     * This is the property that matters. If liveness required the database, a
     * blip would fail the probe and the orchestrator would restart every
     * healthy instance — which cannot fix a database problem.
     */
    const wasConnected = mongoose.connection.readyState === 1;

    if (wasConnected) await mongoose.disconnect();

    try {
      const response = await request(app).get('/api/v1/health');

      assert.equal(response.status, 200, 'liveness must succeed without a database');
      assert.equal(response.body.data.status, 'ok');
    } finally {
      if (wasConnected) await mongoose.connect(process.env.MONGODB_URI);
    }
  });
});

describe('GET /api/v1/health/ready (readiness)', () => {
  test('reflects the database connection state', async () => {
    const response = await request(app).get('/api/v1/health/ready');

    if (isUsingRealDatabase()) {
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.status, 'ready');
      assert.equal(response.body.data.checks.database.status, 'up');
      assert.equal(typeof response.body.data.checks.database.latencyMs, 'number');
    } else {
      // The in-process store is not a mongoose connection, so readiness is
      // legitimately not-ready. Asserting this keeps the contract covered in
      // both modes rather than skipping.
      assert.equal(response.status, 503);
      assert.equal(response.body.data.status, 'not_ready');
    }
  });

  test('returns 503 with the standard envelope when the database is down', async () => {
    const wasConnected = mongoose.connection.readyState === 1;

    if (wasConnected) await mongoose.disconnect();

    try {
      const response = await request(app).get('/api/v1/health/ready');

      assert.equal(response.status, 503);
      assert.equal(response.body.success, false, 'a 503 must not report success');
      assert.equal(response.body.statusCode, 503);
      assert.equal(response.body.data.status, 'not_ready');
      assert.equal(response.body.data.checks.database.status, 'down');
      assert.ok(response.body.data.checks.database.reason);
    } finally {
      if (wasConnected) await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  test('a not-ready instance still answers liveness', async () => {
    const wasConnected = mongoose.connection.readyState === 1;

    if (wasConnected) await mongoose.disconnect();

    try {
      /*
       * The distinction the two endpoints exist to draw: not ready to receive
       * traffic, but very much alive. An orchestrator must remove it from the
       * pool rather than restart it.
       */
      const ready = await request(app).get('/api/v1/health/ready');
      const live = await request(app).get('/api/v1/health');

      assert.equal(ready.status, 503);
      assert.equal(live.status, 200);
    } finally {
      if (wasConnected) await mongoose.connect(process.env.MONGODB_URI);
    }
  });
});
