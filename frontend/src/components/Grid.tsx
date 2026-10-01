import React from "react";
import type { ReactNode } from "react";
import { Suspense, lazy } from "react";

import { isCustomWidgetType, useCustomWidgets } from "../lib/customWidgets";
import type { Widget } from "../lib/types";
import { AutoScroll } from "./AutoScroll";
import { FitCell } from "./FitCell";
import { WIDGET_REGISTRY, WIDGETS } from "./widgets/registry";

// Lazy: Sucrase (the JSX runtime compiler for AI-generated widgets) is only
// fetched when a layout actually contains one — keeps the base bundle lean.
const CustomWidgetRenderer = lazy(() => import("./widgets/CustomWidgetRenderer"));

interface GridProps {
  widgets: Widget[];
  gridRows: number;
  gridCols: number;
  /** When true, hide disabled widgets entirely (mirror view). */
  hideDisabled?: boolean;
  /** Show a subtle background on each cell. Default true. */
  showBorders?: boolean;
}

export function Grid({ widgets, hideDisabled = true, gridRows, gridCols, showBorders = true }: GridProps) {
  const visible = hideDisabled ? widgets.filter((w) => w.enabled) : widgets;
  const { byKey: customWidgets } = useCustomWidgets();
  return (
    <div
      className="grid h-full w-full gap-2 p-4"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
        fontSize: "calc(1rem * var(--font-scale, 1))",
      }}
    >
      {visible.map((widget) => (
        <Cell key={widget.id} widget={widget} customWidget={customWidgets[widget.type]} showBorders={showBorders} />
      ))}
    </div>
  );
}

function Cell({
  widget,
  customWidget,
  showBorders,
}: {
  widget: Widget;
  customWidget: { source_code: string; name: string } | undefined;
  showBorders: boolean;
}) {
  const Component = WIDGETS[widget.type];
  const meta = WIDGET_REGISTRY[widget.type];
  const isCustom = isCustomWidgetType(widget.type);
  const widgetScale = (widget.config as { font_scale?: number } | null)?.font_scale;
  const style = {
    gridRow: `${widget.row + 1} / span ${widget.row_span}`,
    gridColumn: `${widget.col + 1} / span ${widget.col_span}`,
    ...(widgetScale != null ? { "--font-scale": String(widgetScale) } : {}),
  } as React.CSSProperties;
  return (
    <div
      style={style}
      data-widget-cell="true"
      className={`relative flex items-center justify-center overflow-hidden rounded-xl${showBorders ? " bg-white/[0.03]" : ""}`}
    >
      {Component ? (
        meta?.scrollManaged ? (
          // scrollManaged widgets (e.g. Todo) manage their own scroll/layout.
          <Component widget={widget} />
        ) : (widget.config as { auto_scroll?: boolean } | null)?.auto_scroll ? (
          <AutoScroll>
            <Component widget={widget} />
          </AutoScroll>
        ) : (
          <FitCell widgetId={widget.id}>
            <Component widget={widget} />
          </FitCell>
        )
      ) : isCustom && customWidget ? (
        <Suspense fallback={null}>
          <FitCell widgetId={widget.id}>
            <CustomWidgetRenderer widget={widget} sourceCode={customWidget.source_code} />
          </FitCell>
        </Suspense>
      ) : (
        <UnknownWidget type={widget.type} />
      )}
    </div>
  );
}

function UnknownWidget({ type }: { type: string }): ReactNode {
  return <div className="text-white/40 text-sm">unknown widget: {type}</div>;
}
