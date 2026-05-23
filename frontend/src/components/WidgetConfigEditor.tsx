/**
 * WidgetConfigEditor
 *
 * Renders a typed form for a widget's config_json based on the widget's
 * configSchema from the registry. Supports text, number, toggle, select,
 * date fields, and a dedicated transit-route builder.
 *
 * The component is purely controlled: it calls `onChange` on every change
 * and never saves to the server itself — the parent owns the save button.
 */

import { useState } from "react";
import type { ConfigField } from "./widgets/registry";

// ---------------------------------------------------------------------------
// Transit-specific types (mirrors Transit.tsx — kept local to avoid coupling)
// ---------------------------------------------------------------------------

interface CoordPoint {
  lat: number;
  lon: number;
  label: string;
}

type RouteEndpoint = CoordPoint | { source: "home"; label: string };

interface RouteConfig {
  label: string;
  from: RouteEndpoint;
  to: RouteEndpoint;
  modes?: string[];
}

const TRANSIT_MODES = ["BUS", "TRAM", "RAIL", "SUBWAY", "FERRY"] as const;

function isHomeEndpoint(ep: RouteEndpoint): ep is { source: "home"; label: string } {
  return "source" in ep && (ep as { source: string }).source === "home";
}

// ---------------------------------------------------------------------------
// Transit sub-components
// ---------------------------------------------------------------------------

