import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusCircle } from "@phosphor-icons/react";
import WorkspaceSQLConnector from "@/models/workspaceSQLConnector";
import Modal, {
  ModalDangerButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import showToast from "@/utils/toast";
import SQLConnectorCard from "./SQLConnectorCard";
import SQLConnectorForm from "./SQLConnectorForm";

/**
 * Workspace settings tab where a user connects their own SQL databases. The
 * connections are exposed to the agent as the `sql-*` tools only in this
 * workspace, so other chats never see them.
 */
export default function SQLConnectors({ slug }) {
  const { t } = useTranslation();
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | connector
  const [deleting, setDeleting] = useState(null);

  const refresh = async () => {
    const list = await WorkspaceSQLConnector.list(slug);
    setConnectors(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [slug]);

  const handleToggle = async (connector) => {
    const { connector: updated, error } = await WorkspaceSQLConnector.update(
      slug,
      connector.id,
      { enabled: !connector.enabled }
    );
    if (!updated)
      return showToast(error || t("sqlConnector.saveError"), "error", {
        clear: true,
      });
    setConnectors((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry))
    );
  };

  const handleTest = async (connector) => {
    const result = await WorkspaceSQLConnector.testSaved(slug, connector.id);
    if (!result.success) {
      showToast(
        `${t("sqlConnector.testFailed")}: ${result.error ?? ""}`,
        "error",
        { clear: true }
      );
    } else {
      showToast(t("sqlConnector.testOk"), "success");
    }
    await refresh();
  };

  const handleDelete = async () => {
    const { success, error } = await WorkspaceSQLConnector.remove(
      slug,
      deleting.id
    );
    if (!success) {
      showToast(error || t("sqlConnector.saveError"), "error", {
        clear: true,
      });
      return;
    }
    setDeleting(null);
    await refresh();
  };

  return (
    <div
      className="w-full relative flex flex-col gap-y-6"
      data-tour="sql-connectors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-y-1 max-w-3xl">
          <h2 className="text-white light:text-slate-900 text-lg font-semibold">
            {t("sqlConnector.title")}
          </h2>
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("sqlConnector.description")}
          </p>
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("sqlConnector.multiHint")}
          </p>
          <p className="text-white/40 light:text-slate-500 text-xs">
            {t("sqlConnector.agentHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({})}
          className="shrink-0 flex items-center gap-x-2 h-[34px] px-4 rounded-lg text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white hover:opacity-80 transition-all duration-200"
        >
          <PlusCircle size={16} weight="bold" />
          {t("sqlConnector.add")}
        </button>
      </div>

      {loading ? null : connectors.length === 0 ? (
        <div className="w-full rounded-lg border border-dashed border-white/15 light:border-slate-300 p-8 text-center">
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("sqlConnector.empty")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-y-3">
          {connectors.map((connector) => (
            <SQLConnectorCard
              key={connector.id}
              connector={connector}
              onEdit={() => setEditing(connector)}
              onDelete={() => setDeleting(connector)}
              onTest={() => handleTest(connector)}
              onToggle={() => handleToggle(connector)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SQLConnectorForm
          slug={slug}
          connector={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm">
        <div className="flex flex-col gap-y-2">
          <h3 className="text-base font-semibold text-slate-50 light:text-slate-900">
            {t("sqlConnector.deleteTitle")}
          </h3>
          <p className="text-sm text-zinc-400 light:text-slate-600">
            {t("sqlConnector.deleteMessage", { name: deleting?.name })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-x-2">
          <ModalSecondaryButton type="button" onClick={() => setDeleting(null)}>
            {t("sqlConnector.cancel")}
          </ModalSecondaryButton>
          <ModalDangerButton type="button" onClick={handleDelete}>
            {t("sqlConnector.remove")}
          </ModalDangerButton>
        </div>
      </Modal>
    </div>
  );
}
