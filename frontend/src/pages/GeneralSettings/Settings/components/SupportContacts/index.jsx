import { useEffect, useState } from "react";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
import { safeJsonParse } from "@/utils/request";
import { useTranslation } from "react-i18next";

const CHANNELS = ["email", "phone", "messenger"];

const emptyContacts = () => ({
  email: { show: false, value: "" },
  phone: { show: false, value: "" },
  messenger: { show: false, value: "" },
});

const normalizeContacts = (saved) => {
  const parsed = safeJsonParse(saved, {}) || {};
  const contacts = emptyContacts();
  for (const channel of CHANNELS) {
    const entry = parsed?.[channel];
    if (!entry) continue;
    contacts[channel] = {
      show: entry.show === true,
      value: typeof entry.value === "string" ? entry.value : "",
    };
  }
  return contacts;
};

export default function SupportContacts() {
  const { t } = useTranslation();
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState(emptyContacts);

  useEffect(() => {
    Admin.systemPreferencesByFields(["support_contacts"]).then((response) => {
      setContacts(normalizeContacts(response?.settings?.support_contacts));
    });
  }, []);

  const updateChannel = (channel, patch) => {
    setContacts((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], ...patch },
    }));
    setHasChanges(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { success, error } = await Admin.updateSystemPreferences({
      support_contacts: JSON.stringify(contacts),
    });
    setSaving(false);
    if (!success) {
      showToast(
        t("customization.items.support-contacts.save-error", { error }),
        "error",
        { clear: true }
      );
      return;
    }
    showToast(
      t("customization.items.support-contacts.save-success"),
      "success",
      { clear: true }
    );
    setHasChanges(false);
  };

  return (
    <form
      className="flex flex-col gap-y-3 my-4 border-t border-white border-opacity-20 light:border-black/20 pt-6"
      onSubmit={handleSubmit}
    >
      <p className="text-sm leading-6 font-semibold text-white">
        {t("customization.items.support-contacts.title")}
      </p>
      <p className="text-xs text-white/60">
        {t("customization.items.support-contacts.description")}
      </p>

      {CHANNELS.map((channel) => (
        <div
          key={channel}
          className="flex flex-col gap-y-1.5 w-full max-w-[420px]"
        >
          <div className="flex items-center justify-between gap-x-4">
            <span className="text-sm font-medium text-white">
              {t(`customization.items.support-contacts.channels.${channel}`)}
            </span>
            <label className="flex items-center gap-x-2 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                className="accent-sky-500"
                checked={contacts[channel].show}
                onChange={(e) =>
                  updateChannel(channel, { show: e.target.checked })
                }
              />
              {t("customization.items.support-contacts.show")}
            </label>
          </div>
          <input
            type={
              channel === "email"
                ? "email"
                : channel === "phone"
                  ? "tel"
                  : "text"
            }
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full py-2 px-4"
            placeholder={t(
              `customization.items.support-contacts.placeholders.${channel}`
            )}
            autoComplete="off"
            value={contacts[channel].value}
            onChange={(e) => updateChannel(channel, { value: e.target.value })}
          />
        </div>
      ))}

      {hasChanges && (
        <button
          type="submit"
          disabled={saving}
          className="transition-all mt-2 w-fit duration-300 border border-slate-200 px-5 py-2.5 rounded-lg text-white text-sm items-center flex gap-x-2 hover:bg-slate-200 hover:text-slate-800 focus:ring-gray-800 disabled:opacity-50"
        >
          {t("customization.items.support-contacts.save")}
        </button>
      )}
    </form>
  );
}
