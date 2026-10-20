/**
 * Curated presentation themes for pptxgenjs.
 *
 * A theme is a complete design system: cover palette, content palette, table
 * styling, chart palette, typography, density and decoration. The renderer in
 * layouts.js only consumes these tokens, so adding a theme does not require
 * touching layout code.
 *
 * Themes: default · corporate · dark · minimal · creative · editorial · tech · academic
 */

const BASE_THEME = {
  background: "FFFFFF",
  titleColor: "0F172A",
  subtitleColor: "64748B",
  bodyColor: "334155",
  accentColor: "2563EB",
  bulletColor: "2563EB",
  bulletCode: "25AA",

  tableHeaderBg: "1E293B",
  tableHeaderColor: "FFFFFF",
  tableAltRowBg: "F8FAFC",
  tableBorderColor: "E2E8F0",

  footerColor: "94A3B8",
  footerLineColor: "E2E8F0",

  cardColor: "F8FAFC",
  cardBorderColor: "E2E8F0",
  chartGridColor: "E2E8F0",
  chartTextColor: "64748B",

  fontTitle: "Calibri",
  fontBody: "Calibri",
  density: "comfortable",
  decoration: "bar",
  chartPalette: [
    "2563EB",
    "0EA5E9",
    "10B981",
    "F59E0B",
    "EF4444",
    "8B5CF6",
    "EC4899",
    "14B8A6",
  ],
};

function makeTheme(overrides = {}) {
  return { ...BASE_THEME, ...overrides };
}

