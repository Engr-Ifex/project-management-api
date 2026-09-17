import request from 'supertest';

import User from '../../src/models/User.js';
import Workspace from '../../src/models/Workspace.js';
import Project from '../../src/models/Project.js';
import Task from '../../src/models/Task.js';
import Label from '../../src/models/Label.js';
import TaskComment from '../../src/models/TaskComment.js';

/*
 * Test data factories.
 *
 * Records are created through the real models so schema defaults, hooks and
 * validation all apply — a fixture that bypassed them would not represent
 * anything the API can actually store.
 */

export const DEFAULT_PASSWORD = 'Password123!';

let emailCounter = 0;

/** Unique, obviously-test email so a stray record is easy to spot. */
export const uniqueEmail = (prefix = 'user') =>
  `${prefix}-${Date.now()}-${++emailCounter}@test.local`;

export const createUser = async (overrides = {}) => {
  const user = await User.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? DEFAULT_PASSWORD,
    role: overrides.role ?? 'user',
    ...overrides,
  });

  // The plaintext is needed to log in; the model only stores the hash.
  user.plainPassword = overrides.password ?? DEFAULT_PASSWORD;

  return user;
};

export const createWorkspace = async (owner, overrides = {}) => {
  return Workspace.create({
    name: overrides.name ?? 'Test Workspace',
    description: overrides.description ?? '',
    owner: owner._id,
    members: overrides.members ?? [{ user: owner._id, role: 'owner' }],
    ...overrides,
  });
};

export const addWorkspaceMember = async (workspace, user, role = 'member') => {
  workspace.members.push({ user: user._id, role });

  return workspace.save();
};

export const createProject = async (workspace, createdBy, overrides = {}) => {
  return Project.create({
    workspace: workspace._id,
    createdBy: createdBy._id,
    name: overrides.name ?? 'Test Project',
    description: overrides.description ?? '',
    status: overrides.status ?? 'planning',
    members: overrides.members ?? [{ user: createdBy._id, role: 'owner' }],
    ...overrides,
  });
};

export const addProjectMember = async (project, user, role = 'member') => {
  project.members.push({ user: user._id, role });

  return project.save();
};

export const createTask = async (project, createdBy, overrides = {}) => {
  return Task.create({
    project: project._id,
    createdBy: createdBy._id,
    title: overrides.title ?? 'Test Task',
    ...overrides,
  });
};

export const createLabel = async (project, overrides = {}) => {
  return Label.create({
    project: project._id,
    name: overrides.name ?? 'Test Label',
    color: overrides.color ?? '#3366ff',
    ...overrides,
  });
};

export const createComment = async (task, author, overrides = {}) => {
  return TaskComment.create({
    task: task._id,
    project: task.project,
    author: author._id,
    content: overrides.content ?? 'Test comment',
    ...overrides,
  });
};

/**
 * A small request helper bound to one user's session cookie.
 *
 * The token is minted with the model's own method, so the requests are
 * authenticated exactly as a logged-in client's would be.
 */
export const asUser = (app, user) => {
  const cookie = `accessToken=${user.generateAccessToken()}`;

  const withCookie = (test) => test.set('Cookie', cookie);

  return {
    get: (url) => withCookie(request(app).get(url)),
    post: (url) => withCookie(request(app).post(url)),
    patch: (url) => withCookie(request(app).patch(url)),
    put: (url) => withCookie(request(app).put(url)),
    delete: (url) => withCookie(request(app).delete(url)),
  };
};

/** An anonymous (unauthenticated) request helper. */
export const anonymous = (app) => ({
  get: (url) => request(app).get(url),
  post: (url) => request(app).post(url),
  patch: (url) => request(app).patch(url),
  delete: (url) => request(app).delete(url),
});

/**
 * Register through the real API and keep the resulting session cookie.
 *
 * Used where the test is specifically about the authentication flow.
 */
export const registerAndLogin = async (app, overrides = {}) => {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? DEFAULT_PASSWORD;

  const agent = request.agent(app);

  const response = await agent
    .post('/api/v1/auth/register')
    .send({ name: overrides.name ?? 'Test User', email, password });

  if (response.status !== 201) {
    throw new Error(`Registration failed in test setup: ${response.status} ${response.text}`);
  }

  return { agent, user: response.body.data.user, email, password };
};

/**
 * A standard fixture: an owner, a workspace, and a project, all wired together.
 */
export const createProjectFixture = async (overrides = {}) => {
  const owner = await createUser({ name: 'Owner' });
  const workspace = await createWorkspace(owner);
  const project = await createProject(workspace, owner, overrides);

  return { owner, workspace, project };
};
