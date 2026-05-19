/* Canvas-based weather effect renderer. One full-screen <canvas> drawn via
 * requestAnimationFrame with deltaTime so motion is frame-rate independent.
 * Particle counts are tuned for smoothness over a Pi-class GPU; tab-hidden
 * pauses updates so we don't burn cycles when nobody is looking. */
import { useEffect, useRef } from "react";

import type { WeatherCondition } from "./widgets/weather/icons";

interface Props {
  condition: WeatherCondition;
  /** Hex color (e.g. "#fbbf24") used for sun rays / sparkles. */
  themeAccent: string;
  /** Widget bounding rects; clouds animate to lower opacity when overlapping. */
  widgetRects?: DOMRect[];
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers

function withAlpha(hex: string, alpha: number): string {
  const c = hex.trim();
  if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
    const expand =
      c.length === 4
        ? "#" + c.slice(1).split("").map((ch) => ch + ch).join("")
        : c;
    const r = parseInt(expand.slice(1, 3), 16);
    const g = parseInt(expand.slice(3, 5), 16);
    const b = parseInt(expand.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ────────────────────────────────────────────────────────────────────────────
// Scene + particle protocol

interface UpdateResult {
  alive: boolean;
  spawn?: Particle[];
}

interface Particle {
  layer?: number; // higher draws on top
  update(dt: number, scene: Scene): UpdateResult;
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
}

interface Emitter {
  update(dt: number, scene: Scene): Particle[];
}

interface Background {
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
}

class Scene {
  width: number;
  height: number;
  time = 0;
  particles: Particle[] = [];
  emitters: Emitter[] = [];
  background: Background | null = null;
  accent: string;

  constructor(width: number, height: number, accent: string) {
    this.width = width;
    this.height = height;
    this.accent = accent;
  }

  update(dt: number): void {
    this.time += dt;
    const next: Particle[] = [];
    for (const e of this.emitters) {
      const spawned = e.update(dt, this);
      for (const p of spawned) next.push(p);
    }
    for (const p of this.particles) {
      const r = p.update(dt, this);
      if (r.alive) next.push(p);
      if (r.spawn) for (const sp of r.spawn) next.push(sp);
    }
    this.particles = next;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.background?.draw(ctx, this);
    // Sort by layer (stable enough; small N).
    const sorted = this.particles
      .map((p, i) => ({ p, i, l: p.layer ?? 0 }))
      .sort((a, b) => a.l - b.l || a.i - b.i);
    for (const { p } of sorted) p.draw(ctx, this);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Emitters

class ContinuousEmitter implements Emitter {
  private acc = 0;
  constructor(private factory: (scene: Scene) => Particle, private ratePerSec: number) {}
  update(dt: number, scene: Scene): Particle[] {
    this.acc += dt * this.ratePerSec;
    const out: Particle[] = [];
    while (this.acc >= 1) {
      out.push(this.factory(scene));
      this.acc -= 1;
    }
    return out;
  }
}

class LightningEmitter implements Emitter {
  private cooldown = 1 + Math.random() * 2;
  update(dt: number, scene: Scene): Particle[] {
    this.cooldown -= dt;
    if (this.cooldown > 0) return [];
    this.cooldown = rand(3, 7);
    return [new Lightning(scene), new ScreenFlash()];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Particles

class RainDrop implements Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
  layer = 1;

  constructor(scene: Scene, heavy = false) {
    const depth = Math.random();
    this.x = Math.random() * (scene.width + 100) - 50;
    this.y = -20;
    this.vx = (heavy ? 35 : 25) + depth * 25;
    this.vy = (heavy ? 360 : 280) + depth * 480;
    this.length = 6 + depth * 16;
    this.alpha = 0.18 + depth * 0.45;
  }

  update(dt: number, scene: Scene): UpdateResult {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= scene.height - 2) {
      return { alive: false, spawn: [new Splash(this.x, scene.height - 2, this.alpha)] };
    }
    return { alive: this.y < scene.height + 20 };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = `rgba(180, 200, 230, ${this.alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.04, this.y - this.length);
    ctx.stroke();
  }
}

class Splash implements Particle {
  layer = 2;
  age = 0;
  life = 0.35;
  constructor(public x: number, public y: number, public seedAlpha: number) {}

  update(dt: number): UpdateResult {
    this.age += dt;
    return { alive: this.age < this.life };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = this.age / this.life;
    const r = 1 + t * 6;
    const a = (1 - t) * this.seedAlpha * 0.7;
    ctx.strokeStyle = `rgba(190, 210, 235, ${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, Math.PI, 0); // upward half-circle
    ctx.stroke();
  }
}

class Lightning implements Particle {
  layer = 8;
  age = 0;
  life = 0.32;
  segments: { x: number; y: number }[];

  constructor(scene: Scene) {
    let x = rand(scene.width * 0.15, scene.width * 0.85);
    let y = 0;
    const pts: { x: number; y: number }[] = [{ x, y }];
    const targetY = rand(scene.height * 0.65, scene.height * 0.95);
    while (y < targetY) {
      y += rand(18, 38);
      x += rand(-32, 32);
      pts.push({ x, y });
      // Occasional small branch (drawn as part of main path for simplicity)
    }
    this.segments = pts;
  }

  update(dt: number): UpdateResult {
    this.age += dt;
    return { alive: this.age < this.life };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = this.age / this.life;
    // Sharp on-flash, then exponential-ish decay.
    const flash = t < 0.1 ? 1 : Math.pow(1 - (t - 0.1) / 0.9, 1.8);
    if (flash <= 0) return;
    ctx.strokeStyle = `rgba(255, 255, 220, ${flash})`;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "rgba(255, 255, 210, 0.85)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(this.segments[0]!.x, this.segments[0]!.y);
    for (let i = 1; i < this.segments.length; i++) {
      const s = this.segments[i]!;
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

class ScreenFlash implements Particle {
  layer = 9;
  age = 0;
  life = 0.55;
  peak = 0.13;

  update(dt: number): UpdateResult {
    this.age += dt;
    return { alive: this.age < this.life };
  }

  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const t = this.age / this.life;
    const env = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    const a = Math.max(0, env) * this.peak;
    ctx.fillStyle = `rgba(255, 255, 230, ${a})`;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
}

class SnowFlake implements Particle {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  swayAmp: number;
  rot = 0;
  rotSpeed: number;
  layer = 1;

  constructor(scene: Scene) {
    const depth = Math.random();
    this.x = Math.random() * scene.width;
    this.y = -10;
    this.size = 1.5 + depth * 4.5;
    this.alpha = 0.4 + depth * 0.55;
    this.vy = 25 + depth * 60;
    this.phase = Math.random() * Math.PI * 2;
    this.swayAmp = 10 + Math.random() * 30;
    this.rotSpeed = (Math.random() - 0.5) * 2.2;
  }

  update(dt: number, scene: Scene): UpdateResult {
    this.y += this.vy * dt;
    this.phase += dt * 0.9;
    this.rot += this.rotSpeed * dt;
    return { alive: this.y < scene.height + 20 };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const sway = Math.sin(this.phase) * this.swayAmp;
    const px = this.x + sway;
    ctx.save();
    ctx.translate(px, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = `rgba(255, 255, 255, ${this.alpha})`;
    ctx.lineWidth = 0.9;
    const s = this.size;
    ctx.beginPath();
    ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
    ctx.moveTo(0, -s); ctx.lineTo(0, s);
    const d = s * 0.7;
    ctx.moveTo(-d, -d); ctx.lineTo(d, d);
    ctx.moveTo(d, -d); ctx.lineTo(-d, d);
    ctx.stroke();
    ctx.restore();
  }
}

class FogPatch implements Particle {
  x: number;
  y: number;
  vx: number;
  size: number;
  baseAlpha: number;
  age = 0;
  life: number;
  layer = 0;

  constructor(scene: Scene) {
    this.y = Math.random() * scene.height;
    this.vx = rand(6, 14);
    this.size = rand(160, 320);
    this.baseAlpha = rand(0.18, 0.32);
    this.x = -this.size;
    this.life = (scene.width + this.size * 2) / this.vx;
  }

  update(dt: number): UpdateResult {
    this.x += this.vx * dt;
    this.age += dt;
    return { alive: this.age < this.life };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = this.age / this.life;
    const fade = t < 0.18 ? t / 0.18 : t > 0.82 ? (1 - t) / 0.18 : 1;
    const a = this.baseAlpha * Math.max(0, fade);
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
    g.addColorStop(0, `rgba(230, 233, 240, ${a})`);
    g.addColorStop(0.55, `rgba(230, 233, 240, ${a * 0.3})`);
    g.addColorStop(1, "rgba(230, 233, 240, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Cloud implements Particle {
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  baseAlpha: number;
  age = 0;
  life: number;
  layer = 0;

  constructor(scene: Scene) {
    this.y = rand(scene.height * 0.32, scene.height * 0.86);
    const depth = Math.random();
    this.vx = 4 + depth * 8;
    this.width = 260 + depth * 220;
    this.height = 90 + depth * 60;
    this.baseAlpha = 0.16 + depth * 0.18;
    this.x = -this.width;
    this.life = (scene.width + this.width * 2) / this.vx;
  }

  update(dt: number): UpdateResult {
    this.x += this.vx * dt;
    this.age += dt;
    return { alive: this.age < this.life };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = this.age / this.life;
    const fade = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
    const a = this.baseAlpha * Math.max(0, fade);
    const cx = this.x;
    const cy = this.y;
    const r = this.height * 0.55;
    const lobes = [
      { dx: -this.width * 0.3, dy: r * 0.15, sr: r * 1.0 },
      { dx: -this.width * 0.05, dy: -r * 0.25, sr: r * 1.35 },
      { dx: this.width * 0.25, dy: 0, sr: r * 1.05 },
    ];
    for (const { dx, dy, sr } of lobes) {
      const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, sr);
      g.addColorStop(0, `rgba(220, 225, 235, ${a})`);
      g.addColorStop(0.55, `rgba(220, 225, 235, ${a * 0.35})`);
      g.addColorStop(1, "rgba(220, 225, 235, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class SunSpark implements Particle {
  x: number;
  y: number;
  vy: number;
  age = 0;
  life: number;
  size: number;
  alpha: number;
  layer = 2;

  constructor(scene: Scene) {
    this.x = Math.random() * scene.width;
    this.y = scene.height + 8;
    this.vy = -(15 + Math.random() * 25);
    this.life = rand(3.5, 6.5);
    this.size = rand(1, 2.5);
    this.alpha = rand(0.4, 0.85);
  }

  update(dt: number): UpdateResult {
    this.age += dt;
    this.y += this.vy * dt;
    return { alive: this.age < this.life && this.y > -10 };
  }

  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const t = this.age / this.life;
    const env = t < 0.25 ? t / 0.25 : (1 - t) / 0.75;
    const a = Math.max(0, env) * this.alpha;
    const r = this.size * 4;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, withAlpha(scene.accent, a));
    g.addColorStop(1, withAlpha(scene.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Backgrounds

class SunRayBackground implements Background {
  constructor(public intensity = 1) {}

  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const base = scene.time * 0.04;
    const cx = 0;
    const cy = 0;
    const maxR = Math.hypot(scene.width, scene.height) * 1.25;
    const rayCount = 6;
    const accent = scene.accent;

    // Soft corner glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.65);
    glow.addColorStop(0, withAlpha(accent, 0.18 * this.intensity));
    glow.addColorStop(0.35, withAlpha(accent, 0.06 * this.intensity));
    glow.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, scene.width, scene.height);

    // Rotating wedges
    for (let i = 0; i < rayCount; i++) {
      const a = base + (i / rayCount) * (Math.PI / 2);
      const half = 0.06;
      const grad = ctx.createLinearGradient(
        cx,
        cy,
        Math.cos(a) * maxR,
        Math.sin(a) * maxR,
      );
      grad.addColorStop(0, withAlpha(accent, 0.16 * this.intensity));
      grad.addColorStop(0.5, withAlpha(accent, 0.05 * this.intensity));
      grad.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(Math.cos(a - half) * maxR, Math.sin(a - half) * maxR);
      ctx.lineTo(Math.cos(a + half) * maxR, Math.sin(a + half) * maxR);
      ctx.closePath();
      ctx.fill();
    }
  }
}

class FogBaseHaze implements Background {
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const breathe = 0.6 + 0.3 * Math.sin(scene.time / 2.2);
    ctx.fillStyle = `rgba(210, 215, 225, ${0.09 * breathe})`;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Scene factory

function createScene(
  condition: WeatherCondition,
  width: number,
  height: number,
  accent: string,
): Scene {
  const scene = new Scene(width, height, accent);
  switch (condition) {
    case "rain":
      scene.emitters.push(new ContinuousEmitter((s) => new RainDrop(s, false), 80));
      break;
    case "storm":
      scene.emitters.push(new ContinuousEmitter((s) => new RainDrop(s, true), 110));
      scene.emitters.push(new LightningEmitter());
      break;
    case "snow":
      scene.emitters.push(new ContinuousEmitter((s) => new SnowFlake(s), 12));
      break;
    case "fog":
      scene.background = new FogBaseHaze();
      scene.emitters.push(new ContinuousEmitter((s) => new FogPatch(s), 0.5));
      break;
    case "clear":
      scene.background = new SunRayBackground(1);
      scene.emitters.push(new ContinuousEmitter((s) => new SunSpark(s), 5));
      break;
    case "partly-cloudy":
      scene.background = new SunRayBackground(0.55);
      scene.emitters.push(new ContinuousEmitter((s) => new Cloud(s), 0.18));
      break;
    case "cloudy":
      scene.emitters.push(new ContinuousEmitter((s) => new Cloud(s), 0.35));
      break;
  }
  return scene;
}

// ────────────────────────────────────────────────────────────────────────────
// SVG overlay helpers for partly-cloudy / cloudy (no canvas needed)

// Cloud shape ported from icons.tsx. viewBox "0 0 48 28" with coords shifted
// +23x +13y so the shape is fully within positive coordinate space.
function CloudSvg() {
  // All shapes are solid white so they merge into one unified silhouette.
  // Overall transparency is controlled by the parent .fx-dyn-cloud-N opacity.
  return (
    <svg viewBox="0 0 48 28" width="100%" height="100%" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <ellipse cx={11} cy={17} rx={10} ry={7}  fill="white" />
      <ellipse cx={25} cy={12} rx={14} ry={10} fill="white" />
      <ellipse cx={37} cy={18} rx={9}  ry={7}  fill="white" />
      <rect x={2} y={17} width={42} height={9} rx={4.5} fill="white" />
    </svg>
  );
}

// Sun icon: static rays that breathe via CSS, no continuous spin.
function SunSvg() {
  const cx = 40, cy = 40, rayStart = 22, rayEnd = 34, rayCount = 8;
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <g className="fx-dyn-sun-rays">
        {Array.from({ length: rayCount }).map((_, i) => {
          const rad = (i * Math.PI * 2) / rayCount;
          return (
            <line
              key={i}
              x1={cx + Math.cos(rad) * rayStart} y1={cy + Math.sin(rad) * rayStart}
              x2={cx + Math.cos(rad) * rayEnd}   y2={cy + Math.sin(rad) * rayEnd}
              stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={16} fill="currentColor" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cloud-widget overlap helpers

// CSS opacity values that match the .fx-dyn-cloud-N classes.
const CLOUD_BASE_OPACITIES = [0.80, 0.70, 0.75, 0.65] as const;

// Fraction of the cloud's bounding rect that sits over the widget rect (0–1).
function cloudOverlapRatio(cloud: DOMRect, widget: DOMRect): number {
  const ix = Math.max(0, Math.min(cloud.right, widget.right) - Math.max(cloud.left, widget.left));
  const iy = Math.max(0, Math.min(cloud.bottom, widget.bottom) - Math.max(cloud.top, widget.top));
  const area = cloud.width * cloud.height;
  return area > 0 ? Math.min(1, (ix * iy) / area) : 0;
}

// ────────────────────────────────────────────────────────────────────────────
// React component

export default function WeatherEffectDynamic({ condition, themeAccent, widgetRects = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cloud1Ref = useRef<HTMLDivElement>(null);
  const cloud2Ref = useRef<HTMLDivElement>(null);
  const cloud3Ref = useRef<HTMLDivElement>(null);
  const cloud4Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (condition === "partly-cloudy" || condition === "cloudy" || condition === "clear") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cancelled = false;
    let raf = 0;
    let lastTime = 0;

    let scene = createScene(
      condition,
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      themeAccent,
    );

    function resize() {
      const w = canvas!.clientWidth || window.innerWidth;
      const h = canvas!.clientHeight || window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.width = w;
      scene.height = h;
    }
    resize();

    function frame(now: number) {
      if (cancelled) return;
      if (document.hidden) {
        lastTime = 0;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = lastTime === 0 ? 0 : Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      scene.update(dt);
      ctx!.clearRect(0, 0, scene.width, scene.height);
      scene.draw(ctx!);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [condition, themeAccent]);

  // Animate cloud opacity: fade out when overlapping a widget, fade back in when clear.
  useEffect(() => {
    if (condition !== "partly-cloudy" && condition !== "cloudy") return;
    if (widgetRects.length === 0) return;

    const cloudRefs = [cloud1Ref, cloud2Ref, cloud3Ref, cloud4Ref];
    // Track current opacity per cloud so we can lerp smoothly.
    const current = [...CLOUD_BASE_OPACITIES] as number[];
    let raf: number;

    function tick() {
      for (let i = 0; i < cloudRefs.length; i++) {
        const el = cloudRefs[i]!.current;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        let maxOverlap = 0;
        for (const wr of widgetRects) {
          maxOverlap = Math.max(maxOverlap, cloudOverlapRatio(rect, wr));
        }
        const base = CLOUD_BASE_OPACITIES[i]!;
        // At full overlap, reduce to ~10% of base opacity; interpolate in between.
        const target = base * (1 - maxOverlap * 0.9);
        current[i] = current[i]! + (target - current[i]!) * 0.07;
        el.style.opacity = current[i]!.toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const ref of cloudRefs) {
        if (ref.current) ref.current.style.opacity = "";
      }
    };
  }, [condition, widgetRects]);

  if (condition === "clear" || condition === "partly-cloudy" || condition === "cloudy") {
    return (
      <div className="fx-overlay" aria-hidden="true">
        {(condition === "clear" || condition === "partly-cloudy") && (
          <div className="fx-dyn-sun" style={{ color: themeAccent }}>
            <SunSvg />
          </div>
        )}
        {condition !== "clear" && (
          <>
            <div ref={cloud1Ref} className="fx-dyn-cloud fx-dyn-cloud-1"><CloudSvg /></div>
            <div ref={cloud2Ref} className="fx-dyn-cloud fx-dyn-cloud-2"><CloudSvg /></div>
          </>
        )}
        {condition === "cloudy" && (
          <>
            <div ref={cloud3Ref} className="fx-dyn-cloud fx-dyn-cloud-3"><CloudSvg /></div>
            <div ref={cloud4Ref} className="fx-dyn-cloud fx-dyn-cloud-4"><CloudSvg /></div>
          </>
        )}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="fx-overlay"
      style={{ display: "block", width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}