const THEMES = {
  default: makeTheme({
    name: "Professional",
    description: "Clean and versatile — works for any presentation",
    titleSlideBackground: "1E293B",
    titleSlideTitleColor: "FFFFFF",
    titleSlideSubtitleColor: "94A3B8",
    titleSlideAccentColor: "3B82F6",
    accentColor: "2563EB",
    bulletColor: "2563EB",
  }),

  corporate: makeTheme({
    name: "Corporate",
    description: "Refined and authoritative — ideal for business and finance",
    titleSlideBackground: "0C1929",
    titleSlideTitleColor: "FFFFFF",
    titleSlideSubtitleColor: "7B96B5",
    titleSlideAccentColor: "C9943E",
    titleColor: "0C1929",
    subtitleColor: "5A6D82",
    bodyColor: "2C3E50",
    accentColor: "1A5276",
    bulletColor: "1A5276",
    tableHeaderBg: "0C1929",
    tableAltRowBg: "F4F7FA",
    tableBorderColor: "D5DBE2",
    footerColor: "8B9DB3",
    footerLineColor: "D5DBE2",
    cardColor: "F4F7FA",
    cardBorderColor: "D5DBE2",
    chartGridColor: "D5DBE2",
    chartTextColor: "5A6D82",
    fontTitle: "Georgia",
    fontBody: "Calibri",
    decoration: "bar",
    chartPalette: [
      "1A5276",
      "C9943E",
      "2E86AB",
      "A23B72",
      "4D7C5A",
      "7C6E65",
      "D97706",
      "0F766E",
    ],
  }),

  dark: makeTheme({
    name: "Dark",
    description: "Sleek dark theme — great for tech and product presentations",
    titleSlideBackground: "0F0F1A",
    titleSlideTitleColor: "F8FAFC",
    titleSlideSubtitleColor: "7C8DB5",
    titleSlideAccentColor: "818CF8",
    background: "18181B",
    titleColor: "F4F4F5",
    subtitleColor: "A1A1AA",
    bodyColor: "D4D4D8",
    accentColor: "6366F1",
    bulletColor: "818CF8",
    tableHeaderBg: "6366F1",
    tableAltRowBg: "1F1F24",
    tableBorderColor: "3F3F46",
    footerColor: "71717A",
    footerLineColor: "3F3F46",
    cardColor: "1F1F24",
    cardBorderColor: "3F3F46",
    chartGridColor: "3F3F46",
    chartTextColor: "A1A1AA",
    density: "compact",
    chartPalette: [
      "818CF8",
      "22D3EE",
      "34D399",
      "FBBF24",
      "F87171",
      "C084FC",
      "F472B6",
      "2DD4BF",
    ],
  }),

  minimal: makeTheme({
    name: "Minimal",
    description: "Ultra-clean with maximum whitespace — lets content speak",
    titleSlideBackground: "F5F5F5",
    titleSlideTitleColor: "171717",
    titleSlideSubtitleColor: "737373",
    titleSlideAccentColor: "A3A3A3",
    titleColor: "171717",
    subtitleColor: "737373",
    bodyColor: "404040",
    accentColor: "525252",
    bulletColor: "A3A3A3",
    tableHeaderBg: "262626",
    tableAltRowBg: "FAFAFA",
    tableBorderColor: "E5E5E5",
    footerColor: "A3A3A3",
    footerLineColor: "E5E5E5",
    cardColor: "FAFAFA",
    cardBorderColor: "E5E5E5",
    chartGridColor: "E5E5E5",
    chartTextColor: "737373",
    fontTitle: "Calibri Light",
    fontBody: "Calibri Light",
    decoration: "minimal",
    bulletCode: "2022",
    chartPalette: [
      "525252",
      "A3A3A3",
      "737373",
      "D4D4D4",
      "404040",
      "8A8A8A",
      "BDBDBD",
      "262626",
    ],
  }),

  creative: makeTheme({
    name: "Creative",
    description: "Bold and expressive — perfect for pitches and creative work",
    titleSlideBackground: "2E1065",
    titleSlideTitleColor: "FFFFFF",
    titleSlideSubtitleColor: "C4B5FD",
    titleSlideAccentColor: "A78BFA",
    titleColor: "3B0764",
    subtitleColor: "7C3AED",
    bodyColor: "374151",
    accentColor: "7C3AED",
    bulletColor: "7C3AED",
    tableHeaderBg: "5B21B6",
    tableAltRowBg: "FAF5FF",
    tableBorderColor: "E9D5FF",
    footerColor: "A78BFA",
    footerLineColor: "E9D5FF",
    cardColor: "FAF5FF",
    cardBorderColor: "E9D5FF",
    chartGridColor: "E9D5FF",
    chartTextColor: "7C3AED",
    fontTitle: "Georgia",
    fontBody: "Calibri",
    decoration: "bold",
    chartPalette: [
      "7C3AED",
      "DB2777",
      "F59E0B",
      "06B6D4",
      "10B981",
      "F97316",
      "6366F1",
      "EC4899",
    ],
  }),

  editorial: makeTheme({
    name: "Editorial",
    description:
      "Warm paper tones and serif headlines — reports and thought leadership",
    titleSlideBackground: "3F2D20",
    titleSlideTitleColor: "FFF8ED",
    titleSlideSubtitleColor: "D6C3AE",
    titleSlideAccentColor: "D97706",
    background: "FBF8F3",
    titleColor: "1F2937",
    subtitleColor: "78716C",
    bodyColor: "44403C",
    accentColor: "B45309",
    bulletColor: "B45309",
    tableHeaderBg: "3F2D20",
    tableHeaderColor: "FFF8ED",
    tableAltRowBg: "F5EFE6",
    tableBorderColor: "E7DED0",
    footerColor: "A8A29E",
    footerLineColor: "E7DED0",
    cardColor: "F5EFE6",
    cardBorderColor: "E7DED0",
    chartGridColor: "E7DED0",
    chartTextColor: "78716C",
    fontTitle: "Georgia",
    fontBody: "Calibri",
    bulletCode: "2022",
    chartPalette: [
      "B45309",
      "3F2D20",
      "0F766E",
      "9A3412",
      "6B7280",
      "A16207",
      "4D7C0F",
      "7C2D12",
    ],
  }),

  tech: makeTheme({
    name: "Tech",
    description:
      "High-contrast slate and cyan — AI, engineering and product launches",
    titleSlideBackground: "020617",
    titleSlideTitleColor: "F8FAFC",
    titleSlideSubtitleColor: "94A3B8",
    titleSlideAccentColor: "22D3EE",
    background: "0B1220",
    titleColor: "E2E8F0",
    subtitleColor: "94A3B8",
    bodyColor: "CBD5E1",
    accentColor: "06B6D4",
    bulletColor: "22D3EE",
    tableHeaderBg: "155E75",
    tableHeaderColor: "ECFEFF",
    tableAltRowBg: "111C2E",
    tableBorderColor: "1E293B",
    footerColor: "64748B",
    footerLineColor: "1E293B",
    cardColor: "111C2E",
    cardBorderColor: "1E293B",
    chartGridColor: "1E293B",
    chartTextColor: "94A3B8",
    fontTitle: "Segoe UI",
    fontBody: "Segoe UI",
    density: "compact",
    decoration: "corner",
    chartPalette: [
      "22D3EE",
      "818CF8",
      "34D399",
      "FBBF24",
      "F472B6",
      "60A5FA",
      "A78BFA",
      "2DD4BF",
    ],
  }),

  academic: makeTheme({
    name: "Academic",
    description: "Classic navy and burgundy — research, education and analysis",
    titleSlideBackground: "1F3A5F",
    titleSlideTitleColor: "FFFFFF",
    titleSlideSubtitleColor: "B8C7D9",
    titleSlideAccentColor: "9B1C31",
    background: "FFFFFF",
    titleColor: "1F2937",
    subtitleColor: "5B6B7C",
    bodyColor: "374151",
    accentColor: "9B1C31",
    bulletColor: "1F3A5F",
    tableHeaderBg: "1F3A5F",
    tableHeaderColor: "FFFFFF",
    tableAltRowBg: "F5F7FA",
    tableBorderColor: "D8DEE6",
    footerColor: "8A99A8",
    footerLineColor: "D8DEE6",
    cardColor: "F5F7FA",
    cardBorderColor: "D8DEE6",
    chartGridColor: "D8DEE6",
    chartTextColor: "5B6B7C",
    fontTitle: "Cambria",
    fontBody: "Calibri",
    bulletCode: "2022",
    chartPalette: [
      "1F3A5F",
      "9B1C31",
      "2E6F95",
      "B7791F",
      "4D7C5A",
      "6B5B95",
      "8B5E3C",
      "0F766E",
    ],
  }),
};