function EndpointEditor({
  sectionLabel,
  endpoint,
  onChange,
}: {
  sectionLabel: string;
  endpoint: RouteEndpoint;
  onChange: (ep: RouteEndpoint) => void;
}) {
  const isHome = isHomeEndpoint(endpoint);
  const coord = isHome ? null : (endpoint as CoordPoint);

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-fg-faint">{sectionLabel}</div>

      {/* Home vs coordinate toggle */}
      <div className="flex gap-4">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={`ep-${sectionLabel}`}
            checked={isHome}
            onChange={() =>
              onChange({ source: "home", label: endpoint.label ?? sectionLabel })
            }
            className="accent-white/80"
          />
          Home address
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={`ep-${sectionLabel}`}
            checked={!isHome}
            onChange={() =>
              onChange({
                lat: coord?.lat ?? 0,
                lon: coord?.lon ?? 0,
                label: endpoint.label ?? sectionLabel,
              })
            }
            className="accent-white/80"
          />
          Custom coordinates
        </label>
      </div>

      {/* Label */}
      <label className="flex flex-col text-xs">
        <span className="mb-1 text-fg-faint">Display label</span>
        <input
          type="text"
          value={endpoint.label ?? ""}
          onChange={(e) => onChange({ ...endpoint, label: e.target.value })}
          placeholder={sectionLabel}
          className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
        />
      </label>

      {/* Lat / lon — only for custom coordinates */}
      {!isHome && (
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col text-xs">
            <span className="mb-1 text-fg-faint">Latitude</span>
            <input
              type="number"
              step="0.0001"
              value={coord?.lat ?? 0}
              onChange={(e) =>
                onChange({ ...(endpoint as CoordPoint), lat: parseFloat(e.target.value) || 0 })
              }
              className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
            />
          </label>
          <label className="flex flex-1 flex-col text-xs">
            <span className="mb-1 text-fg-faint">Longitude</span>
            <input
              type="number"
              step="0.0001"
              value={coord?.lon ?? 0}
              onChange={(e) =>
                onChange({ ...(endpoint as CoordPoint), lon: parseFloat(e.target.value) || 0 })
              }
              className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function RouteEditor({
  route,
  onChange,
}: {
  route: RouteConfig;
  onChange: (updated: RouteConfig) => void;
}) {
  return (
    <div className="space-y-4 border-t border-white/10 px-3 py-3">
      {/* Route label */}
      <label className="flex flex-col text-xs">
        <span className="mb-1 uppercase tracking-wide text-fg-faint">Route label</span>
        <input
          type="text"
          value={route.label}
          onChange={(e) => onChange({ ...route, label: e.target.value })}
          placeholder="e.g. To Kamppi"
          className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
        />
      </label>

      <EndpointEditor
        sectionLabel="From"
        endpoint={route.from}
        onChange={(ep) => onChange({ ...route, from: ep })}
      />

      <EndpointEditor
        sectionLabel="To"
        endpoint={route.to}
        onChange={(ep) => onChange({ ...route, to: ep })}
      />

      {/* Transport modes */}
      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-fg-faint">
          Transport modes
        </div>
        <div className="flex flex-wrap gap-3">
          {TRANSIT_MODES.map((mode) => {
            const checked = (route.modes ?? []).includes(mode);
            return (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const prev = route.modes ?? [];
                    const next = checked
                      ? prev.filter((m) => m !== mode)
                      : [...prev, mode];
                    onChange({ ...route, modes: next });
                  }}
                  className="accent-white/80"
                />
                {mode}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TransitRoutesEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}) {
  const routes: RouteConfig[] = (config.routes as RouteConfig[] | undefined) ?? [];
  const numDepartures: number = (config.numDepartures as number | undefined) ?? 2;

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const setRoutes = (next: RouteConfig[]) =>
    onChange({ ...config, routes: next });

  const updateRoute = (i: number, updated: RouteConfig) => {
    const next = [...routes];
    next[i] = updated;
    setRoutes(next);
  };

  const removeRoute = (i: number) => {
    const next = routes.filter((_, idx) => idx !== i);
    setRoutes(next);
    setExpandedIdx((prev) =>
      prev === i ? null : prev !== null && prev > i ? prev - 1 : prev,
    );
  };

  const addRoute = () => {
    const newRoute: RouteConfig = {
      label: "New route",
      from: { source: "home", label: "Home" },
      to: { lat: 0, lon: 0, label: "Destination" },
      modes: ["BUS", "TRAM"],
    };
    const next = [...routes, newRoute];
    setRoutes(next);
    setExpandedIdx(next.length - 1);
  };

  return (
    <div className="space-y-4">
      {/* numDepartures */}
      <label className="flex flex-col text-xs">
        <span className="mb-1 uppercase tracking-wide text-fg-faint">
          Departures shown per route
        </span>
        <input
          type="number"
          min={1}
          max={10}
          value={numDepartures}
          onChange={(e) =>
            onChange({ ...config, numDepartures: Number(e.target.value) })
          }
          className="w-20 rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
        />
      </label>

      {/* Route list */}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wide text-fg-faint">
          Routes ({routes.length})
        </div>
        <div className="space-y-2">
          {routes.length === 0 && (
            <p className="text-xs text-fg-faint">
              No routes yet — add one below.
            </p>
          )}
          {routes.map((route, i) => (
            <div
              key={i}
              className="rounded-md border border-white/10 bg-white/5"
            >
              {/* Route header row */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  className="flex flex-1 items-center gap-1.5 text-left text-sm text-fg"
                >
                  <span
                    className={`inline-block shrink-0 transition-transform ${
                      expandedIdx === i ? "rotate-90" : ""
                    }`}
                  >
                    ›
                  </span>
                  <span className="truncate">
                    {route.label || <span className="text-fg-faint italic">Unnamed route</span>}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRoute(i)}
                  className="shrink-0 text-xs text-red-300/70 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>

              {/* Expanded editor */}
              {expandedIdx === i && (
                <RouteEditor
                  route={route}
                  onChange={(updated) => updateRoute(i, updated)}
                />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRoute}
          className="mt-2 rounded-md border border-white/20 px-3 py-1.5 text-xs text-fg-dim hover:bg-white/10 hover:text-fg transition-colors"
        >
          + Add route
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function WidgetConfigEditor({
  schema,
  config,
  onChange,
}: {
  schema: ConfigField[];
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="space-y-5">
      {schema.map((field, fieldIdx) => {
        // ── Transit routes ──────────────────────────────────────────────
        if (field.kind === "transit-routes") {
          return (
            <TransitRoutesEditor
              key="transit-routes"
              config={config}
              onChange={onChange}
            />
          );
        }

        // ── Toggle ──────────────────────────────────────────────────────
        if (field.kind === "toggle") {
          const checked =
            (config[field.key] as boolean | undefined) ??
            (field.defaultChecked ?? false);
          return (
            <label
              key={field.key}
              className="flex cursor-pointer items-start gap-3"
            >
              {/* Pill toggle */}
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(field.key, e.target.checked)}
                  className="sr-only"
                />
                <div
                  onClick={() => set(field.key, !checked)}
                  className={`h-5 w-9 cursor-pointer rounded-full transition-colors ${
                    checked ? "bg-white/80" : "bg-white/20"
                  }`}
                />
                <div
                  onClick={() => set(field.key, !checked)}
                  className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-black transition-transform ${
                    checked ? "translate-x-4" : ""
                  }`}
                />
              </div>
              <div>
                <div className="text-sm text-fg leading-snug">{field.label}</div>
                {field.description && (
                  <div className="mt-0.5 text-xs text-fg-faint leading-relaxed">
                    {field.description}
                  </div>
                )}
              </div>
            </label>
          );
        }

        // ── Select ──────────────────────────────────────────────────────
        if (field.kind === "select") {
          const value =
            (config[field.key] as string | undefined) ??
            (field.defaultValue ?? field.options[0]?.value ?? "");
          return (
            <label key={field.key} className="flex flex-col text-xs">
              <span className="mb-1 uppercase tracking-wide text-fg-faint">
                {field.label}
              </span>
              {field.description && (
                <span className="mb-1.5 text-fg-faint">{field.description}</span>
              )}
              <select
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                className="self-start rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        // ── Date ────────────────────────────────────────────────────────
        if (field.kind === "date") {
          const value = (config[field.key] as string | undefined) ?? "";
          return (
            <label key={field.key} className="flex flex-col text-xs">
              <span className="mb-1 uppercase tracking-wide text-fg-faint">
                {field.label}
              </span>
              {field.description && (
                <span className="mb-1.5 text-fg-faint">{field.description}</span>
              )}
              <input
                type="date"
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                className="self-start rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40 [color-scheme:dark]"
              />
            </label>
          );
        }

        // ── Number ──────────────────────────────────────────────────────
        if (field.kind === "number") {
          const raw = config[field.key];
          const value = raw === undefined || raw === null ? "" : String(raw);
          return (
            <label key={`${field.key}-${fieldIdx}`} className="flex flex-col text-xs">
              <span className="mb-1 uppercase tracking-wide text-fg-faint">
                {field.label}
              </span>
              {field.description && (
                <span className="mb-1.5 text-fg-faint leading-relaxed">
                  {field.description}
                </span>
              )}
              <input
                type="number"
                value={value}
                min={field.min}
                max={field.max}
                step={field.step}
                placeholder={field.placeholder}
                onChange={(e) => {
                  const v = e.target.value;
                  set(field.key, v === "" ? undefined : Number(v));
                }}
                className="w-40 rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
              />
            </label>
          );
        }

        // ── Text ────────────────────────────────────────────────────────
        if (field.kind === "text") {
          const value = (config[field.key] as string | undefined) ?? "";
          return (
            <label key={field.key} className="flex flex-col text-xs">
              <span className="mb-1 uppercase tracking-wide text-fg-faint">
                {field.label}
              </span>
              {field.description && (
                <span className="mb-1.5 text-fg-faint">{field.description}</span>
              )}
              <input
                type="text"
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)}
                className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
              />
            </label>
          );
        }

        return null;
      })}
    </div>
  );
}
