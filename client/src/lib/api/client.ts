/*
 * The HTTP client.
 *
 * Three decisions here, each of which prevents a class of bug:
 *
 * 1. **The base URL is relative (`/api/v1`), not absolute.** The dev server
 *    proxies `/api` to the backend, so every request is same-origin from the
 *    browser's point of view. That matters because the API authenticates with a
 *    `SameSite=Strict` cookie: a genuinely cross-origin frontend would be refused
 *    by CORS *and* would not have its cookie sent. Proxying sidesteps both, and
 *    means the backend needs no change to `CORS_ORIGINS` (which is currently
 *    unset, so cross-origin requests would be refused outright).
 *
 * 2. **The envelope is unwrapped here and nowhere else.** Every call site gets
 *    `data` directly, so no page has to remember that the payload is nested.
 *
 * 3. **401 is broadcast, not handled per-call.** There is no refresh token and
 *    the session dies after 15 minutes, so every 401 means the same thing: the
 *    user is logged out. One listener tears the session down instead of each
 *    page inventing its own redirect.
 */

import type { ApiFieldError } from './types';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];

  constructor(status: number, message: string, errors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }

  /** True when the failure is "you are not logged in", however it was phrased. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when the resource is gone *or* invisible — the API refuses to distinguish. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True when authenticated but not permitted. Hide the affordance; do not retry. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** True on a conflict: duplicate label name, already a member, and so on. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** The message for a given field, for inline form errors. */
  fieldError(field: string): string | undefined {
    return this.errors.find((error) => error.field === field)?.message;
  }
}

/* ------------------------------------------------------------- 401 broadcast */

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Registers a callback fired on any 401. Returns an unsubscribe function.
 * The auth provider is the only intended consumer.
 */
export const onUnauthorized = (listener: UnauthorizedListener): (() => void) => {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
};

/* --------------------------------------------------------- field-error names */

/**
 * Strips the request-part prefix from a validation error's field name.
 *
 * The API's validators parse `{ body, params, query }` as a single object, so a
 * zod issue's path starts with the part it came from: a bad email in a request
 * body is reported as `body.email`, a bad page number as `query.page`. Forms
 * address their fields by the field's own name, and every call site in the app
 * asks for `fieldError('email')`.
 *
 * Normalising here — once, as the error is built — is what makes those lookups
 * match. Before this, `fieldError()` never found anything for a 400 and every
 * inline field error silently failed to render, leaving the user with only the
 * generic "Validation failed" and no indication of which field was wrong.
 */
const normalizeFieldError = (error: ApiFieldError): ApiFieldError => ({
  ...error,
  field: error.field?.replace(/^(?:body|params|query)\./, ''),
});

/* ------------------------------------------------------------------- queries */

/**
 * Serialises query parameters.
 *
 * Empty values are dropped rather than sent as `search=` — the validators
 * require 1–100 characters for `search`, so an empty string is a 400 rather than
 * "no filter". Booleans become the literal strings the API expects.
 */
export const toQueryString = (query: Record<string, unknown> = {}): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
      continue;
    }
    if (typeof value === 'boolean') {
      params.set(key, value ? 'true' : 'false');
      continue;
    }
    params.set(key, String(value));
  }

  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
};

/* -------------------------------------------------------------------- request */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  /** JSON body. Mutually exclusive with `formData`. */
  body?: unknown;
  query?: Record<string, unknown>;
  /**
   * Multipart body. Content-Type is deliberately left unset so the browser adds
   * the multipart boundary — setting it by hand omits the boundary and the
   * server rejects the upload.
   */
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Performs a request and returns the unwrapped `data`.
 *
 * Throws `ApiError` on any non-2xx. A 204 (no body) resolves to `undefined`.
 */
