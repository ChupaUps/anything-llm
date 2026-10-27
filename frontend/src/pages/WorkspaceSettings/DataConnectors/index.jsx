import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusCircle } from "@phosphor-icons/react";
import WorkspaceDataConnector from "@/models/workspaceDataConnector";
import Modal, {
  ModalDangerButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import showToast from "@/utils/toast";
import ConnectorCard from "./ConnectorCard";
import ConnectorForm from "./ConnectorForm";

/**
 * Workspace settings tab where a user connects 1C, Bitrix24 or any other REST
 * system. Saved connectors are exposed to the agent as the `external-data`
 * tool, so the model can pull live records on demand.
 */
export default function DataConnectors({ slug }) {
  const { t } = useTranslation();
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | connector
  const [deleting, setDeleting] = useState(null);

  const refresh = async () => {
    const list = await WorkspaceDataConnector.list(slug);
    setConnectors(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [slug]);

  const handleToggle = async (connector) => {
    const { connector: updated, error } = await WorkspaceDataConnector.update(
      slug,
      connector.id,
      { enabled: !connector.enabled }
    );
    if (!updated)
      return showToast(error || t("dataConnector.saveError"), "error", {
        clear: true,
      });
    setConnectors((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry))
    );
  };

  const handleTest = async (connector) => {
    const result = await WorkspaceDataConnector.testSaved(slug, connector.id);
    if (!result.success) {
      showToast(
        `${t("dataConnector.testFailed")}: ${result.error ?? ""}`,
        "error",
        { clear: true }
      );
    } else {
      showToast(t("dataConnector.testOk"), "success");
    }
    await refresh();
  };

  const handleDelete = async () => {
    const { success, error } = await WorkspaceDataConnector.remove(
      slug,
      deleting.id
    );
    if (!success) {
      showToast(error || t("dataConnector.saveError"), "error", {
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
      data-tour="data-connectors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-y-1 max-w-3xl">
          <h2 className="text-white light:text-slate-900 text-lg font-semibold">
            {t("dataConnector.title")}
          </h2>
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("dataConnector.description")}
          </p>
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("dataConnector.multiHint")}
          </p>
          <p className="text-white/40 light:text-slate-500 text-xs">
            {t("dataConnector.agentHint")}
          </p>
        </div>
        <button
          type="button"
          data-tour="data-connectors-add"
          onClick={() => setEditing({})}
          className="shrink-0 flex items-center gap-x-2 h-[34px] px-4 rounded-lg text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white hover:opacity-80 transition-all duration-200"
        >
          <PlusCircle size={16} weight="bold" />
          {t("dataConnector.add")}
        </button>
      </div>

      {loading ? null : connectors.length === 0 ? (
        <div className="w-full rounded-lg border border-dashed border-white/15 light:border-slate-300 p-8 text-center">
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("dataConnector.empty")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-y-3">
          {connectors.map((connector) => (
            <ConnectorCard
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
        <ConnectorForm
          slug={slug}
          connector={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm">
        <div className="flex flex-col gap-y-2">
          <h3 className="text-base font-semibold text-slate-50 light:text-slate-900">
            {t("dataConnector.deleteTitle")}
          </h3>
          <p className="text-sm text-zinc-400 light:text-slate-600">
            {t("dataConnector.deleteMessage", { name: deleting?.name })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-x-2">
          <ModalSecondaryButton type="button" onClick={() => setDeleting(null)}>
            {t("dataConnector.cancel")}
          </ModalSecondaryButton>
          <ModalDangerButton type="button" onClick={handleDelete}>
            {t("dataConnector.remove")}
          </ModalDangerButton>
        </div>
      </Modal>
    </div>
  );
}
