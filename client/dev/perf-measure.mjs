/*
 * Runtime performance measurement.
 *
 * Drives real Chrome over CDP against the built app, instruments the page
 * *before* any application script runs, and reports the metrics a user actually
 * feels: FCP, LCP, CLS, long tasks, interaction latency, and the request
 * waterfall.
 *
 * ## Why the observers are installed before navigation
 *
 * `Page.addScriptToEvaluateOnNewDocument` runs the probe ahead of the app's own
 * bundle. Installing it afterwards would miss every paint and every layout shift
 * that happened while the page was loading — which is precisely the window being
 * measured. `buffered: true` on each observer is the second half of that: it
 * replays entries recorded before the observer existed.
 *
 * ## Throttling
 *
 * Two profiles are measured, and the distinction matters:
 *
 *   unthrottled  isolates CPU/parse/execution cost on this machine
 *   slow-4g      models a real network, where payload size dominates
 *
 * Both are fixed constants rather than "whatever the machine happened to do", so
 * a before/after comparison is like-for-like. The throttled profile is the one
 * that reflects a user; the unthrottled one is the one that reflects the code.
 *
 * ## What is NOT measured
 *
 * Lighthouse is a separate tool with its own scoring model. These are raw
 * browser metrics collected from the same Chrome, not Lighthouse scores, and
 * they are reported as such. See the completion report.
 *
 *   node dev/perf-measure.mjs                    # both profiles, 5 runs
 *   node dev/perf-measure.mjs --runs 3
 *   node dev/perf-measure.mjs --json out.json
 */

import fs from 'node:fs';

import { Cdp, findChrome, mkdtempSync, rmSync, spawn, tmpdir, waitFor } from './cdp.mjs';

const APP = process.env.APP_URL ?? 'http://localhost:4173';

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg === -1 ? 5 : Number(process.argv[runsArg + 1]);

const jsonArg = process.argv.indexOf('--json');
const JSON_OUT = jsonArg === -1 ? null : process.argv[jsonArg + 1];

const CDP_PORT = 9225;

/* Fixed conditions. Changing any of these invalidates a before/after compare. */
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1 };

const PROFILES = {
  unthrottled: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, cpu: 1 },
  /* Roughly Lighthouse's mobile Slow-4G preset, on a desktop viewport. */
  'slow-4g': {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    cpu: 4,
  },
};

/*
 * The probe. Runs before any app script, in every document.
 *
 * Everything is stashed on `window.__perf` so the harness can read it back
 * without the app knowing anything about it.
 */
const PROBE = `
(() => {
  if (window.__perf) return;

  const state = window.__perf = {
    lcp: 0,
    lcpElement: null,
    cls: 0,
    shifts: [],
    fcp: 0,
    longTasks: [],
    interactions: [],
    tbt: 0,
  };

  const observe = (type, callback, extra = {}) => {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) callback(entry);
      }).observe({ type, buffered: true, ...extra });
    } catch {
      /*
       * The "buffered" option is not supported for every entry type — longtask
       * rejects it outright. Retrying without it keeps the observer live for
       * events that happen after registration, which is the case that matters
       * here: the probe is installed before any application script runs, so
       * anything worth measuring happens after this point anyway.
       */
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) callback(entry);
        }).observe({ type, ...extra });
      } catch {
        /* genuinely unsupported in this Chrome — the metric stays 0 */
      }
    }
  };

  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime;
  });

  observe('largest-contentful-paint', (entry) => {
    state.lcp = entry.startTime;
    state.lcpElement = entry.element
      ? entry.element.tagName.toLowerCase() +
        (entry.element.className && typeof entry.element.className === 'string'
          ? '.' + entry.element.className.trim().split(/\\s+/).slice(0, 2).join('.')
          : '')
      : null;
  });

  observe('layout-shift', (entry) => {
    if (entry.hadRecentInput) return;
    state.cls += entry.value;
    state.shifts.push({ value: entry.value, time: Math.round(entry.startTime) });
  });

  /*
   * Long tasks, and Total Blocking Time from them.
   *
   * This has to be an observer: performance.getEntriesByType('longtask')
   * returns an empty array, because long-task entries are only surfaced to a
   * registered observer. An earlier version of this harness read the timeline
   * instead and reported no long tasks at all on a page whose main thread was
   * demonstrably busy.
   *
   * TBT is the portion of each task beyond 50 ms, which is the threshold at which
   * a task starts delaying input.
   */
  observe('longtask', (entry) => {
    const duration = Math.round(entry.duration);

    state.longTasks.push(duration);
    state.tbt += Math.max(0, duration - 50);
  });

  observe('event', (entry) => {
    if (entry.duration < 8) return;
    state.interactions.push({ name: entry.name, duration: Math.round(entry.duration) });
  }, { durationThreshold: 8 });

  /*
   * Time to a usable screen.
   *
   * The moment the first interactive control on the page exists in the DOM. That
   * is the earliest point a user can do anything, and it is a better proxy for
   * "the app is up" than the load event, which fires whether or not React has
   * committed anything.
   *
   * A MutationObserver rather than polling, so the timestamp is when it actually
   * happened rather than when the next poll happened to notice.
   */
  state.usable = null;

  const checkUsable = () => {
    if (state.usable !== null) return true;

    const field = document.querySelector('input');

    if (field) {
      state.usable = performance.now();
      return true;
    }

    return false;
  };

  if (!checkUsable()) {
    /*
     * \`document.documentElement\` does not exist yet.
     *
     * This script runs at document start, before the parser has created a single
     * element, so observing \`documentElement\` here threw and the observer was
     * silently lost — the metric read 0 in every run. Observing \`document\`
     * instead works from the first insertion.
     */
    const observer = new MutationObserver(() => {
      if (checkUsable()) observer.disconnect();
    });

    observer.observe(document, { childList: true, subtree: true });
  }
})();
`;

