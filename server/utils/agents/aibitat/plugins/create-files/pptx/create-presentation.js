const path = require("path");
const createFilesLib = require("../lib.js");
const {
  resolveTheme,
  getThemeChoices,
  getThemeDescriptions,
} = require("./themes.js");
const { runSectionAgent } = require("./section-agent.js");
const { renderSlide } = require("./layouts.js");
const {
  normalizeDeckRequest,
  normalizeSlides,
  dedupeCitations,
  MAX_SLIDES_PER_DECK,
  MAX_SLIDES_PER_SECTION,
} = require("./normalize.js");
const { getStrings, getPptxLanguage } = require("./i18n.js");

/**
 * Extracts recent conversation history from the parent AIbitat's chat log
 * to provide context to each section sub-agent.
 * @param {Array} chats - The parent AIbitat's _chats array
 * @param {number} [maxMessages=10] - Maximum messages to include
 * @returns {string} Formatted conversation context
 */
function extractConversationContext(chats, maxMessages = 10) {
  if (!Array.isArray(chats) || chats.length === 0) return "";

  const recent = chats
    .filter((c) => c.state === "success" && c.content)
    .slice(-maxMessages);

  if (recent.length === 0) return "";

  return recent
    .map((c) => {
      const content =
        typeof c.content === "string" ? c.content.substring(0, 500) : "";
      return `${c.from}: ${content}`;
    })
    .join("\n");
}

/**
 * @param {Object} deck
 * @returns {number}
 */
function estimateSlideCount(deck) {
  const base =
    1 +
    (deck.includeAgenda && deck.sections.length >= 3 ? 1 : 0) +
    deck.sections.length * 3 +
    (deck.includeClosing ? 1 : 0) +
    (deck.includeSources ? 1 : 0);
  const target = Math.max(base, deck.targetSlideCount || 0);
  return Math.min(MAX_SLIDES_PER_DECK, Math.max(4, target));
}

/**
 * Attach provenance URLs to speaker notes so a presenter can open the source
 * even though the slide itself only shows a short label.
 * @param {Object} slide
 */
function appendSourceNotes(slide) {
  const urls = [];
  if (slide.chart?.source?.url) urls.push(slide.chart.source.url);
  if (slide.table?.source?.url) urls.push(slide.table.source.url);
  if (urls.length === 0) return slide;
  const note = `Source: ${[...new Set(urls)].join("\n")}`;
  return {
    ...slide,
    notes: slide.notes ? `${slide.notes}\n\n${note}` : note,
  };
}

/**
 * Assemble cover, agenda, section slides, sources and closing into one ordered
 * deck. Section slides are normalized and split here so the renderer receives
 * predictable layouts.
 * @param {Object} options
 * @returns {{slides: Object[], warnings: string[]}}
 */
