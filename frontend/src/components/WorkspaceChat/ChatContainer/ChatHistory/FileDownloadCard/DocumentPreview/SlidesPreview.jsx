import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** Coerce a single bullet-ish item into display text. */
function itemText(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  return String(
    item.text ?? item.content ?? item.label ?? item.value ?? item.title ?? ""
  );
}

/** Pull an ordered list of display lines out of a normalized slide object. */
function slideLines(slide) {
  const lines = [];
  if (!slide || typeof slide !== "object") return lines;
  const push = (t) => {
    const s = (t || "").toString().trim();
    if (s) lines.push(s);
  };

  const raw =
    slide.content ?? slide.bullets ?? slide.points ?? slide.items ?? null;
  if (Array.isArray(raw)) raw.forEach((it) => push(itemText(it)));
  else if (raw) push(itemText(raw));

  // Multi-column layouts: prefix each column heading.
  if (Array.isArray(slide.columns)) {
    slide.columns.forEach((col) => {
      push(col?.title || col?.heading);
      const inner = col?.content ?? col?.bullets ?? [];
      if (Array.isArray(inner))
        inner.forEach((it) => push("   • " + itemText(it)));
      else push(inner);
    });
  }

  // Table layouts: render "header: row" style lines.
  const table = slide.table;
  if (table) {
    const headers = table.columnheader ?? table.headers ?? table.header ?? [];
    const rows = table.rows ?? table.data ?? [];
    if (Array.isArray(rows)) {
      rows.forEach((r, ri) => {
        const cells = Array.isArray(r) ? r : Object.values(r || {});
        const label = headers[ri] ?? `Row ${ri + 1}`;
        push(`${label}: ${cells.map((c) => itemText(c)).join(" · ")}`);
      });
    }
  }

  // KPI / stats layouts.
  if (Array.isArray(slide.stats)) {
    slide.stats.forEach((s) =>
      push(`${itemText(s)}${s?.value ? ": " + s.value : ""}`)
    );
  }

  if (slide.quote) push(`“${itemText(slide.quote)}”`);

  return lines;
}

/**
 * Presentation preview: the deck is rendered as a stack of readable slide cards
 * (number, layout, title/subtitle and best-effort body text). This is an
 * outline-style preview, not a pixel render of the .pptx layout.
 * @param {{sourceContent: string, fallbackText: string}} props
 */
export default function SlidesPreview({ sourceContent }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState({});

  const deck = useMemo(() => {
    try {
      const parsed = JSON.parse(sourceContent);
      if (Array.isArray(parsed)) return { title: "", slides: parsed };
      if (Array.isArray(parsed?.slides)) return parsed;
      return null;
    } catch {
      return null;
    }
  }, [sourceContent]);

  if (!deck)
    return (
      <p className="text-sm text-zinc-400">{t("chatPreview.noPreview")}</p>
    );

  return (
    <div className="flex flex-col gap-3">
      {deck.title && (
        <h2 className="text-lg font-bold text-slate-100 light:text-slate-900">
          {deck.title}
        </h2>
      )}
      <p className="text-xs text-zinc-400 light:text-slate-500">
        {t("chatPreview.slidesCount", { count: deck.slides.length })}
      </p>

      {deck.slides.map((slide, i) => {
        const lines = slideLines(slide);
        const isOpen = open[i] ?? i < 3; // auto-expand first three slides
        return (
          <div
            key={i}
            className="rounded-xl border border-zinc-700 light:border-slate-200 bg-zinc-900/60 light:bg-slate-50 overflow-hidden"
          >
            <button
              onClick={() => setOpen((p) => ({ ...p, [i]: !isOpen }))}
              className="w-full flex items-center gap-x-3 px-4 py-3 text-left border-none bg-transparent hover:bg-zinc-800 light:hover:bg-slate-100"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-zinc-800 light:bg-slate-200 text-zinc-300 light:text-slate-600 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-slate-100 light:text-slate-900 truncate">
                  {slide.title || `${t("chatPreview.slide")} ${i + 1}`}
                </span>
                {slide.layout && (
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500 light:text-slate-400">
                    {slide.layout}
                  </span>
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1 flex flex-col gap-y-1.5">
                {slide.subtitle && (
                  <p className="text-sm italic text-zinc-400 light:text-slate-500">
                    {slide.subtitle}
                  </p>
                )}
                {lines.length > 0 ? (
                  <ul className="list-disc pl-5 flex flex-col gap-y-1">
                    {lines.map((ln, li) => (
                      <li
                        key={li}
                        className="text-sm text-slate-200 light:text-slate-700 leading-relaxed"
                      >
                        {ln}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-500 light:text-slate-400">
                    {t("chatPreview.noPreview")}
                  </p>
                )}
                {slide.notes && (
                  <p className="mt-2 text-xs text-zinc-500 light:text-slate-400 border-t border-zinc-800 light:border-slate-200 pt-2 whitespace-pre-wrap">
                    {slide.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