/*
 * Read the long-task list from the performance timeline rather than trusting the
 * observer's buffer.
 *
 * Measured first with an observer and `buffered: true`, and it was unreliable:
 * four runs of five reported no long tasks at all while the fifth reported
 * three. `getEntriesByType` reads whatever the timeline actually retained, which
 * is what the numbers below are computed from.
 */
const COLLECT_LONG_TASKS = `
(() => {
  const entries = performance.getEntriesByType('longtask') ?? [];

  return JSON.stringify(entries.map((entry) => Math.round(entry.duration)));
})()
`;

/* ------------------------------------------------------------------ utils */

const median = (values) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const round = (value, digits = 1) => Number(value.toFixed(digits));

const summarise = (values) => ({
  median: round(median(values)),
  min: round(Math.min(...values)),
  max: round(Math.max(...values)),
});

/* -------------------------------------------------------------- one run --- */

const measureOnce = async (cdp, { url, profile, label }) => {
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.clearBrowserCookies');

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: profile.offline,
    latency: profile.latency,
    downloadThroughput: profile.downloadThroughput,
    uploadThroughput: profile.uploadThroughput,
  });

  const requests = new Map();
  let totalTransfer = 0;

  const onRequest = (params) => {
    requests.set(params.requestId, {
      url: params.request.url,
      type: params.type,
      start: params.timestamp,
      transferSize: 0,
      status: null,
      fromCache: false,
    });
  };

  const onResponse = (params) => {
    const entry = requests.get(params.requestId);
    if (!entry) return;

    entry.status = params.response.status;
    entry.fromCache = params.response.fromDiskCache === true;
    entry.encodedLength = params.response.encodedDataLength ?? 0;
    entry.type = params.type;
    entry.mimeType = params.response.mimeType;
  };

  const onFinished = (params) => {
    const entry = requests.get(params.requestId);
    if (!entry) return;

    entry.transferSize = params.encodedDataLength ?? entry.encodedLength ?? 0;
    entry.end = params.timestamp;
    totalTransfer += entry.transferSize;
  };

  cdp.on('Network.requestWillBeSent', onRequest);
  cdp.on('Network.responseReceived', onResponse);
  cdp.on('Network.loadingFinished', onFinished);

  await cdp.send('Page.navigate', { url });

  // Wait for the app to settle: network idle plus a beat for React to commit.
  await waitFor(cdp, `document.readyState === 'complete'`, { timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const probe = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__perf ?? {})`,
    returnByValue: true,
  });

  const perf = JSON.parse(probe.result.value ?? '{}');

  const navigation = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      if (!entry) return '{}';
      return JSON.stringify({
        ttfb: entry.responseStart - entry.requestStart,
        domContentLoaded: entry.domContentLoadedEventEnd,
        load: entry.loadEventEnd,
        duration: entry.duration,
      });
    })()`,
    returnByValue: true,
  });

  const nav = JSON.parse(navigation.result.value ?? '{}');

  /*
   * Prefer the observer's long-task list; fall back to the timeline.
   *
   * The timeline read is kept as a cross-check because the observer only sees
   * tasks that occur after it is registered — which is everything here, but the
   * fallback costs nothing and makes an empty result unambiguous.
   */
  const timelineResult = await cdp.send('Runtime.evaluate', {
    expression: COLLECT_LONG_TASKS,
    returnByValue: true,
  });

  const timelineTasks = JSON.parse(timelineResult.result.value ?? '[]');
  const longTasks = (perf.longTasks ?? []).length > 0 ? perf.longTasks : timelineTasks;
  const tbt =
    (perf.longTasks ?? []).length > 0
      ? (perf.tbt ?? 0)
      : timelineTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0);

  /* Interaction latency: type into the first field and submit an empty form. */
  const interaction = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const field = document.querySelector('input');
      if (!field) return 'null';

      const before = performance.now();

      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
      descriptor.set.call(field, 'perf@example.com');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));

      // Let React flush.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      return JSON.stringify({ inputLatency: performance.now() - before });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  const interactionResult = JSON.parse(interaction.result.value ?? 'null');

  cdp.off('Network.requestWillBeSent', onRequest);
  cdp.off('Network.responseReceived', onResponse);
  cdp.off('Network.loadingFinished', onFinished);

  const list = [...requests.values()];
  const byType = {};

  for (const entry of list) {
    byType[entry.type] = byType[entry.type] ?? { count: 0, bytes: 0 };
    byType[entry.type].count += 1;
    byType[entry.type].bytes += entry.transferSize;
  }

  /* Duplicate requests: the same URL fetched more than once. */
  const counts = new Map();

  for (const entry of list) {
    counts.set(entry.url, (counts.get(entry.url) ?? 0) + 1);
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count }));

  const failed = list.filter((entry) => entry.status !== null && entry.status >= 400);

  return {
    label,
    profile: label,
    fcp: round(perf.fcp ?? 0),
    lcp: round(perf.lcp ?? 0),
    cls: round(perf.cls ?? 0, 4),
    tbt: round(tbt),
    longTasks,
    usable: round(perf.usable ?? 0),
    lcpElement: perf.lcpElement,
    ttfb: round(nav.ttfb ?? 0),
    domContentLoaded: round(nav.domContentLoaded ?? 0),
    load: round(nav.load ?? 0),
    requestCount: list.length,
    transferBytes: totalTransfer,
    byType,
    /* The actual files fetched, so "the login page downloads X" is provable. */
    scripts: list
      .filter((entry) => entry.type === 'Script')
      .map((entry) => ({
        file: entry.url.replace(APP, ''),
        bytes: entry.transferSize,
        status: entry.status,
      })),
    duplicates,
    failedCount: failed.length,
    failed: failed.slice(0, 5).map((entry) => `${entry.status} ${entry.url}`),
    interactionLatency: interactionResult ? round(interactionResult.inputLatency) : null,
  };
};

