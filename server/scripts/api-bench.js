/*
 * API response-time benchmark.
 *
 * Seeds a dataset through the real HTTP API, then times the read endpoints that
 * the UI actually calls. Reports median and p95 per endpoint, plus the response
 * payload size, because "slow" is usually one of two things and they need
 * different fixes: time spent in the server, or bytes spent on the wire.
 *
 * ## Why it seeds over HTTP rather than writing to the database directly
 *
 * Writing documents straight into MongoDB would be faster, but it would bypass
 * the service layer — and the service layer is where activity records,
 * notifications and denormalised fields are written. A dataset that skipped it
 * would not look like real data, and the queries under test would be reading a
 * shape that never occurs in production.
 *
 * ## Warm-up
 *
 * Each endpoint is called once and discarded before timing. The first call pays
 * for connection setup, Mongoose model compilation and cold query planning;
 * including it would report the cost of starting up rather than the cost of
 * serving.
 *
 *   node scripts/api-bench.js                       # 30 iterations, default seed
 *   node scripts/api-bench.js --iterations 50
 *   node scripts/api-bench.js --tasks 500
 *   node scripts/api-bench.js --json out.json
 */

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: process.env.API_URL ?? 'http://localhost:5000' },
    iterations: { type: 'string', default: '30' },
    projects: { type: 'string', default: '3' },
    tasks: { type: 'string', default: '150' },
    labels: { type: 'string', default: '6' },
    members: { type: 'string', default: '3' },
    json: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`
Usage: node scripts/api-bench.js [options]

  --base <url>         API origin (default http://localhost:5000)
  --iterations <n>     timed calls per endpoint (default 30)
  --projects <n>       projects to seed (default 3)
  --tasks <n>          tasks per project (default 150)
  --labels <n>         labels per project (default 6)
  --members <n>        extra workspace members (default 3)
  --json <path>        also write the raw results as JSON
`);
  process.exit(0);
}

const BASE = values.base.replace(/\/+$/, '');
const ITERATIONS = Number(values.iterations);
const PROJECT_COUNT = Number(values.projects);
const TASKS_PER_PROJECT = Number(values.tasks);
const LABEL_COUNT = Number(values.labels);
const EXTRA_MEMBERS = Number(values.members);

const API = `${BASE}/api/v1`;

const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

let cookie = null;

/** A single HTTP call that never throws — failures are reported, not hidden. */
const call = async (path, { method = 'GET', body } = {}) => {
  const started = process.hrtime.bigint();

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body — the status and size are still recorded */
  }

  return {
    status: response.status,
    ms: elapsed,
    bytes: Buffer.byteLength(text),
    json,
    text: response.status >= 400 ? text.slice(0, 200) : null,
    setCookie: response.headers.getSetCookie?.() ?? [],
  };
};

const must = async (path, options) => {
  const result = await call(path, options);

  if (result.status >= 400) {
    throw new Error(`${options?.method ?? 'GET'} ${path} -> ${result.status} ${result.text ?? ''}`);
  }

  return result;
};

/* ------------------------------------------------------------------ seed -- */

