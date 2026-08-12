import { LANGUAGES } from "../constants/languages";

/**
 * Language names in the language the user is reading.
 *
 * `LANGUAGES` carries English names, which is fine as an identifier and wrong
 * as a label: a Spanish interface was asking "¿En qué idioma vas a dictar?" and
 * then offering "Spanish", and the recommended model was badged "Recomendado
 * para Spanish". The browser already knows every one of these names in every
 * one of our locales, so nothing needs translating by hand.
 */
const cache = new Map<string, Intl.DisplayNames | null>();

const displayNamesFor = (uiLanguage: string): Intl.DisplayNames | null => {
  const cached = cache.get(uiLanguage);
  if (cached !== undefined) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([uiLanguage], {
      type: "language",
      fallback: "none",
    });
  } catch {
    names = null;
  }
  cache.set(uiLanguage, names);
  return names;
};

/**
 * The name of a dictation language code, written in `uiLanguage`. Falls back to
 * the catalogue's English name for codes the browser does not know, and returns
 * null for anything that is not a language at all (e.g. "auto").
 */
export const languageName = (
  code: string,
  uiLanguage: string,
): string | null => {
  const english = LANGUAGES.find((l) => l.value === code)?.label ?? null;
  if (!code || code === "auto") return english;
  const localized = displayNamesFor(uiLanguage)?.of(code);
  if (!localized || localized === code) return english;
  // Intl gives them lowercase in the languages that write them that way
  // ("español"), and capitalised where that is the rule ("Spanisch").
  return localized;
};
