import {
  PREVIEW_CHANNEL,
  buildContentSecurityPolicy,
  buildImportMap,
} from "./runtimeConfig";
import { escapeHtmlAttribute } from "./errors";

export const ERROR_OVERLAY_ID = "__anythingllm_preview_error__";

/**
 * Base styles are applied to fragment previews only. Complete HTML documents
 * keep their own styling untouched.
 */
const BASE_STYLES = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #ffffff;
    color: #0f172a;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 16px;
    -webkit-font-smoothing: antialiased;
  }
`;

/**
 * Sandboxed iframes have an opaque origin, so any localStorage/sessionStorage
 * access throws. Generated code commonly reads those APIs, so replace them
 * with in-memory equivalents before user code runs.
 */
const STORAGE_SHIM = `
(function () {
  function createStorage() {
    var store = Object.create(null);
    return {
      getItem: function (key) { return key in store ? store[key] : null; },
      setItem: function (key, value) { store[key] = String(value); },
      removeItem: function (key) { delete store[key]; },
      clear: function () { store = Object.create(null); },
      key: function (index) { var keys = Object.keys(store); return index < keys.length ? keys[index] : null; },
      get length() { return Object.keys(store).length; },
    };
  }

  ["localStorage", "sessionStorage"].forEach(function (name) {
    var accessible = true;
    try { window[name].getItem("__preview_probe__"); } catch (error) { accessible = false; }
    if (accessible) return;
    try {
      Object.defineProperty(window, name, {
        value: createStorage(),
        configurable: true,
        writable: false,
      });
    } catch (error) {}
  });
})();
`;

/**
 * Reports the rendered height to the parent window and surfaces runtime
 * failures as a full-bleed overlay. Loaded in <head> so it observes errors
 * thrown by anything the user's code does afterwards.
 * @param {string} id - preview id echoed back in every message
 * @returns {string}
 */
function buildRuntimeScript(id) {
  return `
(function () {
  var CHANNEL = ${JSON.stringify(PREVIEW_CHANNEL)};
  var ID = ${JSON.stringify(id)};
  var OVERLAY_ID = ${JSON.stringify(ERROR_OVERLAY_ID)};
  var MIN_HEIGHT = 120;
  var MAX_HEIGHT = 600;
  var lastHeight = -1;
  var scheduled = false;

  function measure() {
    var body = document.body;
    // document.documentElement.scrollHeight is never smaller than the iframe
    // viewport, so using it would make the frame grow-only: an early report
    // (before styles settle) would be latched forever. Body metrics track the
    // real content height in both directions.
    var height = body
      ? Math.max(body.scrollHeight, body.offsetHeight)
      : document.documentElement.scrollHeight;
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
  }

  function report() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      var height = measure();
      if (height === lastHeight) return;
      lastHeight = height;
      try {
        parent.postMessage({ channel: CHANNEL, id: ID, height: height }, "*");
      } catch (error) {}
    });
  }

  function showError(input) {
    try {
      var overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.setAttribute("role", "alert");
        overlay.style.cssText =
          "position: fixed; inset: 0; z-index: 2147483647; overflow: auto;" +
          "margin: 0; padding: 16px; background: rgba(15, 23, 42, 0.97);" +
          "color: #fecaca; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;" +
          "white-space: pre-wrap; word-break: break-word;";
        (document.body || document.documentElement).appendChild(overlay);
      }
      overlay.textContent = String(input);
      report();
    } catch (error) {}
  }

  window.__previewError = showError;

  window.addEventListener("error", function (event) {
    var message = event && event.message ? event.message : "Script error";
    if (event && event.filename) {
      message += " (" + event.filename + ":" + event.lineno + ":" + event.colno + ")";
    }
    showError(message);
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event ? event.reason : null;
    if (!reason) return showError("Unhandled promise rejection");
    showError(reason.stack || reason.message || String(reason));
  });

  if (window.ResizeObserver) {
    var observer = new ResizeObserver(report);
    window.addEventListener("DOMContentLoaded", function () {
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
      report();
    });
  }
  window.addEventListener("load", report);
  setTimeout(report, 50);
})();
`;
}

/**
 * Everything that has to be injected into the preview document head: CSP,
 * local module runtime, storage shim, and the height/error reporter.
 * @param {string} id - preview id
 * @param {{includeBaseStyles?: boolean}} [options]
 * @returns {string}
 */
export function buildPreviewHead(id, { includeBaseStyles = true } = {}) {
  return [
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(buildContentSecurityPolicy())}">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    includeBaseStyles ? `<style>${BASE_STYLES}</style>` : "",
    `<script type="importmap">${JSON.stringify(buildImportMap())}</script>`,
    `<script type="module" src="/preview-runtime/twind.js"></script>`,
    `<script>${STORAGE_SHIM}</script>`,
    `<script>${buildRuntimeScript(id)}</script>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Wraps head/body fragments into a complete HTML document.
 * @param {{head?: string, body?: string, title?: string}} [parts]
 * @returns {string}
 */
export function buildDocument({
  head = "",
  body = "",
  title = "Code preview",
} = {}) {
  // The CSP meta from `buildPreviewHead` is the first head element on purpose.
  // srcdoc documents inherit the parent encoding, so no charset meta is needed.
  return `<!doctype html>
<html lang="en">
<head>
${head}
<title>${escapeHtmlAttribute(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}

const FULL_DOCUMENT_PATTERN = /<!doctype\s|<html[\s>]|<head[\s>]|<body[\s>]/i;

/**
 * A snippet is treated as a complete document as soon as it declares one of
 * the document-level tags; everything else is rendered as a fragment.
 * @param {string} html
 * @returns {boolean}
 */
export function isFullDocument(html = "") {
  return FULL_DOCUMENT_PATTERN.test(html);
}

/**
 * @param {string} html
 * @returns {string}
 */
export function ensureDoctype(html = "") {
  return /^\s*<!doctype/i.test(html) ? html : `<!doctype html>\n${html}`;
}

/**
 * Injects our head elements at the top of the user's <head> (creating one if
 * missing) and optional body elements before the closing </body>.
 * @param {string} html - complete user document
 * @param {{headHtml?: string, bodyHtml?: string}} [parts]
 * @returns {string}
 */
export function injectIntoDocument(
  html,
  { headHtml = "", bodyHtml = "" } = {}
) {
  let output = html;

  if (/<head[\s>]/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${headHtml}`);
  } else if (/<html[\s>]/i.test(output)) {
    output = output.replace(
      /<html[^>]*>/i,
      (match) => `${match}\n<head>\n${headHtml}\n</head>`
    );
  } else {
    output = `<head>\n${headHtml}\n</head>\n${output}`;
  }

  if (bodyHtml) {
    if (/<\/body>/i.test(output)) {
      output = output.replace(
        /<\/body>(?![\s\S]*<\/body>)/i,
        `${bodyHtml}\n</body>`
      );
    } else {
      output = `${output}\n${bodyHtml}`;
    }
  }

  return ensureDoctype(output);
}
