import { useEffect, useRef, useState } from "react";

import { api } from "../../lib/api";
import type { SystemConfig, TransitItinerary } from "../../lib/types";
import type { WidgetProps } from "./registry";

const REFRESH_MS = 2 * 60 * 1000;

// A coord endpoint defined inline in config.
interface CoordPoint {
  lat: number;
  lon: number;
  label: string;
}

// Use "home" as origin to pull coordinates from /api/system instead of hardcoding them.
type RouteEndpoint = CoordPoint | { source: "home"; label: string };

interface RouteConfig {
  label: string;
  from: RouteEndpoint;
  to: RouteEndpoint;
  modes?: string[];
}

interface TransitConfig {
  routes?: RouteConfig[];
  numDepartures?: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  });
}

function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

// Return the primary transit leg (skip WALK legs).
function primaryLeg(itinerary: TransitItinerary) {
  return itinerary.legs.find((l) => l.mode !== "WALK") ?? itinerary.legs[0];
}

const MODE_COLORS: Record<string, string> = {
  RAIL: "#93c5fd",   // blue-300
  BUS: "#86efac",   // green-300
  TRAM: "#fcd34d",  // amber-300
  SUBWAY: "#c4b5fd", // purple-300
  FERRY: "#5eead4", // teal-300
};

function ModeIcon({ mode, size = 14 }: { mode: string; size?: number }) {
  const color = MODE_COLORS[mode] ?? "currentColor";
  if (mode === "RAIL" || mode === "SUBWAY") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="13" rx="3" />
        <path d="M4 10h16" />
        <path d="M8 19l-2 2" />
        <path d="M16 19l2 2" />
        <path d="M8 19h8" />
        <circle cx="9" cy="14.5" r="1" fill={color} stroke="none" />
        <circle cx="15" cy="14.5" r="1" fill={color} stroke="none" />
      </svg>
    );
  }
  if (mode === "TRAM") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="14" height="12" rx="2" />
        <path d="M5 11h14" />
        <path d="M8 5V3" />
        <path d="M16 5V3" />
        <path d="M7 21l2-4" />
        <path d="M17 21l-2-4" />
        <path d="M9 17h6" />
        <circle cx="9" cy="14" r="1" fill={color} stroke="none" />
        <circle cx="15" cy="14" r="1" fill={color} stroke="none" />
      </svg>
    );
  }
  if (mode === "FERRY") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l2-8h14l2 8" />
        <path d="M3 17c0 2 4 3 9 3s9-1 9-3" />
        <path d="M12 9V4" />
        <path d="M8 9h8" />
      </svg>
    );
  }
  // BUS (default)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M3 14h18" />
      <path d="M8 19v2" />
      <path d="M16 19v2" />
      <circle cx="8" cy="17" r="1" fill={color} stroke="none" />
      <circle cx="16" cy="17" r="1" fill={color} stroke="none" />
    </svg>
  );
}

const MODE_BADGE_STYLES: Record<string, string> = {
  RAIL: "bg-blue-900/50 text-blue-200",
  BUS: "bg-green-900/50 text-green-200",
  TRAM: "bg-amber-900/50 text-amber-200",
  SUBWAY: "bg-purple-900/50 text-purple-200",
  FERRY: "bg-teal-900/50 text-teal-200",
};

