import type {
  CalendarWeekResponse,
  ChatEvent,
  ChatMessage,
  Layout,
  SettingsPayload,
  SpotifyNowPlayingResponse,
  SystemConfig,
  Todo,
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
  getCalendarStatus: () =>
    request<{ authorized: boolean; configured: boolean }>("GET", "/api/calendar/status"),
  getCalendarAuth: () =>
    request<{ auth_url: string }>("GET", "/api/calendar/auth"),
  getCalendarEvents: (weekStart: string, signal?: AbortSignal) =>
    request<CalendarWeekResponse>(
      "GET",
      `/api/calendar/events?week_start=${encodeURIComponent(weekStart)}`,
      undefined,
      signal,
    ),
  getTodos: (signal?: AbortSignal) =>
    request<Todo[]>("GET", "/api/todos", undefined, signal),
  createTodo: (body: { name: string; description?: string; due_date?: string; icon?: string }) =>
    request<Todo>("POST", "/api/todos", body),
  updateTodo: (id: number, body: { name?: string; description?: string; due_date?: string; icon?: string; done?: boolean }) =>
    request<Todo>("PATCH", `/api/todos/${id}`, body),
  deleteTodo: (id: number) =>
    request<void>("DELETE", `/api/todos/${id}`),
  getSpotifyStatus: () =>
    request<{ authorized: boolean; configured: boolean }>("GET", "/api/spotify/status"),
  getSpotifyAuth: () =>
    request<{ auth_url: string }>("GET", "/api/spotify/auth"),
  getSpotifyNowPlaying: (signal?: AbortSignal) =>
    request<SpotifyNowPlayingResponse>("GET", "/api/spotify/now-playing", undefined, signal),
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

export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || resp.statusText);
  }
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data) yield JSON.parse(data) as ChatEvent;
      }
    }
  }
}
