import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, ChevronDown } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

/**
 * Professional-profile selector shown in the header. Picking a profile writes
 * `work_profile` (null = "normal"). The profile adds a voice→symbol command
 * layer on top of the always-on personal dictionary:
 *   - normal  → nothing extra
 *   - coding  → built-in code symbols (arroba→@, punto y coma→;, …)
 *   - custom  → the user's own commands (`custom_profile_commands`)
 *
 * Custom dropdown (not a native <select>, which would reserve the width of the
 * longest option) so the trigger hugs the current label and reads as a compact
 * pill, aligned with the quick-control pills on the right of the header.
 */
const PROFILES = [
  { value: "normal", labelKey: "header.profile.normal" },
  { value: "coding", labelKey: "header.profile.coding" },
  { value: "custom", labelKey: "header.profile.custom" },
] as const;

export const ProfileSelect: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const isLight = settings?.theme === "light";
  const current = settings?.work_profile ?? "normal";
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

  const handleSelect = (value: string) => {
    updateSetting("work_profile", value === "normal" ? null : value);
    setOpen(false);
  };

  const currentLabel = t(
    PROFILES.find((p) => p.value === current)?.labelKey ??
      "header.profile.normal",
  );

  return (
    <div
      className="relative"
      ref={ref}
      data-tour="header-profile"
      title={t("header.profile.label")}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded-lg text-xs font-bold transition-colors ${
          isLight
            ? "text-blue-600 hover:bg-slate-100"
            : "text-blue-400 hover:bg-white/[0.06]"
        }`}
      >
        <Briefcase
          className={`w-3.5 h-3.5 shrink-0 ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        />
        <span>{currentLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div
          className={`absolute top-full start-0 mt-1 min-w-full rounded-lg border shadow-lg z-50 py-1 ${
            isLight
              ? "bg-white border-slate-200"
              : "bg-[#141620] border-white/10"
          }`}
        >
          {PROFILES.map((p) => {
            const active = p.value === current;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handleSelect(p.value)}
                className={`block w-full text-start px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "text-blue-500"
                    : isLight
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {t(p.labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProfileSelect;
