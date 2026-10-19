import { encode as HTMLEncode } from "he";
import markdownIt from "markdown-it";
import markdownItKatexPlugin from "./plugins/markdown-katex";
import Appearance from "@/models/appearance";
import hljs from "highlight.js";
import "./themes/github-dark.css";
import "./themes/github.css";
import { v4 } from "uuid";
import i18n from "@/i18n";
import { escapeHtmlAttribute } from "./codePreview/errors";

// Register custom lanaguages
import hljsDefineSvelte from "./hljs-libraries/svelte";
hljs.registerLanguage("svelte", hljsDefineSvelte);

const markdown = markdownIt({
  html: Appearance.get("renderHTML") ?? false,
  typographer: true,
  highlight: function (code, lang) {
    const uuid = v4();
    const theme =
      window.localStorage.getItem("theme") === "light"
        ? "github"
        : "github-dark";

    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          `<div class="whitespace-pre-line w-full max-w-[65vw] hljs ${theme} light:border-solid light:border light:border-gray-700 rounded-lg relative font-mono font-normal text-sm text-slate-200">
            <div class="w-full flex items-center sticky top-0 text-slate-200 light:bg-sky-800 bg-stone-800 px-4 py-2 text-xs font-sans justify-between rounded-t-md -mt-5">
              <div class="flex gap-2">
                <code class="text-xs">${lang || ""}</code>
              </div>
              <button data-code-snippet data-code="code-${uuid}" class="flex items-center gap-x-1">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                <p class="text-xs" style="margin: 0px;padding: 0px;">Copy block</p>
              </button>
            </div>
            <pre class="whitespace-pre-wrap px-4 pb-4">` +
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
          "</pre></div>"
        );
      } catch {}
    }

    return (
      `<div class="whitespace-pre-line w-full max-w-[65vw] hljs ${theme} light:border-solid light:border light:border-gray-700 rounded-lg relative font-mono font-normal text-sm text-slate-200">
        <div class="w-full flex items-center sticky top-0 text-slate-200 bg-stone-800 px-4 py-2 text-xs font-sans justify-between rounded-t-md -mt-5">
          <div class="flex gap-2"><code class="text-xs"></code></div>
          <button data-code-snippet data-code="code-${uuid}" class="flex items-center gap-x-1">
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            <p class="text-xs" style="margin: 0px;padding: 0px;">Copy block</p>
          </button>
        </div>
        <pre class="whitespace-pre-wrap px-4 pb-4">` +
      HTMLEncode(code) +
      "</pre></div>"
    );
  },
});

// Add custom renderer for strong tags to handle theme colors
markdown.renderer.rules.strong_open = () => '<strong class="text-white">';
markdown.renderer.rules.strong_close = () => "</strong>";
markdown.renderer.rules.link_open = (tokens, idx) => {
  const token = tokens[idx];
  const href = token.attrs.find((attr) => attr[0] === "href");
  return `<a href="${HTMLEncode(href[1])}" target="_blank" rel="noopener noreferrer">`;
};

// Custom renderer for responsive images rendered in markdown
markdown.renderer.rules.image = function (tokens, idx) {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  const src = token.attrs[srcIndex][1];
  const alt = token.content || "";

  return `<div class="w-full max-w-[800px]"><img src="${HTMLEncode(src)}" alt="${HTMLEncode(alt)}" class="w-full h-auto" /></div>`;
};

markdown.use(markdownItKatexPlugin);

// ---------------------------------------------------------------------------
// Runnable code blocks (HTML / JSX / TSX)
// ---------------------------------------------------------------------------

const PREVIEWABLE_LANGUAGES = {
  html: "html",
  htm: "html",
  jsx: "react",
  tsx: "react",
  react: "react",
};

// highlight.js has no JSX/TSX grammar - fall back to the closest one.
const HLJS_LANGUAGE_ALIASES = {
  htm: "xml",
  html: "xml",
  jsx: "javascript",
  react: "javascript",
  tsx: "typescript",
};

const COPY_ICON = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;

const PLAY_ICON = `<svg stroke="currentColor" fill="currentColor" stroke-width="1" viewBox="0 0 24 24" class="h-3 w-3" height="1em" width="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8 5.14v13.72L19 12 8 5.14Z"></path></svg>`;

/**
 * Localized label for the preview UI, escaped for attribute/text use.
 * @param {"run" | "preview" | "hide"} key
 * @param {string} fallback
 * @returns {string}
 */
function tPreview(key, fallback) {
  return escapeHtmlAttribute(i18n.t(`chat.code-preview.${key}`, fallback));
}

/**
 * @param {string} code
 * @param {string} lang
 * @returns {string} highlighted markup
 */
function highlightPreviewCode(code, lang) {
  const alias = HLJS_LANGUAGE_ALIASES[lang] ?? lang;
  if (hljs.getLanguage(alias)) {
    try {
      return hljs.highlight(code, { language: alias, ignoreIllegals: true })
        .value;
    } catch {}
  }
  return HTMLEncode(code);
}

