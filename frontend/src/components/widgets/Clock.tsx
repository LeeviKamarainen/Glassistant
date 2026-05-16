import { useEffect, useState } from "react";

import type { WidgetProps } from "./registry";

interface ClockConfig {
  format?: "12h" | "24h";
  show_seconds?: boolean;
}

export function Clock({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const config = (widget.config as ClockConfig | undefined) ?? {};
  const hour12 = config.format === "12h";
  const showSeconds = config.show_seconds !== false; // default on

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
    <div className="flex items-baseline gap-1.5 leading-none">
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
  );
}
