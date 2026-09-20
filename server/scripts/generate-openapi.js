/*
 * Generates `docs/openapi.json` from the implementation.
 *
 * Sources of truth, none of which are duplicated here:
 *   - paths, methods and guards .... scripts/route-inventory.js (parses routes)
 *   - request bodies / query ...... the route's own Zod validator, via
 *                                   `z.toJSONSchema` (Zod 4)
 *   - summaries and grouping ...... scripts/openapi-operations.js
 *   - resource shapes ............. hand-authored below, from the Mongoose models
 *
 * If a route has no entry in OPERATIONS the build fails, so an endpoint cannot
 * be added without being documented.
 *
 *   node scripts/generate-openapi.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

import buildInventory from './route-inventory.js';
import { OPERATIONS, TAGS } from './openapi-operations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const OUTPUT = path.join(root, 'docs', 'openapi.json');

/*
 * Format the document the same way `npm run format:check` expects it.
 *
 * `JSON.stringify` puts every array element on its own line. Prettier collapses
 * the ones that fit, so writing the raw stringify leaves the artefact
 * inconsistent with the format gate — which then fails on the next
 * `npm run docs:generate` for a reason that has nothing to do with the code.
 * Formatting here keeps the generator and the gate in agreement.
 *
 * Prettier is a devDependency. The production image ships `scripts/` (the
 * preflight runs from there) but installs with `--omit=dev`, so the import is
 * optional: without Prettier the document is still valid and still correct,
 * only less tidy.
 */
