import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "@/hooks/useSettings";
import type { AppTheme } from "@/bindings";

interface ThemeSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();

    const currentTheme = (settings?.theme ?? "system") as AppTheme;

    const themeOptions: { value: AppTheme; label: string }[] = [
      { value: "system", label: t("settings.theme.system") },
      { value: "light", label: t("settings.theme.light") },
      { value: "dark", label: t("settings.theme.dark") },
    ];

    const handleThemeChange = (value: string) => {
      updateSetting("theme", value as AppTheme);
    };

    return (
      <SettingContainer
        title={t("settings.theme.title")}
        description={t("settings.theme.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={themeOptions}
          selectedValue={currentTheme}
          onSelect={handleThemeChange}
        />
      </SettingContainer>
    );
  },
);

ThemeSelector.displayName = "ThemeSelector";
