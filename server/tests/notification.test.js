import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { asUser, createUser } from './helpers/factories.js';

let app;
let Notification;

before(async () => {
  app = await startTestDatabase();
  Notification = (await import('../src/models/Notification.js')).default;
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

const API = '/api/v1';

const seedNotification = (recipient, overrides = {}) =>
  Notification.create({
    recipient: recipient._id,
    type: 'task_assigned',
    title: 'You were assigned a task',
    message: 'Task details',
    isRead: false,
    ...overrides,
  });

describe('Notifications', () => {
  test('lists only the caller\u2019s notifications', async () => {
    const me = await createUser({ name: 'Me' });
    const other = await createUser({ name: 'Other' });

    await seedNotification(me);
    await seedNotification(other);

    const response = await asUser(app, me).get(`${API}/notifications`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.notifications.length, 1);
  });

  test('returns an empty list when there are none', async () => {
    const user = await createUser();

    const response = await asUser(app, user).get(`${API}/notifications`);

    assert.equal(response.body.data.notifications.length, 0);
    assert.equal(response.body.data.pagination.total, 0);
  });

  test('counts unread notifications', async () => {
    const user = await createUser();
    await seedNotification(user);
    await seedNotification(user);
    await seedNotification(user, { isRead: true, readAt: new Date() });

    const response = await asUser(app, user).get(`${API}/notifications/unread/count`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.count, 2);
  });

  test('lists only unread notifications on the unread endpoint', async () => {
    const user = await createUser();
    await seedNotification(user);
    await seedNotification(user, { isRead: true, readAt: new Date() });

    const response = await asUser(app, user).get(`${API}/notifications/unread`);

    assert.equal(response.body.data.notifications.length, 1);
  });

  test('filters by read state through the query parameter', async () => {
    const user = await createUser();
    await seedNotification(user);
    await seedNotification(user, { isRead: true, readAt: new Date() });

    const unread = await asUser(app, user).get(`${API}/notifications?unread=true`);
    assert.equal(unread.body.data.notifications.length, 1);

    const all = await asUser(app, user).get(`${API}/notifications?unread=false`);
    assert.equal(all.body.data.notifications.length, 2);
  });

  test('marks a single notification as read', async () => {
    const user = await createUser();
    const notification = await seedNotification(user);

    const response = await asUser(app, user).patch(`${API}/notifications/${notification._id}/read`);

    assert.equal(response.status, 200);

    const reloaded = await Notification.findById(notification._id);
    assert.equal(reloaded.isRead, true);
    assert.ok(reloaded.readAt);
  });

  test('marks all notifications as read', async () => {
    const user = await createUser();
    await seedNotification(user);
    await seedNotification(user);

    const response = await asUser(app, user).patch(`${API}/notifications/read-all`);

    assert.equal(response.status, 200);

    const count = await Notification.countDocuments({ recipient: user._id, isRead: false });
    assert.equal(count, 0);
  });

  test('deletes a notification', async () => {
    const user = await createUser();
    const notification = await seedNotification(user);

    const response = await asUser(app, user).delete(`${API}/notifications/${notification._id}`);

    assert.equal(response.status, 200);

    const remaining = await Notification.countDocuments({ recipient: user._id });
    assert.equal(remaining, 0);
  });

  test('cannot read another user\u2019s notification', async () => {
    const owner = await createUser({ name: 'Owner' });
    const attacker = await createUser({ name: 'Attacker' });
    const notification = await seedNotification(owner);

    const response = await asUser(app, attacker).patch(
      `${API}/notifications/${notification._id}/read`
    );

    assert.equal(response.status, 404, 'another user\u2019s notification must be invisible');
  });

  test('cannot delete another user\u2019s notification', async () => {
    const owner = await createUser({ name: 'Owner' });
    const attacker = await createUser({ name: 'Attacker' });
    const notification = await seedNotification(owner);

    const response = await asUser(app, attacker).delete(`${API}/notifications/${notification._id}`);

    assert.equal(response.status, 404);

    const stillThere = await Notification.countDocuments({ _id: notification._id });
    assert.equal(stillThere, 1);
  });

  test('requires authentication', async () => {
    const response = await fetch(`http://127.0.0.1:1/never`).catch(() => null);
    assert.equal(response, null);

    const { default: request } = await import('supertest');
    const unauth = await request(app).get(`${API}/notifications`);
    assert.equal(unauth.status, 401);
  });

  test('notifications are paginated', async () => {
    const user = await createUser();

    for (let i = 0; i < 5; i += 1) {
      await seedNotification(user, { title: `Notification ${i}` });
    }

    const firstPage = await asUser(app, user).get(`${API}/notifications?limit=2&page=1`);
    const secondPage = await asUser(app, user).get(`${API}/notifications?limit=2&page=2`);

    assert.equal(firstPage.body.data.notifications.length, 2);
    assert.equal(secondPage.body.data.notifications.length, 2);
    assert.equal(firstPage.body.data.pagination.total, 5);
    assert.equal(firstPage.body.data.pagination.totalPages, 3);
    assert.equal(firstPage.body.data.pagination.hasNextPage, true);
    assert.equal(firstPage.body.data.pagination.hasPrevPage, false);
  });
});
