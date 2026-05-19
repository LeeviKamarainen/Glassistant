import { useMemo, useRef, useState } from "react";

import { WIDGET_REGISTRY, WIDGET_TYPES } from "./widgets/registry";
import type { Widget, WidgetUpdate } from "../lib/types";

interface Props {
  widgets: Widget[];
  gridRows: number;
  gridCols: number;
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onAdd: (type: string, row: number, col: number, rowSpan: number, colSpan: number) => Promise<unknown>;
  busy: boolean;
}

interface DragState {
  widgetId: number;
  px: number;
  py: number;
  startPx: number;
  startPy: number;
  startTime: number;
  offsetX: number;
  offsetY: number;
  tileW: number;
  tileH: number;
  pointerId: number;
  moved: boolean;
}

export function MobileGrid({ widgets, gridRows, gridCols, onUpdate, onDelete, onAdd, busy }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [pendingCell, setPendingCell] = useState<{ row: number; col: number; x: number; y: number } | null>(null);
  const [pendingType, setPendingType] = useState(WIDGET_TYPES[0] ?? "clock");
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [editTapPos, setEditTapPos] = useState({ x: 0, y: 0 });
  const [editRowSpan, setEditRowSpan] = useState(1);
  const [editColSpan, setEditColSpan] = useState(1);

  const draggingWidget = useMemo(
    () => (dragState ? (widgets.find((w) => w.id === dragState.widgetId) ?? null) : null),
    [dragState?.widgetId, widgets],
  );

  const occupiedByOthers = useMemo(() => {
    const s = new Set<string>();
    for (const w of widgets) {
      if (!w.enabled || w.id === dragState?.widgetId) continue;
      for (let r = w.row; r < w.row + w.row_span; r++)
        for (let c = w.col; c < w.col + w.col_span; c++) s.add(`${r},${c}`);
    }
    return s;
  }, [widgets, dragState?.widgetId]);

  const allOccupied = useMemo(() => {
    const s = new Set<string>();
    for (const w of widgets) {
      if (!w.enabled) continue;
      for (let r = w.row; r < w.row + w.row_span; r++)
        for (let c = w.col; c < w.col + w.col_span; c++) s.add(`${r},${c}`);
    }
    return s;
  }, [widgets]);

  function cellFromPoint(clientX: number, clientY: number): { row: number; col: number } | null {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * gridCols);
    const row = Math.floor(((clientY - rect.top) / rect.height) * gridRows);
    if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;
    return { row, col };
  }

  function canDropAt(row: number, col: number): boolean {
    if (!draggingWidget) return false;
    if (row + draggingWidget.row_span > gridRows || col + draggingWidget.col_span > gridCols) return false;
    for (let r = row; r < row + draggingWidget.row_span; r++)
      for (let c = col; c < col + draggingWidget.col_span; c++)
        if (occupiedByOthers.has(`${r},${c}`)) return false;
    return true;
  }

  function onTilePointerDown(e: React.PointerEvent, widget: Widget) {
    if (busy) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    gridRef.current?.setPointerCapture(e.pointerId);
    setDragState({
      widgetId: widget.id,
      px: e.clientX,
      py: e.clientY,
      startPx: e.clientX,
      startPy: e.clientY,
      startTime: Date.now(),
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      tileW: rect.width,
      tileH: rect.height,
      pointerId: e.pointerId,
      moved: false,
    });
  }

  function onGridPointerMove(e: React.PointerEvent) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startPx;
    const dy = e.clientY - dragState.startPy;
    // Require both enough time (150ms) and distance (>8px) to start a drag,
    // so quick taps with slight finger jitter aren't mis-detected as drags.
    const elapsed = Date.now() - dragState.startTime;
    const moved = dragState.moved || (elapsed > 150 && dx * dx + dy * dy > 64);
    setDragState({ ...dragState, px: e.clientX, py: e.clientY, moved });
    if (moved) {
      setHoverCell(cellFromPoint(e.clientX - dragState.offsetX, e.clientY - dragState.offsetY));
    }
  }

  function onGridPointerUp(e: React.PointerEvent) {
    if (!dragState) return;
    gridRef.current?.releasePointerCapture(e.pointerId);
    if (dragState.moved && hoverCell && draggingWidget) {
      if (
        canDropAt(hoverCell.row, hoverCell.col) &&
        (hoverCell.row !== draggingWidget.row || hoverCell.col !== draggingWidget.col)
      ) {
        void onUpdate(dragState.widgetId, { row: hoverCell.row, col: hoverCell.col });
      }
    } else if (!dragState.moved && draggingWidget) {
      // Tap (not drag) — open widget edit panel
      setEditingWidget(draggingWidget);
      setEditRowSpan(draggingWidget.row_span);
      setEditColSpan(draggingWidget.col_span);
      setEditTapPos({ x: dragState.startPx, y: dragState.startPy });
      setPendingCell(null);
    }
    setDragState(null);
    setHoverCell(null);
  }

  function onGridPointerCancel() {
    if (dragState) gridRef.current?.releasePointerCapture(dragState.pointerId);
    setDragState(null);
    setHoverCell(null);
  }

  const dropOk = hoverCell ? canDropAt(hoverCell.row, hoverCell.col) : false;

  return (
    <div className="relative w-full">
      {/* Grid container — touch-none prevents browser scroll hijacking during drag */}
      <div
        ref={gridRef}
        className="relative select-none rounded-lg border border-white/10 overflow-hidden touch-none w-full"
        style={{ aspectRatio: `${gridCols} / ${gridRows}` }}
        onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp}
        onPointerCancel={onGridPointerCancel}
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
              row < hoverCell.row + (draggingWidget?.row_span ?? 1) &&
              col >= hoverCell.col &&
              col < hoverCell.col + (draggingWidget?.col_span ?? 1);
            const isEmpty = !allOccupied.has(`${row},${col}`);
            const isSelected = pendingCell?.row === row && pendingCell?.col === col;

            return (
              <div
                key={i}
                className={`relative border border-white/[0.06] transition-colors ${
                  inZone
                    ? dropOk
                      ? "bg-white/15 border-white/30"
                      : "bg-red-500/20 border-red-400/30"
                    : isSelected
                      ? "bg-white/10 border-white/25"
                      : isEmpty && !dragState
                        ? "cursor-pointer active:bg-white/[0.08]"
                        : "pointer-events-none"
                }`}
                onClick={(e) => {
                  if (isEmpty && !dragState && !busy) {
                    setPendingCell({ row, col, x: e.clientX, y: e.clientY });
                    setPendingType(WIDGET_TYPES[0] ?? "clock");
                    setEditingWidget(null);
                  }
                }}
              >
                {isEmpty && !dragState && (
                  <span className="absolute inset-0 flex items-center justify-center text-white/20 select-none pointer-events-none text-base leading-none">
                    +
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Widget tiles */}
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
                  dragState?.widgetId === widget.id && dragState.moved ? "opacity-20" : "opacity-100"
                }`}
              >
                <div
                  className="h-full w-full cursor-grab active:cursor-grabbing rounded border border-white/25 bg-white/10 backdrop-blur-sm p-1.5 flex flex-col gap-0.5 overflow-hidden touch-none"
                  onPointerDown={(e) => onTilePointerDown(e, widget)}
                >
                  <span className="text-[11px] font-medium text-fg truncate leading-tight">
                    {WIDGET_REGISTRY[widget.type]?.label ?? widget.type}
                  </span>
                  <span className="text-[9px] text-fg-faint leading-tight">
                    r{widget.row} c{widget.col} · {widget.row_span}×{widget.col_span}
                  </span>
                  <button
                    type="button"
                    className="mt-auto text-[9px] text-red-300/50 hover:text-red-300 text-left leading-none"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete ${widget.type} #${widget.id}?`)) {
                        void onDelete(widget.id);
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

      {/* Floating tile overlay during drag */}
      {dragState?.moved && draggingWidget && (
        <div
          className="rounded border border-white/50 bg-white/20 backdrop-blur-sm p-1.5 shadow-2xl pointer-events-none"
          style={{
            position: "fixed",
            left: dragState.px - dragState.offsetX,
            top: dragState.py - dragState.offsetY,
            width: dragState.tileW,
            height: dragState.tileH,
            zIndex: 1000,
            opacity: 0.9,
          }}
        >
          <span className="text-[11px] font-medium text-fg truncate block">
            {WIDGET_REGISTRY[draggingWidget.type]?.label ?? draggingWidget.type}
          </span>
        </div>
      )}

      {/* Add widget floating popover */}
      {pendingCell && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
            onPointerDown={() => setPendingCell(null)}
          />
          <AddPopover
            cell={pendingCell}
            type={pendingType}
            onTypeChange={setPendingType}
            onAdd={async () => {
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
            onClose={() => setPendingCell(null)}
            busy={busy}
          />
        </>
      )}

      {/* Widget edit popover */}
      {editingWidget && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 98 }}
            onPointerDown={() => setEditingWidget(null)}
          />
          <EditPopover
            widget={editingWidget}
            tapPos={editTapPos}
            rowSpan={editRowSpan}
            colSpan={editColSpan}
            onRowSpanChange={setEditRowSpan}
            onColSpanChange={setEditColSpan}
            gridRows={gridRows}
            gridCols={gridCols}
            onSave={async () => {
              await onUpdate(editingWidget.id, { row_span: editRowSpan, col_span: editColSpan });
              setEditingWidget(null);
            }}
            onDelete={async () => {
              if (window.confirm(`Delete ${editingWidget.type} #${editingWidget.id}?`)) {
                await onDelete(editingWidget.id);
                setEditingWidget(null);
              }
            }}
            onClose={() => setEditingWidget(null)}
            busy={busy}
          />
        </>
      )}

      <p className="mt-2 text-center text-[10px] text-fg-faint">
        drag to reposition · tap widget to edit · tap + to add · {gridRows}r × {gridCols}c
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating add-widget popover
// ---------------------------------------------------------------------------

