const AIbitat = require("../../../index.js");
const {
  normalizeSlide,
  validateSlide,
  extractSlidesFromText,
  MAX_BULLETS,
} = require("./normalize.js");
const { getStrings } = require("./i18n.js");

const SECTION_BUILDER_PROMPT = `You are a focused presentation section builder. Your ONLY task is to create slides for ONE section of a PowerPoint presentation.

RULES:
- Create 2-5 slides for this section (no more).
- Submit exactly ONE slide per submit-slide call. Never send an array of slides.
- "content" must be an array of 3-6 short bullet strings, never a single string or an object.
- Use the layout "chart" only when you have real data from a tool or from the provided context. Every chart MUST include source: {title, url?, asOf}. Never invent or "estimate" numbers.
- If you cannot verify the numbers, use bullets or a table without numbers. Do not fabricate data.
- Use a table when the data is better read as rows and columns. Include source/asOf when the table contains external data.
- Vary layouts: content, kpi, chart, table, two-column, quote, image.
- Do NOT create cover, agenda, closing or sources slides. The assembler adds them.
- Write the slide title as an insight ("Revenue grew 23% in Q4"), not a generic topic label ("Revenue").
- Include speaker notes with key talking points.

Available layouts:
- "content": title + content array + optional subtitle/notes
- "section": divider with title + optional subtitle (use rarely)
- "table": title + table {headers, rows, source?, asOf?}
- "chart": title + chart {type, dataset, series, source, asOf, ...}
- "kpi": title + 2-4 stats [{value, label, detail?}]
- "two-column": title + exactly 2 columns [{title, content}, {title, content}]
- "quote": title + {text, attribution?}
- "image": title + {url|data, alt, caption?}
- "blank": empty slide (rare)

When finished, call submit-slide once per slide. Do not respond with raw JSON.`;

const SOURCE_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Publication, report, dataset or 'User-provided data'.",
        },
        url: { type: "string", description: "https:// link to the source." },
        asOf: {
          type: "string",
          description: "Date or period the data refers to, e.g. 2026-09.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    { type: "string" },
  ],
};

const CHART_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "bar",
        "line",
        "area",
        "pie",
        "radar",
        "scatter",
        "composed",
        "waterfall",
        "funnel",
        "radialBar",
      ],
      description:
        "Chart type. Use bar for comparison, line/area for trends, pie for composition, composed for a bar+line mix, waterfall for changes.",
    },
    title: { type: "string" },
    subtitle: { type: "string" },
    xKey: {
      type: "string",
      description: "Category/date column in every dataset row.",
    },
    xLabel: { type: "string" },
    yLabel: { type: "string" },
    series: {
      type: "array",
      description:
        'Numeric columns to plot. Strings or objects: [{"key":"revenue","label":"Revenue","kind":"bar","axis":"left"}]',
      items: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              kind: { type: "string", enum: ["bar", "line", "area"] },
              axis: { type: "string", enum: ["left", "right"] },
            },
            required: ["key"],
            additionalProperties: false,
          },
        ],
      },
    },
    dataset: {
      type: "array",
      minItems: 1,
      description:
        'Array of row objects with the xKey and numeric series, e.g. [{"month":"Jan","revenue":120}]',
      items: { type: "object", additionalProperties: true },
    },
    valueFormat: {
      type: "string",
      enum: ["number", "currency", "percent"],
    },
    currency: { type: "string" },
    stackMode: {
      type: "string",
      enum: ["grouped", "stacked", "percent"],
    },
    orientation: { type: "string", enum: ["vertical", "horizontal"] },
    sort: { type: "string", enum: ["none", "asc", "desc"] },
    limit: { type: "number" },
    showValues: { type: "boolean" },
    showLegend: { type: "boolean" },
    donut: { type: "boolean" },
    gauge: { type: "boolean" },
    gaugeMax: { type: "number" },
    sizeKey: { type: "string" },
    referenceLine: { type: "number" },
    referenceLabel: { type: "string" },
    showAverage: { type: "boolean" },
    trendLine: { type: "boolean" },
    rightValueFormat: {
      type: "string",
      enum: ["number", "currency", "percent"],
    },
    rightCurrency: { type: "string" },
    source: SOURCE_SCHEMA,
    asOf: { type: "string" },
  },
  required: ["type", "dataset", "source"],
  additionalProperties: false,
};

