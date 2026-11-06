import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseCsv } from "./csv";

/**
 * Render one sheet of CSV text as a table (first row = header).
 * @param {{csvData: string}} props
 */
function SheetTable({ csvData }) {
  const rows = useMemo(() => parseCsv(csvData), [csvData]);
  if (!rows.length) return <p className="text-sm text-zinc-400">—</p>;

  const [header, ...body] = rows;
  return (
    <div className="overflow-auto max-h-[60vh] rounded-lg border border-zinc-800 light:border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0">
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="text-left font-semibold px-3 py-2 bg-zinc-800 light:bg-slate-100 text-slate-100 light:text-slate-800 border-b border-zinc-700 light:border-slate-200 whitespace-nowrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr
              key={r}
              className="odd:bg-zinc-900/40 light:odd:bg-white even:bg-zinc-900 light:even:bg-slate-50"
            >
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="px-3 py-1.5 text-slate-200 light:text-slate-700 border-b border-zinc-800 light:border-slate-100 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Spreadsheet / CSV preview.
 * - `workbook` renders the structured `{sheets:[{name,csvData}]}` payload with
 *   per-sheet tabs (xlsx).
 * - otherwise it treats `sourceContent` as a single CSV blob.
 * @param {{sourceContent: string, workbook: boolean}} props
 */
export default function TablePreview({ sourceContent, workbook }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);

  const sheets = useMemo(() => {
    if (workbook) {
      try {
        const parsed = JSON.parse(sourceContent);
        if (Array.isArray(parsed?.sheets)) return parsed.sheets;
        return [];
      } catch {
        return [];
      }
    }
    return [{ name: t("chatPreview.types.csv"), csvData: sourceContent }];
  }, [sourceContent, workbook, t]);

  if (!sheets.length)
    return (
      <p className="text-sm text-zinc-400">{t("chatPreview.noPreview")}</p>
    );

  const current = sheets[Math.min(active, sheets.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      {workbook && sheets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                i === active
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-zinc-800 light:bg-slate-100 text-slate-200 light:text-slate-700 border-zinc-700 light:border-slate-200 hover:bg-zinc-700 light:hover:bg-slate-200"
              }`}
            >
              {s.name || `${t("chatPreview.sheet")} ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <SheetTable csvData={current.csvData} />
    </div>
  );
}
