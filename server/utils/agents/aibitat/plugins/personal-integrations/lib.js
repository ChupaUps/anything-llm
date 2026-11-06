/**
 * Runtime helpers shared by the `personal-integrations` sub-tools.
 *
 * The agent only sees the workspaces it is running in and only for the scopes
 * the workspace owner ticked in the settings UI. Every helper reads the row
 * fresh from Prisma so a user can toggle a scope mid-chat without restarting
 * the aibitat handler.
 */

const {
  WorkspaceIntegration,
} = require("../../../../../models/workspaceIntegration");
const { SCOPES } = require("../../../../integrations/providerCatalog");

/** Same trick sql-agent uses to find its workspace from the aibitat handler. */
function workspaceIdFrom(handlerProps = null) {
  const invocation = handlerProps?.invocation ?? {};
  return invocation?.workspace?.id ?? invocation?.workspace_id ?? null;
}

/**
 * @returns {Promise<{integrations: object[], error: string|null}>}
 *   Enabled integrations of the workspace granting the given scope. When
 *   `preferredAccount` is set we filter to that address so a chat can pick a
 *   specific mailbox if the user has several attached.
 */
async function integrationsFor(handlerProps, scope, preferredAccount = null) {
  const workspaceId = workspaceIdFrom(handlerProps);
  if (!workspaceId)
    return { integrations: [], error: "Не удалось определить пространство" };
  const rows = await WorkspaceIntegration.withScope(workspaceId, scope);
  if (!rows.length)
    return {
      integrations: [],
      error: `В этом пространстве нет подключённых ящиков с доступом «${scope}».`,
    };
  if (preferredAccount) {
    const needle = String(preferredAccount).toLowerCase();
    const match = rows.filter(
      (r) => r.account_email.toLowerCase() === needle
    );
    if (!match.length)
      return {
        integrations: [],
        error: `Ящик ${preferredAccount} не подключён в этом пространстве.`,
      };
    return { integrations: match, error: null };
  }
  return { integrations: rows, error: null };
}

/** Renders a short one-liner describing the chosen account for user-visible logs. */
function describeAccount(integration) {
  return `${integration.name} <${integration.account_email}>`;
}

module.exports = {
  SCOPES,
  WorkspaceIntegration,
  workspaceIdFrom,
  integrationsFor,
  describeAccount,
};
