import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { commands } from "@/bindings";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";

interface MuteInCallsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Mutes the user in Discord (or any voice app) while they dictate, by holding
 * F13 down. The microphone is never muted at the system level — VoCript would
 * stop hearing the user too — so the voice app has to mute itself.
 *
 * It needs one-time setup on the other app's side, and no keyboard has an F13
 * to press while Discord waits for a keybind, hence the "send the key" button.
 */
export const MuteInCalls: React.FC<MuteInCallsProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("mute_in_calls") ?? false;

    const sendKey = async () => {
      const result = await commands.sendCallMuteKey();
      if (result.status === "ok") {
        toast.success(t("settings.general.muteInCalls.sent"));
      } else {
        toast.error(result.error);
      }
    };

    return (
      <>
        <ToggleSwitch
          checked={enabled}
          onChange={(value) => updateSetting("mute_in_calls", value)}
          isUpdating={isUpdating("mute_in_calls")}
          label={t("settings.general.muteInCalls.label")}
          description={t("settings.general.muteInCalls.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
        {enabled && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-mid-gray/20 bg-mid-gray/5 px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-logo-primary" />
                <p className="text-xs leading-relaxed text-text/60">
                  {t("settings.general.muteInCalls.setupHint")}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={sendKey}
                className="shrink-0"
              >
                {t("settings.general.muteInCalls.sendKey")}
              </Button>
            </div>
          </div>
        )}
      </>
    );
  },
);
