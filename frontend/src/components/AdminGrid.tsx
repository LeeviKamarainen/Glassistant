import { useMemo, useRef, useState } from "react";

import type { Widget, WidgetUpdate } from "../lib/types";

interface AdminGridProps {
  widgets: Widget[];
  gridRows: number;
  gridCols: number;
  onUpdate: (id: number, patch: WidgetUpdate) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  busy: boolean;
}

export function AdminGrid({
  widgets,
  gridRows,
  gridCols,
  onUpdate,
  onDelete,
  busy,
}: AdminGridProps) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const draggingWidget = useMemo(
    () => (draggingId !== null ? (widgets.find((w) => w.id === draggingId) ?? null) : null),
    [draggingId, widgets],
  );

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

  const dropOk = hoverCell ? canDropAt(hoverCell.row, hoverCell.col) : false;

  return (
    <div style={{ margin: "0 auto", width: "fit-content", maxWidth: "100%" }}>
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
            return (
              <div
                key={i}
                className={`border border-white/[0.06] transition-colors ${
                  inZone
                    ? dropOk
                      ? "bg-white/15 border-white/30"
                      : "bg-red-500/20 border-red-400/30"
                    : ""
                }`}
              />
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
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setHoverCell(null);
                  }}
                  className="h-full w-full cursor-grab active:cursor-grabbing rounded border border-white/25 bg-white/10 backdrop-blur-sm p-1.5 flex flex-col gap-0.5 overflow-hidden"
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
      <p className="mt-1.5 text-center text-[10px] text-fg-faint">
        Drag to reposition · {gridRows}r × {gridCols}c
      </p>
    </div>
  );
}
