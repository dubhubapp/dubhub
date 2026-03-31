import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiUrl } from "./apiBase";
import {
  API_DIAG_TAG,
  ApiRequestError,
  apiDevDiagnosticsEnabled,
  apiDiagIsNativeShell,
  apiDiagLog,
} from "./apiDiagnostics";
import { supabase } from "./supabaseClient";

async function throwIfResNotOk(
  res: Response,
  ctx: { url: string; method: string },
): Promise<void> {
  if (res.ok) return;
  const text = (await res.text()) || res.statusText;
  const err = new ApiRequestError({
    message: `${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
    url: ctx.url,
    method: ctx.method,
    status: res.status,
    statusText: res.statusText,
    responseBody: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
  });
  console.error(API_DIAG_TAG, "HTTP error", serializeDevErr(err));
  if (apiDevDiagnosticsEnabled()) {
    apiDiagLog("HTTP error (throwIfResNotOk)", {
      native: apiDiagIsNativeShell(),
      ...serializeDevErr(err),
    });
  }
  throw err;
}

function serializeDevErr(e: ApiRequestError): Record<string, unknown> {
  return {
    url: e.url,
    method: e.method,
    status: e.status,
    statusText: e.statusText,
    message: e.message,
    bodyPreview: e.responseBody?.slice(0, 500),
  };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { 'Authorization': `Bearer ${session.access_token}` };
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Handle FormData differently - don't set Content-Type header and don't stringify
  const isFormData = data instanceof FormData;
  
  // Get auth headers
  const authHeaders = await getAuthHeaders();
  
  const headers: Record<string, string> = {
    ...authHeaders,
    ...((data && !isFormData) ? { "Content-Type": "application/json" } : {}),
  };
  
  const resolved = url.startsWith("/") ? apiUrl(url) : url;

  if (apiDevDiagnosticsEnabled()) {
    apiDiagLog("apiRequest start", {
      native: apiDiagIsNativeShell(),
      method,
      pathInput: url,
      resolvedUrl: resolved,
    });
  }

  let res: Response;
  try {
    res = await fetch(resolved, {
      method,
      headers,
      body: isFormData ? data as FormData : (data ? JSON.stringify(data) : undefined),
      credentials: "include",
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const stack = fetchErr instanceof Error ? fetchErr.stack : undefined;
    console.error(API_DIAG_TAG, "apiRequest fetch rejected", {
      method,
      resolvedUrl: resolved,
      message: msg,
    });
    if (apiDevDiagnosticsEnabled()) {
      apiDiagLog("apiRequest fetch rejected (network?)", {
        native: apiDiagIsNativeShell(),
        method,
        resolvedUrl: resolved,
        message: msg,
        stack: stack?.split("\n").slice(0, 16).join("\n"),
      });
    }
    throw new ApiRequestError({
      message: `Load failed (fetch): ${msg}`,
      url: resolved,
      method,
    });
  }

  if (apiDevDiagnosticsEnabled()) {
    apiDiagLog("apiRequest response", {
      native: apiDiagIsNativeShell(),
      method,
      resolvedUrl: resolved,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    });
  }

  await throwIfResNotOk(res, { url: resolved, method });
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const pathJoined = queryKey.join("/") as string;
    const resolved = apiUrl(pathJoined);
    const method = "GET";

    if (apiDevDiagnosticsEnabled()) {
      apiDiagLog("getQueryFn start", {
        native: apiDiagIsNativeShell(),
        method,
        queryKey,
        pathJoined,
        resolvedUrl: resolved,
      });
    }

    const authHeaders = await getAuthHeaders();

    let res: Response;
    try {
      res = await fetch(resolved, {
        headers: authHeaders,
        credentials: "include",
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const stack = fetchErr instanceof Error ? fetchErr.stack : undefined;
      console.error(API_DIAG_TAG, "getQueryFn fetch rejected", {
        resolvedUrl: resolved,
        message: msg,
      });
      if (apiDevDiagnosticsEnabled()) {
        apiDiagLog("getQueryFn fetch rejected", {
          native: apiDiagIsNativeShell(),
          resolvedUrl: resolved,
          message: msg,
          stack: stack?.split("\n").slice(0, 16).join("\n"),
        });
      }
      throw new ApiRequestError({
        message: `Load failed (fetch): ${msg}`,
        url: resolved,
        method,
      });
    }

    if (apiDevDiagnosticsEnabled()) {
      apiDiagLog("getQueryFn response", {
        native: apiDiagIsNativeShell(),
        resolvedUrl: resolved,
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      });
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, { url: resolved, method });
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
