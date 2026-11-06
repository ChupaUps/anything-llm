import System from "@/models/system";
import showToast from "@/utils/toast";
import { useEffect, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/**
 * Avatar shown next to every model reply inside the chat embed widget.
 * When nothing is uploaded the widget keeps its own built-in icon, so this
 * setting is purely optional branding and never breaks an existing embed.
 */
export default function CustomAssistantIcon() {
  const { t } = useTranslation();
  const [hasIcon, setHasIcon] = useState(false);
  const [preview, setPreview] = useState("");
  const fileInputRef = useRef(null);

  function iconUrl() {
    return `${System.assistantIconUrl()}?v=${Date.now()}`;
  }

  async function refresh() {
    const exists = await System.hasAssistantIcon();
    setHasIcon(exists);
    setPreview(exists ? iconUrl() : "");
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return false;

    setPreview(URL.createObjectURL(file));
    const formData = new FormData();
    // Field name is "logo" because the server shares the asset upload handler.
    formData.append("logo", file);
    const { success, error } = await System.uploadAssistantIcon(formData);
    if (!success) {
      showToast(
        `${t("customization.items.assistant-icon.uploadFailed")}: ${error}`,
        "error"
      );
      refresh();
      return;
    }

    await refresh();
    showToast(t("customization.items.assistant-icon.uploaded"), "success");
  }

  async function handleRemoveIcon() {
    setPreview("");
    const { success, error } = await System.removeAssistantIcon();
    if (!success) {
      showToast(
        `${t("customization.items.assistant-icon.removeFailed")}: ${error}`,
        "error"
      );
      refresh();
      return;
    }

    setHasIcon(false);
    showToast(t("customization.items.assistant-icon.removed"), "success");
  }

  return (
    <div className="flex flex-col gap-y-0.5 my-4">
      <p className="text-sm leading-6 font-semibold text-white">
        {t("customization.items.assistant-icon.title")}
      </p>
      <p className="text-xs text-white/60">
        {t("customization.items.assistant-icon.description")}
      </p>
      {!hasIcon ? (
        <div className="flex md:flex-row flex-col items-center">
          <div className="flex flex-row gap-x-8">
            <label className="mt-3 transition-all duration-300 hover:opacity-60">
              <input
                id="assistant-icon-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div
                className="w-80 py-4 bg-theme-settings-input-bg rounded-2xl border-2 border-dashed border-theme-text-secondary border-opacity-60 justify-center items-center inline-flex cursor-pointer"
                htmlFor="assistant-icon-upload"
              >
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full bg-white/40">
                    <Plus className="w-6 h-6 text-black/80 m-2" />
                  </div>
                  <div className="text-theme-text-primary text-opacity-80 text-sm font-semibold py-1">
                    {t("customization.items.assistant-icon.add")}
                  </div>
                  <div className="text-theme-text-secondary text-opacity-60 text-xs font-medium py-1">
                    {t("customization.items.assistant-icon.recommended")}
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>
      ) : (
        <div className="flex md:flex-row flex-col items-center relative">
          <div className="group w-80 h-[130px] mt-3 overflow-hidden">
            <img
              src={preview}
              alt="Uploaded assistant icon"
              className="w-full h-full object-contain border-2 border-theme-text-secondary border-opacity-60 p-1 rounded-2xl"
            />

            <div className="absolute w-80 top-0 left-0 right-0 bottom-0 flex flex-col gap-y-3 justify-center items-center rounded-2xl mt-3 bg-black bg-opacity-80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out border-2 border-transparent hover:border-white">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[#FFFFFF] text-base font-medium hover:text-opacity-60 mx-2"
              >
                {t("customization.items.assistant-icon.replace")}
              </button>

              <input
                id="assistant-icon-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                ref={fileInputRef}
              />
              <button
                onClick={handleRemoveIcon}
                className="text-[#FFFFFF] text-base font-medium hover:text-opacity-60 mx-2"
              >
                {t("customization.items.assistant-icon.remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
