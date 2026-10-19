import React, { useState, useEffect } from "react";
import Appearance from "@/models/appearance";
import { useTranslation } from "react-i18next";
import Toggle from "@/components/lib/Toggle";

export default function ChatCodePreview() {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [codePreview, setCodePreview] = useState(true);

  const handleChange = async (checked) => {
    setCodePreview(checked);
    setSaving(true);
    try {
      Appearance.updateSettings({ codePreview: checked });
    } catch (error) {
      console.error("Failed to update appearance settings:", error);
      setCodePreview(!checked);
    }
    setSaving(false);
  };

  useEffect(() => {
    const settings = Appearance.getSettings();
    setCodePreview(settings.codePreview ?? true);
  }, []);

  return (
    <div className="my-4">
      <Toggle
        size="md"
        variant="horizontal"
        enabled={codePreview}
        onChange={handleChange}
        disabled={saving}
        label={t("customization.items.code-preview.title")}
        description={t("customization.items.code-preview.description")}
      />
    </div>
  );
}
