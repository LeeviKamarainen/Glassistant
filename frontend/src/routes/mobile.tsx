import { useCallback, useEffect, useState } from "react";

import { MobileGrid } from "../components/MobileGrid";
import { WIDGET_REGISTRY, WIDGET_TYPES } from "../components/widgets/registry";
import { api } from "../lib/api";
import { useSse } from "../lib/sse";
import { useEffectStyle } from "../lib/useEffectStyle";
import type { EffectStyle } from "../lib/useEffectStyle";
import { useTheme } from "../lib/useTheme";
import { useGridConfig } from "../lib/useGridConfig";
import { THEMES } from "../lib/themes";
import type { ThemeName } from "../lib/themes";
import type { Layout, SseEvent, Todo, Widget, WidgetCreate, WidgetUpdate } from "../lib/types";

type MobileTab = "layout" | "todos" | "countdown" | "theme" | "components";

interface CountdownConfig {
  label?: string;
  target_date?: string;
  show_time?: boolean;
}

export default function Mobile() {
  const theme = useTheme();
  const effectStyle = useEffectStyle();
  const gridConfig = useGridConfig();

  const [tab, setTab] = useState<MobileTab>("layout");
  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLayout(await api.getLayout());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useSse(
    useCallback((event: SseEvent) => {
      if (event.type === "layout_changed") {
        const payload = event.payload as Layout | undefined;
        if (payload?.widgets) setLayout(payload);
      }
    }, []),
  );

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const onUpdate = (id: number, data: WidgetUpdate) => run(() => api.updateWidget(id, data));
  const onDelete = (id: number) => run(() => api.deleteWidget(id));
  const onCreate = (data: WidgetCreate) => run(() => api.createWidget(data));
  const onReset = () => {
    if (!window.confirm("Reset layout to defaults?")) return;
    return run(() => api.resetLayout());
  };

  const countdownWidgets = layout?.widgets.filter((w) => w.type === "countdown") ?? [];

  return (
    <div className="min-h-screen w-full text-fg" style={{ background: "var(--theme-bg)" }}>
      {/* Sticky header + tab bar */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold">Glassistant</h1>
          <a href="/mirror" className="text-xs text-fg-faint underline">
            mirror
          </a>
        </div>
        <div
          className="flex overflow-x-auto border-t border-white/[0.06]"
          style={{ scrollbarWidth: "none" }}
        >
          {(["layout", "todos", "countdown", "theme", "components"] as MobileTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-2.5 text-sm capitalize transition ${
                tab === t
                  ? "border-b-2 border-white/70 text-fg"
                  : "text-fg-dim hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 pb-10">
        {error && (
          <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {tab === "layout" && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-wide text-fg-dim">Layout</h2>
              <button
                type="button"
                onClick={onReset}
                disabled={busy}
                className="rounded border border-white/20 px-3 py-1.5 text-sm text-fg-dim hover:bg-white/5 disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            {!layout ? (
              <div className="text-fg-faint text-sm">Loading…</div>
            ) : (
              <MobileGrid
                widgets={layout.widgets}
                gridRows={gridConfig.rows}
                gridCols={gridConfig.cols}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={(type, row, col, rowSpan, colSpan) =>
                  run(() => api.createWidget({ type, row, col, row_span: rowSpan, col_span: colSpan }))
                }
                busy={busy}
              />
            )}
          </section>
        )}

        {tab === "todos" && (
          <TodosTab busy={busy} setBusy={setBusy} setError={setError} />
        )}

        {tab === "countdown" && (
          <CountdownTab
            countdownWidgets={countdownWidgets}
            onUpdate={onUpdate}
            busy={busy}
          />
        )}

        {tab === "theme" && (
          <ThemeTab theme={theme} effectStyle={effectStyle} busy={busy} />
        )}

        {tab === "components" && (
          <ComponentsTab
            onCreate={onCreate}
            busy={busy}
            gridRows={gridConfig.rows}
            gridCols={gridConfig.cols}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Todos tab
// ---------------------------------------------------------------------------

const EMOJI_LIST = [
  // Tasks / organisation
  "✅", "📝", "📋", "📌", "📍", "🔖", "🗓️", "⏰", "⌛", "🔔",
  // Shopping
  "🛒", "🛍️", "🧾",
  // Home & chores
  "🏠", "🔧", "🔨", "🪛", "🧹", "🧺", "🛠️", "💡", "🪴", "🪣",
  // Food & groceries
  "🍎", "🥦", "🥛", "🥚", "🍞", "🧀", "🥗", "🍕", "☕",
  // Health & fitness
  "💊", "🏃", "🏋️", "🧘", "🩺", "❤️", "🩹", "🏥",
  // Finance
  "💰", "💳", "💵", "🏦",
  // Communication
  "📞", "📱", "💬", "📧",
  // Transport
  "🚗", "🚌", "✈️", "🚂", "🚲",
  // Work
  "💼", "💻", "🗂️", "📁", "📊",
  // Entertainment
  "🎬", "🎮", "📚", "🎵", "🎨", "🎯", "🎁",
  // People / social
  "👥", "👶", "🐕", "🐈",
  // Misc
  "⭐", "❗", "✨", "🔥", "🏆", "🎉", "🌟",
];

function TodosTab({
  busy,
  setBusy,
  setError,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", due_date: "", icon: "" });
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getTodos().then((data) => { if (!cancelled) setTodos(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useSse(
    useCallback((e: SseEvent) => {
      if (e.type === "todos_changed") {
        api.getTodos().then(setTodos).catch(() => {});
      }
    }, []),
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const todo = await api.createTodo({
        name: form.name.trim(),
        ...(form.description.trim() && { description: form.description.trim() }),
        ...(form.due_date && { due_date: form.due_date }),
        ...(form.icon.trim() && { icon: form.icon.trim() }),
      });
      setTodos((prev) => (prev ? [...prev, todo] : [todo]));
      setForm({ name: "", description: "", due_date: "", icon: "" });
      setIconPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(todo: Todo) {
    try {
      const updated = await api.updateTodo(todo.id, { done: !todo.done });
      setTodos((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
    } catch {
      // SSE will sync
    }
  }

  async function deleteTodo(id: number) {
    if (!window.confirm("Delete todo?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteTodo(id);
      setTodos((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = todos ? (showDone ? todos : todos.filter((t) => !t.done)) : [];
  const sorted = [...filtered].sort((a, b) => {
    if (a.due_date === b.due_date) return a.id - b.id;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });

  return (
    <div>
      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col gap-3"
      >
        <h2 className="text-sm uppercase tracking-wide text-fg-dim">New task</h2>
        <input
          type="text"
          placeholder="Task name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          className="rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg placeholder-fg-faint outline-none focus:border-white/40"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg placeholder-fg-faint outline-none focus:border-white/40"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            className="flex-1 rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg outline-none focus:border-white/40"
          />
          <button
            type="button"
            onClick={() => setIconPickerOpen((o) => !o)}
            className={`w-14 rounded border py-2.5 text-xl transition ${
              iconPickerOpen
                ? "border-white/40 bg-white/10"
                : form.icon
                  ? "border-white/20 bg-black"
                  : "border-white/10 bg-black text-fg-faint"
            }`}
            title="Pick an emoji icon"
          >
            {form.icon || "🏷️"}
          </button>
        </div>

        {iconPickerOpen && (
          <div className="rounded-lg border border-white/10 bg-black p-2">
            <div className="grid grid-cols-10 gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, icon: "" }));
                  setIconPickerOpen(false);
                }}
                className="flex items-center justify-center rounded p-1.5 text-sm text-fg-faint hover:bg-white/10 transition"
                title="Clear icon"
              >
                ✕
              </button>
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, icon: emoji }));
                    setIconPickerOpen(false);
                  }}
                  className={`flex items-center justify-center rounded p-1.5 text-xl hover:bg-white/15 transition ${
                    form.icon === emoji ? "bg-white/15 ring-1 ring-white/30" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !form.name.trim()}
          className="rounded bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
        >
          Add task
        </button>
      </form>

      {/* List header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wide text-fg-dim">
          Tasks{todos !== null ? ` (${sorted.length})` : ""}
        </h2>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-dim">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show done
        </label>
      </div>

      {!todos ? (
        <div className="text-fg-faint text-sm">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="text-fg-faint text-sm">No tasks</div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((todo) => {
            const overdue = todo.due_date !== null && todo.due_date < today;
            const dueToday = todo.due_date === today;
            return (
              <li
                key={todo.id}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <button
                  type="button"
                  onClick={() => void toggleDone(todo)}
                  className="mt-0.5 shrink-0 text-lg leading-none text-fg-dim hover:text-fg transition-colors"
                  aria-label={todo.done ? "Mark undone" : "Mark done"}
                >
                  {todo.done ? "✓" : "○"}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {todo.icon && <span>{todo.icon}</span>}
                    <span
                      className={`text-sm ${todo.done ? "line-through text-fg-faint" : "text-fg"}`}
                    >
                      {todo.name}
                    </span>
                    {todo.due_date && (
                      <span
                        className={`shrink-0 text-xs ${
                          overdue || dueToday ? "text-accent" : "text-fg-faint"
                        }`}
                      >
                        {overdue && "⚠ "}
                        {todo.due_date}
                      </span>
                    )}
                  </div>
                  {todo.description && (
                    <div className="mt-0.5 text-xs text-fg-faint">{todo.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void deleteTodo(todo.id)}
                  disabled={busy}
                  className="shrink-0 text-xl leading-none text-red-300/40 hover:text-red-300 transition-colors disabled:opacity-30"
                  aria-label="Delete"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countdown tab
// ---------------------------------------------------------------------------

function CountdownTab({
  countdownWidgets,
  onUpdate,
  busy,
}: {
  countdownWidgets: Widget[];
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  busy: boolean;
}) {
  return (
    <div>
      <h2 className="mb-4 text-sm uppercase tracking-wide text-fg-dim">Countdown</h2>
      {countdownWidgets.length === 0 ? (
        <p className="text-sm text-fg-faint">
          No countdown widgets in layout. Add one in the Layout tab first.
        </p>
      ) : (
        <div className="space-y-4">
          {countdownWidgets.map((widget) => (
            <CountdownForm key={widget.id} widget={widget} onUpdate={onUpdate} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

function CountdownForm({
  widget,
  onUpdate,
  busy,
}: {
  widget: Widget;
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  busy: boolean;
}) {
  const config = (widget.config as CountdownConfig) ?? {};
  const [label, setLabel] = useState(config.label ?? "");
  const [targetDate, setTargetDate] = useState(config.target_date ?? "");
  const [showTime, setShowTime] = useState(config.show_time ?? false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await onUpdate(widget.id, {
      config: {
        ...(label && { label }),
        ...(targetDate && { target_date: targetDate }),
        show_time: showTime,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <div className="text-xs text-fg-faint uppercase tracking-wide">
        Widget #{widget.id}
      </div>
      <input
        type="text"
        placeholder="Event label (e.g. Summer)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg placeholder-fg-faint outline-none focus:border-white/40"
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-faint uppercase tracking-wide">Target date</span>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg outline-none focus:border-white/40"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-dim">
        <input
          type="checkbox"
          checked={showTime}
          onChange={(e) => setShowTime(e.target.checked)}
        />
        Show hours / minutes
      </label>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="rounded bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
      >
        {saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme tab
// ---------------------------------------------------------------------------

function ThemeTab({
  theme,
  effectStyle,
  busy,
}: {
  theme: ReturnType<typeof useTheme>;
  effectStyle: ReturnType<typeof useEffectStyle>;
  busy: boolean;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wide text-fg-dim">Theme</h2>
        <div className="flex flex-wrap gap-2">
          {theme.options.map((opt) => {
            const t = THEMES[opt as ThemeName];
            return (
              <button
                key={opt}
                type="button"
                onClick={() => void theme.set(opt as ThemeName)}
                disabled={busy || theme.name === opt}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                  theme.name === opt
                    ? "border-white/60 bg-white/5"
                    : "border-white/10 hover:bg-white/5"
                } disabled:cursor-default`}
              >
                <span
                  className="h-5 w-5 rounded-full border border-white/20 shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                  }}
                />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wide text-fg-dim">Weather effect</h2>
        <div className="flex gap-2">
          {effectStyle.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => void effectStyle.set(opt as EffectStyle)}
              disabled={busy || effectStyle.style === opt}
              className={`rounded-lg border px-4 py-2.5 text-sm capitalize transition ${
                effectStyle.style === opt
                  ? "border-white/60 bg-white/5"
                  : "border-white/10 hover:bg-white/5"
              } disabled:cursor-default`}
            >
              {opt}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Components tab
// ---------------------------------------------------------------------------

function ComponentsTab({
  onCreate,
  busy,
  gridRows,
  gridCols,
}: {
  onCreate: (data: WidgetCreate) => Promise<unknown>;
  busy: boolean;
  gridRows: number;
  gridCols: number;
}) {
  const [query, setQuery] = useState("");
  const [expanding, setExpanding] = useState<string | null>(null);

  const filtered = WIDGET_TYPES.filter((key) => {
    const meta = WIDGET_REGISTRY[key]!;
    const q = query.toLowerCase();
    return (
      key.includes(q) ||
      meta.label.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <input
        type="search"
        placeholder="Search components…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full rounded border border-white/10 bg-black px-3 py-2.5 text-sm text-fg placeholder-fg-faint outline-none focus:border-white/40"
      />

      {filtered.length === 0 ? (
        <div className="text-sm text-fg-faint">No components match "{query}".</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((key) => {
            const meta = WIDGET_REGISTRY[key]!;
            return (
              <ComponentCard
                key={key}
                typeKey={key}
                label={meta.label}
                description={meta.description}
                defaultRowSpan={meta.defaultSize.rowSpan}
                defaultColSpan={meta.defaultSize.colSpan}
                expanded={expanding === key}
                onExpand={() => setExpanding(expanding === key ? null : key)}
                onAdd={async (create) => {
                  await onCreate(create);
                  setExpanding(null);
                }}
                disabled={busy}
                gridRows={gridRows}
                gridCols={gridCols}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComponentCard({
  typeKey,
  label,
  description,
  defaultRowSpan,
  defaultColSpan,
  expanded,
  onExpand,
  onAdd,
  disabled,
  gridRows,
  gridCols,
}: {
  typeKey: string;
  label: string;
  description: string;
  defaultRowSpan: number;
  defaultColSpan: number;
  expanded: boolean;
  onExpand: () => void;
  onAdd: (w: WidgetCreate) => Promise<void>;
  disabled: boolean;
  gridRows: number;
  gridCols: number;
}) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-fg">{label}</span>
            <span className="text-[10px] uppercase tracking-widest text-fg-dim">{typeKey}</span>
          </div>
          <div className="mt-0.5 text-xs text-fg-faint leading-relaxed">{description}</div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          disabled={disabled}
          className={`shrink-0 rounded border px-3 py-1.5 text-sm transition ${
            expanded
              ? "border-white/40 bg-white/10 text-fg"
              : "border-white/20 text-fg-dim hover:border-white/40 hover:text-fg"
          } disabled:opacity-40`}
        >
          {expanded ? "Cancel" : "+ Add"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-3 flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="uppercase tracking-wide text-fg-faint">Row</span>
              <input
                type="number"
                value={row}
                min={0}
                max={gridRows - 1}
                onChange={(e) => setRow(Number(e.target.value))}
                className="rounded border border-white/10 bg-black px-2 py-2 text-sm text-fg outline-none focus:border-white/40"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="uppercase tracking-wide text-fg-faint">Col</span>
              <input
                type="number"
                value={col}
                min={0}
                max={gridCols - 1}
                onChange={(e) => setCol(Number(e.target.value))}
                className="rounded border border-white/10 bg-black px-2 py-2 text-sm text-fg outline-none focus:border-white/40"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void onAdd({
                type: typeKey,
                row,
                col,
                row_span: defaultRowSpan,
                col_span: defaultColSpan,
              })
            }
            className="rounded bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
          >
            Add {label} ({defaultRowSpan}×{defaultColSpan})
          </button>
        </div>
      )}
    </div>
  );
}
