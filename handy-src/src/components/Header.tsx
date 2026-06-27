import React from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { TranscriptionModeSwitch } from "./TranscriptionModeSwitch";
import type { SidebarSection } from "./Sidebar";
import type { AppTheme } from "@/bindings";

interface HeaderProps {
  currentSection: SidebarSection;
}

export const Header: React.FC<HeaderProps> = ({ currentSection }) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const currentTheme: AppTheme = settings?.theme || "dark";
  const isLight = currentTheme === "light";

  const toggleTheme = () => {
    const nextTheme: AppTheme = isLight ? "dark" : "light";
    updateSetting("theme", nextTheme);
  };

  return (
    <header
      className={`h-14 border-b px-6 flex items-center justify-between shrink-0 select-none transition-colors duration-200 ${
        isLight ? "bg-white border-slate-200" : "bg-[#0c0d12] border-white/10"
      }`}
    >
      {/* Active Section Title */}
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-4 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
        <span
          className={`text-xs font-bold uppercase tracking-wider ${
            isLight ? "text-slate-900" : "text-slate-200"
          }`}
        >
          {t(`sidebar.${currentSection}`)}
        </span>
      </div>

      {/* Persistent Header Toolbar - Clean Frameless */}
      <div className="flex items-center gap-4">
        {/* Transcription mode switch (voice / system × normal / live) */}
        <TranscriptionModeSwitch />

        {/* Light / Dark Mode Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isLight ? t("header.darkMode") : t("header.lightMode")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${
            isLight
              ? "text-slate-800 hover:bg-slate-100"
              : "text-slate-200 hover:bg-white/[0.06]"
          }`}
        >
          {isLight ? (
            <>
              <Moon className="w-3.5 h-3.5 text-blue-600" />
              <span>{t("header.darkMode")}</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("header.lightMode")}</span>
            </>
          )}
        </button>

        {/* Microphone Status Indicator */}
        <div
          className={`hidden sm:flex items-center gap-2 px-2 py-1 text-xs font-semibold ${
            isLight ? "text-blue-700" : "text-blue-400"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]" />
          <span>{t("header.micReady")}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