export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, query, formData, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}${toQueryString(query)}`, {
      method,
      headers,
      body: payload,
      // The session is an httpOnly cookie, so it must be sent explicitly.
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // A network failure is not an API error — it has no status. Surface it as
    // a 0 so callers can still branch on `status`.
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const parsed: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const envelope = parsed as { message?: string; errors?: ApiFieldError[] } | null;
    const message = envelope?.message ?? `Request failed with status ${response.status}`;

    if (response.status === 401) {
      for (const listener of unauthorizedListeners) listener();
    }

    throw new ApiError(
      response.status,
      message,
      (envelope?.errors ?? []).map(normalizeFieldError)
    );
  }

  const envelope = parsed as { data?: T } | null;
  return (envelope?.data ?? (undefined as T)) as T;
};

/* ---------------------------------------------------------------- uploads */

/**
 * Uploads a multipart body and reports progress.
 *
 * `fetch` cannot report upload progress — there is no request-side stream to
 * observe — so this one call site uses `XMLHttpRequest`, the only browser API
 * that emits `upload.onprogress`. Everything else stays on `fetch`.
 *
 * The session and error contracts match `request`: the cookie is sent
 * explicitly, a 401 still broadcasts, and a non-2xx becomes an `ApiError`
 * carrying the server's own message (which is what surfaces a file rejected on
 * its magic bytes rather than its extension).
 */
export const uploadWithProgress = <T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    // Content-Type is deliberately not set — the browser must add the multipart
    // boundary itself, and setting it by hand omits the boundary.

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let parsed: { data?: T; message?: string; errors?: ApiFieldError[] } | null = null;

      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }

      if (xhr.status === 401) {
        for (const listener of unauthorizedListeners) listener();
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiError(
            xhr.status,
            parsed?.message ?? `Upload failed with status ${xhr.status}`,
            (parsed?.errors ?? []).map(normalizeFieldError)
          )
        );

        return;
      }

      resolve((parsed?.data ?? (undefined as T)) as T);
    };

    xhr.onerror = () =>
      reject(new ApiError(0, 'Could not reach the server. Check your connection and try again.'));

    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort());

    xhr.send(formData);
  });

/* ---------------------------------------------------------------- downloads */

/**
 * Downloads an attachment and returns it as a blob URL.
 *
 * Attachments are served from an **authenticated** endpoint, so a plain
 * `<img src>` or `<a href>` gets a 401. The caller must fetch it with
 * credentials and then revoke the URL when done.
 */
export const downloadBlob = async (
  path: string
): Promise<{ url: string; revoke: () => void }> => {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });

  if (!response.ok) {
    throw new ApiError(response.status, 'The file could not be downloaded.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  return { url, revoke: () => URL.revokeObjectURL(url) };
};

/* ------------------------------------------------------------------ helpers */

/** Narrows a possibly-populated reference to a populated document. */
export const isPopulated = <T extends object>(
  ref: unknown
): ref is T => typeof ref === 'object' && ref !== null && !Array.isArray(ref);

/**
 * Reads the id from a reference whether it is populated or not.
 *
 * `User` and `Workspace` use `id`; everything else uses `_id`. Handling both
 * here means no call site has to know which side of that split it is on.
 */
export const refId = (ref: unknown): string | null => {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object') {
    const record = ref as { id?: string; _id?: string };
    return record.id ?? record._id ?? null;
  }
  return null;
};

/** Reads a display name from a possibly-populated reference. */
export const refName = (ref: unknown, fallback = 'Unknown'): string => {
  if (isPopulated<{ name?: string }>(ref)) return ref.name ?? fallback;
  return fallback;
};

/** Builds a list query, dropping `undefined` and clamping `limit` to the API's 1–100. */
export const listQuery = (
  params: Record<string, unknown> = {}
): Record<string, unknown> => {
  const query: Record<string, unknown> = { ...params };
  if (typeof query.limit === 'number') {
    query.limit = Math.min(100, Math.max(1, query.limit));
  }
  if (typeof query.page === 'number') {
    query.page = Math.max(1, query.page);
  }
  return query;
};
