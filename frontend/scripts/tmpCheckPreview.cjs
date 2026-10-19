const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "public", "preview-runtime");

function exportNames(file) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  const names = new Set();
  const exportBlock = source.match(/export\s*\{([^}]*)\}/g) || [];
  for (const block of exportBlock) {
    for (const part of block.replace(/^export\s*\{|\}$/g, "").split(",")) {
      const match = part.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (match) names.add(match[2] || match[1]);
    }
  }
  return [...names];
}

for (const file of [
  "react.js",
  "react-dom.js",
  "react-dom-client.js",
  "react-jsx-runtime.js",
  "react-jsx-dev-runtime.js",
]) {
  const names = exportNames(file);
  console.log(`${file} (${names.length}): ${names.join(", ")}`);
}

const reactExports = exportNames("react.js");
const required = ["useState", "useEffect", "useMemo", "createElement", "Fragment", "default"];
const missing = required.filter((name) => !reactExports.includes(name));
console.log("react missing:", missing.length ? missing.join(", ") : "none");
