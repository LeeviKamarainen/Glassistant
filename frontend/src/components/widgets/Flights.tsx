import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import type { Aircraft, FlightsPayload } from "../../lib/types";
import { usePreview } from "../../lib/previewContext";
import type { WidgetProps } from "./registry";

// ── constants ──────────────────────────────────────────────────────────────────

const REFRESH_MS = 15_000; // 15 s; matches backend TTL
const DEFAULT_LAT = 60.1699;
const DEFAULT_LON = 24.9384;
const DEFAULT_RADIUS_KM = 50;
const DEFAULT_MAX_SHOWN = 6;

// ── mock data ──────────────────────────────────────────────────────────────────

const MOCK: FlightsPayload = {
  aircraft: [
    { icao24: "4b1a2c", callsign: "FIN123", origin_country: "Finland", longitude: 24.95, latitude: 60.18, altitude_m: 8500, on_ground: false, velocity_ms: 230, heading_deg: 45, vertical_rate_ms: 0 },
    { icao24: "4ca832", callsign: "AY456", origin_country: "Finland", longitude: 24.90, latitude: 60.22, altitude_m: 3200, on_ground: false, velocity_ms: 180, heading_deg: 270, vertical_rate_ms: -4.5 },
    { icao24: "abc123", callsign: "SAS789", origin_country: "Sweden", longitude: 25.00, latitude: 60.15, altitude_m: 11000, on_ground: false, velocity_ms: 252, heading_deg: 185, vertical_rate_ms: 0 },
    { icao24: "3c6444", callsign: "DLH21", origin_country: "Germany", longitude: 25.10, latitude: 60.25, altitude_m: 9800, on_ground: false, velocity_ms: 244, heading_deg: 310, vertical_rate_ms: 2.1 },
  ],
  fetched_at: 0,
  lat: DEFAULT_LAT,
  lon: DEFAULT_LON,
  radius_km: DEFAULT_RADIUS_KM,
};

// ── helpers ────────────────────────────────────────────────────────────────────

/** Convert metres to feet, rounded to nearest 100. */
function toFt(m: number): string {
  const ft = Math.round((m * 3.28084) / 100) * 100;
  return ft.toLocaleString();
}

/** Convert m/s to knots, rounded to nearest integer. */
function toKts(ms: number): string {
  return Math.round(ms * 1.94384).toString();
}

/**
 * The ✈ Unicode glyph naturally points east (90°).
 * OpenSky heading is degrees clockwise from north.
 * Rotate by (heading - 90) to align the glyph.
 */
function headingStyle(deg: number | null): React.CSSProperties {
  if (deg == null) return {};
  return { transform: `rotate(${deg - 90}deg)`, display: "inline-block" };
}

/** Vertical-rate indicator: climbing, descending, level. */
function VrIndicator({ vr }: { vr: number | null }) {
  if (vr == null || Math.abs(vr) < 0.5) {
    return <span className="text-fg-faint">—</span>;
  }
  if (vr > 0) return <span className="text-emerald-400">↑</span>;
  return <span className="text-red-400/80">↓</span>;
}

// ── config ─────────────────────────────────────────────────────────────────────

interface FlightsConfig {
  lat?: number;
  lon?: number;
  radius_km?: number;
  max_shown?: number;
}

// ── component ──────────────────────────────────────────────────────────────────

