import React from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor, Search } from "lucide-react";
import VoCriptTextLogo from "./icons/VoCriptTextLogo";
import { useSettings } from "../hooks/useSettings";
import { TranscriptionModeSwitch } from "./TranscriptionModeSwitch";
import { ProfileSelect } from "./ProfileSelect";
import { LanguageQuickSwitch } from "./LanguageQuickSwitch";
import type { AppTheme } from "@/bindings";

interface HeaderProps {
  /** Opens the command palette. Omitted, the magnifier isn't drawn at all. */
  onSearch?: () => void;
}

/**
 * The bar across the top of the window: brand, the control rail, and the two
 * square buttons on the right.
 *
 * It spans the whole width now, with the brand in it — the sidebar starts
 * below. That is the shape from the mockup, and it is what lets the rail sit
 * centred in the window rather than centred in whatever is left over after the
 * sidebar, which moved every time the sidebar was collapsed.
 */
export const Header: React.FC<HeaderProps> = ({ onSearch }) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  // Header toggle cycles through the three real settings (system → light →
  // dark) so "system" stays reachable; the button shows the current mode.
  const theme: AppTheme = settings?.theme ?? "system";
  const cycleTheme = () => {
    const order: AppTheme[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    updateSetting("theme", next);
  };
  const themeMeta = {
    system: { icon: <Monitor size={15} />, label: t("header.systemMode") },
    light: { icon: <Sun size={15} />, label: t("header.lightMode") },
    dark: { icon: <Moon size={15} />, label: t("header.darkMode") },
  }[theme];

  return (
    <header className="vc-topbar select-none">
      <div className="vc-brand">
        <VoCriptTextLogo width={104} />
      </div>

      {/* The rail: profile, the mode chips, and language, in one frame with
          hairlines between the groups. */}
      <div className="flex-1 min-w-0 flex justify-center">
        <div className="vc-chips">
          <ProfileSelect />
          <span className="vc-chips-sep" />
          <TranscriptionModeSwitch />
          <span className="vc-chips-sep" />
          <LanguageQuickSwitch />
        </div>
      </div>

      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          title={`${t("palette.title")} (Ctrl+K)`}
          aria-label={t("palette.title")}
          className="vc-iconbtn active:scale-95"
        >
          <Search size={15} />
        </button>
      )}
      <button
        type="button"
        data-tour="header-theme"
        onClick={cycleTheme}
        title={themeMeta.label}
        aria-label={themeMeta.label}
        className="vc-iconbtn active:scale-95"
      >
        {themeMeta.icon}
      </button>
    </header>
  );
};

export default Header;
