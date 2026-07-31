import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard from "./ModelCard";
import VoCriptTextLogo from "../icons/VoCriptTextLogo";
import { useModelStore } from "../../stores/modelStore";
import { useSettings } from "../../hooks/useSettings";
import { LANGUAGES } from "../../lib/constants/languages";
import {
  POPULAR_LANGUAGES,
  getRecommendedModelId,
  modelSupportsLanguage,
} from "../../lib/utils/modelRecommendation";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();
  const { settings, updateSetting } = useSettings();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const isDownloading = selectedModelId !== null;

  // Language the user is setting up for (defaults to the app's current one).
  const language = settings?.selected_language ?? "es";

  const languageLabel = useMemo(
    () => LANGUAGES.find((l) => l.value === language)?.label,
    [language],
  );

  // Best model for the chosen language.
  const recommendedModelId = useMemo(
    () => getRecommendedModelId(models, language),
    [models, language],
  );

  const handleLanguageSelect = (code: string) => {
    if (isDownloading) return;
    updateSetting("selected_language", code);
  };

  // Watch for the selected model to finish downloading + verifying + extracting
  useEffect(() => {
    if (!selectedModelId) return;

    const model = models.find((m) => m.id === selectedModelId);
    const stillDownloading = selectedModelId in downloadingModels;
    const stillVerifying = selectedModelId in verifyingModels;
    const stillExtracting = selectedModelId in extractingModels;

    if (
      model?.is_downloaded &&
      !stillDownloading &&
      !stillVerifying &&
      !stillExtracting
    ) {
      // Model is ready — select it and transition
      selectModel(selectedModelId).then((success) => {
        if (success) {
          onModelSelected();
        } else {
          toast.error(t("onboarding.errors.selectModel"));
          setSelectedModelId(null);
        }
      });
    }
  }, [
    selectedModelId,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    onModelSelected,
    t,
  ]);

  const handleDownloadModel = async (modelId: string) => {
    setSelectedModelId(modelId);

    // Error toast is handled centrally by the model-download-failed event listener
    // in modelStore — no toast here to avoid duplicates.
    const success = await downloadModel(modelId);
    if (!success) {
      setSelectedModelId(null);
    }
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    return "downloadable";
  };

  const getModelDownloadProgress = (modelId: string): number | undefined => {
    return downloadProgress[modelId]?.percentage;
  };

  const getModelDownloadSpeed = (modelId: string): number | undefined => {
    return downloadStats[modelId]?.speed;
  };

  // Recommended model first (if not already downloaded), then the ones that can
  // handle the chosen language by size, and the ones that can't at the bottom.
  const { recommendedModel, otherModels } = useMemo(() => {
    const notDownloaded = models.filter((m: ModelInfo) => !m.is_downloaded);
    const rec =
      notDownloaded.find((m: ModelInfo) => m.id === recommendedModelId) ?? null;
    const others = notDownloaded
      .filter((m: ModelInfo) => m.id !== rec?.id)
      .sort((a: ModelInfo, b: ModelInfo) => {
        const byLanguage =
          Number(modelSupportsLanguage(b, language)) -
          Number(modelSupportsLanguage(a, language));
        return byLanguage || Number(a.size_mb) - Number(b.size_mb);
      });
    return { recommendedModel: rec, otherModels: others };
  }, [models, recommendedModelId, language]);

  // Models already present on disk (e.g. a reinstall that kept them). If any,
  // offer to continue with them instead of forcing a fresh download.
  const downloadedModels = useMemo(
    () => models.filter((m: ModelInfo) => m.is_downloaded),
    [models],
  );
  const [skipInstalledPrompt, setSkipInstalledPrompt] = useState(false);
  const showInstalledPrompt =
    downloadedModels.length > 0 && !skipInstalledPrompt;

  const handleUseInstalled = async () => {
    const best =
      downloadedModels.find((m) => m.id === recommendedModelId) ??
      downloadedModels[0];
    if (!best) return;
    const success = await selectModel(best.id);
    if (success) {
      onModelSelected();
    } else {
      toast.error(t("onboarding.errors.selectModel"));
    }
  };

  const recommendedBadge =
    language && language !== "auto" && languageLabel
      ? t("settings.models.recommendedForLanguage", { language: languageLabel })
      : t("onboarding.recommended");

  return (
    <div className="h-screen w-screen flex flex-col p-6 gap-4 inset-0">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <VoCriptTextLogo width={200} />
        <p className="text-text/70 max-w-md font-medium mx-auto">
          {t("onboarding.subtitle")}
        </p>
      </div>

      <div className="max-w-[600px] w-full mx-auto text-center flex-1 flex flex-col min-h-0 overflow-y-auto px-2">
        {/* Language quick-pick: recommends the best model for your language */}
        <div className="flex flex-col gap-2 pb-4 shrink-0">
          <p className="text-sm font-medium text-text/70">
            {t("onboarding.chooseLanguage")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {POPULAR_LANGUAGES.map((code) => {
              const label =
                LANGUAGES.find((l) => l.value === code)?.label ?? code;
              const active = code === language;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={isDownloading}
                  onClick={() => handleLanguageSelect(code)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-logo-primary/80 text-white"
                      : "bg-mid-gray/10 text-text/70 hover:bg-mid-gray/20"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 pb-6">
          {recommendedModel && (
            <ModelCard
              key={recommendedModel.id}
              model={recommendedModel}
              variant="featured"
              status={getModelStatus(recommendedModel.id)}
              disabled={isDownloading}
              onSelect={handleDownloadModel}
              onDownload={handleDownloadModel}
              downloadProgress={getModelDownloadProgress(recommendedModel.id)}
              downloadSpeed={getModelDownloadSpeed(recommendedModel.id)}
              recommendedLabel={recommendedBadge}
            />
          )}

          {otherModels.map((model: ModelInfo) => (
            <ModelCard
              key={model.id}
              model={model}
              status={getModelStatus(model.id)}
              disabled={isDownloading}
              onSelect={handleDownloadModel}
              onDownload={handleDownloadModel}
              downloadProgress={getModelDownloadProgress(model.id)}
              downloadSpeed={getModelDownloadSpeed(model.id)}
              unsupportedLabel={
                languageLabel && !modelSupportsLanguage(model, language)
                  ? t("onboarding.modelCard.noLanguageSupport", {
                      language: languageLabel,
                    })
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {showInstalledPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border-2 border-mid-gray/20 bg-[var(--color-background)] p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold text-text">
              {t("onboarding.installed.title")}
            </h2>
            <p className="text-sm text-text/70">
              {t("onboarding.installed.description", {
                count: downloadedModels.length,
              })}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleUseInstalled}
                className="rounded-lg bg-logo-primary px-4 py-2.5 font-semibold text-white transition hover:bg-logo-primary/90"
              >
                {t("onboarding.installed.continue")}
              </button>
              <button
                type="button"
                onClick={() => setSkipInstalledPrompt(true)}
                className="rounded-lg px-4 py-2 font-medium text-text/70 transition hover:bg-mid-gray/10 hover:text-text"
              >
                {t("onboarding.installed.downloadNew")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
