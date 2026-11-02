const { v4: uuidv4 } = require("uuid");
const { reqBody, multiUserMode } = require("../../utils/http");
const { Telemetry } = require("../../models/telemetry");
const { streamChatWithForEmbed } = require("../../utils/chats/embed");
const { EmbedChats } = require("../../models/embedChats");
const {
  validEmbedConfig,
  canRespond,
  setConnectionMeta,
} = require("../../utils/middleware/embedMiddleware");
const {
  convertToChatHistory,
  writeResponseChunk,
} = require("../../utils/helpers/chat/responses");
const { SystemSettings } = require("../../models/systemSettings");
const { hasAssistantIcon } = require("../../utils/files/assistantIcon");

// The widget ships only these two locales. Anything else falls back to the
// instance default, which for this deployment is Russian.
const VALID_WIDGET_LANGUAGES = ["ru", "en"];
const DEFAULT_WIDGET_LANGUAGE = "ru";

// The app name is an admin-controlled string that is interpolated into the
// inline page as both element text and an HTML attribute value, so quotes and
// angle brackets must not be able to break out of it.
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function embeddedEndpoints(app) {
  if (!app) return;

  app.post(
    "/embed/:embedId/stream-chat",
    [validEmbedConfig, setConnectionMeta, canRespond],
    async (request, response) => {
      try {
        const embed = response.locals.embedConfig;
        const {
          sessionId,
          message,
          // optional keys for override of defaults if enabled.
          prompt = null,
          model = null,
          temperature = null,
          username = null,
        } = reqBody(request);

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders();

        await streamChatWithForEmbed(response, embed, message, sessionId, {
          promptOverride: prompt,
          modelOverride: model,
          temperatureOverride: temperature,
          username,
        });
        await Telemetry.sendTelemetry("embed_sent_chat", {
          multiUserMode: multiUserMode(response),
          LLMSelection: process.env.LLM_PROVIDER || "openai",
          Embedder: process.env.EMBEDDING_ENGINE || "inherit",
          VectorDbSelection: process.env.VECTOR_DB || "lancedb",
        });
        response.end();
      } catch (e) {
        console.error(e);
        writeResponseChunk(response, {
          id: uuidv4(),
          type: "abort",
          sources: [],
          textResponse: null,
          close: true,
          error: e.message,
        });
        response.end();
      }
    }
  );

  // GET /embed/:embedId/inline
  // Serves a standalone iframe-friendly HTML page that loads the embed widget
  // in auto-open inline mode (no floating bubble button; panel fills the frame).
  // Must be registered BEFORE /embed/:embedId/:sessionId so Express does not
  // match the literal "inline" segment as a sessionId parameter.
  app.get(
    "/embed/:embedId/inline",
    [validEmbedConfig],
    async (request, response) => {
      try {
        const embed = response.locals.embedConfig;

        const proto =
          request.headers["x-forwarded-proto"] || request.protocol || "http";
        const host = request.headers.host || "localhost:3001";
        const baseUrl = `${proto}://${host}`;

        // Language can be pinned from the embed code (?lang=ru|en) and the
        // widget itself reads it from the script `data-language` attribute.
        const queryLang = String(request.query?.lang || "").toLowerCase();
        const language = VALID_WIDGET_LANGUAGES.includes(queryLang)
          ? queryLang
          : DEFAULT_WIDGET_LANGUAGE;

        // The header/app name is the instance branding, so the panel title and
        // the assistant name follow whatever the admin set under Branding.
        const customAppName = await SystemSettings.get({
          label: "custom_app_name",
        });
        const appName = escapeHtml(customAppName?.value || "Chat");
        // /system/logo is public and always serves the current instance logo
        // (the uploaded custom one when set, the packaged default otherwise),
        // so a rebuild is never needed when the branding changes. `theme=light`
        // asks for the dark variant because the widget chrome is white.
        const logoUrl = `${baseUrl}/api/system/logo?theme=light`;
        // The avatar next to model replies stays the widget's built-in icon
        // until an admin uploads their own under Settings -> Branding.
        const assistantIcon = (await hasAssistantIcon())
          ? `\n    data-assistant-icon="${baseUrl}/api/system/assistant-icon"`
          : "";
        // The empty-state line is not part of the widget's i18n dictionaries, so
        // it is passed in explicitly for Russian embeds and left to the bundle
        // default for every other language.
        const greeting =
          language === "ru"
            ? `\n    data-greeting="Отправьте сообщение, чтобы начать чат"`
            : "";

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Access-Control-Allow-Origin", "*");
        // Override the X-Frame-Options:DENY that express.static sets.
        response.setHeader("X-Frame-Options", "ALLOWALL");
        response.setHeader(
          "Content-Security-Policy",
          "frame-ancestors *; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
        );

        response.status(200).type("html").send(`<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${appName}</title>
  <link rel="stylesheet" href="${baseUrl}/embed/anythingllm-chat-widget.min.css">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:#ffffff}
    /* Hide the floating bubble button in inline mode */
    #anything-llm-embed-chat-button,
    #anything-llm-embed-chat-button-container{display:none!important}
    /* Chat panel fills the entire iframe viewport */
    #anything-llm-embed-chat-container{
      position:static!important;display:block!important;
      width:100%!important;height:100vh!important;
      max-width:100%!important;max-height:100vh!important;
      border-radius:0!important;box-shadow:none!important;
      opacity:1!important;
      transform:none!important;pointer-events:all!important;
    }
    /* The widget renders the panel itself as a 400x700 floating card, so in
       inline mode it has to be turned back into a plain block that fills the
       frame: no rounded corners, border, shadow or offset margins. */
    #anything-llm-chat{
      position:static!important;display:flex!important;
      width:100%!important;height:100vh!important;
      max-width:100%!important;max-height:100vh!important;
      margin:0!important;border:0!important;
      border-radius:0!important;box-shadow:none!important;
    }
    #anything-llm-header{border-radius:0!important}
    /* "Close" is meaningless here - it would only leave the frame blank - and
       the aria-label is a literal baked into the pre-built bundle. */
    #anything-llm-header button[aria-label="Закрыть чат"],
    #anything-llm-header .allm-absolute button:last-child{display:none!important}
  </style>
</head>
<body>
  <script
    data-embed-id="${embed.uuid}"
    data-base-api-url="${baseUrl}/api/embed"
    data-language="${language}"
    data-brand-image-url="${logoUrl}"
    data-assistant-name="${appName}"${assistantIcon}
    data-open-on-load="on"
    data-show-thoughts="true"${greeting}
    src="${baseUrl}/embed/anythingllm-chat-widget.min.js">
  </script>
</body>
</html>`);
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/embed/:embedId/:sessionId",
    [validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;
        const history = await EmbedChats.forEmbedByUser(
          embed.id,
          sessionId,
          null,
          null,
          true
        );

        response.status(200).json({ history: convertToChatHistory(history) });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/embed/:embedId/:sessionId",
    [validEmbedConfig],
    async (request, response) => {
      try {
        const { sessionId } = request.params;
        const embed = response.locals.embedConfig;

        await EmbedChats.markHistoryInvalid(embed.id, sessionId);
        response.status(200).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { embeddedEndpoints };
