import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EnvelopeSimple, PlusCircle } from "@phosphor-icons/react";
import WorkspaceIntegration from "@/models/workspaceIntegration";
import Modal, {
  ModalDangerButton,
  ModalSecondaryButton,
} from "@/components/lib/Modal";
import showToast from "@/utils/toast";
import IntegrationCard from "./IntegrationCard";
import IntegrationForm from "./IntegrationForm";

/**
 * Workspace settings tab where the user attaches their own email / calendar
 * account. The agent picks these up as the `personal-integrations` tools for
 * this workspace only.
 *
 * Providers currently supported out of the box: Yandex 360 (mail + calendar via
 * IMAP/CalDAV with an app password) and Mail.ru (mail only). Google and
 * Microsoft require OAuth and are shipped in a follow-up; the backend catalog
 * already reserves their IDs so this page only has to render a new provider.
 */
export default function Integrations({ slug }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | integration
  const [deleting, setDeleting] = useState(null);

  const refresh = async () => {
    const [{ integrations }, providerList] = await Promise.all([
      WorkspaceIntegration.all(slug),
      WorkspaceIntegration.providers(),
    ]);
    setRows(integrations ?? []);
    setProviders(providerList ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [slug]);

  const labelForProvider = (meta) => {
    if (!meta) return "";
    return i18n.language?.startsWith("ru") ? meta.label : meta.labelEn ?? meta.label;
  };

  const handleToggle = async (row) => {
    const { integration: updated, error } = await WorkspaceIntegration.update(
      slug,
      row.id,
      { enabled: !row.enabled }
    );
    if (!updated) {
      showToast(error || t("workspaceIntegrations.saveError"), "error", {
        clear: true,
      });
      return;
    }
    setRows((cur) => cur.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleTest = async (row) => {
    const result = await WorkspaceIntegration.test(slug, row.id);
    if (!result.success)
      showToast(
        `${t("workspaceIntegrations.testFailed")}: ${result.error ?? ""}`,
        "error",
        { clear: true }
      );
    else showToast(t("workspaceIntegrations.testOk"), "success");
    await refresh();
  };

  const handleDelete = async () => {
    const { success, error } = await WorkspaceIntegration.remove(
      slug,
      deleting.id
    );
    if (!success) {
      showToast(error || t("workspaceIntegrations.saveError"), "error", {
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
      data-tour="workspace-integrations"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-x-3 max-w-3xl">
          <EnvelopeSimple
            size={24}
            className="text-theme-text-primary shrink-0 mt-1"
          />
          <div className="flex flex-col gap-y-1">
            <h2 className="text-white light:text-slate-900 text-lg font-semibold">
              {t("workspaceIntegrations.title")}
            </h2>
            <p className="text-white/60 light:text-slate-600 text-sm">
              {t("workspaceIntegrations.description")}
            </p>
            <p className="text-white/40 light:text-slate-500 text-xs">
              {t("workspaceIntegrations.hint")}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-tour="workspace-integrations-add"
          onClick={() => setEditing({})}
          className="shrink-0 flex items-center gap-x-2 h-[34px] px-4 rounded-lg text-sm font-medium bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white hover:opacity-80 transition-all duration-200"
        >
          <PlusCircle size={16} weight="bold" />
          {t("workspaceIntegrations.add")}
        </button>
      </div>

      {loading ? (
        <div className="text-white/60 light:text-slate-600 text-sm">
          {t("workspaceIntegrations.loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="w-full rounded-lg border border-dashed border-white/15 light:border-slate-300 p-8 text-center">
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("workspaceIntegrations.empty")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-y-3">
          {rows.map((row) => (
            <IntegrationCard
              key={row.id}
              integration={row}
              onEdit={() => setEditing(row)}
              onDelete={() => setDeleting(row)}
              onTest={() => handleTest(row)}
              onToggle={() => handleToggle(row)}
            />
          ))}
        </div>
      )}

      {editing && (
        <IntegrationForm
          slug={slug}
          integration={editing.id ? editing : null}
          providers={providers}
          labelForProvider={labelForProvider}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm">
        <div className="flex flex-col gap-y-2">
          <h3 className="text-base font-semibold text-slate-50 light:text-slate-900">
            {t("workspaceIntegrations.deleteTitle")}
          </h3>
          <p className="text-sm text-zinc-400 light:text-slate-600">
            {t("workspaceIntegrations.deleteMessage", {
              name: deleting?.name,
            })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-x-2">
          <ModalSecondaryButton type="button" onClick={() => setDeleting(null)}>
            {t("workspaceIntegrations.cancel")}
          </ModalSecondaryButton>
          <ModalDangerButton type="button" onClick={handleDelete}>
            {t("workspaceIntegrations.remove")}
          </ModalDangerButton>
        </div>
      </Modal>
    </div>
  );
}
