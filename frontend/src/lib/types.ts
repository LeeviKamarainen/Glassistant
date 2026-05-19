export type WidgetType = "clock" | "date" | "datetime" | "weather" | "weather_forecast" | "calendar";

export interface Widget {
  id: number;
  type: string;
  row: number;
  col: number;
  row_span: number;
  col_span: number;
  config: Record<string, unknown>;
  enabled: boolean;
  z_order: number;
  created_at: string;
  updated_at: string;
}

export interface Layout {
  widgets: Widget[];
}

export interface WidgetCreate {
  type: string;
  row: number;
  col: number;
  row_span?: number;
  col_span?: number;
  config?: Record<string, unknown>;
  enabled?: boolean;
  z_order?: number;
}

export type WidgetUpdate = Partial<WidgetCreate>;

export interface ForecastDay {
  date: string;
  weather_code: number | null;
  temp_max_c: number | null;
  temp_min_c: number | null;
}

export interface WeatherPayload {
  lat: number;
  lon: number;
  temperature_c: number | null;
  weather_code: number | null;
  wind_speed_kmh: number | null;
  humidity_pct: number | null;
  fetched_at: number;
  forecast: ForecastDay[];
}

export interface SettingsPayload {
  settings: Record<string, string>;
}

export interface TransitLeg {
  mode: string;
  from_name: string;
  to_name: string;
  start_time: string;
  end_time: string;
  route_short_name: string | null;
  headsign: string | null;
}

export interface TransitItinerary {
  duration_seconds: number;
  departure: string;
  arrival: string;
  legs: TransitLeg[];
}

export interface TransitPlanResponse {
  itineraries: TransitItinerary[];
}

export interface SystemConfig {
  home_lat: number;
  home_lon: number;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  all_day: boolean;
  color: string | null;
}

export interface CalendarWeekResponse {
  events: CalendarEvent[];
  authorized: boolean;
}

export interface Todo {
  id: number;
  name: string;
  description: string | null;
  due_date: string | null;
  icon: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface TodoConfig {
  show_done?: boolean;
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  album: string;
  album_art_url: string | null;
  is_playing: boolean;
  progress_ms: number;
  duration_ms: number;
}

export interface SpotifyNowPlayingResponse {
  track: SpotifyTrack | null;
  authorized: boolean;
}

export type SseEvent =
  | { type: "layout_changed"; payload: Layout }
  | { type: "settings_changed"; payload: SettingsPayload }
  | { type: "todos_changed"; payload: Record<string, never> }
  | { type: string; payload: unknown };

