import { useTranslation } from "react-i18next";
import {
  ArrowsClockwise,
  PencilSimple,
  Trash,
  Database,
} from "@phosphor-icons/react";
import PostgreSQLLogo from "@/pages/Admin/Agents/SQLConnectorSelection/icons/postgresql.png";
import MySQLLogo from "@/pages/Admin/Agents/SQLConnectorSelection/icons/mysql.png";
import MSSQLLogo from "@/pages/Admin/Agents/SQLConnectorSelection/icons/mssql.png";

export const DB_LOGOS = {
  postgresql: PostgreSQLLogo,
  mysql: MySQLLogo,
  "sql-server": MSSQLLogo,
};

const STATUS_STYLES = {
  ok: "bg-emerald-500",
  error: "bg-red-500",
};

/**
 * One SQL database connected to the workspace in the settings list.
 */
export default function SQLConnectorCard({
  connector,
  onEdit,
  onDelete,
  onTest,
  onToggle,
}) {
  const { t } = useTranslation();
  const checkedAt = connector.last_checked_at
    ? new Date(connector.last_checked_at).toLocaleString()
    : null;

  return (
    <div className="w-full rounded-lg border border-white/10 light:border-slate-300 bg-theme-bg-primary/40 p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-x-3 min-w-0">
        {DB_LOGOS[connector.engine] ? (
          <img
            src={DB_LOGOS[connector.engine]}
            alt={connector.engine}
            className="mt-0.5 w-9 h-9 rounded-md object-contain"
          />
        ) : (
          <div className="mt-0.5 p-2 rounded-lg bg-theme-settings-input-bg text-white/70 light:text-slate-600">
            <Database size={18} weight="bold" />
          </div>
        )}
        <div className="flex flex-col gap-y-1 min-w-0">
          <div className="flex items-center gap-x-2 flex-wrap">
            <span
              className={`text-sm font-semibold ${
                connector.enabled
                  ? "text-white light:text-slate-900"
                  : "text-white/40 light:text-slate-400 line-through"
              }`}
            >
              {connector.name}
            </span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-theme-settings-input-bg text-white/60 light:text-slate-600">
              {connector.engine}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-settings-input-bg text-white/50 light:text-slate-500 font-mono">
              {connector.database_id}
            </span>
            {connector.description && (
              <span className="text-xs text-white/50 light:text-slate-500 truncate">
                {connector.description}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 light:text-slate-500 font-mono truncate max-w-xl">
            {connector.target || t("sqlConnector.targetHidden")}
          </p>
          <div className="flex items-center gap-x-2 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                STATUS_STYLES[connector.last_status] ?? "bg-zinc-500"
              }`}
            />
            <span className="text-white/50 light:text-slate-500">
              {connector.last_status === "ok"
                ? t("sqlConnector.statusOk")
                : connector.last_status === "error"
                  ? t("sqlConnector.statusError")
                  : t("sqlConnector.statusNever")}
              {checkedAt ? ` · ${checkedAt}` : ""}
            </span>
            {connector.last_error && (
              <span
                className="text-red-400 truncate max-w-md"
                title={connector.last_error}
              >
                {connector.last_error}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-x-2 shrink-0">
        <label className="flex items-center gap-x-2 text-xs text-white/60 light:text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={connector.enabled}
            onChange={onToggle}
            className="accent-sky-500"
          />
          {t("sqlConnector.enabled")}
        </label>
        <button
          type="button"
          onClick={onTest}
          title={t("sqlConnector.test")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-theme-settings-input-bg transition-colors duration-200"
        >
          <ArrowsClockwise size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          title={t("sqlConnector.editTitle")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:bg-theme-settings-input-bg transition-colors duration-200"
        >
          <PencilSimple size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title={t("sqlConnector.remove")}
          className="p-2 rounded-lg text-white/60 light:text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-200"
        >
          <Trash size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
