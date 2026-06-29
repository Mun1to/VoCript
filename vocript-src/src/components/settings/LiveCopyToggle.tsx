import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface LiveCopyToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Toggle "pegar transcripción en vivo automáticamente": al parar la
 * transcripción en vivo, pega el texto final en la app activa (como el dictado
 * normal). Si está desactivado, el texto se queda en una cápsula editable y el
 * usuario lo copia con el botón de la cápsula.
 */
export const LiveCopyToggle: React.FC<LiveCopyToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("live_auto_paste") ?? true;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("live_auto_paste", value)}
        isUpdating={isUpdating("live_auto_paste")}
        label={t("settings.general.liveCopy.label")}
        description={t("settings.general.liveCopy.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
