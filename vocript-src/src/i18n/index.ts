import i18n, { type BackendModule, type ReadCallback } from "i18next";
import { initReactI18next } from "react-i18next";
import { locale } from "@tauri-apps/plugin-os";
import { LANGUAGE_METADATA } from "./languages";
import enTranslation from "./locales/en/translation.json";
import { commands } from "@/bindings";
import {
  getLanguageDirection,
  updateDocumentDirection,
  updateDocumentLanguage,
} from "@/lib/utils/rtl";

// Auto-discover translation files using Vite's glob import.
//
// NOT eager: the 20 bundled languages weigh ~1.1 MB in total, and loading them
// all put every one of them in the startup bundle even though a user only ever
// reads one. The glob still resolves the file *paths* synchronously (so the
// language list below is unaffected); only the JSON itself is fetched on
// demand, through the tiny backend module further down.
const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>(
  "./locales/*/translation.json",
);

const loaderPathFor = (code: string) => `./locales/${code}/translation.json`;

const availableLocaleCodes = Object.keys(localeLoaders)
  .map((path) => path.match(/\.\/locales\/(.+)\/translation\.json/)?.[1])
  .filter((code): code is string => Boolean(code));

/**
 * Fetches a language's translations the first time i18next needs it. English
 * never comes through here: it is the initial and fallback language, so it
 * stays bundled and available synchronously.
 */
const lazyLocaleBackend: BackendModule = {
  type: "backend",
  init: () => {},
  read: (language: string, _namespace: string, callback: ReadCallback) => {
    const loader = localeLoaders[loaderPathFor(language)];
    if (!loader) {
      callback(new Error(`No translation bundle for "${language}"`), false);
      return;
    }
    loader()
      .then((module) => callback(null, module.default))
      .catch((error: unknown) => callback(error as Error, false));
  },
};

// Build supported languages list from discovered locales + metadata
export const SUPPORTED_LANGUAGES = availableLocaleCodes
  .map((code) => {
    const meta = LANGUAGE_METADATA[code];
    if (!meta) {
      console.warn(`Missing metadata for locale "${code}" in languages.ts`);
      return { code, name: code, nativeName: code, priority: undefined };
    }
    return {
      code,
      name: meta.name,
      nativeName: meta.nativeName,
      priority: meta.priority,
    };
  })
  .sort((a, b) => {
    // Sort by priority first (lower = higher), then alphabetically
    if (a.priority !== undefined && b.priority !== undefined) {
      return a.priority - b.priority;
    }
    if (a.priority !== undefined) return -1;
    if (b.priority !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

export type SupportedLanguageCode = string;

// Check if a language code is supported
const getSupportedLanguage = (
  langCode: string | null | undefined,
): SupportedLanguageCode | null => {
  if (!langCode) return null;
  const normalized = langCode.toLowerCase();
  // Try exact match first
  let supported = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code.toLowerCase() === normalized,
  );
  if (!supported) {
    // Fall back to prefix match (language only, without region)
    const prefix = normalized.split("-")[0];
    supported = SUPPORTED_LANGUAGES.find(
      (lang) => lang.code.toLowerCase() === prefix,
    );
  }
  return supported ? supported.code : null;
};

// Initialize i18n with English as default
// Language will be synced from settings after init
i18n
  .use(lazyLocaleBackend)
  .use(initReactI18next)
  .init({
    // Only English is bundled up front; every other language is read through
    // the backend above. `partialBundledLanguages` is what tells i18next to
    // still consult the backend even though `resources` is populated — and
    // routing every changeLanguage() call through it means the four call sites
    // across the app get lazy loading without knowing about it.
    resources: { en: { translation: enTranslation } },
    partialBundledLanguages: true,
    lng: "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense for SSR compatibility
    },
  });

// Sync language from app settings
export const syncLanguageFromSettings = async () => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok" && result.data.app_language) {
      const supported = getSupportedLanguage(result.data.app_language);
      if (supported && supported !== i18n.language) {
        await i18n.changeLanguage(supported);
      }
    } else {
      // Fall back to system locale detection if no saved preference
      const systemLocale = await locale();
      const supported = getSupportedLanguage(systemLocale);
      if (supported && supported !== i18n.language) {
        await i18n.changeLanguage(supported);
      }
    }
  } catch (e) {
    console.warn("Failed to sync language from settings:", e);
  }
};

// Run language sync on init
syncLanguageFromSettings();

// Listen for language changes to update HTML dir and lang attributes
i18n.on("languageChanged", (lng) => {
  const dir = getLanguageDirection(lng);
  updateDocumentDirection(dir);
  updateDocumentLanguage(lng);
});

// Re-export RTL utilities for convenience
export { getLanguageDirection, isRTLLanguage } from "@/lib/utils/rtl";

export default i18n;
