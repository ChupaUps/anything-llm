// Temporary harness used to verify the chat code-preview pipeline in a browser.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import { installCodePreviewDelegator } from "@/utils/chat/codePreview";
import { buildHtmlPreviewDocument } from "@/utils/chat/codePreview/htmlDocument";
import "@/index.css";

const HTML_FRAGMENT = `\`\`\`html
<div class="p-4 bg-emerald-100 rounded-lg">
  <h1 class="text-xl font-bold text-emerald-800">Hello preview</h1>
  <button onclick="this.textContent = 'Clicked!'" class="mt-2 px-3 py-1 bg-emerald-600 text-white rounded">Click me</button>
  <p id="stamp" class="mt-2 text-xs">stamp: none</p>
</div>
<script>
  document.getElementById("stamp").textContent = "stamp: inline script ran";
</script>
\`\`\``;

const FULL_DOCUMENT = `\`\`\`html
<!doctype html>
<html>
  <head>
    <style>
      body { background: #fef3c7; font-family: Georgia, serif; }
    </style>
  </head>
  <body>
    <h1>Full document</h1>
    <p id="full">no message</p>
    <script>
      document.getElementById("full").textContent = "message: document script ran";
    </script>
  </body>
</html>
\`\`\``;

const REACT_SAMPLE = `\`\`\`jsx
import { useState } from "react";
import { Rocket } from "lucide-react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="p-4 bg-sky-100 rounded-lg">
      <h1 className="text-lg font-bold flex items-center gap-2">
        <Rocket className="w-4 h-4" /> React preview
      </h1>
      <button
        className="mt-2 px-3 py-1 bg-sky-600 text-white rounded"
        onClick={() => setCount(count + 1)}
      >
        count: {count}
      </button>
    </div>
  );
}
\`\`\``;

const TSX_SAMPLE = `\`\`\`tsx
interface Props { label: string }

function Badge({ label }: Props) {
  return <span className="px-2 py-1 bg-violet-200 text-violet-900 rounded">{label}</span>;
}

export default function App() {
  return (
    <div className="p-4">
      <Badge label="TSX works" />
    </div>
  );
}
\`\`\``;

const BROKEN_SAMPLE = `\`\`\`jsx
export default function App() {
  return <div className="p-4">broken</div
}
\`\`\``;

const UNKNOWN_IMPORT_SAMPLE = `\`\`\`jsx
import _ from "lodash";

export default function App() {
  return <div className="p-4">{_.capitalize("hi")}</div>;
}
\`\`\``;

const SECTIONS = [
  ["HTML fragment", HTML_FRAGMENT],
  ["Full HTML document", FULL_DOCUMENT],
  ["JSX + lucide + tailwind", REACT_SAMPLE],
  ["TSX", TSX_SAMPLE],
  ["Broken JSX", BROKEN_SAMPLE],
  ["Unknown import", UNKNOWN_IMPORT_SAMPLE],
];

function Section({ title, source }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = DOMPurify.sanitize(
      renderMarkdown(source, { allowCodePreview: true })
    );
  }, [source]);

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs font-bold uppercase text-stone-400">{title}</h2>
      <div className="markdown" ref={ref} />
    </section>
  );
}

installCodePreviewDelegator();

// Temporary probe: renders the HTML sample in a same-origin frame so layout
// metrics can be read from the parent.
function Metrics() {
  const [out, setOut] = useState("not run");

  const run = () => {
    const source = HTML_FRAGMENT.replace(/^```html\n/, "").replace(/\n```$/, "");
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "width:600px;height:400px;border:1px solid #444;display:block;margin-bottom:12px";
    document.body.appendChild(frame);
    frame.onload = () => {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      const h1 = doc.querySelector("h1");
      const button = doc.querySelector("button");
      const pick = (element) => {
        const style = win.getComputedStyle(element);
        return {
          margin: style.margin,
          padding: style.padding,
          borderWidth: style.borderWidth,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      };
      setOut(
        JSON.stringify(
          {
            bodyScrollHeight: doc.body.scrollHeight,
            bodyOffsetHeight: doc.body.offsetHeight,
            bodyRectHeight: Math.round(doc.body.getBoundingClientRect().height),
            htmlScrollHeight: doc.documentElement.scrollHeight,
            htmlOffsetHeight: doc.documentElement.offsetHeight,
            bodyPadding: win.getComputedStyle(doc.body).padding,
            twindStyleElement: !!doc.querySelector("style[data-twind]"),
            twindStyleLength: doc.querySelector("style[data-twind]")?.sheet?.cssRules.length,
            h1: pick(h1),
            button: pick(button),
          },
          null,
          2
        )
      );
    };
    frame.srcdoc = buildHtmlPreviewDocument("metrics", source);
  };

  return (
    <div className="mb-8">
      <button
        type="button"
        id="measure"
        className="mb-2 rounded bg-amber-500 px-3 py-1 text-black"
        onClick={run}
      >
        Measure
      </button>
      <pre id="metrics-output" className="text-xs text-lime-300">
        {out}
      </pre>
    </div>
  );
}

function Harness() {
  return (
    <div className="min-h-screen bg-stone-900 p-6">
      <Metrics />
      {SECTIONS.map(([title, source]) => (
        <Section key={title} title={title} source={source} />
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Harness />);
