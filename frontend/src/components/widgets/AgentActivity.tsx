import { useCallback, useState } from "react";

import { useSse } from "../../lib/sse";
import type { AgentActivity as AgentActivityEvent, SseEvent } from "../../lib/types";
import type { WidgetProps } from "./registry";

const MAX_ITEMS = 5;

const PHASE_ICON: Record<string, string> = {
  thinking: "💭",
  tool: "⚙",
  responding: "💬",
  done: "✓",
};

interface ActivityEntry extends AgentActivityEvent {
  id: number;
}

let _nextId = 0;

export function AgentActivity(_props: WidgetProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  const handle = useCallback((event: SseEvent) => {
    if (event.type !== "agent_activity") return;
    const activity = event.payload as AgentActivityEvent;
    setEntries((prev) => [...prev, { ...activity, id: _nextId++ }].slice(-MAX_ITEMS));
  }, []);

  useSse(handle);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden p-1">
      <div className="mb-1 shrink-0 truncate text-[0.65rem] uppercase tracking-wide text-fg-faint">
        Assistant activity
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center text-xs text-fg-faint">Idle — nothing to show.</div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-hidden">
          {entries.map((entry, i) => {
            const isLast = i === entries.length - 1;
            return (
              <li
                key={entry.id}
                className={`flex items-center gap-1.5 overflow-hidden text-xs ${
                  isLast ? "text-fg" : "text-fg-faint"
                }`}
              >
                <span className="shrink-0 opacity-70">{PHASE_ICON[entry.phase] ?? "•"}</span>
                <span className="truncate">{entry.label}</span>
                {isLast && entry.phase !== "done" && (
                  <span className="ml-auto shrink-0 animate-pulse text-fg-faint">●</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
