/*
 * A minimal Chrome DevTools Protocol driver.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 4 asks for browser verification and explicitly says not to claim a
 * browser test passed if it was not run. No browser-automation package is
 * installed (no Playwright, no Puppeteer, no vitest/jsdom) and adding one would
 * mean pulling a large dependency tree into a project that deliberately has
 * none — the opposite of what the brief asks for.
 *
 * Chrome *is* installed on this machine, and Node 22 ships a global
 * `WebSocket`. Those two facts are enough to drive a real browser over CDP with
 * zero new dependencies.
 *
 * WHAT THIS IS NOT: a replacement for Playwright. There is no auto-waiting, no
 * retry, no assertion library. It navigates, evaluates expressions in the page,
 * captures screenshots, and reads console errors. That is what the checks below
 * actually need.
 *
 * Usage:  node dev/cdp.mjs          (writes JSON results to stdout)
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
    : null,
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const findChrome = () => {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No Chrome/Edge binary found.');
};

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }

      const handlers = this.listeners.get(message.method);
      if (handlers) handlers.forEach((handler) => handler(message.params));
    });

    return this;
  }

  send(method, params = {}) {
    const id = ++this.id;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  /*
   * Detach a handler registered with `on`.
   *
   * Needed by the performance harness, which attaches network listeners per
   * measurement and must remove them afterwards. Without this, the listeners
   * accumulate across runs and every run's request log is counted again in the
   * next one — the numbers silently inflate rather than erroring.
   */
  off(method, handler) {
    const handlers = this.listeners.get(method);

    if (!handlers) return;

    const index = handlers.indexOf(handler);

    if (index !== -1) handlers.splice(index, 1);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
  }
}

/** Evaluate an expression in the page and return its value. */
const evaluate = async (cdp, expression) => {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)
    );
  }

  return result.result.value;
};

/*
 * Wait for a predicate evaluated in the page to become truthy.
 *
 * This is the auto-wait Playwright would give us. Without it every check races
 * the app's first render, and a "failure" would just mean "asked too early" —
 * the most common way a hand-rolled browser check produces a false alarm.
 */
