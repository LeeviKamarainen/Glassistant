import type { FC } from "react";

import type { Widget } from "../../lib/types";
import { Calendar } from "./Calendar";
import { Clock } from "./Clock";
import { Countdown } from "./Countdown";
import { DateW } from "./DateW";
import { DateTime } from "./DateTime";
import { Spotify } from "./Spotify";
import { Todo } from "./Todo";
import { Transit } from "./Transit";
import { Weather } from "./Weather";
import { WeatherForecast } from "./WeatherForecast";

export interface WidgetProps {
  widget: Widget;
}

export interface WidgetMeta {
  component: FC<WidgetProps>;
  label: string;
  description: string;
  defaultSize: { rowSpan: number; colSpan: number };
}

export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  clock: {
    component: Clock,
    label: "Clock",
    description: "Current time with optional seconds and 12/24h format.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
  },
  date: {
    component: DateW,
    label: "Date",
    description: "Day, date number, and month name in a vertical stack.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
  },
  datetime: {
    component: DateTime,
    label: "Date & Time",
    description: "Full date header with large clock below — calendar and clock combined.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
  },
  weather: {
    component: Weather,
    label: "Weather",
    description: "Current conditions — temperature, icon, humidity and wind.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
  },
  weather_forecast: {
    component: WeatherForecast,
    label: "Weather Forecast",
    description: "Today's conditions large, with a compact 3-day forecast below.",
    defaultSize: { rowSpan: 2, colSpan: 1 },
  },
  transit: {
    component: Transit,
    label: "Transit",
    description: "Upcoming HSL departures for configured routes (train, bus, tram).",
    defaultSize: { rowSpan: 1, colSpan: 2 },
  },
  calendar: {
    component: Calendar,
    label: "Calendar",
    description: "Google Calendar — current week view with events per day.",
    defaultSize: { rowSpan: 2, colSpan: 7 },
  },
  todo: {
    component: Todo,
    label: "Todo",
    description: "Scrolling task list sorted by due date.",
    defaultSize: { rowSpan: 2, colSpan: 1 },
  },
  countdown: {
    component: Countdown,
    label: "Countdown",
    description: "Days (and optionally hours/minutes) until or since a target date.",
    defaultSize: { rowSpan: 1, colSpan: 1 },
  },
  spotify: {
    component: Spotify,
    label: "Spotify",
    description: "Currently playing track from Spotify — album art, title, artist, progress.",
    defaultSize: { rowSpan: 1, colSpan: 2 },
  },
};

/** Component map used by Grid for rendering. */
export const WIDGETS: Record<string, FC<WidgetProps>> = Object.fromEntries(
  Object.entries(WIDGET_REGISTRY).map(([k, v]) => [k, v.component]),
);

/** All registered type keys. */
export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);
