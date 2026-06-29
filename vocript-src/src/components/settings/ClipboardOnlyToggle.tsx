import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface ClipboardOnlyToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Toggle "copiar al portapapeles sin pegar": al terminar la transcripción, en
 * vez de pegar el texto en la app activa, lo copia al portapapeles y muestra
 * una confirmación en el overlay. Recomendado al capturar audio del sistema
 * (así el texto no cae encima del vídeo/llamada).
 */
export const ClipboardOnlyToggle: React.FC<ClipboardOnlyToggleProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("clipboard_only") || false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("clipboard_only", value)}
        isUpdating={isUpdating("clipboard_only")}
        label={t("settings.general.clipboardOnly.label")}
        description={t("settings.general.clipboardOnly.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  });
