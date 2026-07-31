/**
 * Preset accent colors for the "Themes" section / header picker. The accent is
 * the `--color-logo-primary` CSS variable (see App.css + tailwind.config.js).
 * Stored per-user as a hex string in the `accent_color` setting so a future
 * free-color picker can reuse the same field.
 */
export interface AccentPreset {
  /** Stable id (also the a11y label). */
  id: string;
  /** Hex value applied to `--color-logo-primary`. */
  color: string;
}

export const DEFAULT_ACCENT = "#3b82f6";

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", color: "#3b82f6" },
  { id: "indigo", color: "#6366f1" },
  { id: "purple", color: "#a855f7" },
  { id: "pink", color: "#ec4899" },
  { id: "red", color: "#ef4444" },
  { id: "orange", color: "#f97316" },
  { id: "green", color: "#22c55e" },
  { id: "teal", color: "#14b8a6" },
];

/**
 * Whether a string is a hex color the accent pipeline can handle. Guards the
 * free-color field: `darkenHex` and `hexToRgba` would produce `NaN` colors from
 * anything else, painting the whole UI black.
 */
export function isValidHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Accepts "3b82f6", "#3B82F6" or "#3bf" and returns the canonical "#3b82f6". */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (!isValidHex(`#${raw}`)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}

/** hex → "rgba(r, g, b, a)" (for the accent glow shadow). */
export function hexToRgba(hex: string, alpha = 0.5): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Darken a hex color by `amount` (0–1) to derive the logo stroke shade. */
export function darkenHex(hex: string, amount = 0.25): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  const r = clamp(((n >> 16) & 255) * (1 - amount));
  const g = clamp(((n >> 8) & 255) * (1 - amount));
  const b = clamp((n & 255) * (1 - amount));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
