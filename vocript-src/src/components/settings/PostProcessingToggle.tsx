import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "@/bindings";

interface PostProcessingToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Turning this on for the first time steers to a local model instead of
 * quietly defaulting to the cloud: VoCript's whole pitch is "100% local", so
 * sending a transcript to OpenAI just because it happened to be first in the
 * provider list would break that promise the moment someone flips this
 * switch. Only the *first* time, though — once the user has picked a
 * provider or entered a key for one, that choice is theirs to keep.
 */
export const PostProcessingToggle: React.FC<PostProcessingToggleProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating, setPostProcessProvider } =
      useSettings();
    const [detecting, setDetecting] = useState(false);

    const enabled = getSetting("post_process_enabled") || false;

    const handleChange = async (next: boolean) => {
      if (!next) {
        updateSetting("post_process_enabled", false);
        return;
      }

      const providerId = getSetting("post_process_provider_id") || "openai";
      const apiKeys = getSetting("post_process_api_keys") || {};
      const isUntouchedDefault =
        providerId === "openai" && !(apiKeys.openai || "").trim();

      if (!isUntouchedDefault) {
        updateSetting("post_process_enabled", true);
        return;
      }

      setDetecting(true);
      const hasLocalModel = await commands.detectLocalPostProcessProvider();
      setDetecting(false);

      if (hasLocalModel) {
        await setPostProcessProvider("ollama");
        updateSetting("post_process_enabled", true);
        toast.success(t("settings.debug.postProcessingToggle.usingOllama"));
      } else {
        toast.error(t("settings.debug.postProcessingToggle.noLocalProvider"));
      }
    };

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={handleChange}
        isUpdating={isUpdating("post_process_enabled") || detecting}
        label={t("settings.debug.postProcessingToggle.label")}
        description={t("settings.debug.postProcessingToggle.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  });
