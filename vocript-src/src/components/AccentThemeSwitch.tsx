import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { AccentColorPicker } from "./AccentColorPicker";
import { HoverTooltip } from "./ui/HoverTooltip";

/**
 * Header accent-theme switch: a chip (palette icon + "Themes" label, no chevron
 * so it mirrors the theme toggle on the far right) that opens a color-swatch
 * dropdown. The full control also lives in the Themes section.
 */
export const AccentThemeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const isLight = useResolvedTheme() === "light";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref} data-tour="header-themes">
      <HoverTooltip label={t("sidebar.themes")}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
            isLight
              ? "text-slate-800 hover:bg-slate-100"
              : "text-slate-200 hover:bg-white/[0.06]"
          }`}
        >
          <Palette className="w-3.5 h-3.5 text-logo-primary" />
          <span>{t("sidebar.themes")}</span>
        </button>
      </HoverTooltip>
      {open && (
        <div
          className={`absolute top-full start-0 mt-1 rounded-lg border shadow-lg z-50 p-3 ${
            isLight
              ? "bg-white border-slate-200"
              : "bg-[#141620] border-white/10"
          }`}
        >
          <AccentColorPicker size="md" />
        </div>
      )}
    </div>
  );
};

export default AccentThemeSwitch;
