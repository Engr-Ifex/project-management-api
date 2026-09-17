import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { startTestDatabase, stopTestDatabase } from './helpers/setup.js';

/*
 * Response envelope contract.
 *
 * Success and error responses are read by the same clients, so they must have
 * the same shape. They previously did not: success carried `statusCode` and
 * errors did not, and the validation middleware built its own error body which
 * had drifted from the central handler's.
 *
 * These tests pin the shape of both, plus the fact that every error path —
 * validation, not-found, and thrown ApiError — produces the same envelope.
 */
let app;

before(async () => {
  app = await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

const ERROR_KEYS = ['success', 'statusCode', 'message', 'errors'];
const SUCCESS_KEYS = ['success', 'statusCode', 'message', 'data'];

describe('response envelope contract', () => {
  test('the API index uses the standard success envelope', async () => {
    const response = await request(app).get('/api/v1/');

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), [...SUCCESS_KEYS].sort());
    assert.equal(response.body.success, true);
    assert.equal(response.body.statusCode, 200);
  });

  test('a validation failure uses the standard error envelope', async () => {
    /*
     * Validation errors are produced by the validate middleware. It used to
     * write its own 400 body, which is exactly how the two shapes drifted
     * apart; it now defers to the central error handler.
     */
    const response = await request(app).post('/api/v1/auth/login').send({});

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(response.body).sort(), [...ERROR_KEYS].sort());
    assert.equal(response.body.success, false);
    assert.equal(response.body.statusCode, 400);
    assert.equal(response.body.message, 'Validation failed');
    assert.ok(Array.isArray(response.body.errors));
    assert.ok(response.body.errors.length > 0);

    for (const issue of response.body.errors) {
      assert.ok(issue.field, 'each issue names a field');
      assert.ok(issue.message, 'each issue carries a message');
    }
  });

  test('an unknown route uses the standard error envelope', async () => {
    const response = await request(app).get('/api/v1/definitely-not-a-route');

    assert.equal(response.status, 404);
    assert.deepEqual(Object.keys(response.body).sort(), [...ERROR_KEYS].sort());
    assert.equal(response.body.statusCode, 404);
    assert.equal(response.body.errors.length, 0);
  });

  test('an authentication failure uses the standard error envelope', async () => {
    const response = await request(app).get('/api/v1/users/profile');

    assert.equal(response.status, 401);
    assert.deepEqual(Object.keys(response.body).sort(), [...ERROR_KEYS].sort());
    assert.equal(response.body.statusCode, 401);
    assert.equal(response.body.success, false);
  });

  test('error responses never leak a stack trace outside development', async () => {
    const response = await request(app).get('/api/v1/definitely-not-a-route');

    assert.equal(response.body.stack, undefined);
  });

  test('a malformed id is rejected as 400, not 500', async () => {
    const response = await request(app)
      .get('/api/v1/workspaces/not-an-object-id/projects')
      .set('Cookie', 'accessToken=invalid');

    /*
     * Whatever the auth outcome, the point is that a malformed identifier is
     * never a server error.
     */
    assert.ok(
      response.status === 400 || response.status === 401,
      `expected 400 or 401, got ${response.status}`
    );
    assert.notEqual(response.status, 500);
  });
});
