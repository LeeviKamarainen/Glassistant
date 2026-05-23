import type { FC } from "react";

import type { Widget } from "../../lib/types";
import { Calendar } from "./Calendar";
import { Clock } from "./Clock";
import { Countdown } from "./Countdown";
import { DateW } from "./DateW";
import { DateTime } from "./DateTime";
import { Flights } from "./Flights";
import { Spotify } from "./Spotify";
import { Todo } from "./Todo";
import { Transit } from "./Transit";
import { Weather } from "./Weather";
import { WeatherForecast } from "./WeatherForecast";

export interface WidgetProps {
  widget: Widget;
}

// ---------------------------------------------------------------------------
// Config schema — describes form fields for each widget's config_json
// ---------------------------------------------------------------------------

export type ConfigField =
  | {
      kind: "text";
      key: string;
      label: string;
      description?: string;
      placeholder?: string;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      description?: string;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
    }
  | {
      kind: "toggle";
      key: string;
      label: string;
      description?: string;
      /** Default value used when key is absent from config. */
      defaultChecked?: boolean;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      description?: string;
      /** Default value used when key is absent from config. Falls back to first option. */
      defaultValue?: string;
    }
  | {
      kind: "date";
      key: string;
      label: string;
      description?: string;
    }
  | {
      /** Special renderer: full transit route builder (routes[] + numDepartures). */
      kind: "transit-routes";
    };

export interface WidgetMeta {
  component: FC<WidgetProps>;
  label: string;
  description: string;
  defaultSize: { rowSpan: number; colSpan: number };
  /**
   * Describes the widget's config_json shape for the form editor.
   * Omit (or leave empty) for widgets with no user-facing config.
   */
  configSchema?: ConfigField[];
  /**
   * Set to `true` for widgets that implement their own overflow/scroll logic
   * (e.g. Todo). Hides the "Auto-scroll" toggle in the admin UI and skips
   * the generic `<AutoScroll>` wrapper even if `config.auto_scroll` is set.
   */
  scrollManaged?: boolean;
}

export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  clock: {
    component: Clock,
    label: "Clock",
    description: "Current time with optional seconds and 12/24h format.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
    configSchema: [
      {
        kind: "select",
        key: "format",
        label: "Time format",
        options: [
          { value: "24h", label: "24-hour (14:30)" },
          { value: "12h", label: "12-hour (2:30 PM)" },
        ],
        defaultValue: "24h",
      },
      {
        kind: "toggle",
        key: "show_seconds",
        label: "Show seconds",
        defaultChecked: true,
      },
    ],
  },
  date: {
    component: DateW,
    label: "Date",
    description: "Day, date number, and month name in a vertical stack.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
    // No configurable options.
  },
  datetime: {
    component: DateTime,
    label: "Date & Time",
    description: "Full date header with large clock below — calendar and clock combined.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
    configSchema: [
      {
        kind: "select",
        key: "format",
        label: "Time format",
        options: [
          { value: "24h", label: "24-hour (14:30)" },
          { value: "12h", label: "12-hour (2:30 PM)" },
        ],
        defaultValue: "24h",
      },
      {
        kind: "toggle",
        key: "show_seconds",
        label: "Show seconds",
        defaultChecked: true,
      },
    ],
  },
  weather: {
    component: Weather,
    label: "Weather",
    description: "Current conditions — temperature, icon, humidity and wind.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
    configSchema: [
      {
        kind: "number",
        key: "lat",
        label: "Latitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 60.1699",
      },
      {
        kind: "number",
        key: "lon",
        label: "Longitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 24.9384",
      },
    ],
  },
  weather_forecast: {
    component: WeatherForecast,
    label: "Weather Forecast",
    description: "Today's conditions large, with a compact 3-day forecast below.",
    defaultSize: { rowSpan: 2, colSpan: 1 },
    configSchema: [
      {
        kind: "number",
        key: "lat",
        label: "Latitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 60.1699",
      },
      {
        kind: "number",
        key: "lon",
        label: "Longitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 24.9384",
      },
    ],
  },
  transit: {
    component: Transit,
    label: "Transit",
    description: "Upcoming HSL departures for configured routes (train, bus, tram).",
    defaultSize: { rowSpan: 1, colSpan: 2 },
    configSchema: [{ kind: "transit-routes" }],
  },
  calendar: {
    component: Calendar,
    label: "Calendar",
    description: "Google Calendar — current week view with events per day.",
    defaultSize: { rowSpan: 2, colSpan: 7 },
    // No configurable options.
  },
  todo: {
    component: Todo,
    label: "Todo",
    description: "Scrolling task list sorted by due date.",
    defaultSize: { rowSpan: 2, colSpan: 1 },
    // Todo manages its own RAF scroll loop — no generic wrapper needed.
    scrollManaged: true,
    configSchema: [
      {
        kind: "toggle",
        key: "show_done",
        label: "Show completed tasks",
        description: "Include tasks that have already been marked as done.",
      },
    ],
  },
  countdown: {
    component: Countdown,
    label: "Countdown",
    description: "Days (and optionally hours/minutes) until or since a target date.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
    configSchema: [
      {
        kind: "text",
        key: "label",
        label: "Event name",
        placeholder: "e.g. Summer vacation",
      },
      {
        kind: "date",
        key: "target_date",
        label: "Target date",
      },
      {
        kind: "toggle",
        key: "show_time",
        label: "Show hours & minutes",
        description: "Display a time breakdown in addition to the day count.",
      },
    ],
  },
  spotify: {
    component: Spotify,
    label: "Spotify",
    description: "Currently playing track from Spotify — album art, title, artist, progress.",
    defaultSize: { rowSpan: 1, colSpan: 2 },
    // No configurable options.
  },
  flights: {
    component: Flights,
    label: "Flights",
    description: "Live aircraft overhead via OpenSky Network — callsign, altitude, speed, heading.",
    defaultSize: { rowSpan: 1, colSpan: 2 },
    configSchema: [
      {
        kind: "number",
        key: "lat",
        label: "Latitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 60.1699",
      },
      {
        kind: "number",
        key: "lon",
        label: "Longitude",
        step: 0.0001,
        description: "Leave empty to use the home location from system settings.",
        placeholder: "e.g. 24.9384",
      },
      {
        kind: "number",
        key: "radius_km",
        label: "Detection radius (km)",
        min: 1,
        max: 500,
        description: "Area around the location to scan for aircraft. Default: 50 km.",
        placeholder: "50",
      },
      {
        kind: "number",
        key: "max_shown",
        label: "Max aircraft shown",
        min: 1,
        max: 50,
        description: "How many aircraft to display in the list. Default: 10.",
        placeholder: "10",
      },
    ],
  },
};

/** Component map used by Grid for rendering. */
export const WIDGETS: Record<string, FC<WidgetProps>> = Object.fromEntries(
  Object.entries(WIDGET_REGISTRY).map(([k, v]) => [k, v.component]),
);

/** All registered type keys. */
export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
