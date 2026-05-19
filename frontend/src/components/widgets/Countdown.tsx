import { useEffect, useState } from "react";

import { usePreview } from "../../lib/previewContext";
import type { WidgetProps } from "./registry";

interface CountdownConfig {
  label?: string;
  target_date?: string; // "YYYY-MM-DD"
  show_time?: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function Countdown({ widget }: WidgetProps) {
  const preview = usePreview();
  const config = (widget.config as CountdownConfig | undefined) ?? {};
  const label = config.label ?? "Event";
  const showTime = config.show_time ?? false;

  const targetDate = preview
    ? new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10)
    : (config.target_date ?? "");

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), showTime ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [showTime]);

  if (!targetDate) {
    return (
      <div className="text-fg-faint text-sm">
        Set <code>target_date</code> in config
      </div>
    );
  }

  const target = new Date(targetDate + "T00:00:00");
  const diffMs = target.getTime() - now.getTime();
  const isPast = diffMs < 0;
  const absDiffS = Math.floor(Math.abs(diffMs) / 1000);
  const days = Math.floor(absDiffS / 86_400);
  const hours = Math.floor((absDiffS % 86_400) / 3600);
  const minutes = Math.floor((absDiffS % 3600) / 60);
  const seconds = absDiffS % 60;

  return (
    <div className="anim-fade-in flex flex-col items-center justify-center leading-none gap-1.5">
      <div
        className="text-fg-dim tracking-widest uppercase"
        style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.75rem)" }}
      >
        {isPast ? "since" : "until"}
      </div>
      <div
        className="text-fg-soft tracking-wider text-center"
        style={{ fontSize: "clamp(0.7rem, 1.15vw, 0.95rem)" }}
      >
        {label.toUpperCase()}
      </div>
      <div
        className="font-light tabular-nums text-fg mt-1"
        style={{ fontSize: "clamp(3rem, 8vw, 7rem)" }}
      >
        {days}
      </div>
      <div
        className="text-fg-dim tracking-widest"
        style={{ fontSize: "clamp(0.55rem, 0.85vw, 0.75rem)" }}
      >
        {isPast ? "DAYS AGO" : "DAYS"}
      </div>
      {showTime && days === 0 && (
        <div
          className="text-fg-soft tabular-nums font-light mt-1"
          style={{ fontSize: "clamp(1rem, 2vw, 1.8rem)" }}
        >
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </div>
      )}
      {showTime && days > 0 && (
        <div
          className="text-fg-faint tabular-nums mt-0.5"
          style={{ fontSize: "clamp(0.65rem, 1vw, 0.85rem)" }}
        >
          {pad(hours)}h {pad(minutes)}m
        </div>
      )}
    </div>
  );
}