const POPOVER_W = 192;
const POPOVER_H = 152;
const POPOVER_MARGIN = 10;
const EDIT_POPOVER_W = 192;
const EDIT_POPOVER_H = 160;
const EDIT_POPOVER_MARGIN = 10;

function AddPopover({
  cell,
  type,
  onTypeChange,
  onAdd,
  onClose,
  busy,
}: {
  cell: { row: number; col: number; x: number; y: number };
  type: string;
  onTypeChange: (t: string) => void;
  onAdd: () => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  // Position near the tap, flipping when close to viewport edges
  let left = cell.x + POPOVER_MARGIN;
  let top = cell.y + POPOVER_MARGIN;

  if (left + POPOVER_W > window.innerWidth - POPOVER_MARGIN) {
    left = cell.x - POPOVER_W - POPOVER_MARGIN;
  }
  if (top + POPOVER_H > window.innerHeight - POPOVER_MARGIN) {
    top = cell.y - POPOVER_H - POPOVER_MARGIN;
  }
  // Final clamp so it never escapes the viewport
  left = Math.max(POPOVER_MARGIN, Math.min(left, window.innerWidth - POPOVER_W - POPOVER_MARGIN));
  top = Math.max(POPOVER_MARGIN, Math.min(top, window.innerHeight - POPOVER_H - POPOVER_MARGIN));

  return (
    <div
      style={{ position: "fixed", left, top, width: POPOVER_W, zIndex: 99 }}
      className="rounded-lg border border-white/20 bg-[#111] p-3 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wide text-fg-faint">
        r{cell.row} · c{cell.col}
      </p>
      <select
        value={type}
        onChange={(e) => onTypeChange(e.target.value)}
        className="mb-2.5 w-full rounded border border-white/10 bg-black px-2 py-2 text-sm text-fg outline-none focus:border-white/30"
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
          onClick={() => void onAdd()}
          className="flex-1 rounded bg-white px-2 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-white/20 px-3 py-2 text-sm text-fg-dim hover:bg-white/5"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating widget-edit popover
// ---------------------------------------------------------------------------

function EditPopover({
  widget,
  tapPos,
  rowSpan, colSpan,
  onRowSpanChange, onColSpanChange,
  gridRows, gridCols,
  onSave, onDelete, onClose,
  busy,
}: {
  widget: Widget;
  tapPos: { x: number; y: number };
  rowSpan: number; colSpan: number;
  onRowSpanChange: (n: number) => void;
  onColSpanChange: (n: number) => void;
  gridRows: number; gridCols: number;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  let left = tapPos.x + EDIT_POPOVER_MARGIN;
  let top = tapPos.y + EDIT_POPOVER_MARGIN;
  if (left + EDIT_POPOVER_W > window.innerWidth - EDIT_POPOVER_MARGIN)
    left = tapPos.x - EDIT_POPOVER_W - EDIT_POPOVER_MARGIN;
  if (top + EDIT_POPOVER_H > window.innerHeight - EDIT_POPOVER_MARGIN)
    top = tapPos.y - EDIT_POPOVER_H - EDIT_POPOVER_MARGIN;
  left = Math.max(EDIT_POPOVER_MARGIN, Math.min(left, window.innerWidth - EDIT_POPOVER_W - EDIT_POPOVER_MARGIN));
  top = Math.max(EDIT_POPOVER_MARGIN, Math.min(top, window.innerHeight - EDIT_POPOVER_H - EDIT_POPOVER_MARGIN));

  const dirty = rowSpan !== widget.row_span || colSpan !== widget.col_span;

  return (
    <div
      style={{ position: "fixed", left, top, width: EDIT_POPOVER_W, zIndex: 99 }}
      className="rounded-lg border border-white/20 bg-[#111] p-3 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-fg-faint">
          {WIDGET_REGISTRY[widget.type]?.label ?? widget.type} #{widget.id}
        </p>
        <button type="button" onClick={onClose} className="text-[10px] text-fg-faint hover:text-fg">✕</button>
      </div>
      <div className="flex gap-5 mb-3">
        <SizeSpinner label="Width" value={colSpan} onChange={onColSpanChange} min={1} max={gridCols} />
        <SizeSpinner label="Height" value={rowSpan} onChange={onRowSpanChange} min={1} max={gridRows} />
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void onSave()}
          className="flex-1 rounded bg-white px-3 py-2.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          className="rounded border border-red-500/40 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
        >
          Del
        </button>
      </div>
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
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-fg-dim hover:bg-white/10 disabled:opacity-30 text-base leading-none"
        >
          −
        </button>
        <span className="w-5 text-center text-sm text-fg tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-fg-dim hover:bg-white/10 disabled:opacity-30 text-base leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
