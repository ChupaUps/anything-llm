const { isDarkColor, mixHex, bestTextColor } = require("./themes.js");
const { formatDate } = require("./i18n.js");

// All positioning assumes LAYOUT_16x9: 10 × 5.625 in.
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN_X = 0.7;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;
const FOOTER_Y = 5.0;
const CONTENT_TOP = 1.45;
const CONTENT_BOTTOM = 4.85;

/**
 * @param {unknown} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength = 120) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * Add text with shrink-to-fit enabled. Centralizing the options keeps every
 * layout from silently overflowing when the LLM writes a long headline.
 * @param {Object} slide
 * @param {string|Object[]} text
 * @param {Object} options
 */
function addText(slide, text, options = {}) {
  slide.addText(text, {
    margin: 0,
    fit: "shrink",
    breakLine: false,
    ...options,
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} options
 */
function addRect(slide, pptx, options = {}) {
  slide.addShape(pptx.ShapeType.rect, {
    line: { color: options.fill?.color || "FFFFFF", transparency: 100 },
    ...options,
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} options
 */
function addRoundRect(slide, pptx, options = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    rectRadius: 0.06,
    ...options,
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {string} color
 * @param {number} [height]
 */
function addAccentUnderline(
  slide,
  pptx,
  x,
  y,
  color,
  width = 1.5,
  height = 0.035
) {
  addRect(slide, pptx, {
    x,
    y,
    w: width,
    h: height,
    fill: { color },
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 */
function addTopAccentBar(slide, pptx, theme) {
  const height =
    theme.decoration === "minimal"
      ? 0.03
      : theme.decoration === "bold"
        ? 0.09
        : 0.05;
  addRect(slide, pptx, {
    x: 0,
    y: 0,
    w: "100%",
    h: height,
    fill: { color: theme.accentColor },
  });

  if (theme.decoration === "corner") {
    addRect(slide, pptx, {
      x: SLIDE_W - 0.5,
      y: 0,
      w: 0.5,
      h: 0.5,
      fill: { color: theme.accentColor, transparency: 82 },
    });
  }
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {Object} options
 */
function addCard(slide, pptx, theme, options = {}) {
  const {
    x,
    y,
    w,
    h,
    fill = theme.cardColor,
    border = theme.cardBorderColor,
    accent = false,
  } = options;

  addRoundRect(slide, pptx, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: border, width: 0.75 },
  });

  if (accent) {
    addRect(slide, pptx, {
      x,
      y,
      w,
      h: 0.035,
      fill: { color: theme.accentColor },
    });
  }
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 */
function addSectionBadge(slide, pptx, theme, x, y, size, color) {
  addRoundRect(slide, pptx, {
    x,
    y,
    w: size,
    h: size,
    fill: { color: color || theme.accentColor },
    line: { color: color || theme.accentColor },
  });
}

/**
 * @param {Object} image
 * @returns {{data?: string, path?: string}}
 */
function imageSource(image) {
  if (!image) return {};
  if (image.kind === "data") {
    // PptxGenJS expects "image/png;base64,..." without the data: prefix.
    return { data: String(image.value).replace(/^data:/i, "") };
  }
  return { path: image.value };
}

/**
 * @param {Object} slide
 * @param {Object} image
 * @param {Object} options
 * @returns {boolean}
 */
function addImage(slide, image, options = {}) {
  try {
    slide.addImage({
      ...imageSource(image),
      x: options.x,
      y: options.y,
      w: options.w,
      h: options.h,
      sizing: options.sizing,
      altText: options.altText || image.alt || "",
      transparency: options.transparency,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Add the user's logo only where it is requested. Platform branding is never
 * injected implicitly; a deck with no brand stays clean.
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {Object} branding
 * @param {"cover"|"section"|"content"|"closing"} placement
 */
function addBranding(slide, pptx, theme, branding = {}, placement = "content") {
  if (!branding || branding.mode === "none" || !branding.logo) return;

  const showOnContent =
    placement === "cover" ||
    placement === "closing" ||
    branding.mode === "full";
  if (!showOnContent) return;

  if (placement === "cover") {
    addImage(slide, branding.logo, {
      x: 7.45,
      y: 4.68,
      w: 1.85,
      h: 0.45,
      sizing: { type: "contain", w: 1.85, h: 0.45 },
      altText: branding.logoAlt || "Company logo",
    });
    return;
  }

  if (placement === "closing") {
    addImage(slide, branding.logo, {
      x: 4.125,
      y: 3.9,
      w: 1.75,
      h: 0.45,
      sizing: { type: "contain", w: 1.75, h: 0.45 },
      altText: branding.logoAlt || "Company logo",
    });
    return;
  }

  addImage(slide, branding.logo, {
    x: 7.7,
    y: 5.02,
    w: 0.75,
    h: 0.18,
    sizing: { type: "contain", w: 0.75, h: 0.18 },
    altText: branding.logoAlt || "Company logo",
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {Object} options
 */
function addSlideFooter(slide, pptx, theme, options = {}) {
  const {
    slideNumber = 1,
    totalSlides = 1,
    deckTitle = "",
    company = "",
    sectionTitle = "",
    branding = {},
    date = "",
    language = "en",
    dark = false,
  } = options;

  const color = dark ? theme.titleSlideSubtitleColor : theme.footerColor;
  const lineColor = dark
    ? mixHex(color, theme.titleSlideBackground, 0.55)
    : theme.footerLineColor;

  addRect(slide, pptx, {
    x: MARGIN_X,
    y: FOOTER_Y,
    w: CONTENT_W,
    h: 0.007,
    fill: { color: lineColor },
  });

  const leftParts = [];
  if (branding.footer) leftParts.push(branding.footer);
  else {
    if (company) leftParts.push(company);
    if (deckTitle) leftParts.push(deckTitle);
  }
  if (branding.confidentiality) leftParts.push(branding.confidentiality);
  const displayDate = date ? formatDate(date, language) : "";
  if (displayDate) leftParts.push(displayDate);
  const leftText = truncate(leftParts.filter(Boolean).join(" · "), 76);

  if (leftText) {
    addText(slide, leftText, {
      x: MARGIN_X,
      y: 5.07,
      w: 4.8,
      h: 0.22,
      fontSize: 8,
      color,
      fontFace: theme.fontBody,
      align: "left",
      valign: "middle",
    });
  }

  if (sectionTitle) {
    addText(slide, truncate(sectionTitle, 32), {
      x: 4.95,
      y: 5.07,
      w: 2.55,
      h: 0.22,
      fontSize: 7.5,
      color,
      fontFace: theme.fontBody,
      align: "center",
      valign: "middle",
    });
  }

  addText(slide, `${slideNumber} / ${totalSlides}`, {
    x: 8.55,
    y: 5.07,
    w: 0.75,
    h: 0.22,
    fontSize: 7.5,
    color,
    fontFace: theme.fontBody,
    align: "right",
    valign: "middle",
  });
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} theme
 * @param {number} x
 * @param {number} y
 * @param {number} h
 */
function addVerticalDivider(slide, pptx, theme, x, y, h) {
  addRect(slide, pptx, {
    x,
    y,
    w: 0.008,
    h,
    fill: { color: theme.cardBorderColor },
  });
}

/**
 * @param {Object} theme
 * @param {string} background
 * @returns {string}
 */
function footerTextColor(theme, background) {
  return isDarkColor(background)
    ? bestTextColor(background, "FFFFFF", "111827")
    : theme.footerColor;
}

module.exports = {
  SLIDE_W,
  SLIDE_H,
  MARGIN_X,
  CONTENT_W,
  FOOTER_Y,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  truncate,
  addText,
  addRect,
  addRoundRect,
  addAccentUnderline,
  addTopAccentBar,
  addCard,
  addSectionBadge,
  addImage,
  addBranding,
  addSlideFooter,
  addVerticalDivider,
  footerTextColor,
  imageSource,
};
