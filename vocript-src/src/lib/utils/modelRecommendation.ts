import type { ModelInfo } from "@/bindings";

// Most common dictation languages, shown as quick-pick chips in onboarding.
// Codes must match the model `supported_languages` lists (Whisper codes).
export const POPULAR_LANGUAGES = [
  "es",
  "en",
  "pt",
  "fr",
  "de",
  "it",
  "zh-Hans",
  "ja",
  "ru",
  "ar",
  "hi",
];

// Pick the best model for a given language: among the models that support it,
// the one with the best balance (accuracy weighted over speed). For "auto" or
// unknown languages, fall back to the catalog's recommended model.
export const getRecommendedModelId = (
  models: ModelInfo[],
  langCode: string,
): string | null => {
  if (models.length === 0) return null;
  if (!langCode || langCode === "auto") {
    return models.find((m) => m.is_recommended)?.id ?? null;
  }
  const candidates = models.filter(
    (m) =>
      m.supported_languages.length === 0 ||
      m.supported_languages.includes(langCode),
  );
  if (candidates.length === 0) return null;
  const score = (m: ModelInfo) => m.accuracy_score * 2 + m.speed_score;
  return [...candidates].sort((a, b) => score(b) - score(a))[0].id;
};