const AUTO_RULES = [
  {
    theme: "corporate",
    pattern:
      /(finance|bank|invest|earnings|budget|revenue|margin|финанс|банк|инвест|бюджет|выручк|прибыл)/i,
  },
  {
    theme: "tech",
    pattern:
      /(tech|software|product|startup|platform|data|ai\b|artificial intelligence|machine learning|техн|продукт|стартап|платформ|данн|искусственн|нейросет)/i,
  },
  {
    theme: "academic",
    pattern:
      /(research|academic|science|study|university|literature|исслед|научн|университет|образовательн|учебн)/i,
  },
  {
    theme: "creative",
    pattern:
      /(creative|brand|design|marketing|pitch|campaign|креатив|бренд|дизайн|маркетинг|презентац)/i,
  },
  {
    theme: "minimal",
    pattern: /(minimal|clean|simple|минимал|лаконичн)/i,
  },
];

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeHex(value, fallback = "000000") {
  if (typeof value !== "string") return fallback;
  let hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : fallback;
}

/**
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
function hexToRgb(hex) {
  const value = normalizeHex(hex);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function rgbToHex(r, g, b) {
  const clamp = (value) => Math.min(255, Math.max(0, Math.round(value)));
  return [r, g, b]
    .map((value) => clamp(value).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Mix two colors. Weight is the share of the first color (0-1).
 * @param {string} a
 * @param {string} b
 * @param {number} weight
 * @returns {string}
 */
function mixHex(a, b, weight = 0.5) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const ratio = Math.min(1, Math.max(0, weight));
  return rgbToHex(
    first.r * ratio + second.r * (1 - ratio),
    first.g * ratio + second.g * (1 - ratio),
    first.b * ratio + second.b * (1 - ratio)
  );
}

/**
 * @param {string} hex
 * @returns {number} Relative luminance (0-1)
 */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * @param {string} foreground
 * @param {string} background
 * @returns {number} WCAG contrast ratio (1-21)
 */
function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * @param {string} background
 * @param {string} light
 * @param {string} dark
 * @returns {string}
 */
function bestTextColor(background, light = "FFFFFF", dark = "111827") {
  return contrastRatio(background, light) >= contrastRatio(background, dark)
    ? light
    : dark;
}

/**
 * @param {string} hex
 * @returns {boolean}
 */
function isDarkColor(hex) {
  return luminance(hex) < 0.45;
}

/**
 * Move a color slightly away from its own luminance.
 * @param {string} hex
 * @param {number} amount 0-1
 * @returns {string}
 */
function shadeHex(hex, amount = 0.08) {
  return isDarkColor(hex)
    ? mixHex("FFFFFF", hex, amount)
    : mixHex("000000", hex, amount);
}

/**
 * Pick a readable text color and adjust a token until it meets the target
 * contrast. Keeps custom brand palettes from producing unreadable slides.
 * @param {string} foreground
 * @param {string} background
 * @param {number} target
 * @returns {string}
 */
function ensureContrast(foreground, background, target = 4.5) {
  let color = normalizeHex(foreground);
  if (contrastRatio(color, background) >= target) return color;

  const pole = isDarkColor(background) ? "FFFFFF" : "000000";
  for (let step = 1; step <= 10; step += 1) {
    color = mixHex(pole, foreground, step / 10);
    if (contrastRatio(color, background) >= target) return color;
  }
  return pole;
}

/**
 * Infer a theme from free-form text when the caller passes theme: "auto".
 * @param {string} text
 * @returns {string} theme key
 */
function inferTheme(text = "") {
  const value = String(text || "");
  for (const rule of AUTO_RULES) {
    if (rule.pattern.test(value)) return rule.theme;
  }
  return "default";
}

/**
 * @param {string} themeName
 * @returns {Object} A mutable copy of the theme
 */
function getTheme(themeName) {
  const key = (themeName || "default").toLowerCase().trim();
  const theme = THEMES[key] || THEMES.default;
  return { ...theme, key: THEMES[key] ? key : "default" };
}