const SLIDE_SCHEMA = {
  type: "object",
  properties: {
    layout: {
      type: "string",
      enum: [
        "content",
        "section",
        "table",
        "chart",
        "kpi",
        "two-column",
        "quote",
        "image",
        "blank",
      ],
    },
    title: { type: "string", description: "Insight-style slide headline." },
    subtitle: { type: "string" },
    content: {
      type: "array",
      items: { type: "string" },
      description: "3-6 concise bullet points for the content layout.",
    },
    notes: { type: "string", description: "Speaker notes." },
    table: {
      type: "object",
      properties: {
        headers: { type: "array", items: { type: "string" } },
        rows: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "array",
                items: {
                  anyOf: [{ type: "string" }, { type: "number" }],
                },
              },
              { type: "object", additionalProperties: true },
            ],
          },
        },
        source: SOURCE_SCHEMA,
        asOf: { type: "string" },
      },
      required: ["rows"],
      additionalProperties: false,
    },
    chart: CHART_SCHEMA,
    stats: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
        },
        required: ["value", "label"],
        additionalProperties: false,
      },
    },
    columns: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "array", items: { type: "string" } },
        },
        required: ["title", "content"],
        additionalProperties: false,
      },
    },
    quote: {
      type: "object",
      properties: {
        text: { type: "string" },
        attribution: { type: "string" },
      },
      required: ["text"],
      additionalProperties: false,
    },
    image: {
      type: "object",
      properties: {
        url: { type: "string" },
        data: { type: "string" },
        alt: { type: "string" },
        caption: { type: "string" },
      },
      anyOf: [{ required: ["url"] }, { required: ["data"] }],
      additionalProperties: false,
    },
  },
  required: ["layout", "title"],
  additionalProperties: false,
};

/**
 * Spawns a focused child AIbitat agent to build slides for a single
 * presentation section. The child reuses the parent's provider/model/socket
 * and only receives skills that are enabled on the parent.
 *
 * @param {Object} options
 * @param {AIbitat} options.parentAibitat
 * @param {Object} options.section
 * @param {string} options.presentationTitle
 * @param {string} [options.conversationContext]
 * @param {string} [options.sectionPrefix]
 * @param {string} [options.language]
 * @param {string} [options.audience]
 * @param {string} [options.styleBrief]
 * @returns {Promise<{slides: Object[], citations: Object[], warnings: string[]}>}
 */
