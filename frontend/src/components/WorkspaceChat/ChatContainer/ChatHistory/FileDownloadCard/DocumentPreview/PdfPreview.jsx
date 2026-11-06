import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleNotch } from "@phosphor-icons/react";
import StorageFiles from "@/models/files";

/**
 * Faithful document preview backed by server-side rendering.
 *
 * For PDFs the server returns the file as-is; for office documents
 * (docx/xlsx/pptx/...) it converts them to PDF with headless LibreOffice and
 * caches the result. We fetch that PDF as an authenticated blob and hand an
 * object URL to the browser's built-in viewer.
 *
 * Conversion can take a few seconds on first open (then it is cached), so a
 * loading spinner is shown. If the server cannot produce a PDF (LibreOffice
 * missing, unsupported type, or an error) we render the `fallback` node - the
 * text-based hybrid preview - so the user always sees something useful.
 *
 * @param {{storageFilename: string, fallback?: import("react").ReactNode}} props
 */
export default function FaithfulPreview({ storageFilename, fallback = null }) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let revoke = null;
    let cancelled = false;
    async function load() {
      if (!storageFilename) return setStatus("failed");
      setStatus("loading");
      const blob = await StorageFiles.preview(storageFilename);
      if (cancelled) return;
      if (!blob) return setStatus("failed");
      revoke = URL.createObjectURL(blob);
      setObjectUrl(revoke);
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
      setObjectUrl(null);
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [storageFilename]);

  if (status === "loading")
    return (
      <div className="flex flex-col items-center justify-center gap-y-3 py-16 text-zinc-400 light:text-slate-500">
        <CircleNotch size={24} weight="bold" className="animate-spin" />
        <span className="text-sm">{t("chatPreview.loading")}</span>
      </div>
    );

  if (status === "failed" || !objectUrl) return <>{fallback}</>;

  return (
    <iframe
      title="Document preview"
      src={objectUrl}
      className="w-full h-[70vh] rounded-lg border border-zinc-700 light:border-slate-200 bg-white"
    />
  );
}
