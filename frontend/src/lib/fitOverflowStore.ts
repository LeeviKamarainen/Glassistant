/**
 * Tiny cross-tab store for widget overflow state.
 *
 * FitCell (on /mirror) calls reportOverflow() when it applies or removes a
 * scale transform. AdminGrid (on /admin) subscribes via useOverflowingWidgets()
 * and highlights widgets that are being shrunk to fit.
 *
 * Same-tab updates propagate immediately via a module-level listener Set.
 * Cross-tab updates propagate via the browser's storage event.
 */

const STORE_KEY = "gl_overflow_widgets";

const sameTabListeners = new Set<() => void>();

export function reportOverflow(widgetId: number, overflowing: boolean): void {
  const current = readSet();
  if (overflowing) {
    if (current.has(widgetId)) return; // no change
    current.add(widgetId);
  } else {
    if (!current.has(widgetId)) return; // no change
    current.delete(widgetId);
  }
  localStorage.setItem(STORE_KEY, JSON.stringify([...current]));
  sameTabListeners.forEach((fn) => fn());
}

function readSet(): Set<number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

import { useEffect, useState } from "react";

export function useOverflowingWidgets(): Set<number> {
  const [set, setSet] = useState(readSet);

  useEffect(() => {
    const refresh = () => setSet(readSet());
    sameTabListeners.add(refresh);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORE_KEY) refresh();
    };
    window.addEventListener("storage", storageHandler);
    return () => {
      sameTabListeners.delete(refresh);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  return set;
}
