import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import type { EffectStyle } from "../lib/useEffectStyle";
import {
  codeToCondition,
  type WeatherCondition,
} from "./widgets/weather/icons";

const REFRESH_MS = 10 * 60 * 1000;

// Default location for ambient effects. Matches the Weather widget default.
const DEFAULT_LAT = 60.1699;
const DEFAULT_LON = 24.9384;

// Lazy: canvas particle system is only fetched when style === "dynamic".
const WeatherEffectDynamic = lazy(() => import("./WeatherEffectDynamic"));

interface Props {
  lat?: number;
  lon?: number;
  /** Override the auto-detected condition (debug / admin preview). */
  forceCondition?: WeatherCondition;
  /** "calm" = CSS-only overlays, "dynamic" = canvas particle system. */
  style?: EffectStyle;
  /** Accent color (hex like "#fbbf24") used by sun-ray / sparkle effects. */
  themeAccent?: string;
  /** Widget bounding rects used to fade clouds when they overlap. */
  widgetRects?: DOMRect[];
}

export function WeatherEffect({
  lat = DEFAULT_LAT,
  lon = DEFAULT_LON,
  forceCondition,
  style = "calm",
  themeAccent = "#fbbf24",
  widgetRects = [],
}: Props) {
  const [condition, setCondition] = useState<WeatherCondition | null>(null);

  useEffect(() => {
    if (forceCondition) return;
    let cancelled = false;
    async function load() {
      try {
        const w = await api.getWeather(lat, lon);
        if (!cancelled) setCondition(codeToCondition(w.weather_code));
      } catch {
        /* leave previous */
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lat, lon, forceCondition]);

  const active = forceCondition ?? condition;
  if (!active) return null;

  if (style === "dynamic") {
    return (
      <Suspense fallback={null}>
        <WeatherEffectDynamic condition={active} themeAccent={themeAccent} widgetRects={widgetRects} />
      </Suspense>
    );
  }

  switch (active) {
    case "rain":
      return <RainOverlay />;
    case "storm":
      return <RainOverlay storm />;
    case "snow":
      return <SnowOverlay />;
    case "fog":
      return <FogOverlay />;
    case "clear":
      return <ClearOverlay />;
    case "partly-cloudy":
      return <PartlyCloudyOverlay />;
    case "cloudy":
      return <CloudyOverlay />;
    default:
      return null;
  }
}

function ClearOverlay() {
  return (
    <div className="fx-overlay" aria-hidden="true">
      <div className="fx-clear-glow" />
    </div>
  );
}

function PartlyCloudyOverlay() {
  return (
    <div className="fx-overlay" aria-hidden="true">
      <div className="fx-clear-glow-soft" />
      <div className="fx-cloud-blob fx-cloud-blob-2" />
    </div>
  );
}

function CloudyOverlay() {
  return (
    <div className="fx-overlay" aria-hidden="true">
      <div className="fx-cloud-blob fx-cloud-blob-1" />
      <div className="fx-cloud-blob fx-cloud-blob-2" />
      <div className="fx-cloud-blob fx-cloud-blob-3" />
    </div>
  );
}

function RainOverlay({ storm = false }: { storm?: boolean }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        duration: 0.85 + Math.random() * 0.7,
        height: 10 + Math.random() * 10,
        opacity: 0.35 + Math.random() * 0.35,
      })),
    [],
  );
  return (
    <div className="fx-overlay" aria-hidden="true">
      {drops.map((d) => (
        <div
          key={d.id}
          className="fx-drop"
          style={{
            left: `${d.left}%`,
            height: `${d.height}px`,
            opacity: d.opacity,
            animationDelay: `-${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
      {storm && <div className="fx-flash" />}
    </div>
  );
}

function SnowOverlay() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 5 + Math.random() * 4,
        size: 10 + Math.random() * 14,
        opacity: 0.45 + Math.random() * 0.45,
      })),
    [],
  );
  return (
    <div className="fx-overlay" aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="fx-flake"
          style={{
            left: `${f.left}%`,
            fontSize: `${f.size}px`,
            opacity: f.opacity,
            animationDelay: `-${f.delay}s`,
            animationDuration: `${f.duration}s`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}

function FogOverlay() {
  return (
    <div className="fx-overlay" aria-hidden="true">
      <div className="fx-fog-base" />
      <div className="fx-fog-wisp fx-fog-wisp-1" />
      <div className="fx-fog-wisp fx-fog-wisp-2" />
      <div className="fx-fog-wisp fx-fog-wisp-3" />
    </div>
  );
}
