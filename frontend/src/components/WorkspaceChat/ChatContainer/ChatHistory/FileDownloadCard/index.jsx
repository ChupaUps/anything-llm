import { memo, useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { DownloadSimple, Eye, CircleNotch } from "@phosphor-icons/react";
import { humanFileSize } from "@/utils/numbers";
import StorageFiles from "@/models/files";
import { getFileMeta, isPreviewable } from "./fileMeta";
import DocumentPreview from "./DocumentPreview";

/**
 * @param {{content: {filename: string, storageFilename?: string, fileSize?: number, sourceContent?: string}}} props
 */
function FileDownloadCard({ props }) {
  const { t } = useTranslation();
  const { filename, storageFilename, fileSize, sourceContent } =
    props.content || {};
  const { badge, badgeBg, badgeText, typeKey } = getFileMeta(filename);
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = isPreviewable(filename, sourceContent);

  const handleDownload = async () => {
    if (downloading) return;
    if (!storageFilename) return;

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
    <div className="flex justify-center w-full my-2">
      <div className="w-full max-w-[750px] mr-4">
        <div className="flex items-center justify-between bg-zinc-800 light:bg-slate-100 light:border light:border-slate-200/50 rounded-xl px-2 py-1">
          <div className="flex items-center gap-x-3 min-w-0">
            <div
              className={`${badgeBg} ${badgeText} rounded-lg flex items-center justify-center flex-shrink-0 h-[48px] w-[48px] text-xs font-bold`}
            >
              {badge}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-white light:text-slate-900 text-sm font-medium truncate leading-snug">
                {filename || t("chatPreview.types.generic")}
              </p>
              <p className="text-zinc-400 light:text-slate-500 text-xs leading-snug">
                {humanFileSize(fileSize, true, 1)}
                {fileSize ? " · " : ""}
                {t(`chatPreview.types.${typeKey}`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-x-2 flex-shrink-0 ml-4">
            {canPreview && (
              <button
                onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-x-2 px-4 py-2 rounded-lg border border-zinc-600 light:border-theme-sidebar-border hover:bg-zinc-700 light:hover:bg-theme-bg-secondary transition-colors text-white light:text-theme-text-primary text-sm font-medium"
              >
                <Eye size={16} weight="bold" />
                <span>{t("chatPreview.preview")}</span>
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-x-2 px-4 py-2 rounded-lg border border-zinc-600 light:border-theme-sidebar-border hover:bg-zinc-700 light:hover:bg-theme-bg-secondary transition-colors text-white light:text-theme-text-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <CircleNotch size={16} weight="bold" className="animate-spin" />
              ) : (
                <DownloadSimple size={16} weight="bold" />
              )}
              <span>
                {downloading
                  ? t("chatPreview.downloading")
                  : t("chatPreview.download")}
              </span>
            </button>
          </div>
        </div>
      </div>

      {canPreview && (
        <DocumentPreview
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          filename={filename}
          storageFilename={storageFilename}
          fileSize={fileSize}
          sourceContent={sourceContent}
        />
      )}
    </div>
  );
}

export default memo(FileDownloadCard);
