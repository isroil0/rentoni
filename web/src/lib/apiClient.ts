/**
 * The single place the frontend talks to the backend.
 *
 * Responsibilities kept here (and nowhere else):
 *  - unwrapping the `{ success, data, meta }` envelope
 *  - turning `{ success: false, error }` into a typed ApiError with a safe message
 *  - attaching the bearer token
 *  - transparently refreshing an expired session once, with single-flight de-duplication
 *
 * Token storage: the access token lives in memory only and is never persisted. Only the
 * opaque refresh token is kept in localStorage so a page reload can restore the session;
 * it is the least sensitive of the two and the backend revokes it on rotation.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const REFRESH_STORAGE_KEY = 'rentoni.refreshToken';

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: ApiMeta;
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

/** Every failure surfaced to the UI is one of these — never a raw fetch/DB error. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field-level issues from a VALIDATION_ERROR, keyed by form field name. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const issue of this.details as ValidationIssue[]) {
      if (issue?.field && !out[issue.field]) out[issue.field] = issue.message;
    }
    return out;
  }

  get isAuthError(): boolean {
    return ['UNAUTHENTICATED', 'INVALID_TOKEN', 'SESSION_EXPIRED'].includes(this.code);
  }

  get isStockError(): boolean {
    return this.code === 'INSUFFICIENT_STOCK';
  }
}

/** Human-readable copy for the error states the spec calls out by name. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Unable to connect. Please check your connection.',
  INSUFFICIENT_STOCK: 'Sorry, this item is no longer available in the requested quantity.',
  FORBIDDEN: "You don't have permission to access this page.",
  UNAUTHENTICATED: 'Please sign in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_TOKEN: 'Your session is no longer valid. Please sign in again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  SERVICE_BUSY: 'The store is busy right now. Please try again in a moment.',
  PRODUCT_NOT_FOUND: 'Product not found.',
  VARIANT_NOT_FOUND: 'That size or colour is no longer available.',
  ORDER_NOT_FOUND: 'Order not found.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
};

export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY_MESSAGES[error.code] ?? error.message ?? FRIENDLY_MESSAGES.INTERNAL_ERROR!;
  }
  return FRIENDLY_MESSAGES.INTERNAL_ERROR!;
}

// ---------------------------------------------------------------- tokens ----

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const tokenStore = {
  getAccessToken: () => accessToken,
  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(tokens: { accessToken: string; refreshToken: string }) {
    accessToken = tokens.accessToken;
    try {
      localStorage.setItem(REFRESH_STORAGE_KEY, tokens.refreshToken);
    } catch {
      /* storage unavailable (private mode) — session simply won't survive a reload */
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
  /** Registered by the auth provider so an unrecoverable 401 can reset app state. */
  setSessionLostHandler(handler: (() => void) | null) {
    onSessionLost = handler;
  },
};

// --------------------------------------------------------------- requests ----

/** Any plain object; non-scalar and empty values are dropped when serialising. */
export type QueryParams = Record<string, unknown>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: QueryParams | object;
  /** Skip the bearer header and the refresh dance (login, register, refresh). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as QueryParams)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  meta?: ApiMeta;
  error?: { code: string; message: string; details?: unknown };
}

/** Single-flight refresh: concurrent 401s wait on one refresh call, not N. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = (await response.json()) as Envelope<{
        accessToken: string;
        refreshToken: string;
      }>;
      if (!response.ok || !payload.success || !payload.data) {
        tokenStore.clear();
        return false;
      }
      tokenStore.set(payload.data);
      return true;
    } catch {
      return false;
    } finally {
      // Release the latch on the next tick so queued callers all see the result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function execute<T>(path: string, options: RequestOptions, retrying = false): Promise<Envelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenStore.getAccessToken();
  if (!options.anonymous && token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR', FRIENDLY_MESSAGES.NETWORK_ERROR!, 0);
  }

  if (response.status === 204) return { success: true, data: undefined };

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError('INTERNAL_ERROR', FRIENDLY_MESSAGES.INTERNAL_ERROR!, response.status);
  }

  if (response.ok && payload.success) return payload;

  const code = payload.error?.code ?? 'INTERNAL_ERROR';

  // An expired access token is recoverable: refresh once, then replay the request.
  if (
    response.status === 401 &&
    !options.anonymous &&
    !retrying &&
    ['INVALID_TOKEN', 'SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(code)
  ) {
    if (await refreshSession()) return execute<T>(path, options, true);
    tokenStore.clear();
    onSessionLost?.();
  }

  throw new ApiError(
    code,
    payload.error?.message ?? FRIENDLY_MESSAGES.INTERNAL_ERROR!,
    response.status,
    payload.error?.details,
  );
}

/** Returns `data`, for endpoints that return a single object. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const payload = await execute<T>(path, options);
  return payload.data as T;
}

/** Returns `{ items, meta }`, for list endpoints. */
export async function apiList<T>(path: string, options: RequestOptions = {}): Promise<Paginated<T>> {
  const payload = await execute<T[]>(path, options);
  return {
    items: payload.data ?? [],
    meta: payload.meta ?? {
      page: 1,
      limit: (payload.data ?? []).length,
      total: (payload.data ?? []).length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export const api = {
  get: <T>(path: string, query?: QueryParams | object, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'GET', query, signal }),
  list: <T>(path: string, query?: QueryParams | object, signal?: AbortSignal) =>
    apiList<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, query?: QueryParams | object) =>
    apiRequest<T>(path, { method: 'DELETE', query }),
  anonymous: {
    post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body, anonymous: true }),
  },
};
