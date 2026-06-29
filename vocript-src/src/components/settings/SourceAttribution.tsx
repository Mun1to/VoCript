import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface SourceAttributionProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Toggle "fuente del audio del sistema": al transcribir audio del sistema (un
 * vídeo de YouTube, un podcast en Spotify…), añade al final una línea de
 * «Fuente» con lo que sonaba (título, artista/canal, app y minuto). Solo en
 * Windows (usa la API de medios del sistema, SMTC).
 */
export const SourceAttribution: React.FC<SourceAttributionProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("source_attribution") || false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("source_attribution", value)}
        isUpdating={isUpdating("source_attribution")}
        label={t("settings.general.sourceAttribution.label")}
        description={t("settings.general.sourceAttribution.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);

SourceAttribution.displayName = "SourceAttribution";
