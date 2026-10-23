import i18n from "@/i18n";
import { resources as languages } from "@/locales/resources";

export function useLanguageOptions() {
  const supportedLanguages = Object.keys(languages);
  const languageNames = new Intl.DisplayNames([i18n.resolvedLanguage || "ru"], {
    type: "language",
  });
  const changeLanguage = (newLang = "ru") => {
    if (!supportedLanguages.includes(newLang)) return false;
    i18n.changeLanguage(newLang);
  };

  return {
    currentLanguage: i18n.resolvedLanguage || "ru",
    supportedLanguages,
    getLanguageName: (lang = "ru") => languageNames.of(lang),
    changeLanguage,
  };
}
