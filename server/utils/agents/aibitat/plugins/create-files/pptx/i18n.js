/**
 * Minimal deck chrome translations.
 *
 * The LLM writes the actual slide content in the requested language; these
 * strings only cover deterministic UI labels the renderer adds itself
 * (agenda, sources, "continued", page numbers).
 *
 * Unknown languages fall back to English so the deck never breaks.
 */
const STRINGS = {
  en: {
    agenda: "Agenda",
    agendaTitle: "What we'll cover",
    sources: "Sources",
    closingTitle: "Thank you",
    closingSubtitle: "Questions & discussion",
    continued: "continued",
    source: "Source",
    asOf: "as of",
    page: "Page",
    slide: "Slide",
    noData: "No data provided",
    showingFirst: "showing first {count}",
    dataNote: "Data as provided in the source",
  },
  ru: {
    agenda: "Содержание",
    agendaTitle: "О чём поговорим",
    sources: "Источники",
    closingTitle: "Спасибо за внимание",
    closingSubtitle: "Вопросы и обсуждение",
    continued: "продолжение",
    source: "Источник",
    asOf: "на",
    page: "Стр.",
    slide: "Слайд",
    noData: "Нет данных",
    showingFirst: "показаны первые {count}",
    dataNote: "Данные приведены по указанному источнику",
  },
};

const SUPPORTED_LANGUAGES = Object.keys(STRINGS);

/**
 * @param {string} text
 * @returns {"en"|"ru"}
 */
function detectLanguage(text = "") {
  return /[А-Яа-яЁё]/.test(String(text || "")) ? "ru" : "en";
}

/**
 * Resolve an explicit language code, falling back to script detection.
 * @param {string} language
 * @param {string} [fallbackText]
 * @returns {"en"|"ru"}
 */
function resolveLanguage(language, fallbackText = "") {
  const code = String(language || "")
    .trim()
    .toLowerCase();
  if (code.startsWith("ru")) return "ru";
  if (code.startsWith("en")) return "en";
  return detectLanguage(fallbackText);
}

/**
 * @param {string} language
 * @returns {Object}
 */
function getStrings(language) {
  return STRINGS[language] || STRINGS.en;
}

/**
 * Format an ISO date for a specific language without throwing on bad input.
 * @param {Date|string} value
 * @param {string} language
 * @returns {string}
 */
function formatDate(value, language = "en") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * @param {string} language
 * @returns {string} BCP-47 tag for PowerPoint metadata
 */
function getPptxLanguage(language) {
  return language === "ru" ? "ru-RU" : "en-US";
}

module.exports = {
  STRINGS,
  SUPPORTED_LANGUAGES,
  detectLanguage,
  resolveLanguage,
  getStrings,
  formatDate,
  getPptxLanguage,
};
