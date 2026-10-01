import { useEffect, useRef } from "react";

import { reportOverflow } from "../lib/fitOverflowStore";

interface FitCellProps {
  children: React.ReactNode;
  widgetId: number;
}

/**
 * Wraps widget content and shrinks it via CSS scale() when it overflows the
 * parent cell. Scales uniformly (maintains aspect ratio) and re-fits whenever
 * the content or cell size changes (e.g. font-scale slider, grid resize).
 *
 * Also reports overflow state to fitOverflowStore so the admin drag-and-drop
 * view can highlight widgets that need to be resized.
 */
export function FitCell({ children, widgetId }: FitCellProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const cell = wrapper?.parentElement;
    if (!wrapper || !cell) return;

    function fit() {
      if (!wrapper || !cell) return;

      // Reset transform so we measure the true natural size.
      wrapper.style.transform = "";

      const availW = cell.clientWidth;
      const availH = cell.clientHeight;
      const naturalW = wrapper.scrollWidth;
      const naturalH = wrapper.scrollHeight;

      if (naturalW === 0 || naturalH === 0) return;

      const s = Math.min(1, availW / naturalW, availH / naturalH);
      const isOverflowing = s < 0.999;

      if (isOverflowing) {
        wrapper.style.transform = `scale(${s})`;
      }

      reportOverflow(widgetId, isOverflowing);
    }

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(wrapper);
    ro.observe(cell);
    return () => {
      ro.disconnect();
      reportOverflow(widgetId, false);
    };
  }, [widgetId]);

  return (
    <div
      ref={wrapperRef}
      className="w-full"
      style={{ transformOrigin: "center center" }}
    >
      {children}
    </div>
  );
}
