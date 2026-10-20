const {
  MARGIN_X,
  CONTENT_W,
  SLIDE_H,
  CONTENT_BOTTOM,
  truncate,
  addText,
  addRect,
  addAccentUnderline,
  addTopAccentBar,
  addCard,
  addImage,
  addBranding,
  addSlideFooter,
  addVerticalDivider,
} = require("./utils.js");
const {
  addBulletContent,
  addTableContent,
  addChartContent,
} = require("./charts.js");
const { getStrings, formatDate } = require("./i18n.js");

const RIGHT_PANEL_W = 2.45;

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {Object} slideData
 * @param {Object} context
 * @returns {number} content top
 */
function renderContentChrome(slide, pptx, theme, slideData, context = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    branding = {},
    date = "",
    language = "en",
    sectionTitle = "",
  } = context;

  slide.background = { color: theme.background };
  addTopAccentBar(slide, pptx, theme);

  const title = slideData.title || "";
  const subtitle = slideData.subtitle || slideData.chart?.subtitle || "";
  const titleSize = title.length > 90 ? 18 : title.length > 55 ? 21 : 24;

  addText(slide, title, {
    x: MARGIN_X,
    y: 0.3,
    w: CONTENT_W,
    h: subtitle ? 0.55 : 0.68,
    fontSize: titleSize,
    bold: true,
    color: theme.titleColor,
    fontFace: theme.fontTitle,
    valign: "bottom",
  });

  const contentTop = subtitle ? 1.43 : 1.12;
  if (subtitle) {
    addText(slide, subtitle, {
      x: MARGIN_X,
      y: 0.9,
      w: CONTENT_W,
      h: 0.38,
      fontSize: 12,
      color: theme.subtitleColor,
      fontFace: theme.fontBody,
      valign: "top",
    });
  }

  addAccentUnderline(
    slide,
    pptx,
    MARGIN_X,
    contentTop - 0.2,
    theme.accentColor,
    0.75,
    0.03
  );

  addSlideFooter(slide, pptx, theme, {
    slideNumber,
    totalSlides,
    deckTitle,
    company: branding.mode === "none" ? "" : company,
    sectionTitle,
    branding,
    date,
    language,
  });
  addBranding(slide, pptx, theme, branding, "content");

  return contentTop;
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderTitleSlide(slide, pptx, slideData = {}, theme, context = {}) {
  const { branding = {}, language = "en", date = "" } = context;

  slide.background = { color: theme.titleSlideBackground };

  if (theme.decoration !== "minimal") {
    addRect(slide, pptx, {
      x: 7.55,
      y: 0,
      w: RIGHT_PANEL_W,
      h: SLIDE_H,
      fill: { color: theme.titleSlideAccentColor, transparency: 88 },
    });
    addRect(slide, pptx, {
      x: 7.55,
      y: 0,
      w: 0.035,
      h: SLIDE_H,
      fill: { color: theme.titleSlideAccentColor },
    });
  }

  const kicker =
    branding.confidentiality ||
    (branding.mode === "none" ? "" : branding.company) ||
    (date ? formatDate(date, language) : "");
  if (kicker) {
    addText(slide, kicker.toUpperCase(), {
      x: MARGIN_X,
      y: 0.55,
      w: 6.4,
      h: 0.25,
      fontSize: 9,
      bold: true,
      charSpacing: 1.5,
      color: theme.titleSlideAccentColor,
      fontFace: theme.fontBody,
    });
  }

  const title = slideData.title || "Untitled Presentation";
  addText(slide, title, {
    x: MARGIN_X,
    y: 1.4,
    w: 6.5,
    h: 1.45,
    fontSize: title.length > 70 ? 30 : title.length > 45 ? 34 : 38,
    bold: true,
    color: theme.titleSlideTitleColor,
    fontFace: theme.fontTitle,
    valign: "bottom",
  });

  if (slideData.subtitle) {
    addText(slide, slideData.subtitle, {
      x: MARGIN_X,
      y: 2.95,
      w: 6.2,
      h: 0.65,
      fontSize: 14,
      color: theme.titleSlideSubtitleColor,
      fontFace: theme.fontBody,
      valign: "top",
    });
  }

  const meta = [slideData.author, date ? formatDate(date, language) : ""]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) {
    addText(slide, meta, {
      x: MARGIN_X,
      y: 4.15,
      w: 6.4,
      h: 0.35,
      fontSize: 11,
      color: theme.titleSlideSubtitleColor,
      fontFace: theme.fontBody,
    });
  }

  addRect(slide, pptx, {
    x: 0,
    y: SLIDE_H - 0.08,
    w: "100%",
    h: 0.08,
    fill: { color: theme.titleSlideAccentColor },
  });

  addBranding(slide, pptx, theme, branding, "cover");

  if (!branding.logo && branding.company && branding.mode !== "none") {
    addText(slide, branding.company, {
      x: 7.45,
      y: 4.7,
      w: 1.9,
      h: 0.3,
      fontSize: 9,
      color: theme.titleSlideSubtitleColor,
      fontFace: theme.fontBody,
      align: "right",
    });
  }

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderAgendaSlide(slide, pptx, slideData, theme, context = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    branding = {},
    date = "",
    language = "en",
  } = context;
  const strings = getStrings(language);
  const sections = Array.isArray(slideData.sections) ? slideData.sections : [];

  slide.background = { color: theme.background };
  addTopAccentBar(slide, pptx, theme);

  addText(slide, strings.agenda.toUpperCase(), {
    x: MARGIN_X,
    y: 0.42,
    w: CONTENT_W,
    h: 0.25,
    fontSize: 9,
    bold: true,
    charSpacing: 1.5,
    color: theme.accentColor,
    fontFace: theme.fontBody,
  });
  addText(slide, slideData.title || strings.agenda, {
    x: MARGIN_X,
    y: 0.72,
    w: CONTENT_W,
    h: 0.55,
    fontSize: 28,
    bold: true,
    color: theme.titleColor,
    fontFace: theme.fontTitle,
  });
  addAccentUnderline(slide, pptx, MARGIN_X, 1.3, theme.accentColor, 0.9, 0.035);

  const twoColumns = sections.length > 5;
  const columnWidth = twoColumns ? 3.9 : CONTENT_W;
  const rowHeight = twoColumns ? 0.52 : 0.62;
  const rows = twoColumns ? Math.ceil(sections.length / 2) : sections.length;

  sections.forEach((section, index) => {
    const column = twoColumns && index >= rows ? 1 : 0;
    const row = twoColumns && index >= rows ? index - rows : index;
    const x = MARGIN_X + column * 4.5;
    const y = 1.55 + row * rowHeight;
    const number = String(index + 1).padStart(2, "0");

    addText(slide, number, {
      x,
      y,
      w: 0.5,
      h: rowHeight,
      fontSize: twoColumns ? 9 : 11,
      bold: true,
      color: theme.accentColor,
      fontFace: theme.fontBody,
      valign: "middle",
    });
    addText(slide, truncate(section.title || "", 64), {
      x: x + 0.5,
      y,
      w: columnWidth - 0.5,
      h: rowHeight,
      fontSize: twoColumns ? 12 : 15,
      bold: !twoColumns,
      color: theme.titleColor,
      fontFace: theme.fontTitle,
      valign: "middle",
    });
  });

  addSlideFooter(slide, pptx, theme, {
    slideNumber,
    totalSlides,
    deckTitle,
    company: branding.mode === "none" ? "" : company,
    branding,
    date,
    language,
  });
  addBranding(slide, pptx, theme, branding, "content");

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderSectionSlide(slide, pptx, slideData, theme, context = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    branding = {},
    date = "",
    language = "en",
    sectionNumber = slideData.sectionNumber,
    sectionTotal = context.sectionTotal,
  } = context;

  slide.background = { color: theme.titleSlideBackground };

  if (theme.decoration !== "minimal") {
    addRect(slide, pptx, {
      x: 7.55,
      y: 0,
      w: 2.45,
      h: SLIDE_H,
      fill: { color: theme.titleSlideAccentColor, transparency: 90 },
    });
  }

  const number = Number(sectionNumber) || 0;
  if (number > 0) {
    addText(slide, String(number).padStart(2, "0"), {
      x: MARGIN_X,
      y: 1.35,
      w: 1.25,
      h: 1.15,
      fontSize: 54,
      bold: true,
      color: theme.titleSlideAccentColor,
      fontFace: theme.fontTitle,
      valign: "middle",
    });
    addText(slide, slideData.title || "", {
      x: 2.0,
      y: 1.45,
      w: 6.7,
      h: 1.0,
      fontSize: 32,
      bold: true,
      color: theme.titleSlideTitleColor,
      fontFace: theme.fontTitle,
      valign: "middle",
    });
  } else {
    addText(slide, slideData.title || "", {
      x: MARGIN_X,
      y: 1.55,
      w: 7.6,
      h: 1.1,
      fontSize: 32,
      bold: true,
      color: theme.titleSlideTitleColor,
      fontFace: theme.fontTitle,
      valign: "middle",
    });
    addAccentUnderline(
      slide,
      pptx,
      MARGIN_X,
      2.7,
      theme.titleSlideAccentColor,
      1.4,
      0.04
    );
  }

  if (slideData.subtitle) {
    addText(slide, slideData.subtitle, {
      x: number > 0 ? 2.0 : MARGIN_X,
      y: number > 0 ? 2.55 : 2.95,
      w: 6.9,
      h: 0.6,
      fontSize: 14,
      color: theme.titleSlideSubtitleColor,
      fontFace: theme.fontBody,
      valign: "top",
    });
  }

  if (number > 0 && sectionTotal > 0) {
    addRect(slide, pptx, {
      x: MARGIN_X,
      y: 5.03,
      w: CONTENT_W,
      h: 0.035,
      fill: { color: theme.titleSlideSubtitleColor, transparency: 70 },
    });
    addRect(slide, pptx, {
      x: MARGIN_X,
      y: 5.03,
      w: (CONTENT_W * Math.min(number, sectionTotal)) / sectionTotal,
      h: 0.035,
      fill: { color: theme.titleSlideAccentColor },
    });
  }

  addSlideFooter(slide, pptx, theme, {
    slideNumber,
    totalSlides,
    deckTitle,
    company: branding.mode === "none" ? "" : company,
    branding,
    date,
    language,
    dark: true,
  });
  addBranding(slide, pptx, theme, branding, "section");

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderBulletsSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );

  addBulletContent(slide, pptx, slideData.content, theme, {
    x: MARGIN_X,
    y: contentTop,
    w: CONTENT_W,
    h: CONTENT_BOTTOM - contentTop,
    language: context.language || "en",
  });

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderKpiSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  const stats = (slideData.stats || []).slice(0, 4);
  if (stats.length === 0) return;

  const cardHeight = CONTENT_BOTTOM - contentTop - 0.05;
  const gap = stats.length === 2 ? 0.3 : stats.length === 3 ? 0.25 : 0.2;
  const cardWidth = (CONTENT_W - gap * (stats.length - 1)) / stats.length;

  stats.forEach((stat, index) => {
    const x = MARGIN_X + index * (cardWidth + gap);
    addCard(slide, pptx, theme, {
      x,
      y: contentTop,
      w: cardWidth,
      h: cardHeight,
      accent: true,
    });

    addText(slide, String(index + 1).padStart(2, "0"), {
      x: x + cardWidth - 0.42,
      y: contentTop + 0.12,
      w: 0.3,
      h: 0.2,
      fontSize: 8,
      color: theme.subtitleColor,
      fontFace: theme.fontBody,
      align: "right",
    });

    const value = String(stat.value || "");
    addText(slide, value, {
      x: x + 0.18,
      y: contentTop + 0.35,
      w: cardWidth - 0.36,
      h: 0.75,
      fontSize: value.length > 9 ? 23 : value.length > 6 ? 27 : 31,
      bold: true,
      color: theme.accentColor,
      fontFace: theme.fontTitle,
      valign: "bottom",
    });

    addText(slide, truncate(stat.label || "", 60), {
      x: x + 0.18,
      y: contentTop + 1.18,
      w: cardWidth - 0.36,
      h: 0.4,
      fontSize: 10.5,
      bold: true,
      color: theme.titleColor,
      fontFace: theme.fontBody,
      valign: "top",
    });

    if (stat.detail) {
      addText(slide, stat.detail, {
        x: x + 0.18,
        y: contentTop + 1.62,
        w: cardWidth - 0.36,
        h: cardHeight - 1.8,
        fontSize: 9,
        color: theme.subtitleColor,
        fontFace: theme.fontBody,
        valign: "top",
      });
    }
  });

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderTwoColumnSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  const columns = (slideData.columns || []).slice(0, 2);
  if (columns.length !== 2) return;

  const gap = 0.3;
  const columnWidth = (CONTENT_W - gap) / 2;
  const cardHeight = CONTENT_BOTTOM - contentTop - 0.05;

  columns.forEach((column, index) => {
    const x = MARGIN_X + index * (columnWidth + gap);
    addCard(slide, pptx, theme, {
      x,
      y: contentTop,
      w: columnWidth,
      h: cardHeight,
    });

    addText(slide, truncate(column.title || "", 50), {
      x: x + 0.22,
      y: contentTop + 0.2,
      w: columnWidth - 0.44,
      h: 0.34,
      fontSize: 13,
      bold: true,
      color: theme.accentColor,
      fontFace: theme.fontTitle,
    });
    addAccentUnderline(
      slide,
      pptx,
      x + 0.22,
      contentTop + 0.58,
      theme.accentColor,
      0.55,
      0.025
    );

    const bullets = (column.content || []).map((text) => ({
      text: String(text),
      options: {
        fontSize: 11,
        color: theme.bodyColor,
        fontFace: theme.fontBody,
        bullet: {
          code: theme.bulletCode || "25AA",
          color: theme.bulletColor,
        },
        paraSpaceAfter: 6,
        lineSpacingMultiple: 1.08,
      },
    }));

    if (bullets.length > 0) {
      slide.addText(bullets, {
        x: x + 0.22,
        y: contentTop + 0.72,
        w: columnWidth - 0.44,
        h: cardHeight - 0.9,
        valign: "top",
        margin: 0,
        fit: "shrink",
      });
    }
  });

  addVerticalDivider(
    slide,
    pptx,
    theme,
    MARGIN_X + columnWidth + gap / 2,
    contentTop + 0.15,
    cardHeight - 0.3
  );

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderQuoteSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  const quote = slideData.quote;
  if (!quote?.text) return;

  addText(slide, "“", {
    x: MARGIN_X - 0.05,
    y: contentTop - 0.25,
    w: 0.9,
    h: 1.0,
    fontSize: 72,
    bold: true,
    color: theme.accentColor,
    fontFace: theme.fontTitle,
    transparency: 55,
  });

  addText(slide, quote.text, {
    x: MARGIN_X + 0.75,
    y: contentTop + 0.05,
    w: CONTENT_W - 0.75,
    h: 2.25,
    fontSize: quote.text.length > 220 ? 19 : quote.text.length > 140 ? 22 : 26,
    italic: true,
    color: theme.titleColor,
    fontFace: theme.fontTitle,
    valign: "top",
  });

  if (quote.attribution) {
    addRect(slide, pptx, {
      x: MARGIN_X + 0.75,
      y: contentTop + 2.55,
      w: 0.6,
      h: 0.025,
      fill: { color: theme.accentColor },
    });
    addText(slide, `— ${quote.attribution}`, {
      x: MARGIN_X + 0.75,
      y: contentTop + 2.65,
      w: CONTENT_W - 0.75,
      h: 0.35,
      fontSize: 12,
      color: theme.subtitleColor,
      fontFace: theme.fontBody,
    });
  }

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderTableSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  addTableContent(slide, pptx, slideData.table, theme, {
    x: MARGIN_X,
    y: contentTop,
    w: CONTENT_W,
    h: CONTENT_BOTTOM - contentTop,
    language: context.language || "en",
  });
  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderChartSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  const chart = slideData.chart;
  if (!chart) return;

  addChartContent(slide, pptx, chart, theme, {
    x: MARGIN_X,
    y: contentTop,
    w: CONTENT_W,
    h: CONTENT_BOTTOM - contentTop - 0.2,
  });

  const sourceParts = [];
  if (chart.source?.title) {
    sourceParts.push(
      `${getStrings(context.language || "en").source}: ${truncate(
        chart.source.title,
        90
      )}`
    );
  }
  if (chart.asOf) {
    sourceParts.push(
      `${getStrings(context.language || "en").asOf} ${chart.asOf}`
    );
  }
  if (chart.truncated) {
    sourceParts.push(
      getStrings(context.language || "en").showingFirst.replace(
        "{count}",
        String(chart.dataset.length)
      )
    );
  }

  if (sourceParts.length > 0) {
    addText(slide, sourceParts.join("  ·  "), {
      x: MARGIN_X,
      y: CONTENT_BOTTOM - 0.2,
      w: CONTENT_W,
      h: 0.18,
      fontSize: 8,
      color: theme.footerColor,
      fontFace: theme.fontBody,
    });
  }

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderImageSlide(slide, pptx, slideData, theme, context = {}) {
  const contentTop = renderContentChrome(
    slide,
    pptx,
    theme,
    slideData,
    context
  );
  const image = slideData.image;
  if (!image) return;

  const imageHeight = CONTENT_BOTTOM - contentTop - 0.35;
  addImage(slide, image, {
    x: MARGIN_X,
    y: contentTop,
    w: CONTENT_W,
    h: imageHeight,
    sizing: { type: "contain", w: CONTENT_W, h: imageHeight },
    altText: image.alt || slideData.title || "Slide image",
  });

  if (image.caption) {
    addText(slide, image.caption, {
      x: MARGIN_X,
      y: CONTENT_BOTTOM - 0.3,
      w: CONTENT_W,
      h: 0.2,
      fontSize: 8,
      color: theme.footerColor,
      fontFace: theme.fontBody,
      align: "center",
    });
  }

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderSourcesSlide(slide, pptx, slideData, theme, context = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    branding = {},
    date = "",
    language = "en",
  } = context;
  const strings = getStrings(language);
  const citations = Array.isArray(slideData.citations)
    ? slideData.citations.slice(0, 8)
    : [];

  slide.background = { color: theme.background };
  addTopAccentBar(slide, pptx, theme);

  addText(slide, slideData.title || strings.sources, {
    x: MARGIN_X,
    y: 0.42,
    w: CONTENT_W,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: theme.titleColor,
    fontFace: theme.fontTitle,
  });
  addAccentUnderline(
    slide,
    pptx,
    MARGIN_X,
    1.03,
    theme.accentColor,
    0.9,
    0.035
  );

  if (citations.length === 0) {
    addText(slide, strings.noData, {
      x: MARGIN_X,
      y: 1.4,
      w: CONTENT_W,
      h: 0.4,
      fontSize: 12,
      color: theme.subtitleColor,
      fontFace: theme.fontBody,
      italic: true,
    });
  } else {
    const twoColumns = citations.length > 4;
    const rows = twoColumns
      ? Math.ceil(citations.length / 2)
      : citations.length;
    const columnWidth = twoColumns ? 3.9 : CONTENT_W;
    const rowHeight = twoColumns ? 0.72 : 0.78;

    citations.forEach((citation, index) => {
      const column = twoColumns && index >= rows ? 1 : 0;
      const row = twoColumns && index >= rows ? index - rows : index;
      const x = MARGIN_X + column * 4.5;
      const y = 1.3 + row * rowHeight;

      addText(slide, `[${index + 1}]`, {
        x,
        y,
        w: 0.4,
        h: rowHeight,
        fontSize: 9,
        bold: true,
        color: theme.accentColor,
        fontFace: theme.fontBody,
        valign: "top",
      });

      addText(slide, truncate(citation.title || "", 120), {
        x: x + 0.42,
        y,
        w: columnWidth - 0.42,
        h: 0.34,
        fontSize: 9.5,
        bold: true,
        color: theme.titleColor,
        fontFace: theme.fontBody,
        valign: "top",
      });

      if (citation.url) {
        addText(slide, truncate(citation.url.replace(/^https?:\/\//, ""), 70), {
          x: x + 0.42,
          y: y + 0.34,
          w: columnWidth - 0.42,
          h: 0.28,
          fontSize: 8,
          color: theme.subtitleColor,
          fontFace: theme.fontBody,
          valign: "top",
        });
      }
    });
  }

  addSlideFooter(slide, pptx, theme, {
    slideNumber,
    totalSlides,
    deckTitle,
    company: branding.mode === "none" ? "" : company,
    branding,
    date,
    language,
  });
  addBranding(slide, pptx, theme, branding, "content");

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderClosingSlide(slide, pptx, slideData, theme, context = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    branding = {},
    date = "",
    language = "en",
  } = context;
  const strings = getStrings(language);
  const title = slideData.title || strings.closingTitle;

  slide.background = { color: theme.titleSlideBackground };

  if (theme.decoration !== "minimal") {
    addRect(slide, pptx, {
      x: 7.55,
      y: 0,
      w: 2.45,
      h: SLIDE_H,
      fill: { color: theme.titleSlideAccentColor, transparency: 90 },
    });
  }

  const brandName = branding.mode === "none" ? "" : branding.company || "";
  if (brandName) {
    addText(slide, brandName.toUpperCase(), {
      x: MARGIN_X,
      y: 0.6,
      w: 6.4,
      h: 0.25,
      fontSize: 9,
      bold: true,
      charSpacing: 1.5,
      color: theme.titleSlideAccentColor,
      fontFace: theme.fontBody,
    });
  }

  addText(slide, title, {
    x: MARGIN_X,
    y: 1.6,
    w: 6.8,
    h: 1.1,
    fontSize: 38,
    bold: true,
    color: theme.titleSlideTitleColor,
    fontFace: theme.fontTitle,
    valign: "middle",
  });
  addAccentUnderline(
    slide,
    pptx,
    MARGIN_X,
    2.82,
    theme.titleSlideAccentColor,
    1.2,
    0.04
  );

  addText(slide, slideData.subtitle || strings.closingSubtitle, {
    x: MARGIN_X,
    y: 3.05,
    w: 6.5,
    h: 0.5,
    fontSize: 14,
    color: theme.titleSlideSubtitleColor,
    fontFace: theme.fontBody,
  });

  const contact =
    branding.mode === "none"
      ? ""
      : [branding.website, branding.company].filter(Boolean).join("  ·  ");
  if (contact) {
    addText(slide, contact, {
      x: MARGIN_X,
      y: 4.35,
      w: 6.5,
      h: 0.3,
      fontSize: 10,
      color: theme.titleSlideSubtitleColor,
      fontFace: theme.fontBody,
    });
  }

  addBranding(slide, pptx, theme, branding, "closing");
  addSlideFooter(slide, pptx, theme, {
    slideNumber,
    totalSlides,
    deckTitle,
    company: branding.mode === "none" ? "" : company,
    branding,
    date,
    language,
    dark: true,
  });

  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderBlankSlide(slide, pptx, slideData, theme, context = {}) {
  slide.background = { color: theme.background };
  addBranding(slide, pptx, theme, context.branding, "content");
  addSlideFooter(slide, pptx, theme, {
    slideNumber: context.slideNumber || 1,
    totalSlides: context.totalSlides || 1,
    deckTitle: context.deckTitle || "",
    company: context.branding?.mode === "none" ? "" : context.company || "",
    branding: context.branding || {},
    date: context.date || "",
    language: context.language || "en",
  });
  if (slideData.notes) slide.addNotes(slideData.notes);
}

/**
 * Dispatch a normalized slide to its layout renderer.
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} slideData
 * @param {Object} theme
 * @param {Object} context
 */
function renderSlide(slide, pptx, slideData, theme, context = {}) {
  const layout = slideData.layout || "content";

  switch (layout) {
    case "title":
    case "cover":
      return renderTitleSlide(slide, pptx, slideData, theme, context);
    case "agenda":
      return renderAgendaSlide(slide, pptx, slideData, theme, context);
    case "section":
      return renderSectionSlide(slide, pptx, slideData, theme, context);
    case "kpi":
      return renderKpiSlide(slide, pptx, slideData, theme, context);
    case "two-column":
      return renderTwoColumnSlide(slide, pptx, slideData, theme, context);
    case "quote":
      return renderQuoteSlide(slide, pptx, slideData, theme, context);
    case "table":
      return renderTableSlide(slide, pptx, slideData, theme, context);
    case "chart":
      return renderChartSlide(slide, pptx, slideData, theme, context);
    case "image":
      return renderImageSlide(slide, pptx, slideData, theme, context);
    case "sources":
      return renderSourcesSlide(slide, pptx, slideData, theme, context);
    case "closing":
      return renderClosingSlide(slide, pptx, slideData, theme, context);
    case "blank":
      return renderBlankSlide(slide, pptx, slideData, theme, context);
    default:
      return renderBulletsSlide(slide, pptx, slideData, theme, context);
  }
}

module.exports = {
  renderSlide,
  renderTitleSlide,
  renderAgendaSlide,
  renderSectionSlide,
  renderContentSlide: renderBulletsSlide,
  renderBulletsSlide,
  renderKpiSlide,
  renderTwoColumnSlide,
  renderQuoteSlide,
  renderTableSlide,
  renderChartSlide,
  renderImageSlide,
  renderSourcesSlide,
  renderClosingSlide,
  renderBlankSlide,
};
