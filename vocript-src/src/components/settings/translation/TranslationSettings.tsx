import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import { LANGUAGES } from "../../../lib/constants/languages";

/**
 * "Translation" section.
 *
 * The engines can only translate **into English** — that is what Whisper's and
 * Canary's `translate` flag does, there is no target-language parameter — and
 * only some models support even that. Saying so plainly beats a toggle that
 * silently does nothing, which is what happened before: the switch showed up
 * with Parakeet or Cohere selected and had no effect at all.
 */
export const TranslationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const { models } = useModelStore();

  const selectedModelId = getSetting("selected_model");
  const dictationLanguage = getSetting("selected_language") ?? "auto";
  const translateEnabled = getSetting("translate_to_english") ?? false;

  const activeModel = useMemo(
    () => models.find((model: ModelInfo) => model.id === selectedModelId),
    [models, selectedModelId],
  );

  const capableModels = useMemo(
    () =>
      models
        .filter((model: ModelInfo) => model.supports_translation)
        .map((model: ModelInfo) => model.name),
    [models],
  );

  const supported = activeModel?.supports_translation ?? false;
  const sourceLabel =
    dictationLanguage === "auto"
      ? t("translation.autoLanguage")
      : (LANGUAGES.find((l) => l.value === dictationLanguage)?.label ??
        dictationLanguage);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("translation.title")}>
        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-text/70">{t("translation.subtitle")}</p>

          {/* What actually happens, in one line. */}
          <div className="flex items-center gap-3 rounded-xl border-2 border-mid-gray/20 px-4 py-3">
            <span className="text-sm font-semibold text-text">
              {sourceLabel}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-logo-primary" />
            <span className="text-sm font-semibold text-text">
              {t("translation.english")}
            </span>
          </div>

          {!supported && activeModel && (
            <div className="flex items-start gap-2.5 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-text/80">
                  {t("translation.unsupported", { model: activeModel.name })}
                </p>
                {capableModels.length > 0 && (
                  <p className="text-xs text-text/55">
                    {t("translation.capableModels", {
                      models: capableModels.join(", "),
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <ToggleSwitch
          checked={translateEnabled && supported}
          onChange={(value) => updateSetting("translate_to_english", value)}
          isUpdating={isUpdating("translate_to_english")}
          disabled={!supported}
          label={t("translation.toggle.label")}
          description={t("translation.toggle.description")}
          descriptionMode="inline"
          grouped
        />
      </SettingsGroup>

      <SettingsGroup title={t("translation.limits.title")}>
        <div className="flex items-start gap-2.5 p-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-text/45" />
          <div className="flex flex-col gap-2 text-sm text-text/70">
            <p>{t("translation.limits.englishOnly")}</p>
            <p>{t("translation.limits.future")}</p>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};

export default TranslationSettings;
