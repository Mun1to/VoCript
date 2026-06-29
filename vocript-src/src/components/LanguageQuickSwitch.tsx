import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, ChevronDown } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "../i18n";

/**
 * Quick language switch in the header. Picking a language changes BOTH the app
 * UI language (`app_language` + live i18n) and the transcription model language
 * (`selected_language`) in one go — no need to set them separately.
 *
 * UI and model codes are almost identical; only Chinese differs (UI `zh`/`zh-TW`
 * vs model `zh-Hans`/`zh-Hant`), mapped below. Everything else uses the same code
 * (all 20 UI languages exist in the model's LANGUAGES list).
 */
const APP_TO_MODEL: Record<string, string> = {
  zh: "zh-Hans",
  "zh-TW": "zh-Hant",
};

export const LanguageQuickSwitch: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const isLight = settings?.theme === "light";
  const current = (settings?.app_language ||
    i18n.language) as SupportedLanguageCode;
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

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    updateSetting("app_language", code);
    updateSetting("selected_language", APP_TO_MODEL[code] ?? code);
    setOpen(false);
  };

  const currentLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === current)?.nativeName ?? current;

  return (
    <div
      className="relative"
      ref={ref}
      data-tour="header-language"
      title={t("header.language.label")}
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
        <Globe
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
          className={`absolute top-full end-0 mt-1 max-h-72 overflow-y-auto rounded-lg border shadow-lg z-50 py-1 ${
            isLight
              ? "bg-white border-slate-200"
              : "bg-[#141620] border-white/10"
          }`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === current;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelect(lang.code)}
                className={`block w-full text-start px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "text-blue-500"
                    : isLight
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {lang.nativeName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageQuickSwitch;
