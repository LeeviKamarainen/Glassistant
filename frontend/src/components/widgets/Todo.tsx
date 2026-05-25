import { useEffect, useRef, useState } from "react";

import { usePreview } from "../../lib/previewContext";
import { api } from "../../lib/api";
import { useSse } from "../../lib/sse";
import type { Todo as TodoItem, TodoConfig } from "../../lib/types";
import type { WidgetProps } from "./registry";

const REFRESH_MS = 5 * 60 * 1000;
const SCROLL_PX_PER_S = 30;
const PAUSE_AT_BOTTOM_MS = 1500;

function sortTodos(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.due_date === b.due_date) return a.id - b.id;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });
}

export function Todo({ widget }: WidgetProps) {
  const preview = usePreview();
  const config = (widget.config as TodoConfig | undefined) ?? {};
  const showDone = config.show_done ?? false;

  const [todos, setTodos] = useState<TodoItem[] | null>(() => {
    if (!preview) return null;
    const t0 = new Date().toISOString().slice(0, 10);
    const t1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return [
      { id: 1, name: "Buy groceries", description: "Milk, eggs, bread", due_date: t0, icon: "🛒", done: false, created_at: "", updated_at: "" },
      { id: 2, name: "Fix leaking tap", description: null, due_date: null, icon: "🔧", done: false, created_at: "", updated_at: "" },
      { id: 3, name: "Call insurance", description: null, due_date: t1, icon: "📞", done: false, created_at: "", updated_at: "" },
      { id: 4, name: "Pick up dry cleaning", description: null, due_date: null, icon: null, done: false, created_at: "", updated_at: "" },
    ];
  });
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const scrollRef = useRef({ top: 0, paused: false });

  async function load(signal?: AbortSignal) {
    try {
      const data = await api.getTodos(signal);
      setTodos(data);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useSse((event) => {
    if (!preview && event.type === "todos_changed") void load();
  });

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let controller = new AbortController();

    async function doLoad() {
      controller = new AbortController();
      try {
        const data = await api.getTodos(controller.signal);
        if (!cancelled) { setTodos(data); setError(null); }
      } catch (e) {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    doLoad();
    const id = setInterval(doLoad, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      controller.abort();
    };
  }, []);

  // Auto-scroll loop — restarts whenever todos list changes (reset to top)
  useEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) return;

    scrollRef.current = { top: 0, paused: false };
    container.scrollTop = 0;

    let lastTime: number | null = null;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;

    function tick(now: number) {
      if (!container || !list) return;

      if (lastTime === null) lastTime = now;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const maxScroll = list.scrollHeight - container.clientHeight;

      if (maxScroll > 0 && !scrollRef.current.paused) {
        scrollRef.current.top += SCROLL_PX_PER_S * dt;

        if (scrollRef.current.top >= maxScroll) {
          scrollRef.current.top = maxScroll;
          container.scrollTop = maxScroll;
          scrollRef.current.paused = true;
          lastTime = null;

          pauseTimer = setTimeout(() => {
            scrollRef.current.top = 0;
            container.scrollTop = 0;
            scrollRef.current.paused = false;
          }, PAUSE_AT_BOTTOM_MS);
        } else {
          container.scrollTop = scrollRef.current.top;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, [todos]);

  if (error) return <div className="text-red-300/80 text-sm">todos: {error}</div>;
  if (!todos) return <div className="text-fg-faint text-sm">loading…</div>;

  const today = new Date().toISOString().slice(0, 10);
  const filtered = showDone ? todos : todos.filter((t) => !t.done);
  const sorted = sortTodos(filtered);

  return (
    <div className="anim-fade-in self-stretch h-full w-full">
      <div
        ref={containerRef}
        className="todo-scroll h-full w-full"
        style={{ overflowY: "scroll" }}
      >
        <div ref={listRef} className="flex flex-col gap-3 px-2 py-2">
          {sorted.length === 0 && (
            <div className="text-fg-faint text-sm">No pending tasks</div>
          )}
          {sorted.map((todo) => {
            const overdue = todo.due_date != null && todo.due_date < today;
            const dueToday = todo.due_date === today;
            const dateClass = overdue || dueToday ? "text-accent" : "text-fg-faint";

            return (
              <div key={todo.id} className="flex items-start gap-2">
                {/* Icon */}
                <span
                  className="shrink-0 w-6 text-center leading-snug mt-0.5"
                  style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)" }}
                >
                  {todo.icon ?? "·"}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`leading-snug ${todo.done ? "line-through text-fg-faint" : "text-fg-soft"}`}
                      style={{ fontSize: "clamp(0.75rem, 1.3vw, 1rem)" }}
                    >
                      {todo.name}
                    </span>
                    {todo.due_date && (
                      <span
                        className={`${dateClass} shrink-0`}
                        style={{ fontSize: "clamp(0.6rem, 0.9vw, 0.78rem)" }}
                      >
                        {overdue && "⚠ "}{todo.due_date}
                      </span>
                    )}
                  </div>
                  {todo.description && (
                    <div
                      className="text-fg-faint truncate"
                      style={{ fontSize: "clamp(0.6rem, 0.85vw, 0.72rem)" }}
                    >
                      {todo.description}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
