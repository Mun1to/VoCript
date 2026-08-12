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
//
// SenseVoice covers the whole CJK block and weighs 152 MB. Without it here, the
// plain scores sent a Chinese speaker to Cohere (1.7 GB) and a Japanese or
// Korean one to Nemotron (751 MB) — both multilingual models where CJK is one
// language among many, and both an order of magnitude bigger for the trouble.
const LANGUAGE_SPECIALISTS: Record<string, string> = {
  ru: "gigaam-v3-e2e-ctc",
  zh: "sense-voice-int8",
  "zh-Hans": "sense-voice-int8",
  "zh-Hant": "breeze-asr",
  yue: "sense-voice-int8",
  ja: "sense-voice-int8",
  ko: "sense-voice-int8",
};

// Below this a download is not worth weighing against quality: every model in
// this range finishes in a couple of minutes on an ordinary connection.
const FREE_SIZE_MB = 600;
// How much score the largest model in the catalogue gives up for its size. Small
// on purpose: it settles ties and blocks a gigabyte-and-a-half recommendation
// that is barely better, without ever overriding a model that is genuinely
// stronger for the language.
const SIZE_PENALTY_AT_2GB = 0.5;

export const modelSupportsLanguage = (
  model: ModelInfo,
  langCode: string,
): boolean => {
  if (!langCode || langCode === "auto") return true;
  // Imported models declare no languages, so we can't rule them out.
  if (model.supported_languages.length === 0) return true;
  return model.supported_languages.includes(langCode);
};

/** Accuracy first, then speed, minus what the download costs the user. */
const balanceScore = (model: ModelInfo): number => {
  const oversize = Math.max(0, Number(model.size_mb) - FREE_SIZE_MB);
  const penalty = (oversize / (2048 - FREE_SIZE_MB)) * SIZE_PENALTY_AT_2GB;
  return model.accuracy_score * 2 + model.speed_score - penalty;
};

/** Why a model is the one being suggested, so the UI can say it out loud. */
export type RecommendationReason = "specialist" | "balanced";

export const getRecommendationReason = (
  modelId: string | null,
  langCode: string,
): RecommendationReason =>
  modelId && LANGUAGE_SPECIALISTS[langCode] === modelId
    ? "specialist"
    : "balanced";

// Pick the best model for a given language: the specialist if there is one, else
// the best balance (accuracy weighted over speed, size discounted) among the
// models that support it. For "auto" or unknown languages, fall back to the
// catalog's recommendation.
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

  // Break ties by id: the catalog is a HashMap, so its order is not stable and
  // equal scores would otherwise recommend a different model on every run.
  return [...candidates].sort(
    (a, b) => balanceScore(b) - balanceScore(a) || a.id.localeCompare(b.id),
  )[0].id;
};
