import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ── Token storage ─────────────────────────────────────────────────────────────
// Persisted to sessionStorage so a page reload doesn't log the user out.
// sessionStorage is per-tab and cleared when the browser tab closes (safe).
const TOKEN_KEY = "mtcs_auth_token";
const USER_KEY  = "mtcs_auth_user";

let _authToken: string | null = (() => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
})();

export function setAuthToken(token: string | null) {
  _authToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else        sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getAuthToken(): string | null {
  return _authToken;
}

// Persist / restore the logged-in user object across reloads
export function saveUserToSession(user: object | null) {
  try {
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else       sessionStorage.removeItem(USER_KEY);
  } catch {}
}

export function loadUserFromSession(): any | null {
  try {
    const s = sessionStorage.getItem(USER_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ── Build headers with auth token ────────────────────────────────────────────
function buildHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: buildHeaders(data !== undefined),
    body: data ? JSON.stringify(data) : undefined,
  });

  // Don't throw on auth errors — let callers handle them
  if (res.status === 401 || res.status === 403) return res;

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey[0] as string}`, {
      headers: buildHeaders(false),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