/* ------------------------------------------------------------------ main -- */

const main = async () => {
  const profileDir = mkdtempSync(`${tmpdir()}/perf-`);

  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
  ]);

  const results = [];

  try {
    let version;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!version) throw new Error('Chrome did not expose a debugging port.');

    console.log(`\nChrome:  ${version.Browser}`);
    console.log(`App:     ${APP}`);
    console.log(`Runs:    ${RUNS} per profile`);
    console.log(`Viewport:${VIEWPORT.width}x${VIEWPORT.height}\n`);

    for (const [profileName, profile] of Object.entries(PROFILES)) {
      const target = await (
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })
      ).json();

      const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();

      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Network.enable');
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        ...VIEWPORT,
        mobile: false,
        screenWidth: VIEWPORT.width,
        screenHeight: VIEWPORT.height,
      });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });

      const profileRuns = [];

      for (let run = 1; run <= RUNS; run += 1) {
        const result = await measureOnce(cdp, { url: `${APP}/login`, profile, label: profileName });

        profileRuns.push(result);

        console.log(
          `  [${profileName}] run ${run}/${RUNS}  ` +
            `FCP ${result.fcp}ms  LCP ${result.lcp}ms  CLS ${result.cls}  ` +
            `load ${result.load}ms  reqs ${result.requestCount}  ` +
            `${(result.transferBytes / 1024).toFixed(0)} KB`
        );
      }

      const first = profileRuns[0];

      const summary = {
        profile: profileName,
        runs: RUNS,
        fcp: summarise(profileRuns.map((r) => r.fcp)),
        lcp: summarise(profileRuns.map((r) => r.lcp)),
        cls: summarise(profileRuns.map((r) => r.cls)),
        tbt: summarise(profileRuns.map((r) => r.tbt)),
        usable: summarise(profileRuns.map((r) => r.usable)),
        load: summarise(profileRuns.map((r) => r.load)),
        domContentLoaded: summarise(profileRuns.map((r) => r.domContentLoaded)),
        ttfb: summarise(profileRuns.map((r) => r.ttfb)),
        requestCount: summarise(profileRuns.map((r) => r.requestCount)),
        transferKB: summarise(profileRuns.map((r) => r.transferBytes / 1024)),
        scriptKB: summarise(profileRuns.map((r) => (r.byType.Script?.bytes ?? 0) / 1024)),
        lcpElement: first.lcpElement,
        byType: first.byType,
        scripts: first.scripts,
        duplicates: first.duplicates,
        failedCount: first.failedCount,
        failed: first.failed,
        longTasks: first.longTasks,
        interactionLatency: first.interactionLatency,
      };

      results.push(summary);

      await cdp.close();
    }
  } finally {
    try {
      chrome.kill();
    } catch {
      /* already gone */
    }

    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  }

  console.log('\n================ summary (median of runs) ================\n');

  for (const result of results) {
    console.log(`  ${result.profile}`);
    console.log(`    FCP          ${String(result.fcp.median).padStart(7)} ms`);
    console.log(`    LCP          ${String(result.lcp.median).padStart(7)} ms   (${result.lcpElement ?? 'n/a'})`);
    console.log(`    CLS          ${String(result.cls.median).padStart(7)}`);
    console.log(`    TBT          ${String(result.tbt.median).padStart(7)} ms   long tasks: ${result.longTasks.join(', ') || 'none'}`);
    console.log(`    usable       ${String(result.usable.median).padStart(7)} ms`);
    console.log(`    load         ${String(result.load.median).padStart(7)} ms`);
    console.log(`    TTFB         ${String(result.ttfb.median).padStart(7)} ms`);
    console.log(`    requests     ${String(result.requestCount.median).padStart(7)}`);
    console.log(`    transferred  ${String(result.transferKB.median).padStart(7)} KB  (script ${result.scriptKB.median} KB)`);
    console.log(`    input latency${String(result.interactionLatency ?? 'n/a').padStart(7)} ms`);
    console.log('');

    for (const [type, data] of Object.entries(result.byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
      console.log(
        `      ${type.padEnd(12)} ${String(data.count).padStart(3)} reqs   ${(data.bytes / 1024).toFixed(1).padStart(8)} KB`
      );
    }

    console.log('\n      scripts fetched:');

    for (const script of result.scripts) {
      console.log(
        `        ${(script.bytes / 1024).toFixed(1).padStart(7)} KB  ${script.status}  ${script.file}`
      );
    }

    if (result.duplicates.length > 0) {
      console.log(`\n      duplicate requests: ${result.duplicates.length}`);
      for (const duplicate of result.duplicates.slice(0, 6)) {
        console.log(`        x${duplicate.count}  ${duplicate.url.replace(APP, '')}`);
      }
    }

    if (result.failedCount > 0) {
      console.log(`\n      failed: ${result.failed.join(' | ')}`);
    }

    console.log('');
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ app: APP, runs: RUNS, results }, null, 2));
    console.log(`  written to ${JSON_OUT}\n`);
  }
};

main().catch((error) => {
  console.error('\nMeasurement failed:', error.message);
  process.exitCode = 1;
});
