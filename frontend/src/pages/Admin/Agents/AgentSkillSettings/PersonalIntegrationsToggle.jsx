import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleNotch } from "@phosphor-icons/react";
import Toggle from "@/components/lib/Toggle";
import System from "@/models/system";
import Admin from "@/models/admin";

/**
 * Instance-wide master switch for the per-workspace "Integrations" tab (mail /
 * calendar). Self-saving like the other agent settings toggles: it writes the
 * system preference directly so it does not interfere with the main Agents
 * form's dirty-state / save bar.
 */
export default function PersonalIntegrationsToggle() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    System.keys()
      .then((res) => setEnabled(res?.PersonalIntegrationsEnabled !== false))
      .finally(() => setLoading(false));
  }, []);

  async function toggleEnabled(next) {
    setEnabled(next);
    await Admin.updateSystemPreferences({
      personal_integrations_enabled: String(next),
    });
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center gap-x-1">
        <label className="block text-md font-medium text-zinc-50 light:text-slate-900">
          {t("agent.settings.personalIntegrations.title")}
        </label>
      </div>
      <div className="flex items-center gap-x-4">
        <p className="text-xs text-zinc-400 light:text-slate-600 flex-1">
          {t("agent.settings.personalIntegrations.description")}
        </p>
        {loading ? (
          <CircleNotch
            size={16}
            className="shrink-0 animate-spin text-zinc-400 light:text-slate-600"
          />
        ) : (
          <Toggle
            size="lg"
            name="personalIntegrationsEnabled"
            enabled={enabled}
            onChange={toggleEnabled}
          />
        )}
      </div>
    </div>
  );
}
