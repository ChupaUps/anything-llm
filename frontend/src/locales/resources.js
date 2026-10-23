// Looking for a language to translate AnythingLLM to?
// Create a `common.js` file in the language's ISO code https://www.w3.org/International/O-charset-lang.html
// eg: Spanish => es/common.js
// eg: French => fr/common.js
// You should copy the en/common.js file as your template and just translate every string in there.
// If a string is not defined or is null in the translation file, it will fallback to the value
// in the en/common.js file.
// RULES:
// The EN translation file is the ground-truth for what keys and options are available. DO NOT add a special key
// to a specific language file as this will break the other languages. Any new keys should be added to english
// and the language file you are working on.

// This deployment ships only Russian and English. Russian is the primary language,
// so it is listed first and used as the default/fallback locale.
import English from "./en/common.js";
import Russian from "./ru/common.js";


export const defaultNS = "common";
export const resources = {
  ru: {
    common: Russian,
  },
  en: {
    common: English,
  },
  hu: {
    common: Hungarian,
  },
};
