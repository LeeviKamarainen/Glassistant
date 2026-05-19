import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Grid } from "../components/Grid";
import { WeatherEffect } from "../components/WeatherEffect";
import { api } from "../lib/api";
import { useSse } from "../lib/sse";
import { useEffectStyle } from "../lib/useEffectStyle";
import { THEMES } from "../lib/themes";
import { useTheme } from "../lib/useTheme";
import { useGridConfig } from "../lib/useGridConfig";
import type { Layout, SseEvent } from "../lib/types";

export default function Mirror() {
  const theme = useTheme();
  const effectStyle = useEffectStyle();
  const gridConfig = useGridConfig();

  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetRects, setWidgetRects] = useState<DOMRect[]>([]);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setLayout(await api.getLayout());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useSse(
    useCallback(
      (event: SseEvent) => {
        if (event.type === "layout_changed") {
          const payload = event.payload as Layout | undefined;
          if (payload?.widgets) setLayout(payload);
          else refresh();
        }
      },
      [refresh],
    ),
  );

  const measureWidgets = useCallback(() => {
    if (!gridContainerRef.current) return;
    const cells = gridContainerRef.current.querySelectorAll("[data-widget-cell]");
    setWidgetRects(Array.from(cells).map((el) => el.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    measureWidgets();
  }, [layout, measureWidgets]);

  useEffect(() => {
    window.addEventListener("resize", measureWidgets);
    return () => window.removeEventListener("resize", measureWidgets);
  }, [measureWidgets]);

  const ambient = useMemo(() => {
    const w = layout?.widgets.find((x) => x.type === "weather" && x.enabled);
    const cfg = w?.config as { lat?: number; lon?: number } | undefined;
    return { lat: cfg?.lat, lon: cfg?.lon };
  }, [layout]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <WeatherEffect
        lat={ambient.lat}
        lon={ambient.lon}
        style={effectStyle.style}
        themeAccent={THEMES[theme.name].accent}
        widgetRects={widgetRects}
      />

      <div ref={gridContainerRef} className="relative z-10 h-full w-full">
        {error && (
          <div className="absolute top-2 left-2 text-red-300/70 text-xs">
            {error}
          </div>
        )}
        {layout && (
          <Grid
            widgets={layout.widgets}
            gridRows={gridConfig.rows}
            gridCols={gridConfig.cols}
          />
        )}
      </div>
    </div>
  );
}
