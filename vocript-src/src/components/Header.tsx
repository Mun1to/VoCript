import React from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor, Search } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { TranscriptionModeSwitch } from "./TranscriptionModeSwitch";
import { ProfileSelect } from "./ProfileSelect";
import { LanguageQuickSwitch } from "./LanguageQuickSwitch";
import { AccentThemeSwitch } from "./AccentThemeSwitch";
import type { AppTheme } from "@/bindings";

interface HeaderProps {
  /** Opens the command palette. Omitted, the magnifier isn't drawn at all. */
  onSearch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearch }) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const isLight = useResolvedTheme() === "light";

  // Header toggle cycles through the three real settings (system → light →
  // dark) so "system" stays reachable; the button shows the current mode.
  const theme: AppTheme = settings?.theme ?? "system";
  const cycleTheme = () => {
    const order: AppTheme[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    updateSetting("theme", next);
  };
  const themeMeta = {
    system: {
      icon: <Monitor className="w-3.5 h-3.5 text-accent" />,
      label: t("header.systemMode"),
    },
    light: {
      icon: <Sun className="w-3.5 h-3.5 text-amber-400" />,
      label: t("header.lightMode"),
    },
    dark: {
      icon: <Moon className="w-3.5 h-3.5 text-accent" />,
      label: t("header.darkMode"),
    },
  }[theme];

  return (
    <header
      className={`h-14 border-b px-6 flex items-center gap-4 shrink-0 select-none transition-colors duration-200 ${
        isLight ? "bg-white border-slate-200" : "bg-[#0c0d12] border-white/10"
      }`}
    >
      {/* Left slot (flex-1 keeps the center group centered): quick accent-color
          picker. The full control lives in the Themes section. The active
          section isn't repeated here (it's in the sidebar + page heading). */}
      <div className="flex-1 min-w-0 flex items-center">
        <AccentThemeSwitch />
      </div>

      {/* Center: profile + control pills + language, grouped together */}
      <div className="flex items-center gap-3">
        <ProfileSelect />
        <TranscriptionModeSwitch />
        <LanguageQuickSwitch />
      </div>

      {/* Right: search + theme (flex-1, pushed to the end) */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-3">
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            title={`${t("palette.title")} (Ctrl+K)`}
            aria-label={t("palette.title")}
            className={`p-1.5 rounded-lg transition-colors active:scale-95 ${
              isLight
                ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            }`}
          >
            <Search size={16} />
          </button>
        )}
        <button
          type="button"
          data-tour="header-theme"
          onClick={cycleTheme}
          title={themeMeta.label}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
            isLight
              ? "text-slate-800 hover:bg-slate-100"
              : "text-slate-200 hover:bg-white/[0.06]"
          }`}
        >
          {themeMeta.icon}
          <span>{themeMeta.label}</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
