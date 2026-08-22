import { test, expect } from "@playwright/test";
import type { ModelInfo } from "../src/bindings";
import { getRecommendedModelId } from "../src/lib/utils/modelRecommendation";

/**
 * The catalogue as it really is, trimmed to what these tests need. The language
 * lists are the ones model.rs declares, so if one of them changes there and not
 * here, that is worth knowing about.
 */
const modelo = (
  id: string,
  size_mb: number,
  accuracy_score: number,
  speed_score: number,
  supported_languages: string[],
  is_recommended = false,
): ModelInfo =>
  ({
    id,
    name: id,
    description: "",
    filename: id,
    url: null,
    sha256: null,
    size_mb,
    is_downloaded: false,
    is_downloading: false,
    partial_size: 0,
    is_directory: false,
    engine_type: "whisper",
    accuracy_score,
    speed_score,
    supports_translation: false,
    is_recommended,
    supported_languages,
    supports_language_selection: true,
    is_custom: false,
  }) as unknown as ModelInfo;

// The real list from model.rs, and it has to be the real one: a shortened
// version was what made the first draft of this test pass a broken function,
// because with ten codes Parakeet's twenty-five looked like the widest
// catalogue in the room.
const WHISPER = [
  "en",
  "zh",
  "zh-Hans",
  "zh-Hant",
  "de",
  "es",
  "ru",
  "ko",
  "fr",
  "ja",
  "pt",
  "tr",
  "pl",
  "ca",
  "nl",
  "ar",
  "sv",
  "it",
  "id",
  "hi",
  "fi",
  "vi",
  "he",
  "uk",
  "el",
  "ms",
  "cs",
  "ro",
  "da",
  "hu",
  "ta",
  "no",
  "th",
  "ur",
  "hr",
  "bg",
  "lt",
  "la",
  "mi",
  "ml",
  "cy",
  "sk",
  "te",
  "fa",
  "lv",
  "bn",
  "sr",
  "az",
  "sl",
  "kn",
  "et",
  "mk",
  "br",
  "eu",
  "is",
  "hy",
  "ne",
  "mn",
  "bs",
  "kk",
  "sq",
  "sw",
  "gl",
  "mr",
  "pa",
  "si",
  "km",
  "sn",
  "yo",
  "so",
  "af",
  "oc",
  "ka",
  "be",
  "tg",
  "sd",
  "gu",
  "am",
  "yi",
  "lo",
  "uz",
  "fo",
  "ht",
  "ps",
  "tk",
  "nn",
  "mt",
  "sa",
  "lb",
  "my",
  "bo",
  "tl",
  "mg",
  "as",
  "tt",
  "haw",
  "ln",
  "ha",
  "ba",
  "jw",
  "su",
  "yue",
];
// The 25 NVIDIA trained Parakeet V3 on. No Turkish, and that is the point.
const PARAKEET = [
  "bg",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "et",
  "fi",
  "fr",
  "de",
  "el",
  "hu",
  "it",
  "lv",
  "lt",
  "mt",
  "pl",
  "pt",
  "ro",
  "sk",
  "sl",
  "es",
  "sv",
  "ru",
  "uk",
];

const CATALOGO = [
  modelo("small", 465, 0.6, 0.85, WHISPER),
  modelo("medium", 469, 0.75, 0.6, WHISPER),
  modelo("turbo", 1549, 0.8, 0.55, WHISPER),
  modelo("large", 1031, 0.85, 0.3, WHISPER),
  modelo("nemotron-streaming-3.5", 751, 0.78, 0.85, ["en", "tr", "es", "de"]),
  modelo("parakeet-tdt-0.6b-v3", 456, 0.8, 0.85, PARAKEET, true),
  modelo("importado", 300, 0.8, 0.8, []),
];

test.describe("qué modelo se recomienda", () => {
  test("nunca uno que no hable el idioma pedido", () => {
    for (const idioma of ["tr", "ja", "ar", "hi", "ko"]) {
      const elegido = getRecommendedModelId(CATALOGO, idioma);
      const m = CATALOGO.find((x) => x.id === elegido);
      expect(m?.supported_languages).toContain(idioma);
    }
  });

  test("para «varios idiomas» coge el de más cobertura, no el destacado del catálogo", () => {
    const elegido = getRecommendedModelId(CATALOGO, "auto");
    // Esto es lo que fallaba: se llevaba el is_recommended sin mirar idiomas,
    // y a un turco le tocaba un modelo de 25 lenguas europeas.
    expect(elegido).not.toBe("parakeet-tdt-0.6b-v3");
    const m = CATALOGO.find((x) => x.id === elegido);
    expect(m?.supported_languages.length).toBe(WHISPER.length);
    expect(m?.supported_languages).toContain("tr");
  });

  test("un modelo importado, que no declara idiomas, no vale como «vale para todo»", () => {
    expect(getRecommendedModelId(CATALOGO, "auto")).not.toBe("importado");
  });

  test("sin catálogo no inventa nada", () => {
    expect(getRecommendedModelId([], "tr")).toBeNull();
    expect(getRecommendedModelId([], "auto")).toBeNull();
  });
});