function assembleDeckSlides({ deck, sectionGroups, citations }) {
  const strings = getStrings(deck.language);
  const warnings = [];
  const sectionSlides = [];

  sectionGroups.forEach((group, index) => {
    const normalized = normalizeSlides(
      group.slides.slice(0, MAX_SLIDES_PER_SECTION),
      { language: deck.language }
    );
    warnings.push(...normalized.warnings);

    let slides = normalized.slides;
    if (slides.length === 0) {
      const fallbackContent = (group.section.keyPoints || []).slice(0, 6);
      slides = [
        fallbackContent.length > 0
          ? {
              layout: "content",
              title: group.section.title,
              subtitle: group.section.subtitle || "",
              content: fallbackContent,
            }
          : {
              layout: "section",
              title: group.section.title,
              subtitle: group.section.subtitle || "",
            },
      ];
      warnings.push(
        `Section "${group.section.title}" had no valid slides; inserted a fallback`
      );
    }

    const needsDivider =
      sectionGroups.length > 1 &&
      slides.length >= 2 &&
      slides[0].layout !== "section";
    if (needsDivider) {
      sectionSlides.push({
        layout: "section",
        title: group.section.title,
        subtitle: group.section.subtitle || "",
        sectionNumber: index + 1,
        sectionTitle: group.section.title,
      });
    }

    for (const slide of slides) {
      sectionSlides.push(
        appendSourceNotes({
          ...slide,
          sectionNumber: index + 1,
          sectionTitle: group.section.title,
        })
      );
    }
  });

  if (sectionSlides.length > MAX_SLIDES_PER_DECK - 4) {
    warnings.push(
      `Section content was limited to ${
        MAX_SLIDES_PER_DECK - 4
      } slides so cover, agenda, sources and closing still fit`
    );
  }
  const limitedSections = sectionSlides.slice(0, MAX_SLIDES_PER_DECK - 4);

  const slides = [];
  slides.push({
    layout: "title",
    title: deck.title,
    subtitle: deck.subtitle,
    author: deck.author,
  });

  if (deck.includeAgenda && deck.sections.length >= 3) {
    slides.push({
      layout: "agenda",
      title: strings.agendaTitle,
      sections: deck.sections.map((section) => ({
        title: section.title,
        subtitle: section.subtitle,
      })),
    });
  }

  slides.push(...limitedSections);

  if (deck.includeSources && citations.length > 0) {
    slides.push({
      layout: "sources",
      title: strings.sources,
      citations,
    });
  }

  if (deck.includeClosing) {
    slides.push({
      layout: "closing",
      title: strings.closingTitle,
      subtitle: strings.closingSubtitle,
    });
  }

  return { slides: slides.slice(0, MAX_SLIDES_PER_DECK), warnings };
}

