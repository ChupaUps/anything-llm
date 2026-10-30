import { APP_LANGUAGE } from "@/utils/constants";

// The interface ships in Russian for a Russian audience. The browser locale is
// never consulted: Russian is the default, and the language picker in the
// settings is the only thing that can change it for this browser.
export const DEFAULT_LANGUAGE = "ru";
export const SUPPORTED_LANGUAGES = ["ru", "en"];

/**
 * Normalises any stored value ("en", "en-US", " RU ") to a supported language.
 * @param {string|null|undefined} value
 * @returns {string} a supported language code, Russian when in doubt
 */
export function resolveLanguage(value) {
  const language = String(value || "")
    .trim()
    .toLowerCase()
    .split("-")[0];
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

/**
 * The language picked in the settings for this browser.
 * @returns {string}
 */
export function getStoredLanguage() {
  try {
    return resolveLanguage(window.localStorage.getItem(APP_LANGUAGE));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Remembers a language picked in the settings.
 * @param {string} language
 * @returns {string} the stored language
 */
export function storeLanguage(language) {
  const resolved = resolveLanguage(language);
  try {
    window.localStorage.setItem(APP_LANGUAGE, resolved);
  } catch {}
  return resolved;
}
