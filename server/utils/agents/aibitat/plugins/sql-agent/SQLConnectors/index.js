/**
 * @typedef {('postgresql'|'mysql'|'sql-server')} SQLEngine
 */

/**
 * @typedef {Object} QueryResult
 * @property {[number]} rows - The query result rows
 * @property {number} count - Number of rows the query returned/changed
 * @property {string|null} error - Error string if there was an issue
 */

/**
 * A valid database SQL connection object
 * @typedef {Object} SQLConnection
 * @property {string} database_id - Unique identifier of the database connection
 * @property {SQLEngine} engine - Engine used by connection
 * @property {string} connectionString - RFC connection string for db
 */

/**
 * @param {SQLEngine} identifier
 * @param {object} connectionConfig
 * @returns Database Connection Engine Class for SQLAgent or throws error
 */
function getDBClient(identifier = "", connectionConfig = {}) {
  switch (identifier) {
    case "mysql":
      const { MySQLConnector } = require("./MySQL");
      return new MySQLConnector(connectionConfig);
    case "postgresql":
      const { PostgresSQLConnector } = require("./Postgresql");
      return new PostgresSQLConnector(connectionConfig);
    case "sql-server":
      const { MSSQLConnector } = require("./MSSQL");
      return new MSSQLConnector(connectionConfig);
    default:
      throw new Error(
        `There is no supported database connector for ${identifier}`
      );
  }
}

/**
 * Lists the database connections available to the agent in a workspace.
 * Connections are workspace-scoped, so a chat only sees the databases its
 * owner connected - never the ones of another chat.
 * @param {number|null} workspaceId
 * @returns {Promise<[SQLConnection]>}
 */
async function listSQLConnections(workspaceId = null) {
  if (!workspaceId) return [];
  const {
    WorkspaceSQLConnector,
  } = require("../../../../../../models/workspaceSQLConnector");
  return WorkspaceSQLConnector.forAgent(workspaceId);
}

/**
 * Answer for the tools when the workspace owner has not connected a database
 * yet - the model should ask the user to add one instead of guessing.
 */
const NO_CONNECTIONS_MESSAGE =
  "No SQL databases are connected to this workspace yet. The user can add one in the workspace settings in the 'SQL databases' tab.";

/**
 * Workspace id of the running agent invocation, used to scope the tools to the
 * chat the user is talking in.
 * @param {object|null} handlerProps AIbitat handler props
 * @returns {number|null}
 */
function workspaceIdFrom(handlerProps = null) {
  const invocation = handlerProps?.invocation ?? {};
  return invocation?.workspace?.id ?? invocation?.workspace_id ?? null;
}

/**
 * Validates a SQL connection by attempting to connect and run a simple query
 * @param {SQLEngine} identifier - The SQL engine type
 * @param {object} connectionConfig - The connection configuration
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function validateConnection(identifier = "", connectionConfig = {}) {
  try {
    const client = getDBClient(identifier, connectionConfig);
    return await client.validateConnection();
  } catch {
    console.log(`Failed to connect to ${identifier} database.`);
    return {
      success: false,
      error: `Unable to connect to ${identifier}. Please verify your connection details.`,
    };
  }
}

module.exports = {
  getDBClient,
  listSQLConnections,
  workspaceIdFrom,
  validateConnection,
  NO_CONNECTIONS_MESSAGE,
};
