import { useTranslation } from "react-i18next";
import {
  ArrowsClockwise,
  CalendarBlank,
  Envelope,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";

const STATUS_STYLES = {
  ok: "bg-emerald-500",
  error: "bg-red-500",
};

const SCOPE_META = {
  "email:read": { icon: Envelope, key: "scopeEmailRead" },
  "email:draft": { icon: Envelope, key: "scopeEmailDraft" },
  "calendar:create": { icon: CalendarBlank, key: "scopeCalendarCreate" },
};

/**
 * One connected mail/calendar account shown in the Integrations list. Displays
 * the scope chips so a user can eyeball at a glance what the agent is allowed
 * to do with this mailbox.
 */
export default function IntegrationCard({
  integration,
  onEdit,
  onDelete,
  onTest,
  onToggle,
}) {
  const { t } = useTranslation();
  const checkedAt = integration.last_checked_at
    ? new Date(integration.last_checked_at).toLocaleString()
    : null;
  const scopes = integration.scopes ?? [];

  return (
    <div className="w-full rounded-lg border border-white/10 light:border-slate-300 bg-theme-bg-primary/40 p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-x-3 min-w-0">
        <div className="mt-0.5 p-2 rounded-lg bg-theme-settings-input-bg text-white/70 light:text-slate-600">
          <Envelope size={18} weight="bold" />
        </div>
        <div className="flex flex-col gap-y-1 min-w-0">
          <div className="flex items-center gap-x-2 flex-wrap">
            <span
              className={`text-sm font-semibold ${
                integration.enabled
                  ? "text-white light:text-slate-900"
                  : "text-white/40 light:text-slate-400 line-through"
              }`}
            >
              {integration.name}
            </span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-theme-settings-input-bg text-white/60 light:text-slate-600">
              {integration.providerMeta?.labelEn ?? integration.provider}
            </span>
          </div>
          <p className="text-xs text-white/60 light:text-slate-600 font-mono">
            {integration.account_email}
          </p>
          <div className="flex items-center gap-x-2 flex-wrap">
            {scopes.map((scope) => {
              const meta = SCOPE_META[scope];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <span
                  key={scope}
                  className="inline-flex items-center gap-x-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 light:text-sky-700 border border-sky-500/30"
                >
                  <Icon size={11} weight="bold" />
                  {t(`workspaceIntegrations.${meta.key}`)}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-x-2 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                STATUS_STYLES[integration.last_status] ?? "bg-zinc-500"
              }`}
            />
            <span className="text-white/50 light:text-slate-500">
              {integration.last_status === "ok"
                ? t("workspaceIntegrations.statusOk")
                : integration.last_status === "error"
                  ? t("workspaceIntegrations.statusError")
                  : t("workspaceIntegrations.statusNever")}
              {checkedAt ? ` · ${checkedAt}` : ""}
            </span>
            {integration.last_error && (
              <span
                className="text-red-400 truncate max-w-md"
                title={integration.last_error}
              >
                {integration.last_error}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-x-2 shrink-0">
        <label className="flex items-center gap-x-2 text-xs text-white/60 light:text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={integration.enabled}
            onChange={onToggle}
            className="accent-sky-500"
          />
          {t("workspaceIntegrations.enabled")}
        </label>
        <button
          type="button"
          onClick={onTest}
          title={t("workspaceIntegrations.test")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-theme-settings-input-bg transition-colors duration-200"
        >
          <ArrowsClockwise size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          title={t("workspaceIntegrations.editTitle")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-theme-settings-input-bg transition-colors duration-200"
        >
          <PencilSimple size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t("workspaceIntegrations.remove")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-200"
        >
          <Trash size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
