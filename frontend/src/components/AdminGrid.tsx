import { useEffect, useMemo, useRef, useState } from "react";

import { WIDGET_REGISTRY, WIDGET_TYPES } from "./widgets/registry";
import type { Widget, WidgetUpdate } from "../lib/types";

interface AdminGridProps {
  widgets: Widget[];
  gridRows: number;
  gridCols: number;
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onAdd: (type: string, row: number, col: number, rowSpan: number, colSpan: number) => Promise<unknown>;
  busy: boolean;
}

export function AdminGrid({
  widgets,
  gridRows,
  gridCols,
  onUpdate,
  onDelete,
  onAdd,
  busy,
}: AdminGridProps) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [pendingCell, setPendingCell] = useState<{ row: number; col: number } | null>(null);
  const [pendingType, setPendingType] = useState<string>(WIDGET_TYPES[0] ?? "clock");
  const gridRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(null);
  const [editRowSpan, setEditRowSpan] = useState(1);
  const [editColSpan, setEditColSpan] = useState(1);

  // Close add-widget dropdown when clicking outside
  useEffect(() => {
    if (!pendingCell) return;
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPendingCell(null);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [pendingCell]);

  // Sync edit inputs when a widget is selected
  useEffect(() => {
    if (selectedWidgetId === null) return;
    const w = widgets.find((x) => x.id === selectedWidgetId);
    if (!w) { setSelectedWidgetId(null); return; }
    setEditRowSpan(w.row_span);
    setEditColSpan(w.col_span);
  }, [selectedWidgetId, widgets]);

  // Close edit panel when clicking outside
  useEffect(() => {
    if (selectedWidgetId === null) return;
    function onOutside(e: MouseEvent) {
      if (editRef.current && !editRef.current.contains(e.target as Node)) setSelectedWidgetId(null);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [selectedWidgetId]);

  const draggingWidget = useMemo(
    () => (draggingId !== null ? (widgets.find((w) => w.id === draggingId) ?? null) : null),
    [draggingId, widgets],
  );

  // All occupied cells (used to identify empty cells for click-to-add)
  const allOccupied = useMemo(() => {
    const set = new Set<string>();
    for (const w of widgets) {
      if (!w.enabled) continue;
      for (let r = w.row; r < w.row + w.row_span; r++) {
        for (let c = w.col; c < w.col + w.col_span; c++) {
          set.add(`${r},${c}`);
        }
      }
    }
    return set;
  }, [widgets]);

  // Cells occupied by widgets other than the one being dragged
  const occupiedByOthers = useMemo(() => {
    const set = new Set<string>();
    for (const w of widgets) {
      if (!w.enabled || w.id === draggingId) continue;
      for (let r = w.row; r < w.row + w.row_span; r++) {
        for (let c = w.col; c < w.col + w.col_span; c++) {
          set.add(`${r},${c}`);
        }
      }
    }
    return set;
  }, [widgets, draggingId]);

  function canDropAt(row: number, col: number): boolean {
    if (!draggingWidget || row < 0 || col < 0) return false;
    if (row + draggingWidget.row_span > gridRows || col + draggingWidget.col_span > gridCols)
      return false;
    for (let r = row; r < row + draggingWidget.row_span; r++) {
      for (let c = col; c < col + draggingWidget.col_span; c++) {
        if (occupiedByOthers.has(`${r},${c}`)) return false;
      }
    }
    return true;
  }

  function cellFromEvent(e: React.DragEvent): { row: number; col: number } | null {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * gridCols);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * gridRows);
    if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
    return { row, col };
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cell = cellFromEvent(e);
    if (cell) setHoverCell(cell);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!gridRef.current?.contains(e.relatedTarget as Node)) {
      setHoverCell(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (cell && draggingWidget && canDropAt(cell.row, cell.col)) {
      if (cell.row !== draggingWidget.row || cell.col !== draggingWidget.col) {
        onUpdate(draggingWidget.id, { row: cell.row, col: cell.col });
      }
    }
    setDraggingId(null);
    setHoverCell(null);
  }

  // Compute dropdown position relative to the outer wrapper.
  // Flip to above/right when the cell is in the bottom or right portion of the grid.
  function getDropdownStyle(cell: { row: number; col: number }): React.CSSProperties {
    const inBottomHalf = cell.row >= gridRows / 2;
    const inRightPart = cell.col >= gridCols * 0.65;
    return {
      ...(inBottomHalf
        ? { bottom: `${((gridRows - cell.row) / gridRows) * 100}%` }
        : { top: `${((cell.row + 1) / gridRows) * 100}%` }),
      ...(inRightPart
        ? { right: `${((gridCols - cell.col - 1) / gridCols) * 100}%` }
        : { left: `${(cell.col / gridCols) * 100}%` }),
    };
  }

  const dropOk = hoverCell ? canDropAt(hoverCell.row, hoverCell.col) : false;

  return (
    <div className="relative" style={{ margin: "0 auto", width: "fit-content", maxWidth: "100%" }}>
      <div
        ref={gridRef}
        className="relative select-none rounded-lg border border-white/10 overflow-hidden"
        style={{
          height: "480px",
          aspectRatio: `${gridCols} / ${gridRows}`,
          maxWidth: "100%",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Background cell grid */}
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          }}
        >
          {Array.from({ length: gridRows * gridCols }, (_, i) => {
            const row = Math.floor(i / gridCols);
            const col = i % gridCols;
            const inZone =
              draggingWidget !== null &&
              hoverCell !== null &&
              row >= hoverCell.row &&
              row < hoverCell.row + draggingWidget.row_span &&
              col >= hoverCell.col &&
              col < hoverCell.col + draggingWidget.col_span;
            const isEmpty = !allOccupied.has(`${row},${col}`);
            const isSelected = pendingCell?.row === row && pendingCell?.col === col;
            return (
              <div
                key={i}
                className={`group border border-white/[0.06] transition-colors ${
                  inZone
                    ? dropOk
                      ? "bg-white/15 border-white/30"
                      : "bg-red-500/20 border-red-400/30"
                    : isSelected
                      ? "bg-white/10 border-white/25"
                      : isEmpty && !draggingId
                        ? "cursor-pointer hover:bg-white/[0.06]"
                        : ""
                }`}
                onClick={() => {
                  if (isEmpty && !draggingId && !busy) {
                    setPendingCell({ row, col });
                    setPendingType(WIDGET_TYPES[0] ?? "clock");
                    setSelectedWidgetId(null);
                  }
                }}
              >
                {isEmpty && !draggingId && (
                  <span className="flex h-full w-full items-center justify-center text-base text-white/0 group-hover:text-white/20 transition-colors select-none">
                    +
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Widget cards — pointer-events disabled on container so drag events
            reach the grid; individual cards re-enable them for initiating drag */}
        <div
          className="absolute inset-0 grid pointer-events-none"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          }}
        >
          {widgets
            .filter((w) => w.enabled)
            .map((widget) => (
              <div
                key={widget.id}
                style={{
                  gridRow: `${widget.row + 1} / span ${widget.row_span}`,
                  gridColumn: `${widget.col + 1} / span ${widget.col_span}`,
                  pointerEvents: "auto",
                }}
                className={`p-0.5 transition-opacity ${
                  draggingId === widget.id ? "opacity-30" : "opacity-100"
                }`}
              >
                <div
                  draggable={!busy}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(widget.id);
                    setSelectedWidgetId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setHoverCell(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWidgetId(widget.id === selectedWidgetId ? null : widget.id);
                    setPendingCell(null);
                  }}
                  className={`h-full w-full cursor-grab active:cursor-grabbing rounded border bg-white/10 backdrop-blur-sm p-1.5 flex flex-col gap-0.5 overflow-hidden transition-colors ${
                    selectedWidgetId === widget.id ? "border-white/60" : "border-white/25"
                  }`}
                >
                  <span className="text-[11px] font-medium text-fg truncate leading-tight">
                    {widget.type}
                  </span>
                  <span className="text-[9px] text-fg-faint leading-tight">
                    r{widget.row} c{widget.col} · {widget.row_span}×{widget.col_span}
                  </span>
                  <button
                    type="button"
                    className="mt-auto text-[9px] text-red-300/50 hover:text-red-300 text-left leading-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete ${widget.type} #${widget.id}?`)) {
                        onDelete(widget.id);
                      }
                    }}
                  >
                    delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Add-widget dropdown — sibling of the grid so it escapes overflow-hidden */}
      {pendingCell && (
        <div
          ref={dropdownRef}
          className="absolute z-50 rounded-lg border border-white/20 bg-[#111] p-3 shadow-2xl"
          style={{ width: "172px", ...getDropdownStyle(pendingCell) }}
        >
          <p className="mb-2 text-[10px] uppercase tracking-wide text-fg-faint">
            r{pendingCell.row} · c{pendingCell.col}
          </p>
          <select
            value={pendingType}
            onChange={(e) => setPendingType(e.target.value)}
            className="mb-2 w-full rounded border border-white/10 bg-black px-2 py-1 text-sm text-fg outline-none focus:border-white/30"
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {WIDGET_REGISTRY[t]!.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const meta = WIDGET_REGISTRY[pendingType]!;
                await onAdd(
                  pendingType,
                  pendingCell.row,
                  pendingCell.col,
                  meta.defaultSize.rowSpan,
                  meta.defaultSize.colSpan,
                );
                setPendingCell(null);
              }}
              className="flex-1 rounded bg-white px-2 py-1 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setPendingCell(null)}
              className="rounded border border-white/20 px-2 py-1 text-xs text-fg-dim hover:bg-white/5"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Widget edit panel */}
      {selectedWidgetId !== null && (() => {
        const w = widgets.find((x) => x.id === selectedWidgetId);
        if (!w) return null;
        const dirty = editRowSpan !== w.row_span || editColSpan !== w.col_span;
        return (
          <div
            ref={editRef}
            className="absolute z-50 rounded-lg border border-white/20 bg-[#111] p-3 shadow-2xl"
            style={{ width: "186px", ...getDropdownStyle({ row: w.row, col: w.col }) }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-fg-faint">
                {w.type} #{w.id}
              </p>
              <button type="button" onClick={() => setSelectedWidgetId(null)} className="text-[10px] text-fg-faint hover:text-fg">✕</button>
            </div>
            <div className="flex gap-4 mb-3">
              <SizeSpinner label="Width" value={editColSpan} onChange={setEditColSpan} min={1} max={gridCols} />
              <SizeSpinner label="Height" value={editRowSpan} onChange={setEditRowSpan} min={1} max={gridRows} />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={async () => {
                  await onUpdate(w.id, { row_span: editRowSpan, col_span: editColSpan });
                  setSelectedWidgetId(null);
                }}
                className="flex-1 rounded bg-white px-2 py-1 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete ${w.type} #${w.id}?`)) {
                    void onDelete(w.id);
                    setSelectedWidgetId(null);
                  }
                }}
                className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                Del
              </button>
            </div>
          </div>
        );
      })()}

      <p className="mt-1.5 text-center text-[10px] text-fg-faint">
        Drag to reposition · click widget to edit · click empty cell to add · {gridRows}r × {gridCols}c
      </p>
    </div>
  );
}

function SizeSpinner({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-fg-faint">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-6 w-6 items-center justify-center rounded border border-white/10 text-fg-dim hover:bg-white/10 disabled:opacity-30 text-sm leading-none"
        >
          −
        </button>
        <span className="w-5 text-center text-sm text-fg tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-6 w-6 items-center justify-center rounded border border-white/10 text-fg-dim hover:bg-white/10 disabled:opacity-30 text-sm leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
