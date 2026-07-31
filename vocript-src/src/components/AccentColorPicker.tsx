import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pipette } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  normalizeHex,
} from "../lib/constants/accentColors";

interface AccentColorPickerProps {
  /** "sm" for the compact header row, "md" for the settings section. */
  size?: "sm" | "md";
  /** Adds the free-color control (wheel + hex field) after the presets. */
  allowCustom?: boolean;
}

/** The OS color dialog fires on every drag; persisting each step would hammer
 *  the settings file. Long enough to coalesce a drag, short enough to feel live. */
const WRITE_DELAY_MS = 200;

/**
 * Accent color picker: preset swatches plus, optionally, any color at all.
 * Picking one persists `accent_color`, which App.tsx maps onto the
 * `--color-logo-primary` CSS variable, recoloring the whole UI.
 */
export const AccentColorPicker: React.FC<AccentColorPickerProps> = ({
  size = "md",
  allowCustom = false,
}) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const isLight = useResolvedTheme() === "light";
  const stored = (settings?.accent_color ?? DEFAULT_ACCENT).toLowerCase();

  // What the hex field shows while being edited. Mid-typing values like "#3b8"
  // are not yet valid, so the field cannot read straight from settings.
  const [draft, setDraft] = useState(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = useRef(false);

  // Follow external changes (a preset click, another window) unless the user is
  // mid-edit, which would yank the text from under them.
  useEffect(() => {
    if (!isEditing.current) setDraft(stored);
  }, [stored]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const persist = (hex: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateSetting("accent_color", hex);
      isEditing.current = false;
    }, WRITE_DELAY_MS);
  };

  const handleFreeColor = (value: string) => {
    isEditing.current = true;
    setDraft(value);
    const hex = normalizeHex(value);
    if (hex) persist(hex);
  };

  const dot = size === "sm" ? "w-4 h-4" : "w-7 h-7";
  const ringOffset = isLight ? "ring-offset-white" : "ring-offset-[#0c0d12]";
  const isPreset = ACCENT_PRESETS.some((p) => p.color.toLowerCase() === stored);
  const draftIsValid = normalizeHex(draft) !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACCENT_PRESETS.map((preset) => {
        const active = preset.color.toLowerCase() === stored;
        return (
          <button
            key={preset.id}
            type="button"
            aria-label={preset.id}
            onClick={() => {
              isEditing.current = false;
              updateSetting("accent_color", preset.color);
            }}
            style={{ backgroundColor: preset.color }}
            className={`${dot} rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
              active
                ? `ring-2 ring-offset-2 ${ringOffset} ring-current scale-110`
                : ""
            }`}
          >
            {active && size === "md" && (
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            )}
          </button>
        );
      })}

      {allowCustom && (
        <>
          <span className="mx-1 h-6 w-px bg-mid-gray/25" aria-hidden="true" />

          {/* The swatch is the label; the real <input type="color"> sits on top
              invisibly so clicking anywhere on it opens the OS color dialog. */}
          <label
            className={`relative ${dot} shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110 ${
              isPreset
                ? ""
                : `ring-2 ring-offset-2 ${ringOffset} ring-current scale-110`
            }`}
            style={{
              background: isPreset
                ? "conic-gradient(#ef4444, #f97316, #eab308, #22c55e, #14b8a6, #3b82f6, #a855f7, #ec4899, #ef4444)"
                : draftIsValid
                  ? draft
                  : stored,
            }}
          >
            <input
              type="color"
              value={normalizeHex(draft) ?? stored}
              onChange={(e) => handleFreeColor(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={t("themes.custom.pick")}
            />
            {isPreset && (
              <Pipette
                className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow"
                strokeWidth={2.5}
              />
            )}
          </label>

          <input
            type="text"
            value={draft}
            spellCheck={false}
            onChange={(e) => handleFreeColor(e.target.value)}
            onFocus={() => {
              isEditing.current = true;
            }}
            onBlur={() => {
              isEditing.current = false;
              setDraft(stored);
            }}
            aria-label={t("themes.custom.label")}
            className={`w-24 rounded-lg border-2 bg-transparent px-2 py-1 font-mono text-xs text-text outline-none transition-colors ${
              draftIsValid
                ? "border-mid-gray/20 focus:border-logo-primary"
                : "border-red-500/60"
            }`}
          />
        </>
      )}
    </div>
  );
};

export default AccentColorPicker;