function RouteBadge({ mode, routeShortName }: { mode: string; routeShortName: string | null }) {
  const cls = MODE_BADGE_STYLES[mode] ?? "bg-white/10 text-fg-soft";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${cls}`}>
      <ModeIcon mode={mode} size={14} />
      {routeShortName && (
        <span className="text-[0.65rem] font-bold tracking-wide">{routeShortName}</span>
      )}
    </span>
  );
}

// ── resolve coord from config endpoint ───────────────────────────────────────

function resolveCoord(
  endpoint: RouteEndpoint,
  sys: SystemConfig | null,
): { lat: number; lon: number } | null {
  if ("source" in endpoint) {
    if (!sys || (sys.home_lat === 0 && sys.home_lon === 0)) return null;
    return { lat: sys.home_lat, lon: sys.home_lon };
  }
  return { lat: endpoint.lat, lon: endpoint.lon };
}

// ── per-route state ───────────────────────────────────────────────────────────

interface RouteState {
  itineraries: TransitItinerary[];
  error: string | null;
  loading: boolean;
}

// ── component ─────────────────────────────────────────────────────────────────

export function Transit({ widget }: WidgetProps) {
  const config = (widget.config as TransitConfig | undefined) ?? {};
  const routes: RouteConfig[] = config.routes ?? [];
  const numDepartures = config.numDepartures ?? 2;

  const [sys, setSys] = useState<SystemConfig | null>(null);
  const [routeStates, setRouteStates] = useState<RouteState[]>(() =>
    routes.map(() => ({ itineraries: [], error: null, loading: true })),
  );

  // Fetch system config once (for home coord resolution).
  useEffect(() => {
    api.getSystemConfig().then(setSys).catch(() => null);
  }, []);

  // Keep a stable ref to sys so the interval closure always sees the latest value.
  const sysRef = useRef(sys);
  useEffect(() => {
    sysRef.current = sys;
  }, [sys]);

  useEffect(() => {
    if (routes.length === 0) return;

    let cancelled = false;
    const controllers: AbortController[] = routes.map(() => new AbortController());

    async function loadRoute(idx: number) {
      const route = routes[idx]!;
      const from = resolveCoord(route.from, sysRef.current);
      const to = resolveCoord(route.to, sysRef.current);

      if (!from || !to) {
        if (!cancelled) {
          setRouteStates((prev) => {
            const next = [...prev];
            next[idx] = {
              itineraries: next[idx]?.itineraries ?? [],
              loading: false,
              error: "Home coordinates not set in .env",
            };
            return next;
          });
        }
        return;
      }

      controllers[idx] = new AbortController();
      const timeoutId = setTimeout(() => controllers[idx]!.abort(), 15_000);
      try {
        const ctrl = controllers[idx]!;
      const res = await api.planTransit(from, to, numDepartures, route.modes, ctrl.signal);
        clearTimeout(timeoutId);
        if (!cancelled) {
          setRouteStates((prev) => {
            const next = [...prev];
            next[idx] = { itineraries: res.itineraries, error: null, loading: false };
            return next;
          });
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
          setRouteStates((prev) => {
            const next = [...prev];
            next[idx] = {
              itineraries: next[idx]?.itineraries ?? [],
              loading: false,
              error: msg,
            };
            return next;
          });
        }
      }
    }

    function loadAll() {
      routes.forEach((_, idx) => loadRoute(idx));
    }

    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      controllers.forEach((c) => c.abort());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes.length, numDepartures, sys]);

  if (routes.length === 0) {
    return (
      <div className="text-fg-faint text-xs">
        No routes configured. Add a <code>routes</code> array to this widget's config.
      </div>
    );
  }

  return (
    <div className="anim-fade-in flex w-full flex-col gap-3">
      {routes.map((route, idx) => {
        const state = routeStates[idx] ?? { itineraries: [], error: null, loading: true };
        return (
          <div key={idx} className="flex flex-col gap-1">
            {/* Route label */}
            <div
              className="text-fg-dim uppercase tracking-widest"
              style={{ fontSize: "clamp(0.65rem, 1.1vw, 0.9rem)" }}
            >
              {route.label}
            </div>

            {/* Departures row */}
            {state.error ? (
              <div className="text-red-300/80 text-xs">{state.error}</div>
            ) : state.loading ? (
              <div className="text-fg-faint text-xs">loading…</div>
            ) : state.itineraries.length === 0 ? (
              <div className="text-fg-faint text-xs">no departures found</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {state.itineraries.map((itin, i) => {
                  const leg = primaryLeg(itin);
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <RouteBadge mode={leg?.mode ?? "BUS"} routeShortName={leg?.route_short_name ?? null} />
                      <span
                        className="tabular-nums text-fg font-light"
                        style={{ fontSize: "clamp(0.95rem, 2vw, 1.5rem)" }}
                      >
                        {fmtTime(itin.departure)}
                      </span>
                      <span
                        className="text-fg-faint"
                        style={{ fontSize: "clamp(0.65rem, 1.1vw, 0.9rem)" }}
                      >
                        {fmtDuration(itin.duration_seconds)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
