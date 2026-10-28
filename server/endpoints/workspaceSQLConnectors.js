const { reqBody, multiUserMode, userFromSession } = require("../utils/http");
const { Workspace } = require("../models/workspace");
const { WorkspaceSQLConnector } = require("../models/workspaceSQLConnector");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { canManageWorkspaceData } = require("../utils/workspaces/personal");

/**
 * SQL connections are user data: a `default` user may only manage the
 * databases of a personal workspace they own, admins and managers may manage
 * any workspace.
 */
async function requireSQLConnectorAccess(request, response, next) {
  try {
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

/**
 * The sql-agent is attached per workspace, so its connections are managed by
 * the workspace owner here - never instance-wide from the admin settings.
 */
function workspaceSQLConnectorEndpoints(app) {
  if (!app) return;

  app.get(
    "/workspace/:slug/sql-connectors",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (_request, response) => {
      try {
        const connectors = await WorkspaceSQLConnector.where(
          response.locals.workspace.id
        );
        response.status(200).json({
          connectors: connectors.map((connector) =>
            WorkspaceSQLConnector.toPublic(connector)
          ),
          error: null,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/workspace/:slug/sql-connectors",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (request, response) => {
      try {
        const { connector, error } = await WorkspaceSQLConnector.create({
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ connector: null, error }).end();

        response
          .status(200)
          .json({
            connector: WorkspaceSQLConnector.toPublic(connector),
            error: null,
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // Validates the credentials currently in the form without saving them.
  app.post(
    "/workspace/:slug/sql-connectors/validate",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (request, response) => {
      try {
        const { engine, connectionString } = reqBody(request);
        const result = await WorkspaceSQLConnector.validate({
          engine,
          connectionString,
        });
        response.status(200).json(result).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/workspace/:slug/sql-connectors/:connectorId/test",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (request, response) => {
      try {
        const workspaceId = response.locals.workspace.id;
        const connector = await WorkspaceSQLConnector.get({
          id: request.params.connectorId,
          workspaceId,
        });
        if (!connector)
          return response
            .status(404)
            .json({ success: false, error: "Подключение не найдено" })
            .end();

        const result = await WorkspaceSQLConnector.test({ connector });
        const fresh = await WorkspaceSQLConnector.get({
          id: connector.id,
          workspaceId,
        });

        response
          .status(200)
          .json({
            success: result.success,
            error: result.error,
            connector: WorkspaceSQLConnector.toPublic(fresh),
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.put(
    "/workspace/:slug/sql-connectors/:connectorId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (request, response) => {
      try {
        const { connector, error } = await WorkspaceSQLConnector.update({
          id: request.params.connectorId,
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ connector: null, error }).end();

        response
          .status(200)
          .json({
            connector: WorkspaceSQLConnector.toPublic(connector),
            error: null,
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/workspace/:slug/sql-connectors/:connectorId",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      requireSQLConnectorAccess,
    ],
    async (request, response) => {
      try {
        const { success, error } = await WorkspaceSQLConnector.remove({
          id: request.params.connectorId,
          workspaceId: response.locals.workspace.id,
        });
        if (!success)
          return response.status(400).json({ success: false, error }).end();

        response.status(200).json({ success: true, error: null }).end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { workspaceSQLConnectorEndpoints };
