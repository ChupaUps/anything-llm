import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const entriesDir = path.join(__dirname, "preview-runtime", "entries");
const outdir = path.join(frontendRoot, "public", "preview-runtime");
const shared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  entryNames: "[name]",
  outdir,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
};

/**
 * Builds the preview runtime packages into public/preview-runtime so previews
 * never depend on a CDN. Runs before dev/build via package.json pre-scripts.
 */
async function buildPreviewRuntime() {
  await rm(outdir, { recursive: true, force: true });

  await build({
    ...shared,
    // Splitting keeps a single React instance shared by react, react-dom and
    // the JSX runtime entries - duplicates would break hooks at runtime.
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    entryPoints: {
      react: path.join(entriesDir, "react.js"),
      "react-dom": path.join(entriesDir, "react-dom.js"),
      "react-dom-client": path.join(entriesDir, "react-dom-client.js"),
      "react-jsx-runtime": path.join(entriesDir, "react-jsx-runtime.js"),
      "react-jsx-dev-runtime": path.join(entriesDir, "react-jsx-dev-runtime.js"),
    },
  });

  await build({
    ...shared,
    entryPoints: {
      "lucide-react": path.join(entriesDir, "lucide-react.js"),
      recharts: path.join(entriesDir, "recharts.js"),
      "framer-motion": path.join(entriesDir, "framer-motion.js"),
    },
    external: [
      "react",
      "react/*",
      "react-dom",
      "react-dom/*",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  });

  await build({
    ...shared,
    entryPoints: {
      twind: path.join(entriesDir, "twind.js"),
    },
  });

  console.log(`Preview runtime built at ${outdir}`);
}

buildPreviewRuntime().catch((error) => {
  console.error("Failed to build the preview runtime:", error);
  process.exit(1);
});
