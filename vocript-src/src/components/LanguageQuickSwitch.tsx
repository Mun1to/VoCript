import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "../i18n";
import { HeaderDropdown, HeaderDropdownOption } from "./ui/HeaderDropdown";

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
  const isLight = useResolvedTheme() === "light";
  const current = (settings?.app_language ||
    i18n.language) as SupportedLanguageCode;

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    updateSetting("app_language", code);
    updateSetting("selected_language", APP_TO_MODEL[code] ?? code);
  };

  const currentLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === current)?.nativeName ?? current;

  return (
    <HeaderDropdown
      dataTour="header-language"
      tooltip={t("header.language.label")}
      align="end"
      panelClassName="py-1 max-h-72 overflow-y-auto"
      icon={
        <Globe
          className={`w-3.5 h-3.5 shrink-0 ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        />
      }
      label={currentLabel}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <HeaderDropdownOption
          key={lang.code}
          active={lang.code === current}
          onClick={() => handleSelect(lang.code)}
        >
          {lang.nativeName}
        </HeaderDropdownOption>
      ))}
    </HeaderDropdown>
  );
};

export default LanguageQuickSwitch;
