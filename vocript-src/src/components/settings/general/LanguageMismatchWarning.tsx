import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useModelStore } from "../../../stores/modelStore";
import { useSettings } from "../../../hooks/useSettings";
import { LANGUAGES } from "../../../lib/constants/languages";
import {
  getRecommendedModelId,
  modelSupportsLanguage,
} from "../../../lib/utils/modelRecommendation";
import { Button } from "../../ui/Button";

/**
 * Warns when the active model cannot transcribe the chosen dictation language.
 *
 * The backend quietly falls back to auto-detect in that case (see
 * `resolve_language` in transcription.rs) — it has to, since the engine would
 * otherwise reject the language outright. But auto-detect on a model that has
 * never seen your language does not fail cleanly: it picks the closest thing it
 * does know and writes that, which is what users reported as "the app translates
 * my message into a language I didn't ask for" (issue #2).
 *
 * Nothing in the UI said so. This does, and offers the one-click fix.
 */
export const LanguageMismatchWarning: React.FC = () => {
  const { t } = useTranslation();
  const { currentModel, models, selectModel } = useModelStore();
  const { getSetting } = useSettings();
  const [switching, setSwitching] = useState(false);

  const selectedLanguage = getSetting("selected_language") || "auto";
  const activeModel = models.find((m) => m.id === currentModel);

  const languageLabel = useMemo(
    () => LANGUAGES.find((l) => l.value === selectedLanguage)?.label,
    [selectedLanguage],
  );

  // Only models already on disk: suggesting a download here would be a second
  // problem to solve, not a fix.
  const alternative = useMemo(() => {
    const installed = models.filter(
      (m) => m.is_downloaded && m.id !== currentModel,
    );
    const bestId = getRecommendedModelId(installed, selectedLanguage);
    return installed.find((m) => m.id === bestId);
  }, [models, currentModel, selectedLanguage]);

  const mismatch =
    !!activeModel &&
    selectedLanguage !== "auto" &&
    !!languageLabel &&
    !modelSupportsLanguage(activeModel, selectedLanguage);

  if (!mismatch) return null;

  const handleSwitch = async () => {
    if (!alternative) return;
    setSwitching(true);
    const ok = await selectModel(alternative.id);
    setSwitching(false);
    if (!ok) toast.error(t("settings.modelSettings.switchFailed"));
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-text/80">
          {t("settings.modelSettings.languageNotSupported", {
            model: activeModel.name,
            language: languageLabel,
          })}
        </p>
        {alternative ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={switching}
            onClick={handleSwitch}
          >
            {t("settings.modelSettings.switchToModel", {
              model: alternative.name,
            })}
          </Button>
        ) : (
          <p className="text-xs text-text/60">
            {t("settings.modelSettings.noInstalledModelForLanguage", {
              language: languageLabel,
            })}
          </p>
        )}
      </div>
    </div>
  );
};
