import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultNS, resources } from "./locales/resources";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getStoredLanguage,
  resolveLanguage,
} from "@/utils/language";

/**
 * Keeps the <html lang> attribute aligned with what the user reads.
 * @param {string} language
 */
function syncDocumentLanguage(language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = resolveLanguage(language);
}

i18next
  .use(initReactI18next) // Initialize i18n for React
  .init({
    // No language detector on purpose: a fresh browser always opens in
    // Russian, and only the settings picker can store a different choice.
    lng: getStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    debug: import.meta.env.DEV,
    defaultNS,
    resources,
    lowerCaseLng: true,
    interpolation: {
      escapeValue: false,
    },
  });

syncDocumentLanguage(i18next.resolvedLanguage);
i18next.on("languageChanged", syncDocumentLanguage);

export default i18next;
