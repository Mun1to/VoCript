import React from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Download,
  Globe,
  Languages,
  Loader2,
  Trash2,
} from "lucide-react";
import type { ModelInfo } from "@/bindings";
import { formatModelSize } from "../../lib/utils/format";
import {
  getTranslatedModelDescription,
  getTranslatedModelName,
} from "../../lib/utils/modelTranslation";
import { LANGUAGES } from "../../lib/constants/languages";
import { languageName } from "../../lib/utils/languageNames";
import { POPULAR_LANGUAGES } from "../../lib/utils/modelRecommendation";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { HoverTooltip } from "../ui/HoverTooltip";

// How many language names fit on the capabilities row before it is summarised.
const MAX_LISTED_LANGUAGES = 4;

/** Readable names for language codes, deduplicated and in the given order. */
const languageNames = (codes: string[], uiLanguage: string): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const code of codes) {
    // Whisper declares zh, zh-Hans and zh-Hant; only the two variants have a
    // name, and a bare code is not worth showing to a user.
    if (!LANGUAGES.some((l) => l.value === code)) continue;
    const label = languageName(code, uiLanguage);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    names.push(label);
  }
  return names;
};

/**
 * The capabilities row used to say only "Multilingual" for anything with more
 * than one language, which is exactly what made people pick a model that cannot
 * handle what they speak: to someone dictating in Japanese, Parakeet (25
 * European languages) and Whisper (99) read identically. Now the real languages
 * are listed, with the user's own first so a glance answers "does this one
 * cover me?".
 */
const getLanguageDisplayText = (
  supportedLanguages: string[],
  t: (key: string, options?: Record<string, unknown>) => string,
  uiLanguage: string,
  preferredLanguage?: string,
): string => {
  // Order: the user's own language, then the widely-spoken ones, then the rest
  // as declared. Without this the trimmed list is whatever the model happens to
  // declare first, which is alphabetical for most of them — "Bulgarian,
  // Croatian, Czech, Danish" tells nobody anything.
  const first = supportedLanguages.includes(preferredLanguage ?? "")
    ? [preferredLanguage as string]
    : [];
  const popular = POPULAR_LANGUAGES.filter(
    (code) => code !== preferredLanguage && supportedLanguages.includes(code),
  );
  const rest = supportedLanguages.filter(
    (code) => !first.includes(code) && !popular.includes(code),
  );
  const ordered =
    preferredLanguage === "auto" || !preferredLanguage
      ? [...popular, ...rest]
      : [...first, ...popular, ...rest];

  const names = languageNames(ordered, uiLanguage);

  // Imported models declare nothing; keep the old generic wording for them.
  if (names.length === 0) return t("modelSelector.capabilities.multiLanguage");
  if (names.length === 1) {
    return t("modelSelector.capabilities.languageOnly", {
      language: names[0],
    });
  }
  if (names.length <= MAX_LISTED_LANGUAGES) return names.join(", ");

  return t("modelSelector.capabilities.languagesAndMore", {
    languages: names.slice(0, MAX_LISTED_LANGUAGES).join(", "),
    count: names.length - MAX_LISTED_LANGUAGES,
  });
};

export type ModelCardStatus =
  | "downloadable"
  | "downloading"
  | "verifying"
  | "extracting"
  | "switching"
  | "active"
  | "available";

