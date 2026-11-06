import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import showToast from "@/utils/toast";
import Toggle from "@/components/lib/Toggle";
import ChatFallback from "@/models/chatFallback";
import LLMProviderModelPicker from "@/pages/GeneralSettings/ModelRouters/LLMProviderModelPicker";

/**
 * Admin card to configure a global fallback chat model. When enabled, a chat
 * request that fails on the primary model with a transient provider error
 * (429 / 5xx / network) is transparently retried on this alternate model, so
 * end users keep getting answers instead of an error banner.
 */
export default function ChatModelFallback() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [savedProvider, setSavedProvider] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { config } = await ChatFallback.getConfig();
      setEnabled(config?.enabled === true);
      setSavedProvider(config?.provider || "");
      setSavedModel(config?.model || "");
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    const formData = new FormData(formRef.current);
    const provider = String(formData.get("fallback_provider") || "");
    const model = String(formData.get("fallback_model") || "");

    if (enabled && !provider) {
      showToast(t("chatFallback.toast.providerRequired"), "error", {
        clear: true,
      });
      return;
    }

    setSaving(true);
    const { success, error } = await ChatFallback.updateConfig({
      enabled,
      provider,
      model,
    });
    setSaving(false);
    if (!success) {
      showToast(t("chatFallback.toast.saveError", { error }), "error", {
        clear: true,
      });
      return;
    }
    setSavedProvider(provider);
    setSavedModel(model);
    showToast(t("chatFallback.toast.saved"), "success", { clear: true });
  }

  if (loading) return null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSave}
      className="mt-10 flex flex-col gap-y-4 border-t border-white/10 light:border-black/10 pt-6"
    >
      <div>
        <p className="text-base font-bold text-white light:text-slate-900">
          {t("chatFallback.title")}
        </p>
        <p className="text-xs leading-[18px] text-white/60 light:text-slate-600">
          {t("chatFallback.description")}
        </p>
      </div>

      <Toggle
        size="md"
        enabled={enabled}
        onChange={(checked) => setEnabled(checked)}
        label={t("chatFallback.enable")}
        description={t("chatFallback.enableHint")}
        variant="horizontal"
      />

      {enabled && (
        <div className="max-w-[620px]">
          <LLMProviderModelPicker
            providerFieldName="fallback_provider"
            modelFieldName="fallback_model"
            label={t("chatFallback.pickerLabel")}
            description={t("chatFallback.pickerHint")}
            defaultProvider={savedProvider}
            defaultModel={savedModel}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-fit mt-2 transition-all duration-300 border border-slate-200 px-5 py-2.5 rounded-lg text-white text-sm hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50 light:text-slate-800"
      >
        {saving ? t("chatFallback.saving") : t("chatFallback.save")}
      </button>
    </form>
  );
}