const seed = async () => {
  const stamp = Date.now();
  const email = `bench.${stamp}@example.com`;

  const registered = await must('/auth/register', {
    method: 'POST',
    body: { name: 'Bench Owner', email, password: 'BenchPassword!23' },
  });

  cookie = registered.setCookie.map((entry) => entry.split(';')[0]).join('; ');

  const workspaceResult = await must('/workspaces', {
    method: 'POST',
    body: { name: `Bench Workspace ${stamp}`, description: 'Seeded for API timing' },
  });

  const workspaceId = workspaceResult.json.data.workspace.id;

  /* Extra members, so member lists and populated refs are realistic. */
  const members = [];

  for (let index = 0; index < EXTRA_MEMBERS; index += 1) {
    const memberEmail = `bench.member.${stamp}.${index}@example.com`;

    const member = await must('/auth/register', {
      method: 'POST',
      body: { name: `Bench Member ${index}`, email: memberEmail, password: 'BenchPassword!23' },
    });

    const memberCookie = member.setCookie.map((entry) => entry.split(';')[0]).join('; ');

    /* Invite, then accept as the invitee — the real membership path. */
    const invitation = await must(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: { email: memberEmail, role: 'member' },
    });

    const token = invitation.json.data.invitation.token;

    const saved = cookie;
    cookie = memberCookie;
    await must(`/invitations/${token}/accept`, { method: 'PATCH' });
    cookie = saved;

    members.push(memberEmail);
  }

  const projects = [];
  let taskTotal = 0;

  for (let projectIndex = 0; projectIndex < PROJECT_COUNT; projectIndex += 1) {
    const projectResult = await must(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: {
        name: `Bench Project ${projectIndex}`,
        description: 'A project with enough rows to exercise list queries',
      },
    });

    const projectId = projectResult.json.data.project._id;

    for (let labelIndex = 0; labelIndex < LABEL_COUNT; labelIndex += 1) {
      await must(`/workspaces/${workspaceId}/projects/${projectId}/labels`, {
        method: 'POST',
        body: { name: `Label ${labelIndex}`, color: '#276b62' },
      });
    }

    for (let taskIndex = 0; taskIndex < TASKS_PER_PROJECT; taskIndex += 1) {
      await must(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
        method: 'POST',
        body: {
          title: `Task ${taskIndex} in project ${projectIndex} with a realistic title length`,
          description: 'Seeded description used for payload-size measurement.',
          status: STATUSES[taskIndex % STATUSES.length],
          priority: PRIORITIES[taskIndex % PRIORITIES.length],
        },
      });

      taskTotal += 1;
    }

    const tasks = await must(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks?limit=1`
    );

    projects.push({
      projectId,
      sampleTaskId: tasks.json.data.tasks[0]?._id ?? null,
    });
  }

  return { workspaceId, projects, taskTotal, email };
};

/* ----------------------------------------------------------------- timing -- */

const timeEndpoint = async (label, path) => {
  const warmUp = await call(path);

  if (warmUp.status >= 400) {
    return { label, path, status: warmUp.status, error: warmUp.text, samples: [] };
  }

  const samples = [];

  for (let index = 0; index < ITERATIONS; index += 1) {
    const result = await call(path);

    if (result.status >= 400) {
      return { label, path, status: result.status, error: result.text, samples };
    }

    samples.push({ ms: result.ms, bytes: result.bytes });
  }

  return { label, path, status: warmUp.status, samples, bytes: warmUp.bytes };
};

const percentile = (sorted, fraction) => {
  if (sorted.length === 0) return 0;

  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));

  return sorted[index];
};

const summarise = (entry) => {
  if (entry.error) return { ...entry, median: null, p95: null, min: null, max: null };

  const times = entry.samples.map((sample) => sample.ms).sort((a, b) => a - b);

  return {
    ...entry,
    median: times[Math.floor(times.length / 2)],
    p95: percentile(times, 0.95),
    min: times[0],
    max: times[times.length - 1],
    samples: undefined,
  };
};

/* ------------------------------------------------------------------- main -- */

const main = async () => {
  console.log(`\nAPI benchmark against ${API}`);
  console.log(
    `seed: ${PROJECT_COUNT} projects x ${TASKS_PER_PROJECT} tasks, ` +
      `${LABEL_COUNT} labels/project, ${EXTRA_MEMBERS} extra members`
  );
  console.log(`iterations per endpoint: ${ITERATIONS}\n`);

  const started = Date.now();
  const { workspaceId, projects, taskTotal } = await seed();

  console.log(
    `seeded ${taskTotal} tasks across ${PROJECT_COUNT} projects in ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s\n`
  );

  const project = projects[0];
  const { projectId, sampleTaskId } = project;

  const endpoints = [
    ['profile', '/users/profile'],
    ['workspaces list', '/workspaces'],
    ['workspace', `/workspaces/${workspaceId}`],
    ['workspace dashboard', `/workspaces/${workspaceId}/dashboard`],
    ['members', `/workspaces/${workspaceId}/members`],
    ['projects list', `/workspaces/${workspaceId}/projects`],
    ['project', `/workspaces/${workspaceId}/projects/${projectId}`],
    ['project dashboard', `/workspaces/${workspaceId}/projects/${projectId}/dashboard`],
    ['labels', `/workspaces/${workspaceId}/projects/${projectId}/labels`],
    ['tasks (default)', `/workspaces/${workspaceId}/projects/${projectId}/tasks`],
    ['tasks (limit=10)', `/workspaces/${workspaceId}/projects/${projectId}/tasks?limit=10`],
    ['activities', `/workspaces/${workspaceId}/projects/${projectId}/activities`],
    ['notifications', '/notifications'],
    ['notifications unread count', '/notifications/unread/count'],
  ];

  if (sampleTaskId) {
    endpoints.push([
      'task detail',
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${sampleTaskId}`,
    ]);
    endpoints.push([
      'task comments',
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${sampleTaskId}/comments`,
    ]);
  }

  const results = [];

  for (const [label, path] of endpoints) {
    const raw = await timeEndpoint(label, path);
    const summary = summarise(raw);

    results.push(summary);

    if (summary.error) {
      console.log(
        `  ${label.padEnd(28)} ${String(summary.status).padEnd(4)} FAILED  ${summary.error}`
      );
      continue;
    }

    console.log(
      `  ${label.padEnd(28)} ` +
        `median ${summary.median.toFixed(1).padStart(7)} ms   ` +
        `p95 ${summary.p95.toFixed(1).padStart(7)} ms   ` +
        `${(summary.bytes / 1024).toFixed(1).padStart(8)} KB`
    );
  }

  console.log('');

  if (values.json) {
    const fs = await import('node:fs');

    fs.writeFileSync(
      values.json,
      JSON.stringify(
        {
          api: API,
          seed: {
            projects: PROJECT_COUNT,
            tasksPerProject: TASKS_PER_PROJECT,
            labelsPerProject: LABEL_COUNT,
            extraMembers: EXTRA_MEMBERS,
            totalTasks: taskTotal,
          },
          iterations: ITERATIONS,
          results,
        },
        null,
        2
      )
    );

    console.log(`  written to ${values.json}\n`);
  }
};

main().catch((error) => {
  console.error('\nBenchmark failed:', error.message);
  process.exitCode = 1;
});
