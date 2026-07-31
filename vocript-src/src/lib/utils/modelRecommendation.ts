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
  "tr",
];

// Models trained for one language in particular. They win there even when their
// generic scores are lower, because those scores rate the model as a whole while
// these beat the general-purpose ones on the language they were built for.
const LANGUAGE_SPECIALISTS: Record<string, string> = {
  ru: "gigaam-v3-e2e-ctc",
  "zh-Hant": "breeze-asr",
};

export const modelSupportsLanguage = (
  model: ModelInfo,
  langCode: string,
): boolean => {
  if (!langCode || langCode === "auto") return true;
  // Imported models declare no languages, so we can't rule them out.
  if (model.supported_languages.length === 0) return true;
  return model.supported_languages.includes(langCode);
};

// Pick the best model for a given language: the specialist if there is one, else
// the best balance (accuracy weighted over speed) among the models that support
// it. For "auto" or unknown languages, fall back to the catalog's recommendation.
export const getRecommendedModelId = (
  models: ModelInfo[],
  langCode: string,
): string | null => {
  if (models.length === 0) return null;
  if (!langCode || langCode === "auto") {
    return models.find((m) => m.is_recommended)?.id ?? null;
  }

  const specialist = LANGUAGE_SPECIALISTS[langCode];
  if (specialist && models.some((m) => m.id === specialist)) {
    return specialist;
  }

  // Models that declare the language beat imported ones, which declare nothing
  // and would otherwise be recommended for a language they may not even handle.
  const declared = models.filter((m) =>
    m.supported_languages.includes(langCode),
  );
  const candidates =
    declared.length > 0
      ? declared
      : models.filter((m) => m.supported_languages.length === 0);
  if (candidates.length === 0) return null;

  const score = (m: ModelInfo) => m.accuracy_score * 2 + m.speed_score;
  // Break ties by id: the catalog is a HashMap, so its order is not stable and
  // equal scores would otherwise recommend a different model on every run.
  return [...candidates].sort(
    (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
  )[0].id;
};
