import type { ReactNode } from "react";

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

/** Map Open-Meteo WMO weather codes to our condition buckets. */
export function codeToCondition(code: number | null): WeatherCondition {
  if (code == null) return "cloudy";
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export function conditionLabel(condition: WeatherCondition): string {
  switch (condition) {
    case "clear":
      return "Clear";
    case "partly-cloudy":
      return "Partly cloudy";
    case "cloudy":
      return "Cloudy";
    case "fog":
      return "Fog";
    case "rain":
      return "Rain";
    case "snow":
      return "Snow";
    case "storm":
      return "Thunderstorm";
  }
}

const SIZE = 64;

interface IconProps {
  className?: string;
}

function Svg({ children, className }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="1em"
      height="1em"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Cloud({
  cx,
  cy,
  fill = "rgba(255,255,255,1)",
  scale = 1,
}: {
  cx: number;
  cy: number;
  fill?: string;
  scale?: number;
}) {
  // Three overlapping ellipses → fluffy cloud silhouette. Single group so a
  // parent animation (drift) moves the whole shape.
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <ellipse cx={-12} cy={4} rx={10} ry={7} fill={fill} />
      <ellipse cx={2} cy={-1} rx={14} ry={10} fill={fill} />
      <ellipse cx={14} cy={5} rx={9} ry={7} fill={fill} />
      <rect x={-21} y={4} width={42} height={9} rx={4.5} fill={fill} />
    </g>
  );
}

function Sun({
  cx,
  cy,
  r = 10,
  rays = true,
}: {
  cx: number;
  cy: number;
  r?: number;
  rays?: boolean;
}) {
  const rayLength = r + 7;
  const rayStart = r + 3;
  const rayCount = 8;
  // Both fill and stroke come from the theme accent via CSS vars.
  return (
    <g style={{ color: "var(--theme-accent)" }}>
      {rays && (
        <g
          className="anim-sun-spin"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          {Array.from({ length: rayCount }).map((_, i) => {
            const angle = (i * 360) / rayCount;
            const rad = (angle * Math.PI) / 180;
            const x1 = cx + Math.cos(rad) * rayStart;
            const y1 = cy + Math.sin(rad) * rayStart;
            const x2 = cx + Math.cos(rad) * rayLength;
            const y2 = cy + Math.sin(rad) * rayLength;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}
      <circle cx={cx} cy={cy} r={r} fill="currentColor" className="anim-sun-pulse" />
    </g>
  );
}

function ClearIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <Sun cx={32} cy={32} r={12} />
    </Svg>
  );
}

function PartlyCloudyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <Sun cx={22} cy={22} r={9} />
      <g className="anim-cloud">
        <Cloud cx={38} cy={40} />
      </g>
    </Svg>
  );
}

function CloudyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g className="anim-cloud">
        <Cloud cx={32} cy={32} scale={1.15} />
      </g>
    </Svg>
  );
}

function FogIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g className="anim-fog" style={{ animationDuration: "6s" }}>
        <rect x={6} y={22} width={48} height={3} rx={1.5} fill="rgba(255,255,255,0.55)" />
      </g>
      <g className="anim-fog" style={{ animationDuration: "7s", animationDelay: "-1s" }}>
        <rect x={10} y={32} width={44} height={3} rx={1.5} fill="rgba(255,255,255,0.75)" />
      </g>
      <g className="anim-fog" style={{ animationDuration: "8s", animationDelay: "-2.5s" }}>
        <rect x={4} y={42} width={50} height={3} rx={1.5} fill="rgba(255,255,255,0.55)" />
      </g>
    </Svg>
  );
}

function RainIcon({ className }: IconProps) {
  const drops = [
    { cx: 22, delay: 0 },
    { cx: 32, delay: 0.45 },
    { cx: 42, delay: 0.9 },
  ];
  return (
    <Svg className={className}>
      <g className="anim-cloud">
        <Cloud cx={32} cy={24} scale={1.1} />
      </g>
      {drops.map((d) => (
        <g
          key={d.cx}
          className="anim-rain"
          style={{ animationDelay: `${d.delay}s` }}
        >
          <circle cx={d.cx} cy={40} r={2} fill="#7dd3fc" />
        </g>
      ))}
    </Svg>
  );
}

function Snowflake({ cx, cy, size = 4 }: { cx: number; cy: number; size?: number }) {
  return (
    <g stroke="white" strokeWidth={1.1} strokeLinecap="round">
      <line x1={cx - size} y1={cy} x2={cx + size} y2={cy} />
      <line x1={cx} y1={cy - size} x2={cx} y2={cy + size} />
      <line x1={cx - size * 0.7} y1={cy - size * 0.7} x2={cx + size * 0.7} y2={cy + size * 0.7} />
      <line x1={cx + size * 0.7} y1={cy - size * 0.7} x2={cx - size * 0.7} y2={cy + size * 0.7} />
    </g>
  );
}

function SnowIcon({ className }: IconProps) {
  const flakes = [
    { cx: 22, delay: 0 },
    { cx: 32, delay: 1.1 },
    { cx: 42, delay: 2.2 },
  ];
  return (
    <Svg className={className}>
      <g className="anim-cloud">
        <Cloud cx={32} cy={24} scale={1.1} />
      </g>
      {flakes.map((f) => (
        <g
          key={f.cx}
          className="anim-snow"
          style={{
            animationDelay: `${f.delay}s`,
            transformOrigin: `${f.cx}px 40px`,
          }}
        >
          <Snowflake cx={f.cx} cy={40} />
        </g>
      ))}
    </Svg>
  );
}

function StormIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g className="anim-cloud">
        <Cloud cx={32} cy={22} fill="rgba(180,180,200,0.75)" scale={1.15} />
      </g>
      <g className="anim-bolt">
        <path
          d="M 30 34 L 38 34 L 33 44 L 39 44 L 27 56 L 30 46 L 25 46 Z"
          fill="#fde047"
          stroke="#facc15"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      </g>
    </Svg>
  );
}

const ICONS: Record<WeatherCondition, (p: IconProps) => ReactNode> = {
  clear: ClearIcon,
  "partly-cloudy": PartlyCloudyIcon,
  cloudy: CloudyIcon,
  fog: FogIcon,
  rain: RainIcon,
  snow: SnowIcon,
  storm: StormIcon,
};

export function WeatherIcon({
  condition,
  className,
}: {
  condition: WeatherCondition;
  className?: string;
}) {
  const Icon = ICONS[condition];
  return <Icon className={className} />;
}