interface ModelCardProps {
  model: ModelInfo;
  variant?: "default" | "featured";
  status?: ModelCardStatus;
  disabled?: boolean;
  className?: string;
  onSelect: (modelId: string) => void;
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancel?: (modelId: string) => void;
  downloadProgress?: number;
  downloadSpeed?: number; // MB/s
  showRecommended?: boolean;
  // When set, shows a highlighted badge (e.g. "Recommended for Spanish").
  // Independent of the static `is_recommended` flag.
  recommendedLabel?: string;
  // When set, warns that the model can't transcribe the chosen language
  // (e.g. "No Turkish support").
  unsupportedLabel?: string;
  // The user's dictation language, listed first among the supported ones so
  // they can tell at a glance whether this model covers them.
  preferredLanguage?: string;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  variant = "default",
  status = "downloadable",
  disabled = false,
  className = "",
  onSelect,
  onDownload,
  onDelete,
  onCancel,
  downloadProgress,
  downloadSpeed,
  showRecommended = true,
  recommendedLabel,
  unsupportedLabel,
  preferredLanguage,
}) => {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.language;
  const isFeatured = variant === "featured";
  const isClickable =
    status === "available" || status === "active" || status === "downloadable";

  // Get translated model name and description
  const displayName = getTranslatedModelName(model, t);
  const displayDescription = getTranslatedModelDescription(model, t);

  const baseClasses =
    "flex flex-col rounded-xl px-4 py-3 gap-2 text-left transition-all duration-200";

  const getVariantClasses = () => {
    if (status === "active") {
      return "border-2 border-logo-primary/50 bg-logo-primary/10";
    }
    if (isFeatured) {
      return "border-2 border-logo-primary/25 bg-logo-primary/5";
    }
    return "border-2 border-mid-gray/20";
  };

  const getInteractiveClasses = () => {
    if (!isClickable) return "";
    if (disabled) return "opacity-50 cursor-not-allowed";
    // Border and tint only. A card that grows and casts a shadow under the
    // pointer is the "generated" look, and these cards are big enough that the
    // 1% scale visibly nudged the whole list.
    return "cursor-pointer hover:border-logo-primary/50 hover:bg-logo-primary/5 active:bg-logo-primary/10 group";
  };

  const handleClick = () => {
    if (!isClickable || disabled) return;
    if (status === "downloadable" && onDownload) {
      onDownload(model.id);
    } else {
      onSelect(model.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(model.id);
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && isClickable) handleClick();
      }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={[
        baseClasses,
        getVariantClasses(),
        getInteractiveClasses(),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Top section: name/description + score bars */}
      <div className="flex justify-between items-center w-full">
        <div className="flex flex-col items-start flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3
              className={`text-base font-semibold text-text ${isClickable ? "group-hover:text-logo-primary" : ""} transition-colors`}
            >
              {displayName}
            </h3>
            {recommendedLabel && (
              <Badge variant="primary">{recommendedLabel}</Badge>
            )}
            {unsupportedLabel && (
              <Badge variant="secondary">{unsupportedLabel}</Badge>
            )}
            {showRecommended && model.is_recommended && !recommendedLabel && (
              <Badge variant="primary">{t("onboarding.recommended")}</Badge>
            )}
            {status === "active" && (
              <Badge variant="primary">
                <Check className="w-3 h-3 mr-1" />
                {t("modelSelector.active")}
              </Badge>
            )}
            {model.is_custom && (
              <Badge variant="secondary">{t("modelSelector.custom")}</Badge>
            )}
            {status === "switching" && (
              <Badge variant="secondary">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {t("modelSelector.switching")}
              </Badge>
            )}
          </div>
          <p className="text-text/60 text-sm leading-relaxed">
            {displayDescription}
          </p>
        </div>
        {(model.accuracy_score > 0 || model.speed_score > 0) && (
          <div className="hidden sm:flex items-center ms-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-text/60 w-24 text-end">
                  {t("onboarding.modelCard.accuracy")}
                </p>
                <div className="w-16 h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-logo-primary rounded-full"
                    style={{ width: `${model.accuracy_score * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-text/60 w-24 text-end">
                  {t("onboarding.modelCard.speed")}
                </p>
                <div className="w-16 h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-logo-primary rounded-full"
                    style={{ width: `${model.speed_score * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <hr className="w-full border-mid-gray/20" />

      {/* Bottom row: tags + action buttons (full width) */}
      <div className="flex items-center gap-3 w-full -mb-0.5 mt-0.5 h-5">
        {model.supported_languages.length > 0 && (
          <HoverTooltip
            // When the row had to be trimmed, the tooltip is where the rest of
            // the languages live — that is the question people actually have.
            label={
              model.supported_languages.length === 1
                ? t("modelSelector.capabilities.singleLanguage")
                : languageNames(model.supported_languages, uiLanguage).length >
                    MAX_LISTED_LANGUAGES
                  ? languageNames(model.supported_languages, uiLanguage).join(
                      ", ",
                    )
                  : t("modelSelector.capabilities.languageSelection")
            }
            className="flex items-center gap-1 text-xs text-text/50 min-w-0"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {getLanguageDisplayText(
                model.supported_languages,
                t,
                uiLanguage,
                preferredLanguage,
              )}
            </span>
          </HoverTooltip>
        )}
        {model.supports_translation && (
          <HoverTooltip
            label={t("modelSelector.capabilities.translation")}
            className="flex items-center gap-1 text-xs text-text/50"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{t("modelSelector.capabilities.translate")}</span>
          </HoverTooltip>
        )}
        {status === "downloadable" && (
          <span className="flex items-center gap-1.5 ms-auto text-xs text-text/50">
            <Download className="w-3.5 h-3.5" />
            <span>{formatModelSize(Number(model.size_mb))}</span>
          </span>
        )}
        {onDelete && (status === "available" || status === "active") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            title={t("modelSelector.deleteModel", { modelName: displayName })}
            className="flex items-center gap-1.5 ms-auto text-logo-primary/85 hover:text-logo-primary hover:bg-logo-primary/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t("common.delete")}</span>
          </Button>
        )}
      </div>

      {/* Download/extract progress */}
      {status === "downloading" && downloadProgress !== undefined && (
        <div className="w-full mt-3">
          <div className="w-full h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-logo-primary rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-text/50">
              {t("modelSelector.downloading", {
                percentage: Math.round(downloadProgress),
              })}
            </span>
            <div className="flex items-center gap-2">
              {downloadSpeed !== undefined && downloadSpeed > 0 && (
                <span className="tabular-nums text-text/50">
                  {t("modelSelector.downloadSpeed", {
                    speed: downloadSpeed.toFixed(1),
                  })}
                </span>
              )}
              {onCancel && (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel(model.id);
                  }}
                  aria-label={t("modelSelector.cancelDownload")}
                >
                  {t("modelSelector.cancel")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {status === "verifying" && (
        <div className="w-full mt-3">
          <div className="w-full h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
            <div className="h-full bg-logo-primary rounded-full animate-pulse w-full" />
          </div>
          <p className="text-xs text-text/50 mt-1">
            {t("modelSelector.verifyingGeneric")}
          </p>
        </div>
      )}
      {status === "extracting" && (
        <div className="w-full mt-3">
          <div className="w-full h-1.5 bg-mid-gray/20 rounded-full overflow-hidden">
            <div className="h-full bg-logo-primary rounded-full animate-pulse w-full" />
          </div>
          <p className="text-xs text-text/50 mt-1">
            {t("modelSelector.extractingGeneric")}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Memoised: the onboarding screen renders ~18 of these at once, and any store
 * change (a settings write, a download progress tick) used to re-render every
 * one of them — each redoing its i18n lookups, language-name searches and
 * tooltip subtrees. With stable callbacks from the parent, only the cards whose
 * own props changed now re-render.
 */
export default React.memo(ModelCard);
