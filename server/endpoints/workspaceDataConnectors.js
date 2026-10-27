const { reqBody, multiUserMode, userFromSession } = require("../utils/http");
const { Workspace } = require("../models/workspace");
const { WorkspaceDataConnector } = require("../models/workspaceDataConnector");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { canManageWorkspaceData } = require("../utils/workspaces/personal");
const {
  fetchConnectorData,
  generateSchema,
} = require("../utils/workspaces/dataConnectorClient");

const MAX_SAMPLE_CHARS = 6000;

function sampleOf(data) {
  const serialized =
    typeof data === "string" ? data : JSON.stringify(data ?? null, null, 2);
  if (!serialized) return "";
  return serialized.length > MAX_SAMPLE_CHARS
    ? `${serialized.slice(0, MAX_SAMPLE_CHARS)}\n… обрезано`
    : serialized;
}

/**
 * Merges the values of the form with what is already stored, so a test can run
 * while the user edits a saved connection without retyping the key.
 */
function testTarget({ fields, stored, secret }) {
  return {
    url: fields.url ?? stored?.url,
    provider: fields.provider ?? stored?.provider ?? "generic",
    variant: fields.variant ?? stored?.variant ?? null,
    default_path: fields.default_path ?? stored?.default_path ?? null,
    auth_type: fields.auth_type ?? stored?.auth_type ?? "none",
    auth_username: fields.auth_username ?? stored?.auth_username ?? null,
    auth_key: fields.auth_key ?? stored?.auth_key ?? null,
    headers: fields.headers ?? stored?.headers ?? null,
    secret,
  };
}

/**
 * Connectors are user data: a `default` user may only manage the connectors of
 * a personal workspace they own, admins and managers may manage any workspace.
 */
async function requireConnectorAccess(request, response, next) {
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

function workspaceDataConnectorEndpoints(app) {
  if (!app) return;

  app.get(
    "/workspace/:slug/connectors",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (_request, response) => {
      try {
        const connectors = await WorkspaceDataConnector.where(
          response.locals.workspace.id
        );
        response.status(200).json({
          connectors: connectors.map((connector) =>
            WorkspaceDataConnector.toPublic(connector)
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
    "/workspace/:slug/connectors",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (request, response) => {
      try {
        const { connector, error } = await WorkspaceDataConnector.create({
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ connector: null, error }).end();

        response
          .status(200)
          .json({
            connector: WorkspaceDataConnector.toPublic(connector),
            error: null,
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.put(
    "/workspace/:slug/connectors/:connectorId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (request, response) => {
      try {
        const { connector, error } = await WorkspaceDataConnector.update({
          id: request.params.connectorId,
          workspaceId: response.locals.workspace.id,
          data: reqBody(request),
        });
        if (error)
          return response.status(400).json({ connector: null, error }).end();

        response
          .status(200)
          .json({
            connector: WorkspaceDataConnector.toPublic(connector),
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
    "/workspace/:slug/connectors/:connectorId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (request, response) => {
      try {
        const { success, error } = await WorkspaceDataConnector.remove({
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

  // Tests the configuration currently in the form. Nothing is saved, but the
  // generated schema is returned so the user can review and keep it.
  app.post(
    "/workspace/:slug/connectors/test",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (request, response) => {
      try {
        const body = reqBody(request);
        // A test can run on a half-filled form, so only the address is
        // required here - the name is validated when the connector is saved.
        const stored = body.connectorId
          ? await WorkspaceDataConnector.get({
              id: body.connectorId,
              workspaceId: response.locals.workspace.id,
            })
          : null;
        const { fields, error } = WorkspaceDataConnector.prepareFields(body, {
          existing: stored,
          requireName: false,
        });
        if (error)
          return response
            .status(400)
            .json({ success: false, error, sample: null, schema: null })
            .end();

        // A secret typed in the form is used as is; an already stored one is
        // reused when the user edits a connection without retyping the key.
        const secret = body.authSecret
          ? String(body.authSecret)
          : (WorkspaceDataConnector.withSecret(stored)?.secret ?? null);

        const result = await fetchConnectorData(
          testTarget({ fields, stored, secret })
        );

        response
          .status(200)
          .json({
            success: result.ok,
            status: result.status,
            durationMs: result.durationMs,
            url: result.url,
            sample: sampleOf(result.data),
            schema: result.ok ? generateSchema(result.data) : null,
            error: result.error,
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // Tests a saved connector: the stored key is used, the result (schema and
  // health) is written back so the settings page shows the current state.
  app.post(
    "/workspace/:slug/connectors/:connectorId/test",
    [validatedRequest, flexUserRoleValid([ROLES.all]), requireConnectorAccess],
    async (request, response) => {
      try {
        const workspaceId = response.locals.workspace.id;
        const connector = await WorkspaceDataConnector.get({
          id: request.params.connectorId,
          workspaceId,
        });
        if (!connector)
          return response
            .status(404)
            .json({ success: false, error: "Подключение не найдено" })
            .end();

        const result = await WorkspaceDataConnector.test({ connector });
        const fresh = await WorkspaceDataConnector.get({
          id: connector.id,
          workspaceId,
        });

        response
          .status(200)
          .json({
            success: result.ok,
            status: result.status,
            durationMs: result.durationMs,
            sample: sampleOf(result.data),
            schema: result.schema,
            error: result.error,
            connector: WorkspaceDataConnector.toPublic(fresh),
          })
          .end();
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { workspaceDataConnectorEndpoints };
