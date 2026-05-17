import type {
  Layout,
  SettingsPayload,
  SystemConfig,
  TransitPlanResponse,
  WeatherPayload,
  Widget,
  WidgetCreate,
  WidgetUpdate,
} from "./types";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  };
  const resp = await fetch(path, init);
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const data = await resp.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  getLayout: () => request<Layout>("GET", "/api/layout"),
  createWidget: (data: WidgetCreate) =>
    request<Widget>("POST", "/api/widgets", data),
  updateWidget: (id: number, data: WidgetUpdate) =>
    request<Widget>("PATCH", `/api/widgets/${id}`, data),
  deleteWidget: (id: number) =>
    request<void>("DELETE", `/api/widgets/${id}`),
  resetLayout: () => request<Layout>("POST", "/api/layout/reset"),
  getWeather: (lat: number, lon: number, signal?: AbortSignal) =>
    request<WeatherPayload>(
      "GET",
      `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      undefined,
      signal,
    ),
  getSettings: () => request<SettingsPayload>("GET", "/api/settings"),
  setSetting: (key: string, value: string) =>
    request<SettingsPayload>("PUT", `/api/settings/${encodeURIComponent(key)}`, {
      value,
    }),
  getSystemConfig: () => request<SystemConfig>("GET", "/api/system"),
  planTransit: (
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number },
    num: number,
    modes?: string[],
    signal?: AbortSignal,
  ) =>
    request<TransitPlanResponse>(
      "POST",
      "/api/transit/plan",
      { origin, destination, num, modes: modes?.length ? modes : undefined },
      signal,
    ),
};
