import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard from "./ModelCard";
import VoCriptTextLogo from "../icons/VoCriptTextLogo";
import { Dropdown } from "../ui/Dropdown";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { LANGUAGES } from "../../lib/constants/languages";
import { languageName } from "../../lib/utils/languageNames";
import {
  POPULAR_LANGUAGES,
  getRecommendationReason,
  getRecommendedModelId,
  modelSupportsLanguage,
} from "../../lib/utils/modelRecommendation";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.language;
  // One selector per slice instead of the whole store: subscribing to
  // everything re-rendered this screen (and its ~18 model cards) on unrelated
  // changes, including every download-progress tick.
  const models = useModelStore((s) => s.models);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const selectModel = useModelStore((s) => s.selectModel);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const verifyingModels = useModelStore((s) => s.verifyingModels);
  const extractingModels = useModelStore((s) => s.extractingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const downloadStats = useModelStore((s) => s.downloadStats);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  // Only this one field matters here; useSettings() would subscribe the whole
  // screen to every settings change (including the isUpdating bookkeeping that
  // each write flips twice).
  const language =
    useSettingsStore((s) => s.settings?.selected_language) ?? "en";
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);

  const isDownloading = selectedModelId !== null;

  const languageLabel = useMemo(
    () => languageName(language, uiLanguage),
    [language, uiLanguage],
  );

  // Best model for the chosen language.
  const recommendedModelId = useMemo(
    () => getRecommendedModelId(models, language),
    [models, language],
  );

  const handleLanguageSelect = useCallback(
    (code: string) => {
      if (isDownloading) return;
      updateSetting("selected_language", code);
    },
    [isDownloading, updateSetting],
  );

  // Quick-pick chips. The user's own language always gets one, even when it is
  // not among the widely-spoken ones — otherwise a Polish speaker opens this
  // screen with every chip pointing at somebody else's language.
  const languageChips = useMemo(() => {
    const codes = POPULAR_LANGUAGES.includes(language)
      ? POPULAR_LANGUAGES
      : [language, ...POPULAR_LANGUAGES];
    return codes
      .map((code) => ({ code, label: languageName(code, uiLanguage) }))
      .filter((chip): chip is { code: string; label: string } => !!chip.label);
  }, [language, uiLanguage]);

  // Every language the app can dictate in, for the ones the chips leave out.
  // "Auto" is deliberately absent: this screen exists to recommend a model for
  // a language, and "whatever comes out" cannot be recommended for.
  const allLanguageOptions = useMemo(
    () =>
      LANGUAGES.filter((l) => l.value !== "auto")
        .map((l) => ({
          value: l.value,
          label: languageName(l.value, uiLanguage) ?? l.label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, uiLanguage)),
    [uiLanguage],
  );

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

  // Stable identity so the memoised ModelCards are not invalidated on every
  // render of this screen.
  const handleDownloadModel = useCallback(
    async (modelId: string) => {
      setSelectedModelId(modelId);

      // Error toast is handled centrally by the model-download-failed event listener
      // in modelStore — no toast here to avoid duplicates.
      const success = await downloadModel(modelId);
      if (!success) {
        setSelectedModelId(null);
      }
    },
    [downloadModel],
  );

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

  // Why this one and not another. Vague reassurance is what people ignore; the
  // actual reason is what lets them accept the suggestion and move on.
  const recommendationWhy =
    languageLabel && recommendedModel
      ? t(
          `onboarding.why.${getRecommendationReason(recommendedModel.id, language)}`,
          {
            language: languageLabel,
          },
        )
      : null;

  // With nothing to feature — every model already on disk, or a language no
  // model covers — a collapsed list would leave the screen looking empty.
  const listIsOpen = showAllModels || !recommendedModel;

  return (
    <div className="h-screen w-screen flex flex-col p-6 gap-4 inset-0">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <VoCriptTextLogo width={200} />
        <p className="text-text/70 max-w-md font-medium mx-auto">
          {t("onboarding.subtitle")}
        </p>
      </div>

      {/* `my-auto` centres the short state (one recommended model) and gives
          way to scrolling once the full list is unfolded. */}
      <div className="max-w-[640px] w-full mx-auto flex-1 flex flex-col min-h-0 overflow-y-auto px-2">
        <div className="my-auto flex flex-col">
          {/* Language quick-pick: recommends the best model for your language */}
          <div className="flex flex-col gap-2 pb-4 shrink-0 text-center">
            <p className="text-sm font-medium text-text/70">
              {t("onboarding.chooseLanguage")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {languageChips.map(({ code, label }) => {
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
            {/* The chips already say which language is picked, so this one keeps
              reading "Another language…": it is the way out of the shortlist,
              not a second display of the same state. */}
            <div className="mx-auto w-56 pt-1">
              <Dropdown
                options={allLanguageOptions}
                selectedValue={null}
                onSelect={handleLanguageSelect}
                disabled={isDownloading}
                placeholder={t("onboarding.otherLanguage")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pb-6">
            {recommendedModel && (
              <div className="flex flex-col gap-2">
                {recommendationWhy && (
                  <p className="text-sm text-text/70 text-center px-2">
                    {recommendationWhy}
                  </p>
                )}
                <ModelCard
                  key={recommendedModel.id}
                  model={recommendedModel}
                  variant="featured"
                  status={getModelStatus(recommendedModel.id)}
                  disabled={isDownloading}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  downloadProgress={getModelDownloadProgress(
                    recommendedModel.id,
                  )}
                  downloadSpeed={getModelDownloadSpeed(recommendedModel.id)}
                  preferredLanguage={language}
                  recommendedLabel={recommendedBadge}
                />
                <p className="text-xs text-text/45 text-center">
                  {t("onboarding.changeLater")}
                </p>
              </div>
            )}

            {/* The other models stay folded away. Eighteen cards on the very
              first screen is not a choice, it is a wall — and every one of
              them needed reading to find out it was the wrong one. */}
            {otherModels.length > 0 && recommendedModel && (
              <button
                type="button"
                onClick={() => setShowAllModels((open) => !open)}
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-text/60 hover:text-text transition-colors"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    listIsOpen ? "rotate-180" : ""
                  }`}
                />
                {listIsOpen
                  ? t("onboarding.hideOtherModels")
                  : t("onboarding.showOtherModels", {
                      count: otherModels.length,
                    })}
              </button>
            )}

            {listIsOpen &&
              otherModels.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  status={getModelStatus(model.id)}
                  disabled={isDownloading}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  downloadProgress={getModelDownloadProgress(model.id)}
                  downloadSpeed={getModelDownloadSpeed(model.id)}
                  preferredLanguage={language}
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
