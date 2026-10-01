import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { SettingsPayload, SseEvent } from "./types";

export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 3.0;
export const FONT_SCALE_STEP = 0.05;
const DEFAULT_SCALE = 1.0;

function parseScale(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : NaN;
  if (isNaN(n)) return null;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

/** Reads/sets the mirror font scale. Applies --font-scale on :root and
 *  persists via /api/settings. Synced to all clients via SSE. */
export function useFontScale() {
  const [scale, setScale] = useState<number>(DEFAULT_SCALE);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (data) => {
        if (cancelled) return;
        const parsed = parseScale(data.settings.font_scale);
        if (parsed !== null) setScale(parsed);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useSse(
    useCallback((event: SseEvent) => {
      if (event.type !== "settings_changed") return;
      const payload = event.payload as SettingsPayload | undefined;
      const parsed = parseScale(payload?.settings?.font_scale);
      if (parsed !== null) setScale(parsed);
    }, []),
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(scale));
  }, [scale]);

  const set = useCallback(async (next: number) => {
    const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next));
    const rounded = Math.round(clamped / FONT_SCALE_STEP) * FONT_SCALE_STEP;
    setScale(rounded);
    try {
      await api.setSetting("font_scale", String(rounded));
    } catch {
      /* server broadcasts truth via SSE on failure */
    }
  }, []);

  return { scale, set };
}
