import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "@/bindings";

interface SystemAudioAppSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

// Empty value = capture the whole system mix (default).
const WHOLE_SYSTEM = "";

/**
 * Selector de la app objetivo para la transcripción del audio del sistema.
 * "Todo el sistema" = mezcla completa (loopback normal). Elegir una app captura
 * solo el audio de esa aplicación (WASAPI process loopback, solo Windows).
 */
export const SystemAudioAppSelector: React.FC<SystemAudioAppSelectorProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const [apps, setApps] = useState<string[]>([]);

    const selected = getSetting("system_audio_app") || WHOLE_SYSTEM;

    const refresh = useCallback(async () => {
      try {
        const list = await commands.listSystemAudioApps();
        setApps(list);
      } catch {
        setApps([]);
      }
    }, []);

    useEffect(() => {
      refresh();
    }, [refresh]);

    const stripExe = (name: string) => name.replace(/\.exe$/i, "");

    const options = [
      {
        value: WHOLE_SYSTEM,
        label: t("settings.general.systemAudioApp.wholeSystem"),
      },
      // Keep the currently-selected app visible even if it isn't playing now.
      ...(selected !== WHOLE_SYSTEM && !apps.includes(selected)
        ? [{ value: selected, label: stripExe(selected) }]
        : []),
      ...apps.map((name) => ({ value: name, label: stripExe(name) })),
    ];

    const handleSelect = async (value: string) => {
      await updateSetting(
        "system_audio_app",
        value === WHOLE_SYSTEM ? null : value,
      );
    };

    return (
      <SettingContainer
        title={t("settings.general.systemAudioApp.title")}
        description={t("settings.general.systemAudioApp.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={options}
          selectedValue={selected}
          onSelect={handleSelect}
          placeholder={t("settings.general.systemAudioApp.wholeSystem")}
          disabled={isUpdating("system_audio_app")}
          onRefresh={refresh}
        />
      </SettingContainer>
    );
  });
