import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import type { WeatherPayload } from "../../lib/types";
import type { WidgetProps } from "./registry";
import {
  WeatherIcon,
  codeToCondition,
  conditionLabel,
} from "./weather/icons";

const REFRESH_MS = 10 * 60 * 1000; // 10 min; matches backend TTL

const DEFAULT_LAT = 60.1699;
const DEFAULT_LON = 24.9384;

interface WeatherConfig {
  lat?: number;
  lon?: number;
}

export function Weather({ widget }: WidgetProps) {
  const config = (widget.config as WeatherConfig | undefined) ?? {};
  const lat = config.lat ?? DEFAULT_LAT;
  const lon = config.lon ?? DEFAULT_LON;

  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    async function load() {
      activeController = new AbortController();
      const timeoutId = setTimeout(() => activeController!.abort(), 15_000);
      try {
        const w = await api.getWeather(lat, lon, activeController.signal);
        clearTimeout(timeoutId);
        if (!cancelled) { setData(w); setError(null); }
      } catch (e) {
        clearTimeout(timeoutId);
        if (!cancelled) {
          const msg = e instanceof DOMException && e.name === "AbortError"
            ? "Request timed out"
            : e instanceof Error ? e.message : String(e);
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
  }, [lat, lon]);

  if (error) {
    return <div className="text-red-300/80 text-sm">weather: {error}</div>;
  }
  if (!data) {
    return <div className="text-fg-faint text-sm">loading…</div>;
  }

  const condition = codeToCondition(data.weather_code);
  const temp = data.temperature_c != null ? Math.round(data.temperature_c) : null;

  return (
    <div
      className="anim-fade-in flex items-center gap-4 leading-none"
      key={`${condition}-${temp}`}
    >
      <div
        className="text-fg-soft"
        style={{ fontSize: "clamp(3rem, 7vw, 6rem)" }}
      >
        <WeatherIcon condition={condition} />
      </div>
      <div className="flex flex-col gap-1">
        <div
          className="font-light tabular-nums text-fg"
          style={{ fontSize: "clamp(1.8rem, 4.5vw, 4rem)" }}
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
            className="text-fg-faint mt-1 flex gap-3"
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
  );
}
