/**
 * Shared metadata helpers for generated-file download/preview cards.
 * Kept in one place so the FileDownloadCard and its DocumentPreview modal agree
 * on the badge, extension and i18n type label for every file kind.
 */

/**
 * @typedef {Object} FileMeta
 * @property {string} ext - lowercased extension (falls back to "txt")
 * @property {string} badge - short badge text (PDF, DOC, XLS, ...)
 * @property {string} badgeBg - tailwind background class for the badge
 * @property {string} badgeText - tailwind text color class for the badge
 * @property {string} typeKey - key under `chatPreview.types` for the label
 */

/**
 * Resolve display metadata for a filename based on its extension.
 * @param {string} filename
 * @returns {FileMeta}
 */
export function getFileMeta(filename) {
  const ext = filename?.split(".")?.pop()?.toLowerCase() ?? "txt";
  switch (ext) {
    case "pptx":
    case "ppt":
      return {
        ext,
        badge: "PPT",
        badgeBg: "bg-orange-100",
        badgeText: "text-orange-700",
        typeKey: "powerpoint",
      };
    case "pdf":
      return {
        ext,
        badge: "PDF",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
        typeKey: "pdf",
      };
    case "doc":
    case "docx":
      return {
        ext,
        badge: "DOC",
        badgeBg: "bg-blue-100",
        badgeText: "text-blue-700",
        typeKey: "word",
      };
    case "xls":
    case "xlsx":
      return {
        ext,
        badge: "XLS",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        typeKey: "spreadsheet",
      };
    case "csv":
      return {
        ext,
        badge: "CSV",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        typeKey: "csv",
      };
    case "txt":
    case "md":
      return {
        ext,
        badge: ext.toUpperCase(),
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-700",
        typeKey: "text",
      };
    default:
      return {
        ext,
        badge: ext.toUpperCase().slice(0, 4),
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-700",
        typeKey: "generic",
      };
  }
}

/**
 * Decide which renderer a file should use. Prefers the extension but falls back
 * to sniffing the persisted `sourceContent` shape, so structured payloads
 * (pptx slide JSON, xlsx sheet JSON) still preview when the filename extension
 * is missing or unexpected.
 * @param {string} filename
 * @param {string|undefined} sourceContent
 * @returns {"pdf"|"slides"|"sheets"|"csv"|"markdown"|"text"}
 */
export function detectPreviewKind(filename, sourceContent) {
  const { ext } = getFileMeta(filename);
  if (ext === "pdf") return "pdf";
  if (ext === "pptx" || ext === "ppt") return "slides";
  if (ext === "xlsx" || ext === "xls") return "sheets";
  if (ext === "csv") return "csv";
  if (ext === "md" || ext === "docx" || ext === "doc") return "markdown";

  // Unknown/missing extension: sniff the structured JSON shapes.
  const trimmed = (sourceContent || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return "slides";
      if (Array.isArray(parsed?.slides)) return "slides";
      if (Array.isArray(parsed?.sheets)) return "sheets";
    } catch {
      /* not JSON - fall through to text */
    }
  }

  return "text";
}

/**
 * File extensions the server can render faithfully to PDF via LibreOffice. These
 * get a pixel-accurate preview (fonts/layout/colors) regardless of whether a
 * `sourceContent` payload exists, with the text renderers as fallback.
 * @param {string} ext
 * @returns {boolean}
 */
export function isFaithfulExt(ext) {
  return [
    "docx",
    "doc",
    "odt",
    "rtf",
    "xlsx",
    "xls",
    "ods",
    "csv",
    "pptx",
    "ppt",
    "odp",
  ].includes(String(ext || "").toLowerCase());
}

/**
 * Decide whether a preview can be shown for this file.
 * - PDF renders natively from the stored blob, so it is always previewable.
 * - Office documents render via server-side LibreOffice, so they are previewable
 *   even without persisted `sourceContent`.
 * - Everything else (md/txt) is drawn from `sourceContent`, so it needs one.
 * @param {string} filename
 * @param {string|undefined} sourceContent
 * @returns {boolean}
 */
export function isPreviewable(filename, sourceContent) {
  const kind = detectPreviewKind(filename, sourceContent);
  if (kind === "pdf") return true;
  if (isFaithfulExt(getFileMeta(filename).ext)) return true;
  return !!sourceContent;
}
