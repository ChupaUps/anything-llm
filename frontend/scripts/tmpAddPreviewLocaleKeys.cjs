/* Temporary helper: adds the code-preview locale keys to every locale. */
const fs = require("fs");
const path = require("path");

const localesRoot = path.join(__dirname, "..", "src", "locales");

const chatBlock = (values) => `    "code-preview": {
      run: "${values.run}",
      preview: "${values.preview}",
      hide: "${values.hide}",
      loading: "${values.loading}",
      error: "${values.error}",
      "unknown-import": "${values.unknownImport}",
    },
`;

const customizationBlock = (values) => `      "code-preview": {
        title: "${values.title}",
        description:
          "${values.description}",
      },
`;

const ENGLISH = {
  run: "RUN",
  preview: "Preview",
  hide: "Hide",
  loading: "Loading preview",
  error: "Preview failed",
  unknownImport: "This import is not available in the preview",
  title: "Code preview",
  description:
    "Run HTML, JSX and TSX code blocks in an isolated sandbox right inside the chat.",
};

const RUSSIAN = {
  run: "ЗАПУСК",
  preview: "Предпросмотр",
  hide: "Скрыть",
  loading: "Загрузка предпросмотра",
  error: "Не удалось показать предпросмотр",
  unknownImport: "Этот импорт недоступен в предпросмотре",
  title: "Предпросмотр кода",
  description:
    "Запуск HTML и React-блоков кода в изолированной песочнице прямо в чате.",
};

let updated = 0;
const skipped = [];

for (const locale of fs.readdirSync(localesRoot)) {
  const file = path.join(localesRoot, locale, "common.js");
  if (!fs.existsSync(file)) continue;

  let text = fs.readFileSync(file, "utf8");
  if (text.includes('"code-preview"')) {
    skipped.push(locale);
    continue;
  }

  const values = locale === "ru" ? RUSSIAN : ENGLISH;

  if (!/^  chat: \{\n/m.test(text)) throw new Error(`chat anchor: ${locale}`);
  if (!/^      "render-html": \{/m.test(text))
    throw new Error(`render-html anchor: ${locale}`);

  text = text.replace(/^  chat: \{\n/m, (match) => match + chatBlock(values));
  text = text.replace(
    /^      "render-html": \{/m,
    (match) => customizationBlock(values) + match
  );

  fs.writeFileSync(file, text);
  updated += 1;
}

console.log(`updated: ${updated}`);
console.log(`skipped: ${skipped.join(", ") || "none"}`);