export function Flights({ widget }: WidgetProps) {
  const preview = usePreview();
  const cfg = (widget.config as FlightsConfig | undefined) ?? {};
  const lat = cfg.lat ?? DEFAULT_LAT;
  const lon = cfg.lon ?? DEFAULT_LON;
  const radiusKm = cfg.radius_km ?? DEFAULT_RADIUS_KM;
  const maxShown = cfg.max_shown ?? DEFAULT_MAX_SHOWN;

  const [data, setData] = useState<FlightsPayload | null>(preview ? MOCK : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let ctrl: AbortController | null = null;

    async function load() {
      ctrl = new AbortController();
      const timer = setTimeout(() => ctrl!.abort(), 20_000);
      try {
        const d = await api.getFlights(lat, lon, radiusKm, ctrl.signal);
        clearTimeout(timer);
        if (!cancelled) { setData(d); setError(null); }
      } catch (e) {
        clearTimeout(timer);
        if (!cancelled) {
          const msg =
            e instanceof DOMException && e.name === "AbortError"
              ? "Request timed out"
              : e instanceof Error ? e.message : String(e);
          setError(msg);
        }
      } finally {
        ctrl = null;
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      ctrl?.abort();
    };
  }, [lat, lon, radiusKm, preview]);

  // ── render ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col gap-1">
        <Header count={null} radiusKm={radiusKm} />
        <p className="text-red-300/80 text-xs">flights: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-1">
        <Header count={null} radiusKm={radiusKm} />
        <p className="text-fg-faint text-sm">loading…</p>
      </div>
    );
  }

  const shown = data.aircraft.slice(0, maxShown);

  return (
    <div className="anim-fade-in flex flex-col gap-2 w-full">
      <Header count={data.aircraft.length} radiusKm={radiusKm} />

      {data.aircraft.length === 0 ? (
        <p className="text-fg-faint text-sm italic">No airborne aircraft detected.</p>
      ) : (
        <div className="flex flex-col gap-0.5 w-full">
          {/* column header */}
          <div
            className="grid gap-x-2 text-fg-faint uppercase tracking-wider select-none"
            style={{
              fontSize: "clamp(0.5rem, 0.8vw, 0.65rem)",
              gridTemplateColumns: "1.5rem 5rem 1fr 3.5rem 3rem 1rem",
            }}
          >
            <span />
            <span>Callsign</span>
            <span>Country</span>
            <span className="text-right">Alt (ft)</span>
            <span className="text-right">Kts</span>
            <span className="text-center">↕</span>
          </div>

          {shown.map((ac) => (
            <AircraftRow key={ac.icao24} ac={ac} />
          ))}

          {data.aircraft.length > maxShown && (
            <p
              className="text-fg-faint italic"
              style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.7rem)" }}
            >
              +{data.aircraft.length - maxShown} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Header({ count, radiusKm }: { count: number | null; radiusKm: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-fg font-light"
        style={{ fontSize: "clamp(0.85rem, 1.6vw, 1.3rem)" }}
      >
        ✈ Overhead
      </span>
      {count != null && (
        <span
          className="text-accent font-semibold tabular-nums"
          style={{ fontSize: "clamp(0.85rem, 1.6vw, 1.3rem)" }}
        >
          {count}
        </span>
      )}
      <span
        className="text-fg-faint"
        style={{ fontSize: "clamp(0.5rem, 0.85vw, 0.7rem)" }}
      >
        within {radiusKm} km
      </span>
    </div>
  );
}

function AircraftRow({ ac }: { ac: Aircraft }) {
  return (
    <div
      className="grid gap-x-2 items-center text-fg-soft"
      style={{
        fontSize: "clamp(0.6rem, 1vw, 0.8rem)",
        gridTemplateColumns: "1.5rem 5rem 1fr 3.5rem 3rem 1rem",
      }}
    >
      {/* heading indicator */}
      <span
        className="text-accent"
        style={headingStyle(ac.heading_deg)}
      >
        ✈
      </span>

      {/* callsign */}
      <span className="font-mono font-medium text-fg truncate">
        {ac.callsign ?? ac.icao24}
      </span>

      {/* country */}
      <span className="text-fg-dim truncate">{ac.origin_country}</span>

      {/* altitude */}
      <span className="text-right tabular-nums text-fg-soft">
        {ac.altitude_m != null ? toFt(ac.altitude_m) : "—"}
      </span>

      {/* speed */}
      <span className="text-right tabular-nums text-fg-faint">
        {ac.velocity_ms != null ? toKts(ac.velocity_ms) : "—"}
      </span>

      {/* vertical rate */}
      <span className="text-center">
        <VrIndicator vr={ac.vertical_rate_ms} />
      </span>
    </div>
  );
}