/**
 * Apply custom brand colors and re-derive dependent tokens.
 * @param {Object} theme
 * @param {Object} brand
 * @returns {Object}
 */
function applyBrand(theme, brand = {}) {
  if (!brand || typeof brand !== "object") return theme;

  const primary = brand.primary ? normalizeHex(brand.primary, "") : "";
  const accent = brand.accent ? normalizeHex(brand.accent, "") : "";
  const background = brand.background ? normalizeHex(brand.background, "") : "";

  if (primary) {
    theme.titleSlideBackground = primary;
    theme.tableHeaderBg = primary;
    theme.accentColor = accent || theme.accentColor;
    theme.chartPalette = [
      primary,
      accent || theme.chartPalette[0],
      ...theme.chartPalette,
    ];
  }

  if (background) {
    theme.background = background;
    theme.titleColor = bestTextColor(background);
    theme.bodyColor = mixHex(theme.titleColor, background, 0.82);
    theme.subtitleColor = mixHex(theme.titleColor, background, 0.62);
    theme.cardColor = shadeHex(background, 0.04);
    theme.cardBorderColor = shadeHex(background, 0.14);
    theme.tableAltRowBg = shadeHex(background, 0.035);
    theme.tableBorderColor = shadeHex(background, 0.14);
    theme.footerLineColor = shadeHex(background, 0.14);
    theme.chartGridColor = shadeHex(background, 0.14);
  }

  if (brand.text) {
    theme.titleColor = normalizeHex(brand.text, theme.titleColor);
    theme.bodyColor = mixHex(theme.titleColor, theme.background, 0.82);
  }

  if (accent) {
    theme.accentColor = accent;
    theme.bulletColor = accent;
    theme.titleSlideAccentColor = accent;
    theme.chartPalette = [accent, ...theme.chartPalette];
  }

  // De-duplicate the chart palette after brand overrides.
  theme.chartPalette = [
    ...new Set(theme.chartPalette.map((color) => normalizeHex(color))),
  ];

  theme.titleSlideTitleColor = bestTextColor(
    theme.titleSlideBackground,
    theme.titleSlideTitleColor,
    "111827"
  );
  theme.titleSlideSubtitleColor = ensureContrast(
    mixHex(theme.titleSlideTitleColor, theme.titleSlideBackground, 0.62),
    theme.titleSlideBackground,
    3
  );
  theme.titleColor = ensureContrast(theme.titleColor, theme.background, 7);
  theme.bodyColor = ensureContrast(theme.bodyColor, theme.background, 4.5);
  theme.subtitleColor = ensureContrast(
    theme.subtitleColor,
    theme.background,
    3
  );
  theme.tableHeaderColor = bestTextColor(theme.tableHeaderBg);
  theme.chartTextColor = theme.subtitleColor;

  return theme;
}

/**
 * Resolve a preset, auto-inferred or brand-overridden theme.
 * @param {Object} options
 * @param {string} [options.themeName]
 * @param {Object} [options.brand]
 * @param {string} [options.styleBrief]
 * @param {string} [options.text]
 * @returns {Object}
 */
function resolveTheme({
  themeName = "auto",
  brand = null,
  styleBrief = "",
  text = "",
} = {}) {
  const requested = String(themeName || "auto")
    .toLowerCase()
    .trim();
  const key =
    requested === "auto" || !THEMES[requested]
      ? inferTheme(`${styleBrief} ${text}`)
      : requested;
  const theme = getTheme(key);
  theme.requested = requested;
  theme.autoSelected = requested === "auto" || !THEMES[requested];
  return applyBrand(theme, brand);
}

/**
 * Preset identifiers only. Used by preview scripts and documentation.
 * @returns {string[]}
 */
function getAvailableThemes() {
  return Object.keys(THEMES);
}

/**
 * Identifiers accepted by the tool schema (includes auto).
 * @returns {string[]}
 */
function getThemeChoices() {
  return ["auto", ...getAvailableThemes()];
}

/**
 * @returns {object[]} Array of { id, name, description } for documentation
 */
function getThemeDescriptions() {
  return [
    {
      id: "auto",
      name: "Auto",
      description:
        "Picks a theme from the title and style brief — a safe default for mixed topics",
    },
    ...Object.entries(THEMES).map(([id, theme]) => ({
      id,
      name: theme.name,
      description: theme.description,
    })),
  ];
}

module.exports = {
  THEMES,
  getTheme,
  getAvailableThemes,
  getThemeChoices,
  getThemeDescriptions,
  resolveTheme,
  inferTheme,
  applyBrand,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  mixHex,
  luminance,
  contrastRatio,
  bestTextColor,
  isDarkColor,
  shadeHex,
  ensureContrast,
};
