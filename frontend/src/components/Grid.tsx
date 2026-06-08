import type { ReactNode } from "react";
import { Suspense, lazy } from "react";

import { isCustomWidgetType, useCustomWidgets } from "../lib/customWidgets";
import type { Widget } from "../lib/types";
import { AutoScroll } from "./AutoScroll";
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
}

export function Grid({ widgets, hideDisabled = true, gridRows, gridCols }: GridProps) {
  const visible = hideDisabled ? widgets.filter((w) => w.enabled) : widgets;
  const { byKey: customWidgets } = useCustomWidgets();
  return (
    <div
      className="grid h-full w-full gap-4 p-6"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((widget) => (
        <Cell key={widget.id} widget={widget} customWidget={customWidgets[widget.type]} />
      ))}
    </div>
  );
}

function Cell({
  widget,
  customWidget,
}: {
  widget: Widget;
  customWidget: { source_code: string; name: string } | undefined;
}) {
  const Component = WIDGETS[widget.type];
  const meta = WIDGET_REGISTRY[widget.type];
  const isCustom = isCustomWidgetType(widget.type);
  const style = {
    gridRow: `${widget.row + 1} / span ${widget.row_span}`,
    gridColumn: `${widget.col + 1} / span ${widget.col_span}`,
  };
  return (
    <div
      style={style}
      data-widget-cell="true"
      data-ai-widget={isCustom ? "true" : undefined}
      className={
        "relative flex items-center justify-center overflow-hidden rounded-lg" +
        (isCustom ? " ring-1 ring-inset ring-violet-400/40" : "")
      }
    >
      {isCustom && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-violet-200/90">
          AI
        </span>
      )}
      {Component ? (
        // scrollManaged widgets (e.g. Todo) handle scroll themselves.
        // Everyone else: wrap in AutoScroll when the per-instance flag is set.
        !meta?.scrollManaged && (widget.config as { auto_scroll?: boolean } | null)?.auto_scroll ? (
          <AutoScroll>
            <Component widget={widget} />
          </AutoScroll>
        ) : (
          <Component widget={widget} />
        )
      ) : isCustom && customWidget ? (
        <Suspense fallback={null}>
          <CustomWidgetRenderer widget={widget} sourceCode={customWidget.source_code} />
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
