import { useEffect, useState } from "react";

import { usePreview } from "../../lib/previewContext";
import { api } from "../../lib/api";
import type { WeatherPayload } from "../../lib/types";
import type { WidgetProps } from "./registry";
import {
  WeatherIcon,
  codeToCondition,
  conditionLabel,
} from "./weather/icons";

const MOCK_WEATHER: WeatherPayload = {
  lat: 60.17,
  lon: 24.94,
  temperature_c: 14,
  weather_code: 3,
  wind_speed_kmh: 12,
  humidity_pct: 68,
  fetched_at: 0,
  forecast: [
    { date: "2026-05-19", weather_code: 61, temp_max_c: 12, temp_min_c: 6 },
    { date: "2026-05-20", weather_code: 0, temp_max_c: 19, temp_min_c: 9 },
    { date: "2026-05-21", weather_code: 71, temp_max_c: 5, temp_min_c: 1 },
  ],
};

const REFRESH_MS = 10 * 60 * 1000;
const DEFAULT_LAT = 60.1699;
const DEFAULT_LON = 24.9384;

interface WeatherConfig {
  lat?: number;
  lon?: number;
}

export function WeatherForecast({ widget }: WidgetProps) {
  const preview = usePreview();
  const config = (widget.config as WeatherConfig | undefined) ?? {};
  const lat = config.lat ?? DEFAULT_LAT;
  const lon = config.lon ?? DEFAULT_LON;

  const [data, setData] = useState<WeatherPayload | null>(preview ? MOCK_WEATHER : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let activeController: AbortController | null = null;

    async function load() {
      activeController = new AbortController();
      const timeoutId = setTimeout(() => activeController!.abort(), 15_000);
      try {
        const w = await api.getWeather(lat, lon, activeController.signal);
        clearTimeout(timeoutId);
        if (!cancelled) {
          setData(w);
          setError(null);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (!cancelled) {
          const msg =
            e instanceof DOMException && e.name === "AbortError"
              ? "Request timed out"
              : e instanceof Error
                ? e.message
                : String(e);
          setError(msg);
        }
      } finally {
        activeController = null;
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      activeController?.abort();
    };
  }, [lat, lon, preview]);

  if (error) {
    return <div className="text-red-300/80 text-sm">weather: {error}</div>;
  }
  if (!data) {
    return <div className="text-fg-faint text-sm">loading…</div>;
  }

  const condition = codeToCondition(data.weather_code);
  const temp =
    data.temperature_c != null ? Math.round(data.temperature_c) : null;
  const forecastDays = (data.forecast ?? []).slice(1, 4);

  return (
    <div
      className="anim-fade-in flex flex-col gap-4 w-full leading-none"
      key={`${condition}-${temp}`}
    >
      {/* Current conditions */}
      <div className="flex items-center gap-4">
        <div
          className="text-fg-soft"
          style={{ fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
        >
          <WeatherIcon condition={condition} />
        </div>
        <div className="flex flex-col gap-1">
          <div
            className="font-light tabular-nums text-fg"
            style={{ fontSize: "clamp(2.2rem, 5.5vw, 5rem)" }}
          >
            {temp != null ? `${temp}°` : "—"}
          </div>
          <div
            className="text-fg-dim tracking-wider"
            style={{ fontSize: "clamp(0.65rem, 1.1vw, 1rem)" }}
          >
            {conditionLabel(condition).toUpperCase()}
          </div>
          {(data.humidity_pct != null || data.wind_speed_kmh != null) && (
            <div
              className="text-fg-faint flex gap-3"
              style={{ fontSize: "clamp(0.6rem, 0.95vw, 0.85rem)" }}
            >
              {data.humidity_pct != null && (
                <span>{Math.round(data.humidity_pct)}% RH</span>
              )}
              {data.wind_speed_kmh != null && (
                <span>{Math.round(data.wind_speed_kmh)} km/h</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3-day forecast */}
      {forecastDays.length > 0 && (
        <div className="flex gap-2 border-t border-white/10 pt-3">
          {forecastDays.map((day) => {
            const fc = codeToCondition(day.weather_code);
            const hi =
              day.temp_max_c != null ? Math.round(day.temp_max_c) : null;
            const lo =
              day.temp_min_c != null ? Math.round(day.temp_min_c) : null;
            const dayName = new Date(day.date + "T12:00:00")
              .toLocaleDateString(undefined, { weekday: "short" })
              .toUpperCase();
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="text-fg-faint tracking-wide"
                  style={{ fontSize: "clamp(0.55rem, 0.9vw, 0.75rem)" }}
                >
                  {dayName}
                </div>
                <div
                  className="text-fg-soft"
                  style={{ fontSize: "clamp(1.2rem, 3vw, 2.2rem)" }}
                >
                  <WeatherIcon condition={fc} />
                </div>
                <div
                  className="flex gap-1 tabular-nums"
                  style={{ fontSize: "clamp(0.6rem, 0.95vw, 0.8rem)" }}
                >
                  {hi != null && <span className="text-fg">{hi}°</span>}
                  {lo != null && (
                    <span className="text-fg-faint">{lo}°</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
