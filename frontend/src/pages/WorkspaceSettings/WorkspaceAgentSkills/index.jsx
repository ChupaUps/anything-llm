import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Robot } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import System from "@/models/system";
import showToast from "@/utils/toast";
import Toggle from "@/components/lib/Toggle";
import {
  getAppIntegrationSkills,
  getConfigurableSkills,
  getDefaultSkills,
} from "@/pages/Admin/Agents/skills";

// Skills the workspace itself wires up (through connectors) rather than the
// admin panel. They are always listed here so an admin can opt a workspace out
// even when its 1C/Bitrix24/SQL connectors are configured.
const WORKSPACE_SCOPED_SKILLS = {
  "external-data": {
    titleKey: "workspaceAgentSkills.externalData.title",
    fallbackTitle: "External data (1C / Bitrix24)",
    descriptionKey: "workspaceAgentSkills.externalData.description",
    fallbackDescription:
      "Live data pulled by the workspace's Data & API connections.",
  },
  "sql-agent": {
    titleKey: "workspaceAgentSkills.sqlAgent.title",
    fallbackTitle: "SQL databases",
    descriptionKey: "workspaceAgentSkills.sqlAgent.description",
    fallbackDescription:
      "Query tools exposed by the databases connected in this workspace.",
  },
  "personal-integrations": {
    titleKey: "workspaceAgentSkills.personalIntegrations.title",
    fallbackTitle: "Personal mail / calendar",
    descriptionKey: "workspaceAgentSkills.personalIntegrations.description",
    fallbackDescription:
      "Mail and calendar accounts the workspace owner attached on the Integrations tab.",
  },
};

/**
 * Per-workspace agent skill overrides. Every skill the admin has switched on
 * globally is on by default here; unchecking a switch pushes the key onto the
 * workspace's `disabledAgentSkills` list and the agent stops attaching it for
 * chats in this workspace only.
 */
export default function WorkspaceAgentSkills({ slug }) {
  const { t } = useTranslation();
  const [disabled, setDisabled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isMultiUser, setIsMultiUser] = useState(false);

  const defaultSkills = useMemo(() => getDefaultSkills(t), [t]);
  const configurableSkills = useMemo(
    () =>
      getConfigurableSkills(t, {
        // Availability probes are handled on the admin page; here we always
        // list every skill so the admin can opt a workspace out even before
        // the corresponding service is configured globally.
        fileSystemAgentAvailable: true,
        createFilesAgentAvailable: true,
        codeInterpreterAvailable: true,
        imageGenerationAvailable: true,
      }),
    [t]
  );
  const appIntegrationSkills = useMemo(() => getAppIntegrationSkills(t), [t]);

  useEffect(() => {
    async function load() {
      const [{ disabledSkills }, keys] = await Promise.all([
        Workspace.getAgentSkills(slug),
        System.keys(),
      ]);
      setDisabled(disabledSkills ?? []);
      setIsMultiUser(keys?.MULTI_USER_MODE === true);
      setLoading(false);
    }
    load();
  }, [slug]);

  async function persist(nextDisabled) {
    setSaving(true);
    const res = await Workspace.updateAgentSkills(slug, nextDisabled);
    if (res?.success === false) {
      showToast(t("workspaceAgentSkills.saveError"), "error", { clear: true });
      return false;
    }
    setDisabled(nextDisabled);
    return true;
  }

  async function handleToggle(key, nextEnabled) {
    // Enabled = not in disabled list. Toggle updates the set and immediately
    // saves; the panel is small enough that a manual save button would only
    // add friction.
    const alreadyDisabled = disabled.includes(key);
    if (alreadyDisabled === !nextEnabled) return;
    const next = nextEnabled
      ? disabled.filter((entry) => entry !== key)
      : [...new Set([...disabled, key])];
    await persist(next);
  }

  const sections = [
    {
      id: "default",
      label: t("workspaceAgentSkills.sections.default"),
      skills: Object.entries(defaultSkills).map(([key, meta]) => ({
        key,
        title: meta.title,
        description: meta.description,
      })),
    },
    {
      id: "configurable",
      label: t("workspaceAgentSkills.sections.configurable"),
      skills: Object.entries(configurableSkills)
        .filter(([key]) => !(isMultiUser && skillIsSingleUserOnly(key)))
        .map(([key, meta]) => ({
          key,
          title: meta.title,
          description: meta.description,
        })),
    },
    {
      id: "integrations",
      label: t("workspaceAgentSkills.sections.integrations"),
      skills: Object.entries(appIntegrationSkills)
        .filter(([key]) => !(isMultiUser && skillIsSingleUserOnly(key)))
        .map(([key, meta]) => ({
          key,
          title: meta.title,
          description: meta.description,
        })),
    },
    {
      id: "workspaceScoped",
      label: t("workspaceAgentSkills.sections.workspaceScoped"),
      skills: Object.entries(WORKSPACE_SCOPED_SKILLS).map(
        ([key, meta]) => ({
          key,
          title: t(meta.titleKey, meta.fallbackTitle),
          description: t(meta.descriptionKey, meta.fallbackDescription),
        })
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col gap-y-6" data-tour="workspace-agent-skills">
      <div className="flex items-start gap-x-3">
        <Robot size={24} className="text-theme-text-primary shrink-0 mt-1" />
        <div className="flex flex-col gap-y-1 max-w-3xl">
          <h2 className="text-white light:text-slate-900 text-lg font-semibold">
            {t("workspaceAgentSkills.title")}
          </h2>
          <p className="text-white/60 light:text-slate-600 text-sm">
            {t("workspaceAgentSkills.description")}
          </p>
          <p className="text-white/40 light:text-slate-500 text-xs">
            {t("workspaceAgentSkills.hint")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-white/60 light:text-slate-600 text-sm">
          {t("workspaceAgentSkills.loading")}
        </div>
      ) : (
        <div className="flex flex-col gap-y-8 max-w-3xl">
          {sections.map((section) =>
            section.skills.length === 0 ? null : (
              <div key={section.id} className="flex flex-col gap-y-3">
                <div className="text-white light:text-slate-900 text-sm font-semibold uppercase tracking-wide">
                  {section.label}
                </div>
                <div className="flex flex-col gap-y-3 rounded-lg border border-white/10 light:border-slate-200 p-4">
                  {section.skills.map((skill) => (
                    <Toggle
                      key={skill.key}
                      size="md"
                      variant="horizontal"
                      label={skill.title}
                      description={skill.description}
                      disabled={saving}
                      enabled={!disabled.includes(skill.key)}
                      onChange={(checked) => handleToggle(skill.key, checked)}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Gmail/Calendar/Outlook/scheduled-jobs are only offered in single-user mode
// upstream, so the workspace panel hides them when multi-user is active to
// match the admin skills page.
const SINGLE_USER_ONLY = new Set([
  "create-scheduled-job",
  "gmail-agent",
  "google-calendar-agent",
  "outlook-agent",
]);
function skillIsSingleUserOnly(key) {
  return SINGLE_USER_ONLY.has(key);
}