const formatDocument = async (text) => {
  try {
    const prettier = await import('prettier');
    const config = (await prettier.resolveConfig(OUTPUT)) ?? {};

    return await prettier.format(text, { ...config, parser: 'json' });
  } catch {
    console.warn('Prettier unavailable — writing unformatted JSON.');

    return text;
  }
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (name) => ({ type: 'array', items: ref(name) });
const str = (extra = {}) => ({ type: 'string', ...extra });
const nullable = (schema) => ({ ...schema, nullable: true });
const dateTime = () => nullable({ type: 'string', format: 'date-time' });
const objectId = () => str({ pattern: '^[0-9a-fA-F]{24}$', example: '64f000000000000000000001' });
const integer = (extra = {}) => ({ type: 'integer', ...extra });
const bool = () => ({ type: 'boolean' });

/* ------------------------------------------------------------------ *
 * Resource schemas (authored from the Mongoose models)
 * ------------------------------------------------------------------ */

const SCHEMAS = {
  ObjectId: objectId(),

  Pagination: {
    type: 'object',
    description: 'Present on every paginated list response.',
    properties: {
      page: integer({ example: 1 }),
      limit: integer({ example: 20 }),
      total: integer({ example: 42 }),
      totalPages: integer({ example: 3 }),
      hasNextPage: bool(),
      hasPrevPage: bool(),
    },
  },

  UserSettings: {
    type: 'object',
    properties: {
      emailNotifications: bool(),
      marketingEmails: bool(),
    },
  },

  User: {
    type: 'object',
    description:
      'A user. `password` is never present: it is `select: false` and stripped again on serialisation.',
    properties: {
      id: objectId(),
      name: str({ example: 'Ada Lovelace' }),
      email: str({ format: 'email', example: 'ada@example.com' }),
      role: { type: 'string', enum: ['user', 'admin'] },
      avatar: nullable(str()),
      settings: ref('UserSettings'),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  WorkspaceMember: {
    type: 'object',
    properties: {
      user: {
        description: 'Populated as an object on read; a plain id when embedded in a list.',
        oneOf: [ref('ObjectId'), ref('User')],
      },
      role: { type: 'string', enum: ['owner', 'admin', 'member'] },
    },
  },

  Workspace: {
    type: 'object',
    description: '`_id` is mapped to `id` on serialisation, as for User.',
    properties: {
      id: objectId(),
      name: str({ example: 'Acme Platform' }),
      description: str(),
      owner: ref('ObjectId'),
      members: { type: 'array', items: ref('WorkspaceMember') },
      settings: {
        type: 'object',
        properties: { allowMemberInvites: bool(), isPublic: bool() },
      },
      isArchived: bool(),
      archivedAt: dateTime(),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Invitation: {
    type: 'object',
    properties: {
      _id: objectId(),
      workspace: ref('ObjectId'),
      invitedBy: ref('ObjectId'),
      email: str({ format: 'email' }),
      role: { type: 'string', enum: ['admin', 'member'] },
      status: { type: 'string', enum: ['pending', 'accepted', 'expired', 'cancelled'] },
      expiresAt: dateTime(),
      acceptedAt: dateTime(),
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  ProjectMember: {
    type: 'object',
    properties: {
      user: { oneOf: [ref('ObjectId'), ref('User')] },
      role: { type: 'string', enum: ['owner', 'admin', 'member', 'viewer'] },
    },
  },

  Project: {
    type: 'object',
    properties: {
      _id: objectId(),
      workspace: ref('ObjectId'),
      createdBy: { oneOf: [ref('ObjectId'), ref('User')] },
      name: str({ example: 'Payments v2' }),
      description: str(),
      status: { type: 'string', enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'] },
      deadline: dateTime(),
      color: nullable(str()),
      members: {
        type: 'array',
        items: ref('ProjectMember'),
        description:
          'Present only for a caller with access to the project — a project member, ' +
          'or a workspace owner/admin. A workspace member who is not on the project ' +
          'can still read the project record (discovery), but the membership list is ' +
          'omitted: it carries member identities and is project-internal. ' +
          '`createdBy` is likewise reduced to an id for such a caller.',
      },
      isArchived: bool(),
      archivedAt: dateTime(),
      archivedBy: ref('ObjectId'),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Subtask: {
    type: 'object',
    properties: {
      _id: objectId(),
      title: str(),
      isCompleted: bool(),
      completedAt: dateTime(),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Task: {
    type: 'object',
    properties: {
      _id: objectId(),
      project: ref('ObjectId'),
      createdBy: { oneOf: [ref('ObjectId'), ref('User')] },
      assignee: { oneOf: [ref('ObjectId'), ref('User'), { type: 'null' }] },
      title: str({ example: 'Handle refund webhooks' }),
      description: str(),
      subtasks: { type: 'array', items: ref('Subtask') },
      labels: { type: 'array', items: ref('ObjectId') },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'in_review', 'completed', 'cancelled'],
      },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      startDate: dateTime(),
      dueDate: dateTime(),
      estimatedTime: integer({ description: 'Estimated effort in minutes.', example: 120 }),
      position: integer({ description: 'Ordering within the project.' }),
      isArchived: bool(),
      archivedAt: dateTime(),
      archivedBy: ref('ObjectId'),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Comment: {
    type: 'object',
    properties: {
      _id: objectId(),
      task: ref('ObjectId'),
      project: ref('ObjectId'),
      author: { oneOf: [ref('ObjectId'), ref('User')] },
      content: str({ maxLength: 2000 }),
      editedAt: dateTime(),
      isDeleted: bool(),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Label: {
    type: 'object',
    properties: {
      _id: objectId(),
      project: ref('ObjectId'),
      name: str({ example: 'bug' }),
      color: str({ description: 'Hex colour, e.g. `#ff0000`.', example: '#ff0000' }),
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Attachment: {
    type: 'object',
    description:
      'Metadata only. Files are never served from a public path; use the download endpoint.',
    properties: {
      _id: objectId(),
      originalFilename: str({ example: 'spec.pdf' }),
      storedFilename: str({ description: 'Server-generated UUID name.' }),
      mimeType: str({ example: 'application/pdf' }),
      size: integer({ description: 'Bytes.', example: 20480 }),
      uploader: { oneOf: [ref('ObjectId'), ref('User')] },
      project: ref('ObjectId'),
      task: { oneOf: [ref('ObjectId'), { type: 'null' }] },
      comment: { oneOf: [ref('ObjectId'), { type: 'null' }] },
      scope: { type: 'string', enum: ['project', 'task', 'comment'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Notification: {
    type: 'object',
    properties: {
      _id: objectId(),
      recipient: ref('ObjectId'),
      actor: { oneOf: [ref('ObjectId'), ref('User')] },
      type: {
        type: 'string',
        enum: [
          'task_assigned',
          'task_reassigned',
          'task_due_soon',
          'task_comment_added',
          'project_member_added',
          'project_role_changed',
          'workspace_invitation',
        ],
      },
      title: str(),
      message: str(),
      workspace: ref('ObjectId'),
      project: ref('ObjectId'),
      task: ref('ObjectId'),
      comment: ref('ObjectId'),
      isRead: bool(),
      readAt: dateTime(),
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  ProjectActivity: {
    type: 'object',
    description: 'An append-only audit entry. Written by the service layer, never by a client.',
    properties: {
      _id: objectId(),
      workspace: ref('ObjectId'),
      project: ref('ObjectId'),
      user: { oneOf: [ref('ObjectId'), ref('User')] },
      action: {
        type: 'string',
        description: 'See `docs/API.md` for the full action list.',
        example: 'task_status_changed',
      },
      metadata: { type: 'object', additionalProperties: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  WorkspaceDashboard: {
    type: 'object',
    properties: {
      workspace: ref('Workspace'),
      projects: {
        type: 'object',
        properties: {
          total: integer(),
          active: integer(),
          archived: integer(),
          byStatus: { type: 'object', additionalProperties: integer() },
        },
      },
      myTasks: ref('MyTasks'),
    },
  },

  MyTasks: {
    type: 'object',
    description: 'Figures for the calling user only.',
    properties: {
      assigned: integer(),
      completed: integer(),
      overdue: integer(),
    },
  },

  ProjectDashboard: {
    type: 'object',
    properties: {
      project: ref('Project'),
      tasks: {
        type: 'object',
        properties: {
          total: integer(),
          byStatus: { type: 'object', additionalProperties: integer() },
          byPriority: { type: 'object', additionalProperties: integer() },
          completed: integer(),
          cancelled: integer(),
          overdue: integer(),
          upcoming: integer(),
          upcomingDueDays: integer(),
          unassigned: integer(),
          completionPercentage: integer({ description: 'completed / (total − cancelled), 0–100.' }),
          estimatedTime: {
            type: 'object',
            properties: {
              unit: str({ example: 'minutes' }),
              total: integer(),
              completed: integer(),
              remaining: integer(),
            },
          },
        },
      },
      myTasks: ref('MyTasks'),
    },
  },
};

/* ------------------------------------------------------------------ *
 * Response envelopes
 * ------------------------------------------------------------------ */

const DATA_SHAPES = {
  user: { user: ref('User') },
  auth: { user: ref('User') },
  settings: { settings: ref('UserSettings') },
  workspace: { workspace: ref('Workspace') },
  workspaces: { workspaces: arrayOf('Workspace'), pagination: ref('Pagination') },
  invitation: { invitation: ref('Invitation') },
  members: { members: { type: 'array', items: ref('WorkspaceMember') } },
  member: { member: ref('WorkspaceMember') },
  project: { project: ref('Project') },
  projects: { projects: arrayOf('Project'), pagination: ref('Pagination') },
  task: { task: ref('Task') },
  tasks: { tasks: arrayOf('Task'), pagination: ref('Pagination') },
  subtask: { subtask: ref('Subtask') },
  subtasks: { subtasks: arrayOf('Subtask') },
  comment: { comment: ref('Comment') },
  comments: { comments: arrayOf('Comment'), pagination: ref('Pagination') },
  label: { label: ref('Label') },
  labels: { labels: arrayOf('Label') },
  attachment: { attachment: ref('Attachment') },
  attachments: { attachments: arrayOf('Attachment'), pagination: ref('Pagination') },
  notification: { notification: ref('Notification') },
  notifications: { notifications: arrayOf('Notification'), pagination: ref('Pagination') },
  count: { count: integer() },
  activities: { activities: arrayOf('ProjectActivity'), pagination: ref('Pagination') },
  apiIndex: { version: str(), documentation: str() },
  health: {
    status: { type: 'string', enum: ['ok'] },
    uptimeSeconds: integer(),
    environment: { type: 'string', enum: ['development', 'test', 'production'] },
    version: str(),
  },
  healthReady: {
    status: { type: 'string', enum: ['ready', 'not_ready'] },
    checks: {
      type: 'object',
      properties: {
        database: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: integer({ description: 'Present when the database is up.' }),
            reason: str({ description: 'Present when the database is down.' }),
          },
        },
      },
    },
  },
  dashboard: null, // replaced per operation below
  message: null,
  binary: null,
  openapi: null,
};

// The two dashboard endpoints return different payloads.
const DASHBOARD_OVERRIDES = {
  'GET /api/v1/workspaces/:workspaceId/dashboard': 'WorkspaceDashboard',
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/dashboard': 'ProjectDashboard',
};

const ENVELOPE_PREFIX = 'Response';

const buildEnvelopes = () => {
  const envelopes = {};

  for (const [key, dataProps] of Object.entries(DATA_SHAPES)) {
    if (!dataProps) continue;

    envelopes[`${key}${ENVELOPE_PREFIX}`] = {
      type: 'object',
      description: 'Standard success envelope.',
      required: ['success', 'statusCode', 'message', 'data'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        statusCode: integer({ example: 200 }),
        message: str({ example: 'Request completed successfully' }),
        data: { type: 'object', properties: dataProps },
      },
    };
  }

  envelopes.MessageResponse = {
    type: 'object',
    description: 'Success envelope for endpoints that return no payload.',
    required: ['success', 'statusCode', 'message'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      statusCode: integer({ example: 200 }),
      message: str({ example: 'Operation completed successfully' }),
      data: { type: 'object', nullable: true },
    },
  };

  return envelopes;
};

const ERROR_SCHEMA = {
  type: 'object',
  description: 'Standard error envelope. `errors` is a list of field-level failures.',
  required: ['success', 'statusCode', 'message', 'errors'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    statusCode: integer({ example: 400 }),
    message: str({ example: 'Validation failed' }),
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: str({ example: 'body.email' }),
          message: str({ example: 'Please provide a valid email address' }),
        },
      },
    },
  },
};

/* ------------------------------------------------------------------ *
 * Zod -> JSON Schema
 * ------------------------------------------------------------------ */

const loadValidators = async () => {
  const dir = path.join(root, 'src', 'validators');
  const map = new Map();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.validator.js'))) {
    const module = await import(pathToFileURL(path.join(dir, file)).href);

    for (const [name, value] of Object.entries(module)) {
      if (value && typeof value === 'object' && typeof value.safeParse === 'function') {
        map.set(name, value);
      }
    }
  }

  return map;
};

/** Convert a validator to JSON Schema, tolerating transforms. */
const toJsonSchema = (schema) => {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  } catch (error) {
    throw new Error(`Could not convert validator to JSON Schema: ${error.message}`, {
      cause: error,
    });
  }
};

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

const paramDescription = (name) =>
  ({
    workspaceId: 'Workspace id (24-character hex ObjectId).',
    projectId: 'Project id.',
    taskId: 'Task id.',
    subtaskId: 'Subtask id.',
    commentId: 'Comment id.',
    labelId: 'Label id.',
    attachmentId: 'Attachment id.',
    notificationId: 'Notification id.',
    userId: 'User id.',
    token: 'Invitation token.',
  })[name] ?? `${name} parameter.`;

const pathParameters = (pathTemplate) =>
  [...pathTemplate.matchAll(/:([A-Za-z]+)/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: objectId(),
    description: paramDescription(name),
  }));

const queryParametersFrom = (jsonSchema) => {
  const properties = jsonSchema?.properties ?? {};
  const required = new Set(jsonSchema?.required ?? []);

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: { ...schema, nullable: undefined },
    description: schema.description ?? '',
  }));
};

const errorResponses = (guards, pathTemplate) => {
  const responses = {};

  if (guards.includes('authenticate')) {
    responses['401'] = {
      description: 'Missing, expired, malformed or revoked session cookie.',
      content: { 'application/json': { schema: ref('ErrorResponse') } },
    };
  }

  if (guards.some((g) => g.startsWith('workspace') || g.startsWith('project'))) {
    responses['403'] = {
      description: 'Authenticated, but without the required workspace or project authority.',
      content: { 'application/json': { schema: ref('ErrorResponse') } },
    };
  }

  if (/:/.test(pathTemplate)) {
    responses['404'] = {
      description: 'The resource does not exist, or is outside the caller’s scope.',
      content: { 'application/json': { schema: ref('ErrorResponse') } },
    };
  }

  responses['400'] = {
    description: 'Validation failed, or the request is not actionable.',
    content: { 'application/json': { schema: ref('ErrorResponse') } },
  };

  responses['429'] = {
    description:
      'Rate limit exceeded. Authentication endpoints are limited to 10 requests / 15 minutes per IP.',
    content: { 'application/json': { schema: ref('ErrorResponse') } },
  };

  return responses;
};

const buildSecurity = (guards) => {
  if (!guards.includes('authenticate')) return undefined;

  // There is exactly one scheme: the accessToken cookie.
  return [{ cookieAuth: [] }];
};

const buildOperations = async (inventory, validators) => {
  const paths = {};
  const missing = [];

  for (const route of inventory) {
    const key = `${route.method} ${route.path}`;
    const meta = OPERATIONS[key];

    if (!meta) {
      missing.push(key);
      continue;
    }

    const [tag, summary, returns, bodyOverride, statusOverride] = meta;
    const method = route.method.toLowerCase();
    const pathTemplate = route.path.replace(/:([A-Za-z]+)/g, '{$1}');

    const operation = {
      tags: [tag],
      summary,
      operationId: `${route.controller ? route.controller.split('.')[1] : method + tag}`,
      security: buildSecurity(route.guards),
      responses: errorResponses(route.guards, route.path),
    };

    const parameters = pathParameters(route.path);

    // Request body and query parameters come from the route's own validator.
    if (route.validator && validators.has(route.validator)) {
      const jsonSchema = toJsonSchema(validators.get(route.validator));

      if (jsonSchema.properties?.query) {
        parameters.push(...queryParametersFrom(jsonSchema.properties.query));
      }

      const bodySchema = jsonSchema.properties?.body;

      if (bodyOverride !== null && bodySchema && Object.keys(bodySchema.properties ?? {}).length) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: bodySchema } },
        };
      }
    }

    if (parameters.length) operation.parameters = parameters;

    /*
     * Success response.
     *
     * 201 for POST is the convention, not a rule: login, logout, adding a
     * project member and assigning a label are POSTs that do not create a
     * resource and answer 200. Those declare their status explicitly in
     * `openapi-operations.js`; the default would publish a contract the API
     * does not honour.
     */
    const status = statusOverride ?? (method === 'post' ? '201' : '200');

    if (returns === 'openapi') {
      operation.responses[status] = {
        description: 'The OpenAPI 3.1 document for this API.',
        content: { 'application/json': { schema: { type: 'object' } } },
      };
    } else if (returns === 'binary') {
      operation.responses[status] = {
        description: 'The file stream.',
        content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      };
    } else if (returns === 'message') {
      operation.responses[status] = {
        description: 'Success.',
        content: { 'application/json': { schema: ref('MessageResponse') } },
      };
    } else {
      const envelope =
        DASHBOARD_OVERRIDES[key] ?? (DATA_SHAPES[returns] ? `${returns}${ENVELOPE_PREFIX}` : null);

      operation.responses[status] = {
        description: 'Success.',
        content: {
          'application/json': {
            schema: envelope ? ref(envelope) : ref('MessageResponse'),
          },
        },
      };
    }

    /*
     * The readiness probe is the one endpoint that answers 503 as a normal
     * outcome, so the same envelope is documented under both status codes.
     */
    if (returns === 'healthReady') {
      operation.responses['503'] = {
        description:
          'The instance is not ready to receive traffic: the database is unreachable. ' +
          'It is still alive — use GET /api/v1/health for liveness.',
        content: { 'application/json': { schema: ref('healthReadyResponse') } },
      };
    }

    // POST /auth/* also set the session cookie.
    if (route.path.startsWith('/api/v1/auth/') && route.path !== '/api/v1/auth/logout') {
      operation.responses[status].headers = {
        'Set-Cookie': {
          description: 'The `accessToken` httpOnly session cookie.',
          schema: str(),
        },
      };
    }

    paths[pathTemplate] = { ...(paths[pathTemplate] ?? {}), [method]: operation };
  }

  return { paths, missing };
};

const main = async () => {
  const inventory = buildInventory();
  const validators = await loadValidators();

  const { paths, missing } = await buildOperations(inventory, validators);

  if (missing.length) {
    console.error('Undocumented routes — add them to scripts/openapi-operations.js:\n');
    for (const key of missing) console.error(`  ${key}`);
    process.exit(1);
  }

  const document = {
    openapi: '3.1.0',
    info: {
      title: 'Project Management API',
      version: '1.0.0',
      description:
        'REST API for workspaces, projects, tasks, comments, labels and file attachments.\n\n' +
        'Generated from the implementation by `npm run docs:generate`. ' +
        'Authentication is cookie-based; see `docs/API.md` for the full guide.',
      license: { name: 'ISC' },
    },
    servers: [{ url: 'http://localhost:5000', description: 'Local development' }],
    tags: TAGS,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
          description:
            'Session cookie set by `POST /api/v1/auth/login`. httpOnly, SameSite=Strict, ' +
            'and `Secure` in production. There is no bearer-token alternative.',
        },
      },
      schemas: { ...SCHEMAS, ...buildEnvelopes(), ErrorResponse: ERROR_SCHEMA },
      responses: {
        Unauthenticated: {
          description: 'Authentication required.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
    paths,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, await formatDocument(`${JSON.stringify(document, null, 2)}\n`), 'utf8');

  const operationCount = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);

  console.log(`Wrote ${path.relative(root, OUTPUT)}`);
  console.log(`  ${Object.keys(paths).length} paths, ${operationCount} operations`);
  console.log(`  ${Object.keys(document.components.schemas).length} schemas`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
