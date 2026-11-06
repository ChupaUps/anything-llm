const { reqBody, multiUserMode, userFromSession } = require("../utils/http");
const { Workspace } = require("../models/workspace");
const {
  WorkspaceIntegration,
} = require("../models/workspaceIntegration");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { canManageWorkspaceData } = require("../utils/workspaces/personal");
const {
  PROVIDERS,
} = require("../utils/integrations/providerCatalog");
const { testImapConnection } = require("../utils/integrations/imapClient");
const { SystemSettings } = require("../models/systemSettings");

/**
 * Instance-wide master switch managed from the admin Agents page. When it is
 * off nobody (members or admins) may read or mutate integrations, so the tab
 * effectively disappears for everyone.
 */
async function integrationsFeatureEnabled() {
  return (
    (await SystemSettings.getValueOrFallback(
      { label: "personal_integrations_enabled" },
      "true"
    )) === "true"
  );
}

/**
 * Integrations are personal user data: a `default` user may only manage their
 * own personal workspace, admins/managers may manage any workspace. Same rule
 * as data / SQL connectors so the UX stays consistent across tabs.
 */
async function requireIntegrationAccess(request, response, next) {
  try {
    if (!(await integrationsFeatureEnabled()))
      return response
        .status(403)
        .json({ success: false, error: "Интеграции отключены администратором" })
        .end();
    const user = await userFromSession(request, response);
    const { slug = "" } = request.params;
    const workspace = multiUserMode(response)
      ? await Workspace.getWithUser(user, { slug })
      : await Workspace.get({ slug });

    if (!workspace) return response.sendStatus(400).end();
    if (!canManageWorkspaceData(user, workspace))
      return response.sendStatus(401).end();

    response.locals.workspace = workspace;
    response.locals.user = user;
    next();
  } catch (e) {
    console.error(e.message, e);
    return response.sendStatus(500).end();
  }
}

function workspaceIntegrationEndpoints(app) {
  if (!app) return;

  // Static provider catalog the frontend uses to render the picker without a
  // round-trip per workspace. Kept here so adding a provider is one place.
  app.get(
    "/workspace/integrations/providers",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    (_request, response) => {
      response.status(200).json({
        success: true,
        providers: Object.values(PROVIDERS).map((p) =>
          WorkspaceIntegration.publicProviderMeta(p.id)
        ),
      });
    }
  );

  app.get(
    "/workspace/:slug/integrations",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireIntegrationAccess,
    ],
    async (_request, response) => {
      try {
        const rows = await WorkspaceIntegration.where(
          response.locals.workspace.id
        );
        response.status(200).json({
          integrations: rows.map((row) => WorkspaceIntegration.toPublic(row)),
          error: null,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/workspace/:slug/integrations",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireIntegrationAccess,
    ],
    async (request, response) => {
      try {
        const { integration, error } = await WorkspaceIntegration.create({
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ integration: null, error }).end();
        response.status(200).json({
          integration: WorkspaceIntegration.toPublic(integration),
          error: null,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.put(
    "/workspace/:slug/integrations/:integrationId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireIntegrationAccess,
    ],
    async (request, response) => {
      try {
        const { integration, error } = await WorkspaceIntegration.update({
          id: request.params.integrationId,
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ integration: null, error }).end();
        response.status(200).json({
          integration: WorkspaceIntegration.toPublic(integration),
          error: null,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/workspace/:slug/integrations/:integrationId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireIntegrationAccess,
    ],
    async (request, response) => {
      try {
        const { success, error } = await WorkspaceIntegration.remove({
          id: request.params.integrationId,
          workspaceId: response.locals.workspace.id,
        });
        if (!success)
          return response.status(400).json({ success: false, error }).end();
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // Verifies credentials by opening an IMAP session. When the form passes a
  // plaintext `appPassword` we use it as-is (unsaved test); otherwise we reuse
  // the stored one and update the row's health fields.
  app.post(
    "/workspace/:slug/integrations/:integrationId/test",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireIntegrationAccess,
    ],
    async (request, response) => {
      try {
        const body = reqBody(request);
        const workspaceId = response.locals.workspace.id;
        const stored = await WorkspaceIntegration.get({
          id: request.params.integrationId,
          workspaceId,
        });
        if (!stored)
          return response
            .status(404)
            .json({ success: false, error: "Интеграция не найдена" })
            .end();

        const plaintext =
          typeof body.appPassword === "string" && body.appPassword.length > 0
            ? body.appPassword
            : null;
        const row = WorkspaceIntegration.withSecret(stored);
        const result = plaintext
          ? await testImapConnection({
              host: row.imap_host,
              port: row.imap_port,
              user: row.auth_user,
              password: plaintext,
            })
          : await WorkspaceIntegration.test({ integration: stored });

        const fresh = await WorkspaceIntegration.get({
          id: stored.id,
          workspaceId,
        });
        response.status(200).json({
          success: result.success,
          error: result.error,
          integration: WorkspaceIntegration.toPublic(fresh),
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { workspaceIntegrationEndpoints };
