import { useEffect, useState } from "react";

import type { WidgetProps } from "./registry";

export function DateW(_: WidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Re-render once a minute — plenty for date display.
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" })
    .format(now)
    .toUpperCase();
  const day = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(now);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" })
    .format(now)
    .toUpperCase();

  return (
    <div
      className="anim-fade-in flex flex-col items-center justify-center text-center leading-none"
      key={`${weekday}-${day}-${month}`}
    >
      <div
        className="font-light tracking-[0.3em] text-fg-dim"
        style={{ fontSize: "calc(clamp(0.65rem, 1.1vw, 1rem) * var(--font-scale, 1))" }}
      >
        {weekday}
      </div>
      <div
        className="font-light tabular-nums my-1.5"
        style={{ fontSize: "calc(clamp(2.5rem, 6vw, 6rem) * var(--font-scale, 1))" }}
      >
        {day}
      </div>
      <div
        className="font-light tracking-[0.3em] text-fg-dim"
        style={{ fontSize: "calc(clamp(0.65rem, 1.1vw, 1rem) * var(--font-scale, 1))" }}
      >
        {month}
      </div>
    </div>
  );
}
