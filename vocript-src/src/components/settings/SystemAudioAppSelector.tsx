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

    // Construye las opciones y deduplica por nombre visible (sin .exe y sin
    // distinguir mayúsculas) para que una misma app que abre varios procesos
    // (p. ej. Spotify) no aparezca repetida. Las apps enumeradas van antes que
    // la seleccionada para conservar su valor "real" cuando coinciden.
    const rawOptions = [
      {
        value: WHOLE_SYSTEM,
        label: t("settings.general.systemAudioApp.wholeSystem"),
      },
      ...apps.map((name) => ({ value: name, label: stripExe(name) })),
      // Mantén visible la app seleccionada aunque no esté sonando ahora.
      ...(selected !== WHOLE_SYSTEM
        ? [{ value: selected, label: stripExe(selected) }]
        : []),
    ];
    const seenLabels = new Set<string>();
    const options = rawOptions.filter((o) => {
      const key = o.label.toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });

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
