import { useEffect, useRef } from "react";

import type { SseEvent } from "./types";

// Module-level singleton so all useSse subscribers share one EventSource.
// Multiple components calling useSse (e.g. useTheme + useEffectStyle + route)
// would otherwise open 3 concurrent long-lived connections and saturate the
// browser's 6-connection HTTP/1.1 pool for localhost.

type Handler = (event: SseEvent) => void;

let _source: EventSource | null = null;
let _attempt = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
const _subscribers = new Set<Handler>();

function _connect() {
  if (_source) return;
  _source = new EventSource("/api/events");

  _source.onopen = () => {
    _attempt = 0;
  };

  _source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as SseEvent;
      for (const h of _subscribers) h(parsed);
    } catch (e) {
      console.warn("SSE parse failed", e);
    }
  };

  _source.onerror = () => {
    _source?.close();
    _source = null;
    if (_subscribers.size === 0) return;
    const delayMs = Math.min(15_000, 500 * 2 ** _attempt);
    _attempt += 1;
    _retryTimer = setTimeout(_connect, delayMs);
  };
}

function _disconnect() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  _source?.close();
  _source = null;
  _attempt = 0;
}

function _subscribe(handler: Handler): () => void {
  _subscribers.add(handler);
  if (_subscribers.size === 1) _connect();
  return () => {
    _subscribers.delete(handler);
    if (_subscribers.size === 0) _disconnect();
  };
}

/** Subscribe to `/api/events`. Reconnects with exponential backoff.
 *  All callers share a single EventSource connection. */
export function useSse(onEvent: Handler): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    // Wrap in a stable closure so the same function reference is stored in the
    // subscriber set for the lifetime of this effect.
    const handler: Handler = (event) => handlerRef.current(event);
    return _subscribe(handler);
  }, []);
}
