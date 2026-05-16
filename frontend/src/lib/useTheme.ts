import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { SettingsPayload, SseEvent } from "./types";
import { applyTheme, isThemeName, THEME_NAMES } from "./themes";
import type { ThemeName } from "./themes";

const DEFAULT: ThemeName = "mirror";

/** Subscribes to the active theme from /api/settings and applies it as CSS
 *  variables on :root. Returns a setter that persists via /api/settings/theme. */
export function useTheme() {
  const [name, setName] = useState<ThemeName>(DEFAULT);

  // Fetch once on mount.
  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (data) => {
        if (cancelled) return;
        const t = data.settings.theme;
        if (isThemeName(t)) setName(t);
      },
      () => {
        /* leave default */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Update from SSE settings_changed events.
  useSse(
    useCallback((event: SseEvent) => {
      if (event.type !== "settings_changed") return;
      const payload = event.payload as SettingsPayload | undefined;
      const t = payload?.settings?.theme;
      if (isThemeName(t)) setName(t);
    }, []),
  );

  // Apply to :root whenever the active theme changes.
  useEffect(() => {
    applyTheme(name);
  }, [name]);

  const set = useCallback(async (next: ThemeName) => {
    setName(next); // optimistic; SSE confirms or correction
    try {
      await api.setSetting("theme", next);
    } catch {
      // Server will broadcast the truth via SSE if our write failed.
    }
  }, []);

  return { name, set, options: THEME_NAMES };
}
