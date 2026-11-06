import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import DOMPurify from "@/utils/chat/purify";

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {}
    }
    return "";
  },
});

/**
 * Render a markdown source string (used for docx + .md previews). The generated
 * markup is sanitized with DOMPurify before injection.
 * @param {{content: string}} props
 */
export default function MarkdownPreview({ content }) {
  const html = useMemo(() => {
    if (!content) return "";
    return DOMPurify.sanitize(md.render(content));
  }, [content]);

  return (
    <div
      className="prose prose-invert light:prose-none max-w-none text-sm text-slate-100 light:text-slate-800
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
        [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6
        [&_li]:my-1 [&_a]:text-sky-400 [&_a]:underline [&_table]:w-full [&_table]:my-3
        [&_th]:text-left [&_th]:font-semibold [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-zinc-800 light:[&_th]:bg-slate-100
        [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-zinc-700 light:[&_td]:border-slate-200
        [&_code]:bg-zinc-800 light:[&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px]
        [&_pre]:bg-zinc-900 light:[&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
        [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-zinc-400
        [&_hr]:my-4 [&_hr]:border-zinc-700 light:[&_hr]:border-slate-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
