import { useCallback, useEffect, useState } from "react";

import { usePreview } from "../../lib/previewContext";
import { api } from "../../lib/api";
import type { CalendarEvent, CalendarWeekResponse } from "../../lib/types";
import type { WidgetProps } from "./registry";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;

function getMondayIso(): string {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getWeekDays(mondayIso: string): string[] {
  const base = new Date(mondayIso + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  });
}

function localDateOf(event: CalendarEvent): string {
  if (event.all_day) return event.start.slice(0, 10);
  const dt = new Date(event.start);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, "0"),
    String(dt.getDate()).padStart(2, "0"),
  ].join("-");
}

function localTimeOf(event: CalendarEvent): string | null {
  if (event.all_day) return null;
  const dt = new Date(event.start);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const day = localDateOf(ev);
    const bucket = map.get(day);
    if (bucket) bucket.push(ev);
    else map.set(day, [ev]);
  }
  return map;
}

function makeMockCalendarData(weekStart: string): CalendarWeekResponse {
  const days = getWeekDays(weekStart);
  return {
    authorized: true,
    events: [
      { id: "p1", summary: "Team standup", start: `${days[0]}T09:00:00`, end: `${days[0]}T09:30:00`, all_day: false, color: null },
      { id: "p2", summary: "Code review", start: `${days[1]}T11:00:00`, end: `${days[1]}T12:00:00`, all_day: false, color: null },
      { id: "p3", summary: "Dentist", start: `${days[2]}T14:00:00`, end: `${days[2]}T15:00:00`, all_day: false, color: null },
      { id: "p4", summary: "Gym", start: `${days[3]}T07:00:00`, end: `${days[3]}T08:00:00`, all_day: false, color: null },
      { id: "p5", summary: "Weekend", start: days[5]!, end: days[5]!, all_day: true, color: null },
    ] as CalendarEvent[],
  };
}

export function Calendar(_props: WidgetProps) {
  const preview = usePreview();
  const [weekStart, setWeekStart] = useState(getMondayIso);
  const [data, setData] = useState<CalendarWeekResponse | null>(
    preview ? makeMockCalendarData(getMondayIso()) : null,
  );
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (signal?: AbortSignal) => {
    if (preview) return;
    const ws = getMondayIso();
    setWeekStart(ws);
    try {
      const result = await api.getCalendarEvents(ws, signal);
      setData(result);
      setError(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    const ctrl = new AbortController();
    fetchEvents(ctrl.signal);
    const id = setInterval(() => fetchEvents(ctrl.signal), 5 * 60 * 1000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, [fetchEvents, preview]);

  if (!data && !error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-faint">
        Loading…
      </div>
    );
  }

  if (!data?.authorized) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-fg-faint">
        <span className="text-sm">Calendar not connected</span>
        <span className="text-xs opacity-60">Authorize in admin panel</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = getWeekDays(weekStart);
  const byDay = groupByDay(data.events);

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "rgba(255,255,255,0.06)" }}>
      {days.map((day, i) => {
        const isToday = day === today;
        const events = byDay.get(day) ?? [];
        const overflow = events.length - MAX_VISIBLE;
        const dateNum = parseInt(day.slice(8), 10);

        return (
          <div
            key={day}
            className="flex flex-col overflow-hidden"
            style={{
              padding: "clamp(4px, 0.6vw, 10px)",
              background: isToday ? "rgba(255,255,255,0.07)" : "var(--theme-bg)",
            }}
          >
            {/* Header */}
            <div className="mb-1 shrink-0">
              <div
                className="text-xs uppercase tracking-widest leading-none"
                style={{
                  fontSize: "clamp(0.45rem, 0.9vw, 0.65rem)",
                  color: isToday ? "var(--theme-accent)" : "var(--theme-fg-dim)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {DAY_NAMES[i]}
              </div>
              <div
                className="leading-none"
                style={{
                  fontSize: "clamp(0.85rem, 1.6vw, 1.4rem)",
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--theme-fg)" : "var(--theme-fg-dim)",
                  marginTop: "2px",
                }}
              >
                {dateNum}
              </div>
            </div>

            {/* Event list */}
            <div className="flex flex-col gap-px overflow-hidden">
              {events.slice(0, MAX_VISIBLE).map((ev) => {
                const t = localTimeOf(ev);
                return (
                  <div
                    key={ev.id}
                    className="overflow-hidden text-ellipsis whitespace-nowrap rounded"
                    style={{
                      fontSize: "clamp(0.4rem, 0.75vw, 0.6rem)",
                      padding: "1px 3px",
                      color: isToday ? "var(--theme-fg)" : "var(--theme-fg-dim)",
                      background: "rgba(255,255,255,0.05)",
                    }}
                    title={ev.summary}
                  >
                    {t && (
                      <span style={{ opacity: 0.65, marginRight: "2px" }}>{t}</span>
                    )}
                    {ev.summary}
                  </div>
                );
              })}
              {overflow > 0 && (
                <div
                  className="text-fg-faint"
                  style={{ fontSize: "clamp(0.38rem, 0.7vw, 0.55rem)", padding: "1px 3px" }}
                >
                  +{overflow} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
