import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { useSse } from "./sse";
import type { SettingsPayload, SseEvent } from "./types";

export interface GridConfig {
  rows: number;
  cols: number;
}

const DEFAULTS: GridConfig = { rows: 12, cols: 7 };

function parse(settings: Record<string, string>): GridConfig {
  const rows = parseInt(settings["grid_rows"] ?? "", 10);
  const cols = parseInt(settings["grid_cols"] ?? "", 10);
  return {
    rows: Number.isFinite(rows) && rows > 0 ? rows : DEFAULTS.rows,
    cols: Number.isFinite(cols) && cols > 0 ? cols : DEFAULTS.cols,
  };
}

export function useGridConfig() {
  const [config, setConfig] = useState<GridConfig>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (data) => {
        if (!cancelled) setConfig(parse(data.settings));
      },
      () => { /* leave defaults */ },
    );
    return () => { cancelled = true; };
  }, []);

  useSse(
    useCallback((event: SseEvent) => {
      if (event.type !== "settings_changed") return;
      const payload = event.payload as SettingsPayload | undefined;
      if (payload?.settings) setConfig(parse(payload.settings));
    }, []),
  );

  const setRows = useCallback(async (rows: number) => {
    setConfig((c) => ({ ...c, rows }));
    try {
      await api.setSetting("grid_rows", String(rows));
    } catch { /* SSE will reconcile */ }
  }, []);

  const setCols = useCallback(async (cols: number) => {
    setConfig((c) => ({ ...c, cols }));
    try {
      await api.setSetting("grid_cols", String(cols));
    } catch { /* SSE will reconcile */ }
  }, []);

  return { ...config, setRows, setCols };
}
