/**
 * UI typography options.
 *
 * Every stack is built from fonts the operating system already ships: the app's
 * CSP blocks external requests, so a downloaded webfont would simply not load,
 * and bundling several families would add megabytes to the installer for a
 * cosmetic setting.
 */
export interface UiFont {
  /** Stable id stored in the `ui_font` setting; also the i18n key suffix. */
  id: string;
  stack: string;
}

export const DEFAULT_UI_FONT = "default";

export const UI_FONTS: UiFont[] = [
  {
    id: "default",
    stack:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    id: "system",
    stack:
      'system-ui, "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
  },
  {
    // Wide letterforms and open counters: the easiest to read at small sizes.
    id: "readable",
    stack: 'Verdana, "DejaVu Sans", Geneva, Tahoma, sans-serif',
  },
  {
    id: "serif",
    stack: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  },
  {
    id: "mono",
    stack: 'Consolas, "SF Mono", "DejaVu Sans Mono", ui-monospace, monospace',
  },
];

export const DEFAULT_UI_FONT_SIZE = 14;

/** Root font sizes in px. Everything is sized in rem, so this scales the whole
 *  interface, not just the text. Kept narrow: past ~17px the header controls
 *  stop fitting in the minimum window width. */
export const UI_FONT_SIZES = [
  { id: "compact", size: 13 },
  { id: "normal", size: 14 },
  { id: "large", size: 15 },
  { id: "larger", size: 16 },
];

/**
 * Resolves the `ui_font` setting to a CSS font stack.
 *
 * The value is either one of the bundled ids above or, when the user picked one
 * from their system, the family name itself. No migration needed: anything that
 * is not a known id is treated as a family, with the default stack behind it in
 * case that font is ever uninstalled.
 */
export const fontStackFor = (id: string | undefined): string => {
  if (!id) return UI_FONTS[0].stack;
  const preset = UI_FONTS.find((font) => font.id === id);
  if (preset) return preset.stack;
  // Quoted: most family names have spaces. Stray quotes would break the rule.
  return `"${id.replace(/["\\]/g, "")}", ${UI_FONTS[0].stack}`;
};

/** True when the stored value is a system family rather than a bundled preset. */
export const isSystemFont = (id: string | undefined): boolean =>
  !!id && !UI_FONTS.some((font) => font.id === id);
