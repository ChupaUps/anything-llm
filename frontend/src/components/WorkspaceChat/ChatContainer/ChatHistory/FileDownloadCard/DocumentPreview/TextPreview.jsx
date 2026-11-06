/**
 * Plain-text preview for txt/log/json/xml/yaml and other text files. Rendered as
 * a monospace block that wraps, so long lines stay readable inside the modal.
 * @param {{content: string}} props
 */
export default function TextPreview({ content }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-slate-100 light:text-slate-800 bg-zinc-900 light:bg-slate-50 rounded-lg p-4 border border-zinc-800 light:border-slate-200 max-h-[70vh] overflow-auto">
      {content}
    </pre>
  );
}