/**
 * Renders a code block with a RUN button and an (initially hidden) preview
 * pane. The iframe is created later by the preview controller, after a click.
 * @param {{code: string, lang: string, mode: "html"|"react"}} block
 * @returns {string}
 */
function renderPreviewableCodeBlock({ code, lang, mode }) {
  const theme =
    window.localStorage.getItem("theme") === "light" ? "github" : "github-dark";
  const label = lang === "htm" ? "html" : lang;
  const highlighted = highlightPreviewCode(code, lang);

  const header =
    `<div class="w-full flex items-center sticky top-0 text-slate-200 light:bg-sky-800 bg-stone-800 px-4 py-2 text-xs font-sans justify-between rounded-t-md">` +
    `<div class="flex gap-2"><code class="text-xs">${escapeHtmlAttribute(label)}</code></div>` +
    `<div class="flex items-center gap-x-3">` +
    `<button type="button" data-code-run class="flex items-center gap-x-1 hover:text-white light:hover:text-slate-900">${PLAY_ICON}<p class="text-xs" style="margin: 0px;padding: 0px;">${tPreview("run", "RUN")}</p></button>` +
    `<button type="button" data-code-snippet data-code="code-${v4()}" class="flex items-center gap-x-1">${COPY_ICON}<p class="text-xs" style="margin: 0px;padding: 0px;">Copy block</p></button>` +
    `</div>` +
    `</div>`;

  const pane =
    `<div data-code-preview-pane class="border-t border-stone-700 light:border-slate-300" hidden style="display: none;">` +
    `<div class="flex items-center justify-between px-4 py-2 text-xs font-sans text-slate-300 light:text-slate-600">` +
    `<span>${tPreview("preview", "Preview")}</span>` +
    `<button type="button" data-code-preview-hide class="flex items-center gap-x-1 hover:text-white light:hover:text-slate-900">${tPreview("hide", "Hide")}</button>` +
    `</div>` +
    `<div data-code-preview-status class="px-4 pb-3 text-xs font-sans text-slate-400" hidden style="display: none;"></div>` +
    `<pre data-code-preview-error class="px-4 pb-4 text-xs text-red-400 whitespace-pre-wrap" hidden style="display: none; margin: 0px;"></pre>` +
    `<div data-code-preview-frame class="w-full overflow-hidden bg-white"></div>` +
    `</div>`;

  return (
    `<div class="whitespace-pre-line w-full max-w-[65vw] hljs ${theme} light:border-solid light:border light:border-gray-700 rounded-lg relative font-mono font-normal text-sm my-5" data-code-block data-code-lang="${escapeHtmlAttribute(label)}" data-code-mode="${mode}" data-preview-id="${v4()}">` +
    header +
    `<pre data-code-source class="whitespace-pre-wrap px-4 pb-4" style="margin: 0px;">${highlighted}</pre>` +
    pane +
    `</div>`
  );
}

const defaultFenceRenderer = markdown.renderer.rules.fence;

markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const lang = token.info
    ? token.info.trim().split(/\s+/g)[0].toLowerCase()
    : "";
  const mode = PREVIEWABLE_LANGUAGES[lang];

  if (
    !mode ||
    env?.allowCodePreview !== true ||
    Appearance.get("codePreview") === false
  )
    return defaultFenceRenderer(tokens, index, options, env, self);

  return renderPreviewableCodeBlock({ code: token.content, lang, mode });
};

export default function renderMarkdown(text = "", env = {}) {
  return markdown.render(text, env);
}

/**
 * Chain-of-thought is written loosely: models pad list markers with extra
 * spaces ("*   item") and indent even top-level lists by 4 spaces. Markdown
 * reads a 4-space indent as an indented code block, or lazily folds those
 * lines into the previous paragraph — either way the thought renders as a
 * jumble of literal asterisks. Halve deep indents (4 -> 2 per level) and
 * tighten marker padding so the content parses as the lists it was meant to
 * be. Lines inside fenced ``` blocks pass through untouched.
 * @param {string} text
 * @returns {string}
 */
function normalizeThoughtIndentation(text = "") {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const width = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
      const normWidth = width >= 4 ? Math.floor(width / 2) : width;
      const dedented = " ".repeat(normWidth) + line.trimStart();
      return dedented.replace(/^(\s*(?:[*+-]|\d+[.)]))\s{2,}/, "$1 ");
    })
    .join("\n");
}

/**
 * Render for model thoughts. Indented-code parsing is turned off so any
 * residual indentation can never render as literal monospace text; fenced
 * ``` blocks still work. The toggle is safe on the shared instance because
 * rendering is synchronous.
 * @param {string} text
 * @param {object} env - markdown-it environment (e.g. `allowCodePreview`)
 * @returns {string}
 */
export function renderThoughtMarkdown(text = "", env = {}) {
  markdown.disable("code");
  try {
    return markdown.render(normalizeThoughtIndentation(text), env);
  } finally {
    markdown.enable("code");
  }
}
