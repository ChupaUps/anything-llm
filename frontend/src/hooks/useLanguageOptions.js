import { useEffect, useMemo, useState } from "react";
import i18n from "@/i18n";
import { resources as languages } from "@/locales/resources";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  storeLanguage,
} from "@/utils/language";

export function useLanguageOptions() {
  const supportedLanguages = Object.keys(languages);
  const [currentLanguage, setCurrentLanguage] = useState(
    () => i18n.resolvedLanguage || DEFAULT_LANGUAGE
  );

  // The picker is rendered both in the settings page and in the account modal,
  // so every instance follows the single shared i18n instance.
  useEffect(() => {
    const handleLanguageChanged = (language) => setCurrentLanguage(language);
    i18n.on("languageChanged", handleLanguageChanged);
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, []);

  const languageNames = useMemo(
    () => new Intl.DisplayNames([currentLanguage], { type: "language" }),
    [currentLanguage]
  );

  // The only entry point that can change the language: it is written to the
  // browser storage first so requests and the next cold start see it, then
  // applied to the running i18n instance.
  const changeLanguage = (newLang = DEFAULT_LANGUAGE) => {
    if (!SUPPORTED_LANGUAGES.includes(newLang)) return false;
    storeLanguage(newLang);
    i18n.changeLanguage(newLang);
    return true;
  };

  const getLanguageName = (lang = DEFAULT_LANGUAGE) => {
    const name = languageNames.of(resolveLanguage(lang));
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : lang;
  };

  return {
    currentLanguage: resolveLanguage(currentLanguage),
    supportedLanguages,
    getLanguageName,
    changeLanguage,
  };
}
