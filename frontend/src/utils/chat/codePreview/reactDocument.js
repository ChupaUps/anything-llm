import { buildDocument, buildPreviewHead } from "./documentTemplate";

const SELF_RENDER_SOURCE =
  "/createRoot\\s*\\(|ReactDOM\\s*\\.\\s*render\\s*\\(/";

const CONTRACT_HINT = [
  "Nothing to render.",
  "",
  "The preview could not find a component to mount. Either:",
  "  - export a component: export default function App() { ... }",
  "  - or mount it yourself: createRoot(document.getElementById('root')).render(<App />)",
].join("\n");

const RUNTIME_HINT =
  "Preview failed to run." +
  "\n\nOnly bare imports from react, react-dom, lucide-react, recharts and framer-motion are available." +
  " Relative imports, CSS imports and external module URLs are not supported." +
  "\n\n";

/**
 * Encodes module source as base64 so it can travel inside an inline script
 * without a stray `</script>` (or any other markup) terminating the tag.
 * @param {string} value
 * @returns {string}
 */
export function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunkSize)
    );
  }
  return btoa(binary);
}

/**
 * Bootstrap module: exposes React globals, decodes the compiled module from a
 * Blob URL (so imports resolve through the import map), then mounts the
 * default/App export when the snippet does not mount itself.
 * @param {string} encodedCode - base64 module source
 * @returns {string}
 */
function buildBootstrapScript(encodedCode) {
  return `
import * as ReactBundle from "react";
import * as ReactDOMBundle from "react-dom";
import * as ReactDOMClientBundle from "react-dom/client";

window.React = ReactBundle.default || ReactBundle;
window.ReactDOM = Object.assign({}, ReactDOMBundle.default || ReactDOMBundle, {
  createRoot: ReactDOMClientBundle.createRoot,
  hydrateRoot: ReactDOMClientBundle.hydrateRoot,
});

const SELF_RENDER = ${SELF_RENDER_SOURCE};

function decodeSource(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

try {
  const source = decodeSource(${JSON.stringify(encodedCode)});
  const blobUrl = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" })
  );

  let loaded;
  try {
    loaded = await import(blobUrl);
  } finally {
    // Lazy dynamic imports from the snippet keep working for a short while,
    // then the URL is released.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }

  const container = document.getElementById("root");
  const selfRendered = SELF_RENDER.test(source);
  const alreadyMounted = !!(container && container.childElementCount > 0);
  const Component = loaded && (loaded.default || loaded.App);

  if (!selfRendered && !alreadyMounted) {
    if (!Component) {
      window.__previewError(${JSON.stringify(CONTRACT_HINT)});
    } else if (container) {
      ReactDOMClientBundle.createRoot(container).render(
        ReactBundle.createElement(Component)
      );
    }
  }
} catch (error) {
  const message =
    error && (error.stack || error.message) ? error.stack || error.message : String(error);
  window.__previewError(${JSON.stringify(RUNTIME_HINT)} + message);
}
`;
}

/**
 * Builds the srcdoc document for a compiled JSX/TSX module.
 * @param {string} id - preview id used for height reporting
 * @param {string} compiledCode - ES module produced by sucrase
 * @returns {string}
 */
export function buildReactPreviewDocument(id, compiledCode) {
  const head = buildPreviewHead(id, { includeBaseStyles: true });
  const body = `<div id="root"></div>
<script type="module">${buildBootstrapScript(encodeBase64Utf8(compiledCode))}</script>`;

  return buildDocument({ head, body, title: "React preview" });
}
