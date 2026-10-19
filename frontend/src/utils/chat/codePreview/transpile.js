/**
 * JSX/TSX preview compilation. Sucrase is not part of the main bundle: it is
 * only fetched the first time a React-style block is executed.
 */

const MODE_CONFIG = {
  jsx: { transforms: ["jsx"], filePath: "App.jsx" },
  react: { transforms: ["jsx"], filePath: "App.jsx" },
  tsx: { transforms: ["typescript", "jsx"], filePath: "App.tsx" },
};

const SELF_RENDER_PATTERN = /createRoot\s*\(|ReactDOM\s*\.\s*render\s*\(/;
const DEFAULT_EXPORT_PATTERN = /\bexport\s+default\b/;
const APP_DECLARATION_PATTERN =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:function|class|const|let|var)\s+App\b/;

let sucrasePromise = null;

function loadSucrase() {
  if (!sucrasePromise) sucrasePromise = import("sucrase");
  return sucrasePromise;
}

/**
 * @param {string} source
 * @returns {boolean} whether the snippet mounts itself
 */
export function isSelfRendering(source = "") {
  return SELF_RENDER_PATTERN.test(source);
}

/**
 * Sucrase errors already carry `filePath: message (line:column)`, but the
 * structured location is preferred when available.
 * @param {unknown} error
 * @returns {string}
 */
function formatTranspileError(error) {
  const message =
    error && error.message ? String(error.message) : String(error);
  const location = error && error.loc;
  if (location && typeof location.line === "number")
    return `${message} (line ${location.line}, column ${location.column ?? 0})`;
  return message;
}

/**
 * Compiles a JSX/TSX snippet into an ES module. When the snippet neither
 * exports anything nor mounts itself, a discovered `App` declaration is
 * exported as the default so the preview has something to render.
 * @param {string} source
 * @param {"jsx"|"react"|"tsx"} [mode]
 * @returns {Promise<string>} compiled module source
 */
export async function transpilePreviewCode(source, mode = "react") {
  const config = MODE_CONFIG[mode] ?? MODE_CONFIG.react;

  let compiled;
  try {
    const { transform } = await loadSucrase();
    compiled = transform(source, {
      transforms: config.transforms,
      jsxRuntime: "automatic",
      production: true,
      filePath: config.filePath,
    });
  } catch (error) {
    throw new Error(formatTranspileError(error));
  }

  let code = compiled.code;
  if (
    !DEFAULT_EXPORT_PATTERN.test(code) &&
    !isSelfRendering(source) &&
    APP_DECLARATION_PATTERN.test(code)
  )
    code += "\n\nexport default App;\n";

  return code;
}
