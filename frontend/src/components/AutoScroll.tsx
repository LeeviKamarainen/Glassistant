import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Pixels scrolled per second when content overflows the widget cell. */
const SCROLL_PX_PER_S = 30;
/** Pause at the top (ms) before starting the scroll and after jumping back. */
const PAUSE_TOP_MS = 1500;
/** Pause at the bottom (ms) before jumping back to the top. */
const PAUSE_BOTTOM_MS = 2500;

interface AutoScrollProps {
  children: ReactNode;
}

/**
 * Generic overflow-scroll shell for widget cells.
 *
 * Behaviour:
 *   • Content fits  → children are centred inside the cell (same as the old
 *     `flex items-center justify-center` on the Cell div).
 *   • Content taller than cell → pause at top, scroll slowly to bottom,
 *     pause, snap back to top, repeat indefinitely.
 *
 * Scrolling is driven by `transform: translateY(…)` on the inner wrapper so
 * it runs on the compositor thread. A ResizeObserver resets the scroll
 * position whenever the content size changes (data refresh, etc.).
 */
export function AutoScroll({ children }: AutoScrollProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let destroyed = false;
    let y = 0;
    // Start paused so fresh content is readable before scrolling begins.
    let pauseUntil = performance.now() + PAUSE_TOP_MS;
    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let lastTime: number | null = null;

    function resetToTop() {
      if (destroyed) return;
      y = 0;
      inner!.style.transform = "";
      pauseUntil = performance.now() + PAUSE_TOP_MS;
    }

    function tick(now: number) {
      if (destroyed) return;

      const maxScroll = inner!.scrollHeight - outer!.clientHeight;

      if (maxScroll <= 2) {
        // Content fits — remove any leftover transform and do nothing.
        if (inner!.style.transform) inner!.style.transform = "";
        lastTime = null;
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (now < pauseUntil) {
        // In a pause window — keep loop alive but don't move.
        lastTime = null;
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Actively scrolling.
      if (lastTime === null) lastTime = now;
      // Cap dt so a wake from a hidden/backgrounded tab doesn't jump.
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      y = Math.min(y + SCROLL_PX_PER_S * dt, maxScroll);
      inner!.style.transform = `translateY(${-y}px)`;

      if (y >= maxScroll) {
        // Reached the bottom: freeze the loop, wait, then snap back.
        pauseUntil = Infinity;
        timerId = setTimeout(() => {
          timerId = null;
          resetToTop();
        }, PAUSE_BOTTOM_MS);
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    // Restart from top whenever the content or container is resized
    // (handles data refreshes, font loads, window resize, etc.).
    const ro = new ResizeObserver(() => {
      if (timerId) { clearTimeout(timerId); timerId = null; }
      resetToTop();
    });
    ro.observe(outer);
    ro.observe(inner);

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (timerId) clearTimeout(timerId);
      ro.disconnect();
    };
  }, []);

  return (
    // Outer: fills the grid cell and clips any overflow.
    <div ref={outerRef} className="h-full w-full overflow-hidden">
      {/*
       * Inner: natural height for its content.
       *   flex-col + justify-center + min-h-full  →  small content is centred
       *   in the full cell height (no overflow branch).
       *   items-center  →  shrink-to-fit children are horizontally centred;
       *   children with w-full stretch to fill (overrides align-items).
       */}
      <div
        ref={innerRef}
        className="flex flex-col items-center justify-center"
        style={{ minHeight: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}