module.exports.CreatePptxPresentation = {
  name: "create-pptx-presentation",
  plugin: function () {
    return {
      name: "create-pptx-presentation",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a polished, data-driven PowerPoint presentation (PPTX). " +
            "Provide a title, optional brand, and section outlines with key points. " +
            "Each section is independently researched by a focused sub-agent that can " +
            "use workspace documents and, when enabled, web search and scraping. " +
            "The deck can include native charts, KPI cards, tables, two-column " +
            "comparisons, quotes and images. Charts require a real dataset and a source.",
          examples: [
            {
              prompt: "Create a board presentation about Q4 results",
              call: JSON.stringify({
                filename: "q4-business-review.pptx",
                title: "Q4 Business Review",
                subtitle: "Revenue, margin and 2026 outlook",
                author: "Finance team",
                theme: "auto",
                styleBrief:
                  "Board update: concise, data-driven, navy and gold, no stock photos",
                audience: "Board of directors",
                branding: {
                  mode: "minimal",
                  company: "Acme",
                  primary: "0C1929",
                  accent: "C9943E",
                },
                sections: [
                  {
                    title: "Revenue",
                    keyPoints: [
                      "Revenue grew 23% year-over-year",
                      "Enterprise segment drove most of the growth",
                    ],
                    dataNeeds: ["Quarterly revenue by segment"],
                  },
                  {
                    title: "Outlook",
                    keyPoints: [
                      "FY2026 priorities and risks",
                      "Investment areas",
                    ],
                    dataNeeds: ["2026 market growth rate from a named source"],
                  },
                ],
              }),
            },
            {
              prompt: "Create a clean presentation with no branding",
              call: JSON.stringify({
                filename: "project-update.pptx",
                title: "Project Atlas Update",
                theme: "minimal",
                branding: { mode: "none" },
                sections: [
                  {
                    title: "Progress",
                    keyPoints: ["Milestone 1 complete", "Milestone 2 on track"],
                  },
                ],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              filename: {
                type: "string",
                description:
                  "The filename for the presentation (should end with .pptx).",
              },
              title: {
                type: "string",
                description:
                  "The title of the presentation (shown on title slide).",
              },
              subtitle: {
                type: "string",
                description: "Optional subtitle or tagline for the cover.",
              },
              author: {
                type: "string",
                description:
                  "Optional author/presenter name for the cover and metadata.",
              },
              language: {
                type: "string",
                description:
                  "BCP-47 language code for the deck, for example en-US or ru-RU. Use auto to infer from the title. Chrome labels support en and ru; other languages use English labels.",
              },
              theme: {
                type: "string",
                enum: getThemeChoices(),
                description:
                  "Visual theme. auto picks a theme from the title and styleBrief. " +
                  getThemeDescriptions()
                    .map((theme) => `${theme.id} (${theme.description})`)
                    .join("; "),
              },
              styleBrief: {
                type: "string",
                description:
                  "Optional visual brief: tone, industry, colors, imagery. Used to pick a theme and guide the section agents.",
              },
              audience: {
                type: "string",
                description:
                  "Who the deck is for (board, customers, engineers).",
              },
              branding: {
                type: "object",
                description:
                  "Optional user branding. mode none removes all branding; minimal adds only a logo/footer where the template allows; full adds the logo to content slides.",
                properties: {
                  mode: {
                    type: "string",
                    enum: ["none", "minimal", "full"],
                  },
                  company: { type: "string" },
                  logo: {
                    type: "string",
                    description:
                      "https URL or data:image/png;base64,... URI for the user's logo.",
                  },
                  website: { type: "string" },
                  footer: { type: "string" },
                  confidentiality: { type: "string" },
                  showDate: { type: "boolean" },
                  primary: {
                    type: "string",
                    description: "Brand primary color as a hex string.",
                  },
                  accent: {
                    type: "string",
                    description: "Brand accent color as a hex string.",
                  },
                  background: {
                    type: "string",
                    description: "Optional custom content background hex.",
                  },
                  text: {
                    type: "string",
                    description: "Optional custom text hex.",
                  },
                },
                additionalProperties: false,
              },
              sections: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                description:
                  "Section outlines. Each section is independently researched and built by a focused sub-agent.",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "The section title.",
                    },
                    subtitle: {
                      type: "string",
                      description: "Optional section subtitle.",
                    },
                    keyPoints: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 12,
                      description:
                        "Key points this section should cover. The sub-agent expands these into slides.",
                    },
                    instructions: {
                      type: "string",
                      description:
                        "Optional guidance (research recent statistics, compare competitors, include a chart or table).",
                    },
                    dataNeeds: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Specific data points or sources the sub-agent should verify before putting numbers on a slide.",
                    },
                  },
                  required: ["title", "keyPoints"],
                  additionalProperties: false,
                },
              },
              includeAgenda: {
                type: "boolean",
                description:
                  "Add an agenda slide when there are at least three sections (default true).",
              },
              includeClosing: {
                type: "boolean",
                description: "Add a closing slide (default true).",
              },
              includeSources: {
                type: "boolean",
                description:
                  "Add a sources slide when the agents collected citations (default true).",
              },
              targetSlideCount: {
                type: "integer",
                minimum: 4,
                maximum: MAX_SLIDES_PER_DECK,
                description:
                  "Optional approximate slide count target. Used for approval and planning, not as a hard limit.",
              },
            },
            required: ["filename", "title", "sections"],
            additionalProperties: false,
          },

          handler: async function (args = {}) {
            const log = this.super.handlerProps?.log || console.log;

            try {
              log(`Using the create-pptx-presentation tool.`);

              const normalized = normalizeDeckRequest(args);
              if (!normalized.ok) {
                return `Presentation not created: ${normalized.errors.join(
                  "; "
                )}. Call create-pptx-presentation again with at least one section.`;
              }

              const deck = normalized.request;
              const warnings = [...normalized.warnings];
              const theme = resolveTheme({
                themeName: deck.theme,
                brand: deck.branding,
                styleBrief: deck.styleBrief,
                text: `${deck.title} ${deck.audience}`,
              });
              const estimatedSlides = estimateSlideCount(deck);

              this.super.introspect(
                `${this.caller}: Planning presentation "${deck.title}" — ${
                  deck.sections.length
                } section${deck.sections.length !== 1 ? "s" : ""}, ${
                  theme.name
                } theme${theme.autoSelected ? " (auto)" : ""}, ~${estimatedSlides} slides`
              );

              // Ask for approval BEFORE kicking off the expensive sub-agent work
              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: {
                    filename: deck.filename,
                    title: deck.title,
                    theme: theme.name,
                    themeKey: theme.key,
                    themeAutoSelected: theme.autoSelected,
                    brandingMode: deck.branding.mode,
                    company: deck.branding.company,
                    language: deck.language,
                    sectionCount: deck.sections.length,
                    sectionTitles: deck.sections.map(
                      (section) => section.title
                    ),
                    estimatedSlides,
                    includesAgenda: deck.includeAgenda,
                    includesSources: deck.includeSources,
                  },
                  description: `Create PowerPoint presentation "${deck.title}" with ${deck.sections.length} sections, ${theme.name} theme, ~${estimatedSlides} slides`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message || "Presentation creation cancelled.";
                }
              }

              const conversationContext = extractConversationContext(
                this.super._chats
              );
              const sectionGroups = [];
              const allCitations = [];

              for (let index = 0; index < deck.sections.length; index += 1) {
                const section = deck.sections[index];
                this.super.introspect(
                  `${this.caller}: [${index + 1}/${
                    deck.sections.length
                  }] Building section "${section.title}"…`
                );

                const result = await runSectionAgent({
                  parentAibitat: this.super,
                  section,
                  presentationTitle: deck.title,
                  conversationContext,
                  sectionPrefix: `${index + 1}/${deck.sections.length}`,
                  language: deck.language,
                  audience: deck.audience,
                  styleBrief: deck.styleBrief,
                });

                const sectionSlides = (result.slides || []).slice(
                  0,
                  MAX_SLIDES_PER_SECTION
                );
                if ((result.slides || []).length > MAX_SLIDES_PER_SECTION) {
                  warnings.push(
                    `Section "${section.title}" returned ${
                      result.slides.length
                    } slides; kept the first ${MAX_SLIDES_PER_SECTION}`
                  );
                }

                sectionGroups.push({ section, slides: sectionSlides });
                warnings.push(...(result.warnings || []));
                allCitations.push(...(result.citations || []));

                this.super.introspect(
                  `${this.caller}: [${index + 1}/${
                    deck.sections.length
                  }] Section "${section.title}" complete — ${
                    sectionSlides.length
                  } slide${sectionSlides.length !== 1 ? "s" : ""}`
                );
              }

              // Roll up citations from sub-agents to the parent so they appear
              // as sources on the final assistant message.
              if (allCitations.length > 0) this.super.addCitation(allCitations);

              const assembled = assembleDeckSlides({
                deck,
                sectionGroups,
                citations: dedupeCitations(allCitations),
              });
              warnings.push(...assembled.warnings);

              this.super.introspect(
                `${this.caller}: Assembling final deck — ${assembled.slides.length} slides total`
              );

              const PptxGenJS = require("pptxgenjs");
              const pptx = new PptxGenJS();
              pptx.layout = "LAYOUT_16x9";
              pptx.title = deck.title;
              pptx.subject = deck.subtitle || deck.title;
              pptx.author =
                deck.author || deck.branding.company || "AnythingLLM";
              pptx.company = deck.branding.company || "";
              pptx.lang = getPptxLanguage(deck.language);
              pptx.theme = {
                headFontFace: theme.fontTitle,
                bodyFontFace: theme.fontBody,
                lang: getPptxLanguage(deck.language),
              };

              // Sub-agent output can carry XML 1.0 illegal control characters
              // (e.g. a form feed from a LaTeX `\frac`); strip them recursively
              // so PowerPoint can open the generated deck.
              const cleanSlides = createFilesLib.stripInvalidXmlChars(
                assembled.slides
              );
              const totalSlides = cleanSlides.length;

              cleanSlides.forEach((slideData, index) => {
                const slide = pptx.addSlide();
                try {
                  renderSlide(slide, pptx, slideData, theme, {
                    slideNumber: index + 1,
                    totalSlides,
                    deckTitle: deck.title,
                    company: deck.branding.company,
                    branding: deck.branding,
                    date: deck.today,
                    language: deck.language,
                    sectionNumber: slideData.sectionNumber,
                    sectionTotal: deck.sections.length,
                    sectionTitle: slideData.sectionTitle,
                  });
                } catch (error) {
                  warnings.push(
                    `Slide ${index + 1} ("${
                      slideData.title || "untitled"
                    }") could not be fully rendered: ${error.message}`
                  );
                  log(
                    `create-pptx-presentation: slide ${
                      index + 1
                    } render error: ${error.message}`
                  );

                  // Keep the slide count stable and leave a readable fallback
                  // instead of dropping the page or crashing the whole deck.
                  try {
                    slide.background = { color: theme.background };
                    slide.addText(slideData.title || deck.title, {
                      x: 0.7,
                      y: 0.5,
                      w: 8.6,
                      h: 1,
                      fontSize: 24,
                      bold: true,
                      color: theme.titleColor,
                      fontFace: theme.fontTitle,
                      fit: "shrink",
                      margin: 0,
                    });
                    slide.addText(
                      "This slide could not be fully rendered. The details are in the speaker notes.",
                      {
                        x: 0.7,
                        y: 1.7,
                        w: 8.6,
                        h: 0.6,
                        fontSize: 13,
                        color: theme.subtitleColor,
                        fontFace: theme.fontBody,
                        fit: "shrink",
                        margin: 0,
                      }
                    );
                    slide.addNotes(
                      `Render error: ${error.message}\n\n${
                        slideData.notes || ""
                      }`
                    );
                  } catch (fallbackError) {
                    warnings.push(
                      `Fallback for slide ${
                        index + 1
                      } also failed: ${fallbackError.message}`
                    );
                  }
                }
              });

              const buffer = await pptx.write({ outputType: "nodebuffer" });
              const bufferSizeKB = (buffer.length / 1024).toFixed(2);
              const bufferSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
              log(
                `create-pptx-presentation: Generated buffer - size: ${bufferSizeKB}KB (${bufferSizeMB}MB), slides: ${totalSlides}, theme: ${theme.name}`
              );

              const displayFilename = path.basename(deck.filename);
              const savedFile = await createFilesLib.saveGeneratedFile({
                fileType: "pptx",
                extension: "pptx",
                buffer,
                displayFilename,
              });

              this.super.socket?.send?.("fileDownloadCard", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              createFilesLib.registerOutput(this.super, "PptxFileDownload", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              this.super.introspect(
                `${this.caller}: Successfully created presentation "${deck.title}"`
              );

              const chartCount = cleanSlides.filter(
                (slide) => slide.layout === "chart" && slide.chart
              ).length;
              const qaNotes = [...new Set(warnings)]
                .filter(Boolean)
                .slice(0, 8);

              return [
                `Successfully created presentation "${deck.title}" with ${totalSlides} slides across ${
                  deck.sections.length
                } sections using the ${theme.name} theme${
                  theme.autoSelected ? " (auto-selected)" : ""
                }.`,
                chartCount > 0 ? `Included ${chartCount} native chart(s).` : "",
                `Branding: ${deck.branding.mode}.`,
                qaNotes.length > 0
                  ? `QA notes: ${qaNotes.join("; ")}`
                  : "QA notes: no issues.",
              ]
                .filter(Boolean)
                .join("\n");
            } catch (e) {
              log(`create-pptx-presentation error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating presentation: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
