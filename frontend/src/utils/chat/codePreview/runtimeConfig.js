export const PREVIEW_CHANNEL = "anythingllm-code-preview";

/**
 * DOM contract shared by the markdown renderer (which emits the markup) and
 * the controller (which reacts to it).
 */
export const PREVIEW_SELECTORS = {
  block: "[data-code-block]",
  run: "[data-code-run]",
  source: "pre[data-code-source]",
  pane: "[data-code-preview-pane]",
  hide: "[data-code-preview-hide]",
  status: "[data-code-preview-status]",
  error: "[data-code-preview-error]",
  frameHost: "[data-code-preview-frame]",
};

/** Vertical bounds, in pixels, for the preview iframe. */
export const PREVIEW_MIN_HEIGHT = 120;
export const PREVIEW_MAX_HEIGHT = 600;

export const PREVIEW_PACKAGES = [
  "react",
  "react-dom",
  "react-dom/client",
  "lucide-react",
  "recharts",
  "framer-motion",
];

/**
 * Import map used by the preview iframe. All entries point at locally built
 * ESM bundles so previews never reach a CDN or an external package registry.
 * Absolute origins are required because the iframe has an opaque origin.
 * @returns {{ imports: Record<string, string> }}
 */
export function buildImportMap() {
  const origin = window.location.origin;
  return {
    imports: {
      react: `${origin}/preview-runtime/react.js`,
      "react/jsx-runtime": `${origin}/preview-runtime/react-jsx-runtime.js`,
      "react/jsx-dev-runtime": `${origin}/preview-runtime/react-jsx-dev-runtime.js`,
      "react-dom": `${origin}/preview-runtime/react-dom.js`,
      "react-dom/client": `${origin}/preview-runtime/react-dom-client.js`,
      "lucide-react": `${origin}/preview-runtime/lucide-react.js`,
      recharts: `${origin}/preview-runtime/recharts.js`,
      "framer-motion": `${origin}/preview-runtime/framer-motion.js`,
    },
  };
}

/**
 * CSP for the preview document. Scripts are limited to the app origin, inline
 * bootstrap code, and the Blob module that carries the user's code. Fetch/XHR
 * and WebSocket are blocked; images, fonts, and stylesheets may use https.
 * @returns {string}
 */
export function buildContentSecurityPolicy() {
  const origin = window.location.origin;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origin} blob:`,
    `style-src 'unsafe-inline' ${origin} https:`,
    `img-src data: blob: ${origin} https:`,
    `font-src data: blob: ${origin} https:`,
    `media-src data: blob: ${origin} https:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
