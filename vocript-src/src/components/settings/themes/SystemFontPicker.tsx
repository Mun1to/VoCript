import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search } from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";
import { isSystemFont } from "../../../lib/constants/fonts";

/**
 * Lets the user pick any font installed on their computer, not just the bundled
 * ones. Each row previews itself, which also warns them off anything unreadable
 * before they apply it.
 */
export const SystemFontPicker: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const [fonts, setFonts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const current = getSetting("ui_font");
  const selected = isSystemFont(current) ? current : null;

  useEffect(() => {
    void commands.getSystemFonts().then(setFonts);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? fonts.filter((font) => font.toLowerCase().includes(needle))
      : fonts;
    // Capped: rendering 400 rows, each in its own font, is what would make this
    // list feel sluggish. Typing narrows it down.
    return matches.slice(0, 80);
  }, [fonts, query]);

  // Nothing to offer (non-Windows for now): stay out of the way entirely.
  if (fonts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" ref={ref}>
      <span className="text-xs font-medium uppercase tracking-wide text-text/50">
        {t("themes.typography.systemFont")}
      </span>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-start transition-colors ${
            selected
              ? "border-logo-primary/60 bg-logo-primary/10"
              : "border-mid-gray/20 hover:border-logo-primary/40"
          }`}
          style={selected ? { fontFamily: `"${selected}"` } : undefined}
        >
          <span className="truncate text-sm text-text">
            {selected ?? t("themes.typography.chooseSystemFont")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text/50" />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 flex max-h-72 w-full flex-col rounded-xl border-2 border-mid-gray/20 bg-background shadow-2xl">
            <div className="flex items-center gap-2 border-b border-mid-gray/20 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-text/40" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("themes.typography.searchFonts")}
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text/35"
              />
            </div>

            <div className="overflow-y-auto py-1">
              {filtered.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => {
                    updateSetting("ui_font", font);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{ fontFamily: `"${font}"` }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm text-text transition-colors hover:bg-logo-primary/15"
                >
                  <span className="truncate">{font}</span>
                  {font === selected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-logo-primary" />
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-text/45">
                  {t("themes.typography.noFonts")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemFontPicker;