const waitFor = async (cdp, expression, { timeout = 15000, interval = 150 } = {}) => {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timed out waiting for: ${expression}`);
};

const SETTLE = `(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()`;

/*
 * Dispatch a real key press through the browser's input pipeline.
 *
 * `element.focus()` is not a substitute: it moves focus without the browser
 * treating it as keyboard-originated, so `:focus-visible` does not match and
 * any check of the focus ring or of a keyboard-only reveal reads as a failure
 * against a correct page. The virtual key code and code are both required —
 * CDP does not infer them from the key name.
 */
const KEY_CODES = {
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Enter: { code: 'Enter', keyCode: 13 },
};

const pressKey = async (cdp, key) => {
  const spec = KEY_CODES[key];
  if (!spec) throw new Error(`pressKey: add ${key} to KEY_CODES`);

  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
  });

  // Let focus and any reveal transition settle before the caller measures.
  await new Promise((resolve) => setTimeout(resolve, 150));
};

/*
 * Deterministic readiness: fonts loaded, then two animation frames.
 *
 * Screenshots taken before webfonts resolve render in the fallback face, which
 * makes a layout check report differences that are purely a font swap. This is
 * why the numbers below are stable between runs.
 */
const ready = async (cdp) => {
  await evaluate(cdp, `document.fonts.ready.then(() => true)`);
  await evaluate(cdp, SETTLE);
};

/* A blank page is white; an error page or a crash is not the same as "empty". */
const waitForApp = async (cdp, { timeout = 20000 } = {}) => {
  await waitFor(
    cdp,
    `document.querySelector('#root') && document.querySelector('#root').children.length > 0`,
    {
      timeout,
    }
  );
  await ready(cdp);
};

const navigate = async (cdp, url, { waitForApp: shouldWait = true } = {}) => {
  await cdp.send('Page.navigate', { url });
  if (shouldWait) await waitForApp(cdp);
  else await ready(cdp);
};

/*
 * Measure horizontal overflow.
 *
 * `documentElement.scrollWidth > clientWidth` is the only reliable signal: it
 * catches an element wider than the viewport even when an ancestor clips it,
 * and it stays correct if a scrollbar appears.
 *
 * `offenders` names the widest elements so a failure is actionable rather than
 * just "the page is 12px too wide".
 */
const OVERFLOW_CHECK = `
(() => {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - doc.clientWidth;

  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right > doc.clientWidth + 1) {
      const tag = el.tagName.toLowerCase();
      const cls = (el.getAttribute('class') || '').slice(0, 90);
      offenders.push({ tag, cls, right: Math.round(rect.right), width: Math.round(rect.width) });
    }
  }

  return { overflow, offenders: offenders.slice(0, 8) };
})()
`;

/* Elements that are clipped by an ancestor with a fixed height. */
const CLIPPED_CHECK = `
(() => {
  const clipped = [];
  for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,a,td,th,li')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    const style = getComputedStyle(el);
    if (style.overflow === 'visible') continue;
    /*
     * The sr-only utility is a deliberate 1px box with its content clipped —
     * that is the whole point of it, and it is the standard way to give a
     * control an accessible name without painting text. Its scrollHeight will
     * always exceed its clientHeight, so it looks exactly like clipped content
     * and is not. Excluded by the rule that defines it: clipped and 1px, or
     * clipped and positioned out of flow.
     */
    const isVisuallyHidden =
      el.clientWidth <= 1 ||
      el.clientHeight <= 1 ||
      style.position === 'absolute' ||
      style.position === 'fixed';
    if (isVisuallyHidden) continue;

    if (
      el.scrollHeight > el.clientHeight + 2 &&
      style.overflowY !== 'auto' &&
      style.overflowY !== 'scroll'
    ) {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().slice(0, 40),
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      });
    }
  }
  return clipped.slice(0, 8);
})()
`;

/*
 * Contrast for text nodes, computed against the nearest opaque ancestor
 * background. This is the same approach axe uses for its "serious" colour
 * failures; it will not resolve gradients or images, but neither does a quick
 * manual pass, and it flags real problems rather than guessing.
 */
const CONTRAST_CHECK = `
(() => {
  const parse = (color) => {
    const m = color.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  });

  const failures = [];

  for (const el of document.querySelectorAll('p,span,a,button,td,th,li,h1,h2,h3,label,div')) {
    // Only elements that directly own a short run of text.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!own || own.length < 2) continue;

    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.15) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const fg = parse(style.color);
    if (!fg) continue;

    const bg = bgOf(el);
    const composed = fg.a < 1 ? blend(fg, bg) : fg;
    const L1 = lum(composed);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = isLarge ? 3 : 4.5;

    if (ratio < required) {
      failures.push({
        text: own.slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        required,
        size,
        color: style.color,
        sample: el.tagName.toLowerCase(),
      });
    }
  }

  // De-duplicate by text+ratio: one bad token repeated is one problem.
  const seen = new Set();
  return failures.filter((f) => {
    const key = f.text + '|' + f.ratio;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
})()
`;

/* Interactive elements with no detectable accessible name. */
const A11Y_NAME_CHECK = `
(() => {
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (text) return text;
    }

    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label && label.textContent.trim()) return label.textContent.trim();
      }
      const wrapping = el.closest('label');
      if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder;
      const title = el.getAttribute('title');
      if (title) return title;
    }

    const text = (el.textContent || '').trim();
    if (text) return text;

    const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (imgAlt) return imgAlt;

    const title = el.getAttribute('title');
    if (title) return title;

    return '';
  };

  const bad = [];
  for (const el of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    if (!nameOf(el)) {
      bad.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 70) });
    }
  }
  return bad.slice(0, 10);
})()
`;

/* Images without alt, and fields whose error is not associated. */
const SEMANTICS_CHECK = `
(() => {
  const issues = [];

  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) issues.push({ kind: 'img-no-alt', src: img.getAttribute('src')?.slice(0, 60) });
  }

  for (const el of document.querySelectorAll('[aria-invalid="true"]')) {
    const described = el.getAttribute('aria-describedby');
    if (!described) continue; // no error message rendered at all is a different check
    const ok = described.split(/\\s+/).some((id) => {
      const node = document.getElementById(id);
      return node && node.textContent.trim();
    });
    if (!ok) issues.push({ kind: 'error-not-associated', id: el.id });
  }

  // A labelled control whose label points nowhere.
  for (const label of document.querySelectorAll('label[for]')) {
    const target = document.getElementById(label.getAttribute('for'));
    if (!target) issues.push({ kind: 'dangling-label', for: label.getAttribute('for') });
  }

  return issues;
})()
`;

const DEVICE_PROFILES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  tablet: { width: 834, height: 1112, deviceScaleFactor: 1, isMobile: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

export {
  Cdp,
  DEVICE_PROFILES,
  A11Y_NAME_CHECK,
  CLIPPED_CHECK,
  CONTRAST_CHECK,
  OVERFLOW_CHECK,
  SEMANTICS_CHECK,
  evaluate,
  findChrome,
  navigate,
  pressKey,
  ready,
  spawn,
  waitFor,
  writeFileSync,
  mkdtempSync,
  rmSync,
  tmpdir,
};
