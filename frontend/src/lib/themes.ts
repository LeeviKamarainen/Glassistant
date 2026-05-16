export interface ThemePalette {
  /** Display name shown in admin. */
  label: string;
  /** Page background. Kept near-black on every theme — the magic mirror only
   *  reflects when the screen is mostly black. Themes vary tone via --theme-fg. */
  bg: string;
  /** Primary text + foreground color. All widget text alpha-blends from this. */
  fg: string;
  /** Accent color used for the sun icon, theme highlights, etc. */
  accent: string;
}

export type ThemeName = "mirror" | "moonlight" | "ember" | "forest";

export const THEMES: Record<ThemeName, ThemePalette> = {
  mirror: {
    label: "Mirror",
    bg: "#000000",
    fg: "#ffffff",
    accent: "#fbbf24", // amber
  },
  moonlight: {
    label: "Moonlight",
    bg: "#02030a",
    fg: "#dbe7ff", // cool blue-white
    accent: "#93c5fd", // pale blue
  },
  ember: {
    label: "Ember",
    bg: "#050300",
    fg: "#f7ead3", // bone / warm white
    accent: "#f59e0b", // warm amber
  },
  forest: {
    label: "Forest",
    bg: "#01060a",
    fg: "#d6e7d0", // soft sage
    accent: "#86efac", // leaf green
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && value in THEMES;
}

export function applyTheme(name: ThemeName): void {
  const theme = THEMES[name];
  const root = document.documentElement;
  root.style.setProperty("--theme-bg", theme.bg);
  root.style.setProperty("--theme-fg", theme.fg);
  root.style.setProperty("--theme-accent", theme.accent);
  root.dataset.theme = name;
}
