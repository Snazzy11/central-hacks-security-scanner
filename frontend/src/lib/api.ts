const TOKEN_KEY = 'token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

/**
 * fetch wrapper for our backend: prefixes /api, sends the auth token if we have one,
 * and throws ApiError (with FastAPI's error message) on non-2xx responses.
 * Pass `json` for a JSON body.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Same as api() but returns the raw Response, e.g. for file downloads. */
export async function request(path: string, { json, ...init }: Options = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body = init.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const res = await fetch(`/api${path}`, { ...init, headers, body });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(res.status, errorMessage(data?.detail) ?? res.statusText);
  }
  return res;
}

function errorMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail;
  // Validation errors come back as [{ msg: "...", loc: [...] }, ...]
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
  }
  return undefined;
}
