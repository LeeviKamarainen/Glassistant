import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { SettingsPayload, SseEvent } from "./types";

/** Whether to show the subtle cell background behind each widget on /mirror.
 *  Stored as "true"/"false" in app_settings. */
export function useWidgetBorders() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (data) => {
        if (cancelled) return;
        const v = data.settings.show_widget_borders;
        if (v !== undefined) setShow(v !== "false");
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
      const v = payload?.settings?.show_widget_borders;
      if (v !== undefined) setShow(v !== "false");
    }, []),
  );

  const set = useCallback(async (next: boolean) => {
    setShow(next);
    try {
      await api.setSetting("show_widget_borders", next ? "true" : "false");
    } catch {
      /* server broadcasts truth via SSE on failure */
    }
  }, []);

  return { show, set };
}
