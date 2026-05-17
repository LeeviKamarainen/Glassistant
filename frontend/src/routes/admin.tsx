import { useCallback, useEffect, useState } from "react";

import { AdminGrid } from "../components/AdminGrid";
import { WeatherEffect } from "../components/WeatherEffect";
import { WIDGET_REGISTRY, WIDGET_TYPES } from "../components/widgets/registry";
import type { WeatherCondition } from "../components/widgets/weather/icons";
import { api } from "../lib/api";
import { useSse } from "../lib/sse";
import { useEffectStyle } from "../lib/useEffectStyle";
import type { EffectStyle } from "../lib/useEffectStyle";
import { useTheme } from "../lib/useTheme";
import { THEMES } from "../lib/themes";
import type { ThemeName } from "../lib/themes";
import { useGridConfig } from "../lib/useGridConfig";
import type { Layout, SseEvent, Widget, WidgetCreate, WidgetUpdate } from "../lib/types";

type AdminTab = "layout" | "components";

export default function Admin() {
  const theme = useTheme();
  const effectStyle = useEffectStyle();
  const gridConfig = useGridConfig();

  const [activeTab, setActiveTab] = useState<AdminTab>("layout");
  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCondition, setPreviewCondition] = useState<WeatherCondition | "off">("off");

  // Local pending state for grid config edits
  const [pendingRows, setPendingRows] = useState(gridConfig.rows);
  const [pendingCols, setPendingCols] = useState(gridConfig.cols);

  useEffect(() => {
    setPendingRows(gridConfig.rows);
    setPendingCols(gridConfig.cols);
  }, [gridConfig.rows, gridConfig.cols]);

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

  const onCreate = (data: WidgetCreate) => run(() => api.createWidget(data));
  const onUpdate = (id: number, data: WidgetUpdate) =>
    run(() => api.updateWidget(id, data));
  const onDelete = (id: number) => run(() => api.deleteWidget(id));
  const onReset = () => {
    if (!window.confirm("Reset layout to defaults?")) return;
    return run(() => api.resetLayout());
  };
  const onSaveGrid = () =>
    run(async () => {
      if (pendingRows !== gridConfig.rows) await gridConfig.setRows(pendingRows);
      if (pendingCols !== gridConfig.cols) await gridConfig.setCols(pendingCols);
      return undefined as unknown as Layout;
    });

  const gridDirty = pendingRows !== gridConfig.rows || pendingCols !== gridConfig.cols;

  return (
    <div className="relative min-h-screen w-full text-fg" style={{ backgroundColor: "var(--theme-bg)" }}>
      {previewCondition !== "off" && (
        <WeatherEffect
          forceCondition={previewCondition}
          style={effectStyle.style}
          themeAccent={THEMES[theme.name].accent}
        />
      )}

      <div className="relative z-10 mx-auto max-w-3xl p-4 sm:p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Glassistant admin</h1>
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            className="rounded-md border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Reset layout
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">Theme</h2>
          <div className="flex flex-wrap gap-2">
            {theme.options.map((opt) => (
              <ThemeSwatch
                key={opt}
                name={opt}
                active={theme.name === opt}
                onSelect={theme.set}
                disabled={busy}
              />
            ))}
          </div>
        </section>

        {/* Weather effect style */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">
            Weather effect style
          </h2>
          <div className="flex flex-wrap gap-2">
            {effectStyle.options.map((opt) => (
              <EffectStyleButton
                key={opt}
                value={opt}
                active={effectStyle.style === opt}
                onSelect={effectStyle.set}
                disabled={busy}
              />
            ))}
          </div>
        </section>

        {/* Grid configuration */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">Grid size</h2>
          <div className="flex flex-wrap items-end gap-3">
            <NumberInput
              label="Rows"
              value={pendingRows}
              onChange={setPendingRows}
              min={1}
              max={50}
            />
            <NumberInput
              label="Cols"
              value={pendingCols}
              onChange={setPendingCols}
              min={1}
              max={50}
            />
            <button
              type="button"
              onClick={onSaveGrid}
              disabled={busy || !gridDirty}
              className="rounded-md border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-30"
            >
              Save
            </button>
            {!gridDirty && (
              <span className="text-xs text-fg-faint">
                {gridConfig.rows}r × {gridConfig.cols}c
              </span>
            )}
          </div>
        </section>

        {/* Preview weather effect */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">
            Preview weather effect
          </h2>
          <p className="mb-2 text-xs text-fg-faint">
            Toggle the ambient overlay on this page to see how each condition feels with the current theme.
          </p>
          <select
            value={previewCondition}
            onChange={(e) =>
              setPreviewCondition(e.target.value as WeatherCondition | "off")
            }
            className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
          >
            <option value="off">Off (use real weather on /mirror)</option>
            <option value="clear">Clear</option>
            <option value="partly-cloudy">Partly cloudy</option>
            <option value="cloudy">Cloudy</option>
            <option value="fog">Fog</option>
            <option value="rain">Rain</option>
            <option value="storm">Storm</option>
            <option value="snow">Snow</option>
          </select>
        </section>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 border-b border-white/10">
          {(["layout", "components"] as AdminTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize transition ${
                activeTab === tab
                  ? "border-b-2 border-white/70 text-fg"
                  : "text-fg-dim hover:text-fg"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "layout" && (
          <>
            {layout && (
              <section className="mb-8">
                <h2 className="mb-4 text-sm uppercase tracking-wide text-fg-dim">
                  Layout editor
                </h2>
                <AdminGrid
                  widgets={layout.widgets}
                  gridRows={gridConfig.rows}
                  gridCols={gridConfig.cols}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  busy={busy}
                />
              </section>
            )}

            <section className="mb-8">
              <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">Add widget</h2>
              <AddWidgetForm
                onSubmit={onCreate}
                disabled={busy}
                gridRows={gridConfig.rows}
                gridCols={gridConfig.cols}
              />
            </section>

            <section>
              <h2 className="mb-2 text-sm uppercase tracking-wide text-fg-dim">All widgets</h2>
              {!layout ? (
                <div className="text-fg-faint">Loading…</div>
              ) : layout.widgets.length === 0 ? (
                <div className="text-fg-faint">No widgets. Add one above.</div>
              ) : (
                <ul className="space-y-2">
                  {layout.widgets.map((w) => (
                    <WidgetRow
                      key={w.id}
                      widget={w}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      disabled={busy}
                      gridRows={gridConfig.rows}
                      gridCols={gridConfig.cols}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {activeTab === "components" && (
          <ComponentBrowser
            onAdd={onCreate}
            disabled={busy}
            gridRows={gridConfig.rows}
            gridCols={gridConfig.cols}
          />
        )}

        <footer className="mt-10 text-xs text-fg-faint">
          Mirror view: <a className="underline" href="/mirror">/mirror</a>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component browser
// ---------------------------------------------------------------------------

function ComponentBrowser({
  onAdd,
  disabled,
  gridRows,
  gridCols,
}: {
  onAdd: (w: WidgetCreate) => Promise<unknown>;
  disabled: boolean;
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
        className="mb-6 w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-fg placeholder-fg-faint outline-none focus:border-white/40"
      />

      {filtered.length === 0 ? (
        <div className="text-fg-faint text-sm">No components match "{query}".</div>
      ) : (
        <div className="flex flex-col gap-6">
          {filtered.map((key) => {
            const meta = WIDGET_REGISTRY[key]!;
            return (
              <ComponentCard
                key={key}
                typeKey={key}
                meta={meta}
                expanded={expanding === key}
                onExpand={() => setExpanding(expanding === key ? null : key)}
                onAdd={async (create) => {
                  await onAdd(create);
                  setExpanding(null);
                }}
                disabled={disabled}
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
  meta,
  expanded,
  onExpand,
  onAdd,
  disabled,
  gridRows,
  gridCols,
}: {
  typeKey: string;
  meta: (typeof WIDGET_REGISTRY)[string];
  expanded: boolean;
  onExpand: () => void;
  onAdd: (w: WidgetCreate) => Promise<void>;
  disabled: boolean;
  gridRows: number;
  gridCols: number;
}) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [rowSpan, setRowSpan] = useState(meta.defaultSize.rowSpan);
  const [colSpan, setColSpan] = useState(meta.defaultSize.colSpan);

  useEffect(() => {
    if (expanded) {
      setRowSpan(meta.defaultSize.rowSpan);
      setColSpan(meta.defaultSize.colSpan);
    }
  }, [expanded, meta.defaultSize.rowSpan, meta.defaultSize.colSpan]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAdd({ type: typeKey, row, col, row_span: rowSpan, col_span: colSpan });
  };

  const Component = meta.component;
  const mockWidget: Widget = {
    id: -1,
    type: typeKey,
    row: 0,
    col: 0,
    row_span: meta.defaultSize.rowSpan,
    col_span: meta.defaultSize.colSpan,
    config: {},
    enabled: true,
    z_order: 0,
    created_at: "",
    updated_at: "",
  };

  const previewHeight = meta.defaultSize.rowSpan * 180;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <div
        className="flex items-center justify-center w-full overflow-hidden bg-black/60 p-8"
        style={{ minHeight: previewHeight }}
      >
        <Component widget={mockWidget} />
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-fg">{meta.label}</span>
              <span className="text-[10px] uppercase tracking-widest text-fg-dim">
                {typeKey} · {meta.defaultSize.rowSpan}×{meta.defaultSize.colSpan}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-fg-faint leading-relaxed">
              {meta.description}
            </div>
          </div>
          <button
            type="button"
            onClick={onExpand}
            disabled={disabled}
            className={`shrink-0 rounded-md border px-3 py-1 text-sm transition ${
              expanded
                ? "border-white/40 bg-white/10 text-fg"
                : "border-white/20 text-fg-dim hover:border-white/40 hover:text-fg"
            } disabled:opacity-40`}
          >
            {expanded ? "Cancel" : "+ Add"}
          </button>
        </div>

        {expanded && (
          <form
            onSubmit={submit}
            className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3"
          >
            <NumberInput label="Row" value={row} onChange={setRow} max={gridRows - 1} />
            <NumberInput label="Col" value={col} onChange={setCol} max={gridCols - 1} />
            <NumberInput label="R-span" value={rowSpan} onChange={setRowSpan} min={1} max={gridRows} />
            <NumberInput label="C-span" value={colSpan} onChange={setColSpan} min={1} max={gridCols} />
            <button
              type="submit"
              disabled={disabled}
              className="col-span-4 mt-1 rounded-md bg-white text-black px-3 py-1.5 text-sm font-medium hover:bg-white/90 disabled:opacity-50"
            >
              Add to layout
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function EffectStyleButton({
  value,
  active,
  onSelect,
  disabled,
}: {
  value: EffectStyle;
  active: boolean;
  onSelect: (v: EffectStyle) => Promise<void> | void;
  disabled: boolean;
}) {
  const label = value === "calm" ? "Calm" : "Dynamic";
  const hint =
    value === "calm"
      ? "CSS overlays · light"
      : "Canvas particles · richer";
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled || active}
      className={`flex flex-col items-start rounded-md border px-3 py-2 text-sm transition ${
        active ? "border-white/60 bg-white/5" : "border-white/10 hover:bg-white/5"
      } disabled:cursor-default`}
    >
      <span className="text-fg">{label}</span>
      <span className="text-[10px] uppercase tracking-widest text-fg-faint">{hint}</span>
    </button>
  );
}

function ThemeSwatch({
  name,
  active,
  onSelect,
  disabled,
}: {
  name: ThemeName;
  active: boolean;
  onSelect: (n: ThemeName) => Promise<void> | void;
  disabled: boolean;
}) {
  const t = THEMES[name];
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      disabled={disabled || active}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
        active ? "border-white/60 bg-white/5" : "border-white/10 hover:bg-white/5"
      } disabled:cursor-default`}
    >
      <span
        className="h-5 w-5 rounded-full border border-white/20"
        style={{
          background: `linear-gradient(135deg, ${t.bg} 0%, ${t.bg} 50%, ${t.accent} 50%, ${t.accent} 100%)`,
        }}
      />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-fg">{t.label}</span>
        <span className="text-[10px] uppercase tracking-widest text-fg-faint">{name}</span>
      </span>
    </button>
  );
}

function AddWidgetForm({
  onSubmit,
  disabled,
  gridRows,
  gridCols,
}: {
  onSubmit: (w: WidgetCreate) => Promise<unknown>;
  disabled: boolean;
  gridRows: number;
  gridCols: number;
}) {
  const [type, setType] = useState<string>(WIDGET_TYPES[0] ?? "clock");
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [rowSpan, setRowSpan] = useState(1);
  const [colSpan, setColSpan] = useState(1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      type,
      row,
      col,
      row_span: rowSpan,
      col_span: colSpan,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-2 rounded-md border border-white/10 bg-white/5 p-3 sm:grid-cols-6"
    >
      <Select label="Type" value={type} onChange={setType} options={WIDGET_TYPES} />
      <NumberInput label="Row" value={row} onChange={setRow} max={gridRows - 1} />
      <NumberInput label="Col" value={col} onChange={setCol} max={gridCols - 1} />
      <NumberInput label="Row span" value={rowSpan} onChange={setRowSpan} min={1} max={gridRows} />
      <NumberInput label="Col span" value={colSpan} onChange={setColSpan} min={1} max={gridCols} />
      <button
        type="submit"
        disabled={disabled}
        className="col-span-2 self-end rounded-md bg-white text-black px-3 py-1 text-sm font-medium hover:bg-white/90 disabled:opacity-50 sm:col-span-1"
      >
        Add
      </button>
    </form>
  );
}

function WidgetRow({
  widget,
  onUpdate,
  onDelete,
  disabled,
  gridRows,
  gridCols,
}: {
  widget: Widget;
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  disabled: boolean;
  gridRows: number;
  gridCols: number;
}) {
  const [row, setRow] = useState(widget.row);
  const [col, setCol] = useState(widget.col);
  const [rowSpan, setRowSpan] = useState(widget.row_span);
  const [colSpan, setColSpan] = useState(widget.col_span);
  const [configOpen, setConfigOpen] = useState(false);
  const [configText, setConfigText] = useState(
    () => JSON.stringify(widget.config, null, 2),
  );
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setRow(widget.row);
    setCol(widget.col);
    setRowSpan(widget.row_span);
    setColSpan(widget.col_span);
  }, [widget.id, widget.row, widget.col, widget.row_span, widget.col_span]);

  useEffect(() => {
    setConfigText(JSON.stringify(widget.config, null, 2));
    setConfigError(null);
  }, [widget.config]);

  const dirty =
    row !== widget.row ||
    col !== widget.col ||
    rowSpan !== widget.row_span ||
    colSpan !== widget.col_span;

  const saveConfig = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configText);
    } catch {
      setConfigError("Invalid JSON");
      return;
    }
    setConfigError(null);
    await onUpdate(widget.id, { config: parsed });
  };

  return (
    <li className="rounded-md border border-white/10 bg-white/5">
      <div className="grid grid-cols-2 items-end gap-2 p-3 sm:grid-cols-7">
        <div className="sm:col-span-1">
          <div className="text-xs uppercase tracking-wide text-fg-faint">
            #{widget.id} · {widget.type}
          </div>
          <div className="text-sm text-fg-dim">
            {widget.enabled ? "enabled" : "disabled"}
          </div>
        </div>
        <NumberInput label="Row" value={row} onChange={setRow} max={gridRows - 1} />
        <NumberInput label="Col" value={col} onChange={setCol} max={gridCols - 1} />
        <NumberInput label="R-span" value={rowSpan} onChange={setRowSpan} min={1} max={gridRows} />
        <NumberInput label="C-span" value={colSpan} onChange={setColSpan} min={1} max={gridCols} />
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() =>
            onUpdate(widget.id, {
              row,
              col,
              row_span: rowSpan,
              col_span: colSpan,
            })
          }
          className="rounded-md border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-30"
        >
          Save
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (window.confirm(`Delete widget #${widget.id}?`)) onDelete(widget.id);
          }}
          className="rounded-md border border-red-500/40 text-red-200 px-3 py-1 text-sm hover:bg-red-500/10 disabled:opacity-30"
        >
          Delete
        </button>
      </div>

      {/* Config editor */}
      <div className="border-t border-white/10">
        <button
          type="button"
          onClick={() => setConfigOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-fg-faint hover:text-fg-dim transition"
        >
          <span className={`transition-transform ${configOpen ? "rotate-90" : ""}`}>›</span>
          Config JSON
        </button>
        {configOpen && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            <textarea
              value={configText}
              onChange={(e) => { setConfigText(e.target.value); setConfigError(null); }}
              rows={8}
              spellCheck={false}
              className="w-full rounded-md border border-white/10 bg-black px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-white/40 resize-y"
            />
            {configError && (
              <div className="text-xs text-red-300">{configError}</div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={saveConfig}
              className="self-start rounded-md border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-30"
            >
              Save config
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col text-xs">
      <span className="mb-1 uppercase tracking-wide text-fg-faint">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex flex-col text-xs">
      <span className="mb-1 uppercase tracking-wide text-fg-faint">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/40"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
