import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { CustomWidget, CustomWidgetsPayload, SseEvent } from "./types";

export const CUSTOM_WIDGET_KEY_PREFIX = "ai_";

export function isCustomWidgetType(type: string): boolean {
  return type.startsWith(CUSTOM_WIDGET_KEY_PREFIX);
}

/** Subscribes to the AI-generated widget registry from /api/custom-widgets and
 *  keeps it in sync via custom_widgets_changed SSE events. */
export function useCustomWidgets() {
  const [widgets, setWidgets] = useState<CustomWidget[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getCustomWidgets().then(
      (data) => {
        if (!cancelled) setWidgets(data);
      },
      () => {
        /* leave empty */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useSse(
    useCallback((event: SseEvent) => {
      if (event.type !== "custom_widgets_changed") return;
      const payload = event.payload as CustomWidgetsPayload | undefined;
      if (payload?.widgets) setWidgets(payload.widgets);
    }, []),
  );

  const byKey = useMemo(() => {
    const map: Record<string, CustomWidget> = {};
    for (const w of widgets) map[w.key] = w;
    return map;
  }, [widgets]);

  return { widgets, byKey };
}
