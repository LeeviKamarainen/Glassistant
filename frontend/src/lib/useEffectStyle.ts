import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { SettingsPayload, SseEvent } from "./types";

export type EffectStyle = "calm" | "dynamic";
export const EFFECT_STYLES: EffectStyle[] = ["calm", "dynamic"];

function isEffectStyle(v: unknown): v is EffectStyle {
  return v === "calm" || v === "dynamic";
}

/** Active style for the ambient weather overlay. "calm" = CSS-only (default),
 *  "dynamic" = canvas-based particle system. Stored in /api/settings. */
export function useEffectStyle() {
  const [style, setStyle] = useState<EffectStyle>("calm");

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (data) => {
        if (cancelled) return;
        const s = data.settings.weather_effect_style;
        if (isEffectStyle(s)) setStyle(s);
      },
      () => {
        /* leave default */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useSse(
    useCallback((event: SseEvent) => {
      if (event.type !== "settings_changed") return;
      const payload = event.payload as SettingsPayload | undefined;
      const s = payload?.settings?.weather_effect_style;
      if (isEffectStyle(s)) setStyle(s);
    }, []),
  );

  const set = useCallback(async (next: EffectStyle) => {
    setStyle(next); // optimistic
    try {
      await api.setSetting("weather_effect_style", next);
    } catch {
      /* server will broadcast truth via SSE if our write failed */
    }
  }, []);

  return { style, set, options: EFFECT_STYLES };
}
