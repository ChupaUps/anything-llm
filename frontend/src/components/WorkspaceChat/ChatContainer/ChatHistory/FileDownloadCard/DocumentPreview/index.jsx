import { useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { DownloadSimple, CircleNotch } from "@phosphor-icons/react";
import Modal, { ModalHeader, ModalBody } from "@/components/lib/Modal";
import { humanFileSize } from "@/utils/numbers";
import StorageFiles from "@/models/files";
import { getFileMeta, detectPreviewKind, isFaithfulExt } from "../fileMeta";
import FaithfulPreview from "./PdfPreview";
import MarkdownPreview from "./MarkdownPreview";
import TablePreview from "./TablePreview";
import SlidesPreview from "./SlidesPreview";
import TextPreview from "./TextPreview";

/**
 * Text-based preview reconstructed from the persisted `sourceContent`. Used
 * directly for markdown/txt and as the fallback when LibreOffice cannot render
 * an office document to PDF (e.g. not installed, or a conversion error).
 * @param {{kind: string, sourceContent?: string}} data
 * @param {(key: string) => string} t
 * @returns {import("react").ReactNode}
 */
function hybridBody({ kind, sourceContent }, t) {
  if (!sourceContent)
    return (
      <p className="text-sm text-zinc-400">{t("chatPreview.noPreview")}</p>
    );
  switch (kind) {
    case "slides":
      return <SlidesPreview sourceContent={sourceContent} />;
    case "sheets":
      return <TablePreview sourceContent={sourceContent} workbook={true} />;
    case "csv":
      return <TablePreview sourceContent={sourceContent} workbook={false} />;
    case "markdown":
      return <MarkdownPreview content={sourceContent} />;
    default:
      return <TextPreview content={sourceContent} />;
  }
}

/**
 * Pick the right renderer for a file. PDF and office documents render
 * faithfully via server-side LibreOffice (falling back to the text preview);
 * markdown/txt render straight from `sourceContent`.
 * @param {{filename: string, sourceContent?: string, storageFilename?: string}} data
 * @param {(key: string) => string} t
 * @returns {import("react").ReactNode}
 */
function renderBody({ filename, sourceContent, storageFilename }, t) {
  const kind = detectPreviewKind(filename, sourceContent);
  const ext = getFileMeta(filename).ext;

  if (kind === "pdf" || isFaithfulExt(ext)) {
    const fallback =
      kind === "pdf" ? (
        <p className="text-sm text-zinc-400">{t("chatPreview.noPreview")}</p>
      ) : (
        hybridBody({ kind, sourceContent }, t)
      );
    return (
      <FaithfulPreview storageFilename={storageFilename} fallback={fallback} />
    );
  }

  return hybridBody({ kind, sourceContent }, t);
}

/**
 * In-chat document preview modal. Renders generated files from the persisted
 * `sourceContent` (docx/md/txt/csv/xlsx/pptx) and natively for PDF, without any
 * heavyweight Office renderer.
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   filename: string,
 *   storageFilename?: string,
 *   fileSize?: number,
 *   sourceContent?: string,
 * }} props
 */
export default function DocumentPreview({
  isOpen,
  onClose,
  filename,
  storageFilename,
  fileSize,
  sourceContent,
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const { badge, badgeBg, badgeText, typeKey } = getFileMeta(filename);

  const handleDownload = async () => {
    if (downloading || !storageFilename) return;
    setDownloading(true);
    try {
      const blob = await StorageFiles.download(storageFilename);
      if (!blob) throw new Error("Failed to download file");
      saveAs(blob, filename || storageFilename);
    } catch {
      console.error("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader
        title={
          <span className="flex items-center gap-x-2">
            <span
              className={`${badgeBg} ${badgeText} rounded-md flex items-center justify-center h-6 min-w-[36px] px-1 text-[11px] font-bold flex-shrink-0`}
            >
              {badge}
            </span>
            <span className="truncate">
              {filename || t("chatPreview.types.generic")}
            </span>
          </span>
        }
        subtitle={[
          t(`chatPreview.types.${typeKey}`),
          fileSize ? humanFileSize(fileSize, true, 1) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={onClose}
      >
        <div className="flex justify-end mt-1">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-x-2 px-3 py-1.5 rounded-lg border border-zinc-600 light:border-slate-300 hover:bg-zinc-800 light:hover:bg-slate-100 transition-colors text-slate-100 light:text-slate-700 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <DownloadSimple size={14} weight="bold" />
            )}
            <span>
              {downloading
                ? t("chatPreview.downloading")
                : t("chatPreview.download")}
            </span>
          </button>
        </div>
      </ModalHeader>

      <ModalBody>
        {renderBody({ filename, sourceContent, storageFilename }, t)}
      </ModalBody>
    </Modal>
  );
}
