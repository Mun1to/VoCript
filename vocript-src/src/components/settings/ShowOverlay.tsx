import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "@/bindings";
import type { OverlayPosition } from "@/bindings";

interface ShowOverlayProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ShowOverlay: React.FC<ShowOverlayProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    // Whether the user has ever dragged the overlay: the reset action only
    // makes sense once there is something to go back from.
    const [hasCustomPosition, setHasCustomPosition] = useState(false);

    useEffect(() => {
      void commands.hasCustomOverlayPosition().then(setHasCustomPosition);
    }, []);

    const overlayOptions = [
      { value: "none", label: t("settings.advanced.overlay.options.none") },
      { value: "bottom", label: t("settings.advanced.overlay.options.bottom") },
      { value: "top", label: t("settings.advanced.overlay.options.top") },
    ];

    const selectedPosition = (getSetting("overlay_position") ||
      "bottom") as OverlayPosition;

    const resetPosition = async () => {
      const result = await commands.resetOverlayPosition();
      if (result.status === "ok") {
        setHasCustomPosition(false);
        toast.success(t("settings.advanced.overlay.customPosition.resetDone"));
      } else {
        toast.error(result.error);
      }
    };

    return (
      <SettingContainer
        title={t("settings.advanced.overlay.title")}
        description={t("settings.advanced.overlay.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="flex items-center gap-2">
          <Dropdown
            options={overlayOptions}
            selectedValue={selectedPosition}
            onSelect={(value) =>
              updateSetting("overlay_position", value as OverlayPosition)
            }
            disabled={isUpdating("overlay_position")}
          />
          {hasCustomPosition && (
            <Button
              variant="secondary"
              size="sm"
              onClick={resetPosition}
              title={t("settings.advanced.overlay.customPosition.reset")}
              className="flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("settings.advanced.overlay.customPosition.reset")}
            </Button>
          )}
        </div>
      </SettingContainer>
    );
  },
);