async function runSectionAgent({
  parentAibitat,
  section,
  presentationTitle,
  conversationContext = "",
  sectionPrefix = "",
  language = "en",
  audience = "",
  styleBrief = "",
}) {
  const log = parentAibitat.handlerProps?.log || console.log;
  const warnings = [];

  const childAibitat = new AIbitat({
    ...parentAibitat.defaultProvider,
    chats: [],
    handlerProps: parentAibitat.handlerProps,
    maxToolCalls: 12,
  });

  // Share introspect so tool activity (web-search status, etc.) streams to the frontend
  childAibitat.introspect = parentAibitat.introspect;
  childAibitat._submittedSlides = [];

  // Filtered socket: pass through introspection but suppress reportStreamEvent
  // so sub-agent chatter doesn't render in the UI as a chat message.
  childAibitat.socket = {
    send: (type, content) => {
      if (type === "reportStreamEvent") return;
      parentAibitat.socket?.send(type, content);
    },
  };

  // Only load the research tools the parent actually has enabled. This keeps
  // the section agent consistent with disabled_agent_skills settings.
  const parentFunctions = parentAibitat.functions;
  const hasSkill = (name) =>
    parentFunctions && typeof parentFunctions.has === "function"
      ? parentFunctions.has(name)
      : false;

  const { webBrowsing } = require("../../web-browsing.js");
  const { webScraping } = require("../../web-scraping.js");
  const { memory } = require("../../memory.js");

  if (hasSkill("web-browsing")) childAibitat.use(webBrowsing.plugin());
  if (hasSkill("web-scraping")) childAibitat.use(webScraping.plugin());
  if (hasSkill("rag-memory")) childAibitat.use(memory.plugin());

  childAibitat.function({
    super: childAibitat,
    name: "submit-slide",
    description:
      "Submit exactly one finished slide. Call this tool once per slide; do not send an array.",
    parameters: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        slide: SLIDE_SCHEMA,
      },
      required: ["slide"],
      additionalProperties: false,
    },
    handler: function ({ slide }) {
      const errors = validateSlide(slide);
      if (errors.length > 0) {
        this.super.introspect(
          `${this.caller}: rejected slide - ${errors.join("; ")}`
        );
        return `Slide not accepted: ${errors.join(
          "; "
        )}. Fix the JSON and call submit-slide again with ONE slide object. Remember: content must be an array of 3-6 strings, and a chart needs dataset + source {title,url?,asOf?}.`;
      }

      const result = normalizeSlide(slide, this.super._submittedSlides.length);
      if (!result.ok || !result.slide) {
        return `Slide not accepted: ${result.warnings.join(
          "; "
        )}. Add a title and real content, then call submit-slide again.`;
      }

      this.super._submittedSlides.push(result.slide);
      const count = this.super._submittedSlides.length;
      return `Slide ${count} accepted (${result.slide.layout}). Call submit-slide again for the next slide, or finish with a short summary when the section is complete.`;
    },
  });

  const functions = Array.from(childAibitat.functions.values());
  const messages = [
    { role: "system", content: SECTION_BUILDER_PROMPT },
    {
      role: "user",
      content: buildSectionPrompt({
        section,
        presentationTitle,
        conversationContext,
        language,
        audience,
        styleBrief,
        hasWebSearch: hasSkill("web-browsing"),
        hasWebScrape: hasSkill("web-scraping"),
        hasMemory: hasSkill("rag-memory"),
      }),
    },
  ];

  // The execution helpers read from `this.providerInstance`, so bind the
  // resolved provider before calling them (mirrors AIbitat#chat).
  const provider = childAibitat.getProviderForConfig(
    childAibitat.defaultProvider
  );
  provider.attachHandlerProps(childAibitat.handlerProps);
  childAibitat.providerInstance = provider;

  log(
    `[SectionAgent] Running sub-agent for section: "${section.title}" with ${functions.length} tools`
  );

  let agentName = `@section-builder`;
  if (sectionPrefix) agentName = `[${sectionPrefix}] ${agentName}`;

  let responseText = "";
  try {
    responseText = provider.supportsAgentStreaming
      ? await childAibitat.handleAsyncExecution(messages, functions, agentName)
      : await childAibitat.handleExecution(messages, functions, agentName);
  } catch (error) {
    log(`[SectionAgent] Error in section "${section.title}": ${error.message}`);
    warnings.push(`Section "${section.title}" failed: ${error.message}`);
  }

  // Collect any citations the child accumulated (web-search, web-scrape, memory).
  const citations = childAibitat._pendingCitations || [];

  let slides = childAibitat._submittedSlides;
  if (!Array.isArray(slides) || slides.length === 0) {
    const recovered = extractSlidesFromText(responseText);
    warnings.push(...recovered.warnings);
    if (recovered.slides.length > 0) {
      slides = recovered.slides;
      log(
        `[SectionAgent] Recovered ${slides.length} slide(s) for "${section.title}" from raw output`
      );
    }
  }

  if (!Array.isArray(slides) || slides.length === 0) {
    log(
      `[SectionAgent] No slides submitted for "${section.title}", using fallback`
    );
    const fallback = buildFallbackSlides(section);
    return {
      slides: fallback,
      citations,
      warnings: [
        ...warnings,
        `Section "${section.title}" produced no valid slides; used a safe fallback`,
      ],
    };
  }

  log(
    `[SectionAgent] Section "${section.title}" produced ${slides.length} slides, ${citations.length} citations`
  );
  return { slides, citations, warnings };
}

