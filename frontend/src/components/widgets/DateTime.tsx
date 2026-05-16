import { useEffect, useState } from "react";

import type { WidgetProps } from "./registry";

interface DateTimeConfig {
  format?: "12h" | "24h";
  show_seconds?: boolean;
}

export function DateTime({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const config = (widget.config as DateTimeConfig | undefined) ?? {};
  const hour12 = config.format === "12h";
  const showSeconds = config.show_seconds !== false;

  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" })
    .format(now)
    .toUpperCase();
  const day = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(now);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" })
    .format(now)
    .toUpperCase();
  const year = now.getFullYear();

  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  let suffix = "";
  if (hour12) {
    suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
  }
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return (
    <div
      className="anim-fade-in flex flex-col items-center justify-center text-center leading-none gap-3"
      key={`${weekday}-${day}`}
    >
      <div className="flex flex-col items-center gap-1">
        <div
          className="font-light tracking-[0.25em] text-fg-dim"
          style={{ fontSize: "clamp(0.6rem, 1vw, 0.85rem)" }}
        >
          {weekday}
        </div>
        <div
          className="font-light tracking-[0.15em] text-fg"
          style={{ fontSize: "clamp(0.75rem, 1.2vw, 1.05rem)" }}
        >
          {day} {month} {year}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-light tracking-tight tabular-nums"
          style={{ fontSize: "clamp(2.5rem, 7vw, 7rem)" }}
        >
          {hh}
          <span className="opacity-50">:</span>
          {mm}
        </span>
        {showSeconds && (
          <span
            className="font-light tabular-nums text-fg-soft"
            style={{ fontSize: "clamp(1rem, 2.2vw, 2rem)" }}
          >
            {ss}
          </span>
        )}
        {hour12 && (
          <span
            className="text-fg-faint tracking-widest"
            style={{ fontSize: "clamp(0.75rem, 1.2vw, 1rem)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
