import type { ReactNode } from "react";

import type { Widget } from "../lib/types";
import { AutoScroll } from "./AutoScroll";
import { WIDGET_REGISTRY, WIDGETS } from "./widgets/registry";

interface GridProps {
  widgets: Widget[];
  gridRows: number;
  gridCols: number;
  /** When true, hide disabled widgets entirely (mirror view). */
  hideDisabled?: boolean;
}

export function Grid({ widgets, hideDisabled = true, gridRows, gridCols }: GridProps) {
  const visible = hideDisabled ? widgets.filter((w) => w.enabled) : widgets;
  return (
    <div
      className="grid h-full w-full gap-4 p-6"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
      }}
    >
      {visible.map((widget) => (
        <Cell key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

function Cell({ widget }: { widget: Widget }) {
  const Component = WIDGETS[widget.type];
  const meta = WIDGET_REGISTRY[widget.type];
  const style = {
    gridRow: `${widget.row + 1} / span ${widget.row_span}`,
    gridColumn: `${widget.col + 1} / span ${widget.col_span}`,
  };
  return (
    <div
      style={style}
      data-widget-cell="true"
      className="flex items-center justify-center overflow-hidden rounded-lg"
    >
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
      ) : (
        <UnknownWidget type={widget.type} />
      )}
    </div>
  );
}

function UnknownWidget({ type }: { type: string }): ReactNode {
  return <div className="text-white/40 text-sm">unknown widget: {type}</div>;
}