/**
 * @param {Object} options
 * @returns {string}
 */
function buildSectionPrompt({
  section,
  presentationTitle,
  conversationContext,
  language,
  audience,
  styleBrief,
  hasWebSearch,
  hasWebScrape,
  hasMemory,
}) {
  const strings = getStrings(language);
  const tools = [
    hasWebSearch ? "web search for current facts" : "",
    hasWebScrape ? "web scraping for a specific URL" : "",
    hasMemory ? "workspace document search (rag-memory)" : "",
  ].filter(Boolean);

  const parts = [
    `Build slides for the section "${section.title}" of the presentation "${presentationTitle}".`,
    `Write the slide text in ${language === "ru" ? "Russian" : "English"}.`,
  ];

  if (audience) parts.push(`Audience: ${audience}.`);
  if (styleBrief) parts.push(`Style brief: ${styleBrief}.`);

  if (section.keyPoints?.length > 0) {
    parts.push(
      `\nKey points to cover:\n${section.keyPoints
        .map((point) => `- ${point}`)
        .join("\n")}`
    );
  }

  if (section.instructions) {
    parts.push(`\nSpecial instructions: ${section.instructions}`);
  }

  if (section.dataNeeds?.length > 0) {
    parts.push(
      `\nData to verify or find:\n${section.dataNeeds
        .map((need) => `- ${need}`)
        .join("\n")}`
    );
  }

  if (conversationContext) {
    parts.push(
      `\nContext from the conversation (use it as the primary source when it already contains the facts):\n${conversationContext.slice(
        0,
        4000
      )}`
    );
  }

  parts.push(
    tools.length > 0
      ? `\nAvailable research tools: ${tools.join(", ")}. Use them only when the facts are missing or need to be current.`
      : "\nNo research tools are enabled in this run. Use only the provided context; do not invent current numbers."
  );

  parts.push(
    `\nData rules:
- Every number must come from the conversation, a tool result, or an explicitly provided source.
- Charts need source {title, url?, asOf} and a real dataset. If you cannot provide that, use bullets or a table instead.
- Prefer 3-6 bullets per content slide. Do not paste paragraphs into bullets.
- Use at most ${MAX_BULLETS} bullets per slide; split longer lists into two slides.`
  );

  parts.push(
    `\nBuild 2-5 slides. Submit ONE slide per submit-slide call, in order. Do not batch slides and do not respond with raw JSON.`
  );

  if (strings?.continued) {
    // Keep the prompt and renderer aligned on continuation wording.
    parts.push(
      `If a list is too long, continue on another slide title ending with "(${strings.continued})".`
    );
  }

  return parts.join("\n");
}

/**
 * Generates safe slides from the section definition when the sub-agent fails.
 * @param {Object} section
 * @returns {Object[]}
 */
function buildFallbackSlides(section) {
  if (!section.keyPoints || section.keyPoints.length === 0) {
    return [
      {
        layout: "section",
        title: section.title,
        subtitle: section.subtitle || "",
      },
    ];
  }

  return [
    {
      layout: "content",
      title: section.title,
      subtitle: section.subtitle || "",
      content: section.keyPoints.slice(0, MAX_BULLETS),
      notes: `Key points for ${section.title}`,
    },
  ];
}

module.exports = { runSectionAgent, SLIDE_SCHEMA, CHART_SCHEMA };
