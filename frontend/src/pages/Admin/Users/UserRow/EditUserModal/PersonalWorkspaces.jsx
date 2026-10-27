import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowSquareOut, Plus } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";

/**
 * Personal workspaces (chats) of a user inside the user settings dialog.
 * Every row links to the workspace itself and the `+` button adds one more
 * space whose slug is built from the login and never repeats.
 */
export default function PersonalWorkspaces({ user, limit, onLimitChange }) {
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    Admin.userWorkspaces(user.id).then((list) => {
      if (!active) return;
      setWorkspaces(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  const createWorkspace = async () => {
    setCreating(true);
    const { workspace, error } = await Admin.createUserWorkspace(user.id);
    setCreating(false);
    if (!workspace) {
      showToast(error || t("common.personalWorkspaces.createError"), "error", {
        clear: true,
      });
      return;
    }

    const created = [...workspaces, workspace];
    setWorkspaces(created);
    // The server raises the quota when the admin grants an extra space, so the
    // number in the dialog stays in sync until the form is submitted.
    if (created.length > Number(limit)) onLimitChange?.(created.length);
    showToast(
      t("common.personalWorkspaces.created", { slug: workspace.slug }),
      "success",
      { clear: true }
    );
  };

  return (
    <div className="flex flex-col gap-y-2 w-full">
      <div className="flex items-start justify-between gap-x-4">
        <div className="flex flex-col gap-y-1">
          <label className="text-theme-text-primary text-sm font-semibold">
            {t("common.personalWorkspaces.title")}
          </label>
          <p className="text-xs text-theme-text-secondary">
            {t("common.personalWorkspaces.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={createWorkspace}
          disabled={creating}
          title={t("common.personalWorkspaces.addHint")}
          className="shrink-0 flex items-center gap-x-1.5 h-[34px] px-3 text-xs font-semibold rounded-lg bg-zinc-800 light:bg-white border border-zinc-800 light:border-slate-300 text-theme-text-primary hover:bg-zinc-700 light:hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" weight="bold" />
          {t("common.personalWorkspaces.add")}
        </button>
      </div>

      <p className="text-xs text-theme-text-secondary">
        {t("common.personalWorkspaces.usage", {
          used: workspaces.length,
          limit,
        })}
      </p>

      {loading ? (
        <p className="text-xs text-theme-text-secondary">
          {t("common.loading")}
        </p>
      ) : workspaces.length === 0 ? (
        <p className="text-xs text-theme-text-secondary">
          {t("common.personalWorkspaces.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-y-1">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex items-center justify-between gap-x-3 rounded-lg border border-zinc-800 light:border-slate-200 px-3 py-2"
            >
              <div className="min-w-0 flex flex-col">
                <p className="text-xs font-medium text-theme-text-primary truncate">
                  {workspace.name}
                </p>
                <p className="text-[11px] text-theme-text-secondary truncate">
                  /workspace/{workspace.slug}
                </p>
              </div>
              <Link
                to={paths.workspace.chat(workspace.slug)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 flex items-center gap-x-1 text-xs font-medium text-theme-text-secondary hover:text-theme-text-primary"
              >
                <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
                {t("common.personalWorkspaces.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
