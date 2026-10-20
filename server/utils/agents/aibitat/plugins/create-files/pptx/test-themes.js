/**
 * Generate a preview presentation for every theme using the same rendering
 * pipeline as the production tool. Run from repo root:
 *
 *   node server/utils/agents/aibitat/plugins/create-files/pptx/test-themes.js
 *
 * Output → storage/generated-files/theme-previews/
 */

const path = require("path");
const fs = require("fs");
const PptxGenJS = require("pptxgenjs");
const createFilesLib = require("../lib.js");
const { getTheme, getAvailableThemes, resolveTheme } = require("./themes.js");
const { renderSlide } = require("./layouts.js");
const { normalizeSlides } = require("./normalize.js");
const { getStrings } = require("./i18n.js");

// One slide per supported layout so a preview exercises every renderer branch.
const RAW_SLIDES = [
  {
    layout: "title",
    title: "FY2026 Strategy Review",
    subtitle: "Growth, margin and the next horizon",
    author: "Strategy team",
  },
  {
    layout: "agenda",
    title: "What we'll cover",
    sections: [
      { title: "Market context" },
      { title: "FY2025 results" },
      { title: "Operating priorities" },
      { title: "FY2026 outlook" },
    ],
  },
  {
    layout: "section",
    title: "FY2025 results",
    subtitle: "A year of durable, profitable growth",
  },
  {
    layout: "content",
    title: "Revenue grew 23% while margin expanded 180bps",
    subtitle: "Growth was balanced across segments and regions",
    content: [
      "Revenue reached $4.2B, up 23% year-over-year",
      "Operating margin expanded 180bps to 28.4%",
      "Enterprise ARR now represents 61% of total revenue",
      "Net revenue retention held at 118%",
      "Free cash flow conversion reached 86%",
    ],
    notes: "Emphasize the durability of the margin expansion story.",
  },
  {
    layout: "kpi",
    title: "Four metrics define the year",
    stats: [
      { value: "$4.2B", label: "Revenue", detail: "+23% year-over-year" },
      { value: "28.4%", label: "Operating margin", detail: "+180bps" },
      {
        value: "118%",
        label: "Net revenue retention",
        detail: "Best-in-class",
      },
      { value: "94.7%", label: "Gross retention", detail: "+2.1pp" },
    ],
  },
  {
    layout: "two-column",
    title: "What worked and what needs work",
    columns: [
      {
        title: "Strengths",
        content: [
          "Enterprise motion is compounding",
          "Platform consolidation wins larger deals",
          "Gross margin improved for six quarters",
        ],
      },
      {
        title: "Watch-outs",
        content: [
          "SMB churn remains above plan",
          "Hiring velocity is behind roadmap",
          "APAC expansion is six months late",
        ],
      },
    ],
  },
  {
    layout: "chart",
    title: "Revenue growth accelerated in every quarter",
    subtitle: "Quarterly revenue, $ millions",
    chart: {
      type: "bar",
      xKey: "quarter",
      series: [{ key: "revenue", label: "Revenue" }],
      dataset: [
        { quarter: "Q1", revenue: 860 },
        { quarter: "Q2", revenue: 940 },
        { quarter: "Q3", revenue: 1080 },
        { quarter: "Q4", revenue: 1320 },
      ],
      valueFormat: "currency",
      currency: "USD",
      showValues: true,
      source: { title: "FY2025 audited financials", asOf: "2026-01" },
    },
  },
  {
    layout: "table",
    title: "Margin expansion is structural",
    table: {
      headers: ["Metric", "FY2024", "FY2025", "Change"],
      rows: [
        ["Revenue", "$3.4B", "$4.2B", "+23%"],
        ["Gross margin", "62.1%", "64.8%", "+270bps"],
        ["Operating income", "$910M", "$1.19B", "+31%"],
        ["Free cash flow", "$780M", "$1.02B", "+31%"],
      ],
      source: { title: "FY2025 audited financials", asOf: "2026-01" },
    },
  },
  {
    layout: "quote",
    title: "The customer signal is unambiguous",
    quote: {
      text: "We consolidated four vendors onto this platform and cut our analytics stack cost by a third.",
      attribution: "CIO, Global 2000 customer",
    },
  },
  {
    layout: "sources",
    title: "Sources",
    citations: [
      {
        title: "FY2025 audited financials",
        url: "https://example.com/fy2025",
      },
      {
        title: "Customer advisory board interviews",
        url: "https://example.com/cab",
      },
    ],
  },
  {
    layout: "closing",
    title: "Thank you",
    subtitle: "Questions & discussion",
  },
];

async function generateThemePreview(themeName, outputDir, slides) {
  const theme = getTheme(themeName);
  const strings = getStrings("en");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = `${theme.name} Theme Preview`;
  pptx.author = "AnythingLLM";
  pptx.company = "AnythingLLM";

  const totalSlides = slides.length;
  const date = new Date().toISOString().slice(0, 10);

  slides.forEach((slideData, index) => {
    const slide = pptx.addSlide();
    renderSlide(slide, pptx, slideData, theme, {
      slideNumber: index + 1,
      totalSlides,
      deckTitle: "FY2026 Strategy Review",
      company: "Acme",
      branding: { mode: "none" },
      date,
      language: "en",
      sectionNumber: slideData.sectionNumber,
      sectionTotal: 4,
      sectionTitle: slideData.sectionTitle || strings.agenda,
    });
  });

  const filename = `theme-preview-${themeName}.pptx`;
  const filepath = path.join(outputDir, filename);
  await pptx.writeFile({ fileName: filepath });
  console.log(`  ✓ ${theme.name} → ${filename}`);
}

async function main() {
  const baseDir = await createFilesLib.getOutputDirectory();
  const outputDir = path.join(baseDir, "theme-previews");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const normalized = normalizeSlides(RAW_SLIDES, { language: "en" });
  if (normalized.warnings.length > 0) {
    console.warn("Normalizer warnings:");
    normalized.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  console.log("Generating theme previews…\n");
  const themes = getAvailableThemes();
  for (const themeName of themes) {
    await generateThemePreview(themeName, outputDir, normalized.slides);
  }

  // A branded variant proves brand colors and logo slots override the preset.
  const branded = resolveTheme({
    themeName: "default",
    brand: {
      primary: "0C1929",
      accent: "C9943E",
      company: "Acme",
    },
  });
  const brandedPptx = new PptxGenJS();
  brandedPptx.layout = "LAYOUT_16x9";
  brandedPptx.title = "Branded Theme Preview";
  normalized.slides.forEach((slideData, index) => {
    const slide = brandedPptx.addSlide();
    renderSlide(slide, brandedPptx, slideData, branded, {
      slideNumber: index + 1,
      totalSlides: normalized.slides.length,
      deckTitle: "FY2026 Strategy Review",
      company: "Acme",
      branding: { mode: "none" },
      date: new Date().toISOString().slice(0, 10),
      language: "en",
      sectionNumber: slideData.sectionNumber,
      sectionTotal: 4,
      sectionTitle: slideData.sectionTitle || getStrings("en").agenda,
    });
  });
  await brandedPptx.writeFile({
    fileName: path.join(outputDir, "theme-preview-branded.pptx"),
  });

  console.log(
    `\nDone! ${themes.length + 1} previews saved to:\n  ${outputDir}`
  );
}

main().catch(console.error);
