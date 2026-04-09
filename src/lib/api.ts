export function getDesktopConfig() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__desktopConfig;
}

export function isDesktopHost() {
  return Boolean(getDesktopConfig());
}

export function postDesktopHostMessage(message: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.chrome?.webview?.postMessage(message);
}

export function getApiBaseUrl() {
  const desktopApiBaseUrl = getDesktopConfig()?.apiBaseUrl;
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  return (desktopApiBaseUrl ?? configuredApiBaseUrl ?? "http://127.0.0.1:3001").replace(/\/$/, "");
}

export function getEdgeFunctionsBaseUrl() {
  const desktopApiBaseUrl = getDesktopConfig()?.apiBaseUrl;
  if (desktopApiBaseUrl) {
    return desktopApiBaseUrl.replace(/\/$/, "");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
  }

  return "http://127.0.0.1:3001/functions/v1";
}

export function getSupabaseAnonKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return null as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;

    throw new Error(errorMessage);
  }

  return payload as T;
}

export function buildJsonRequestInit(method: string, body?: unknown, headers?: HeadersInit): RequestInit {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");

  return {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
