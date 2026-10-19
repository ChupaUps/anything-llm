/**
 * Formats an unknown error into a readable message for the preview pane.
 * @param {unknown} error
 * @returns {string}
 */
export function formatError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.stack || error.message || String(error);
}

/**
 * Escapes a value for safe use inside a double-quoted HTML attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
