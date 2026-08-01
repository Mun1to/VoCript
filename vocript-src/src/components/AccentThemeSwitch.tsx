import React from "react";
import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { AccentColorPicker } from "./AccentColorPicker";
import { HeaderDropdown } from "./ui/HeaderDropdown";

/**
 * Header accent-theme switch: a chip (palette icon + "Themes" label, no chevron
 * so it mirrors the theme toggle on the far right) that opens a color-swatch
 * dropdown. The full control also lives in the Themes section.
 */
export const AccentThemeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const isLight = useResolvedTheme() === "light";

  return (
    <HeaderDropdown
      dataTour="header-themes"
      tooltip={t("sidebar.themes")}
      showChevron={false}
      panelClassName="p-3"
      icon={
        <Palette
          className={`w-3.5 h-3.5 shrink-0 ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        />
      }
      label={t("sidebar.themes")}
    >
      <AccentColorPicker size="md" />
    </HeaderDropdown>
  );
};

export default AccentThemeSwitch;
