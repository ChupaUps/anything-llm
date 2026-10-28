const prisma = require("../utils/prisma");
const { EncryptionManager } = require("../utils/EncryptionManager");
const slugify = require("slugify");

let encryption = null;

/**
 * Connection strings contain credentials, so they are encrypted with the
 * instance-wide SIG_KEY/SIG_SALT pair instead of being stored in plain text.
 * @returns {EncryptionManager}
 */
function encryptionManager() {
  if (!encryption) encryption = new EncryptionManager();
  return encryption;
}

/**
 * Workspace SQL connectors - databases a workspace owner connected so the
 * sql-agent can answer questions about their own data. Connections are scoped
 * to a workspace, so a chat never sees the databases of another chat.
 */
const WorkspaceSQLConnector = {
  ENGINES: ["postgresql", "mysql", "sql-server"],
  MAX_PER_WORKSPACE: 10,

  /**
   * Row prepared for a request: the encrypted connection string is replaced by
   * a readable target and a flag, the credentials never leave the server.
   * @param {object|null} connector
   * @returns {object|null}
   */
  toPublic(connector = null) {
    if (!connector) return null;
    const { connection_string, ...rest } = connector;
    return {
      ...rest,
      hasConnection: Boolean(connection_string),
      target: this.describeTarget(connector),
    };
  },

  /**
   * Human readable "host / port / database" of a saved connection.
   * @param {object|null} connector
   * @returns {string|null}
   */
  describeTarget(connector = null) {
    const connectionString = this.connectionStringOf(connector);
    if (!connectionString) return null;
    try {
      const url = new URL(connectionString);
      const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      return [url.hostname, url.port, database].filter(Boolean).join(" / ");
    } catch {
      return null;
    }
  },

  /**
   * Decrypted connection string of a stored row, or null when the secret can
   * no longer be read (for example after a key rotation).
   * @param {object|null} connector
   * @returns {string|null}
   */
  connectionStringOf(connector = null) {
    if (!connector?.connection_string) return null;
    return encryptionManager().decrypt(connector.connection_string);
  },

  async where(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_sql_connectors.findMany({
      where: { workspace_id: Number(workspaceId) },
      orderBy: { id: "asc" },
    });
  },

  async enabled(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_sql_connectors.findMany({
      where: { workspace_id: Number(workspaceId), enabled: true },
      orderBy: { id: "asc" },
    });
  },

  async hasEnabled(workspaceId = null) {
    if (!workspaceId) return false;
    const count = await prisma.workspace_sql_connectors.count({
      where: { workspace_id: Number(workspaceId), enabled: true },
    });
    return count > 0;
  },

  async get({ id = null, workspaceId = null } = {}) {
    if (!id || !workspaceId) return null;
    return prisma.workspace_sql_connectors.findFirst({
      where: { id: Number(id), workspace_id: Number(workspaceId) },
    });
  },

  async byDatabaseId({ workspaceId = null, databaseId = "" } = {}) {
    if (!workspaceId || !databaseId) return null;
    return prisma.workspace_sql_connectors.findFirst({
      where: {
        workspace_id: Number(workspaceId),
        database_id: String(databaseId),
      },
    });
  },

  /**
   * Connections in the shape the sql-agent tools expect: the decrypted
   * connection string plus the identifier the model passes back.
   * @param {number|null} workspaceId
   * @returns {Promise<Array<{database_id: string, engine: string, connectionString: string, schema: string|null, name: string, description: string|null}>>}
   */
  async forAgent(workspaceId = null) {
    const connectors = await this.enabled(workspaceId);
    return connectors
      .map((connector) => ({
        database_id: connector.database_id,
        engine: connector.engine,
        connectionString: this.connectionStringOf(connector),
        schema: connector.schema || null,
        name: connector.name,
        description: connector.description || null,
      }))
      .filter((connector) => !!connector.connectionString);
  },

  /**
   * Agent-facing identifier derived from the display name. Cyrillic and other
   * non-latin names are transliterated so the model gets a stable latin id.
   * @param {string} name
   * @returns {string}
   */
  databaseIdFor(name = "") {
    const slug = slugify(String(name || ""), {
      lower: true,
      strict: true,
      trim: true,
    });
    return slug || "database";
  },

  /**
   * Slug of the name that is not taken in the workspace yet.
   * @param {{workspaceId: number, name: string, excludeId?: number|null}} params
   * @returns {Promise<string>}
   */
  async uniqueDatabaseId({ workspaceId = null, name = "", excludeId = null }) {
    const base = this.databaseIdFor(name);
    const taken = await prisma.workspace_sql_connectors.findMany({
      where: {
        workspace_id: Number(workspaceId),
        ...(excludeId ? { id: { not: Number(excludeId) } } : {}),
      },
      select: { database_id: true },
    });
    const used = new Set(taken.map((row) => row.database_id));
    if (!used.has(base)) return base;

    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  },

  /**
   * Validates and normalizes user input into database columns.
   * @param {object} data request body
   * @param {{existing?: object|null, requireName?: boolean, requireConnection?: boolean}} opts
   * @returns {{fields: object|null, error: string|null}}
   */
  prepareFields(
    data = {},
    { existing = null, requireName = true, requireConnection = true } = {}
  ) {
    const fields = { lastUpdatedAt: new Date() };

    if (data.name !== undefined)
      fields.name = String(data.name || "")
        .trim()
        .slice(0, 100);
    if (data.description !== undefined)
      fields.description =
        String(data.description || "")
          .trim()
          .slice(0, 500) || null;
    if (data.engine !== undefined)
      fields.engine = this.ENGINES.includes(data.engine) ? data.engine : null;

    if (data.schema !== undefined)
      fields.schema =
        String(data.schema || "")
          .trim()
          .slice(0, 100) || null;

    if (data.connectionString !== undefined) {
      const raw = String(data.connectionString || "").trim();
      if (raw.length > 0) {
        if (!/^[a-z0-9+.-]+:\/\//i.test(raw))
          return {
            fields: null,
            error:
              "Строка подключения должна быть в формате engine://user:password@host:port/database",
          };
        const encrypted = encryptionManager().encrypt(raw);
        if (!encrypted)
          return {
            fields: null,
            error: "Не удалось зашифровать строку подключения",
          };
        fields.connection_string = encrypted;
      } else if (data.connectionString === null)
        fields.connection_string = null;
    }

    if (data.enabled !== undefined) fields.enabled = Boolean(data.enabled);

    const name = fields.name ?? existing?.name ?? "";
    if (requireName && !String(name).trim())
      return { fields: null, error: "Укажите название подключения" };

    const engine = fields.engine ?? existing?.engine ?? "";
    if (!engine) return { fields: null, error: "Выберите тип базы данных" };

    const hasConnection = Boolean(
      fields.connection_string ?? existing?.connection_string
    );
    if (requireConnection && !hasConnection)
      return { fields: null, error: "Укажите параметры подключения" };

    // The PostgreSQL schema is the only engine specific option; other engines
    // ignore it so a stale value cannot survive an engine switch.
    if (engine !== "postgresql" && !data.schema) delete fields.schema;

    return { fields, error: null };
  },

  /**
   * @param {{workspaceId: number, data: object}} params
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  async create({ workspaceId = null, data = {} } = {}) {
    if (!workspaceId)
      return { connector: null, error: "Рабочее пространство не найдено" };

    const existing = await prisma.workspace_sql_connectors.count({
      where: { workspace_id: Number(workspaceId) },
    });
    if (existing >= this.MAX_PER_WORKSPACE)
      return {
        connector: null,
        error: `Достигнут лимит баз данных для пространства (${this.MAX_PER_WORKSPACE})`,
      };

    const { fields, error } = this.prepareFields(data);
    if (error) return { connector: null, error };

    fields.database_id = await this.uniqueDatabaseId({
      workspaceId,
      name: fields.name,
    });

    try {
      const connector = await prisma.workspace_sql_connectors.create({
        data: { workspace_id: Number(workspaceId), ...fields },
      });
      return { connector, error: null };
    } catch (error) {
      console.error("WorkspaceSQLConnector.create", error.message);
      if (error.code === "P2002")
        return {
          connector: null,
          error: "Подключение с таким названием уже существует",
        };
      return { connector: null, error: "Не удалось сохранить подключение" };
    }
  },

  /**
   * Connection parameters are never sent back to the browser, so an update
   * without `connectionString` only renames or toggles the saved connector.
   * @param {{id: number, workspaceId: number, data: object}} params
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  async update({ id = null, workspaceId = null, data = {} } = {}) {
    const existing = await this.get({ id, workspaceId });
    if (!existing) return { connector: null, error: "Подключение не найдено" };

    const { fields, error } = this.prepareFields(data, { existing });
    if (error) return { connector: null, error };

    if (fields.name !== undefined && fields.name !== existing.name)
      fields.database_id = await this.uniqueDatabaseId({
        workspaceId,
        name: fields.name,
        excludeId: existing.id,
      });

    try {
      const connector = await prisma.workspace_sql_connectors.update({
        where: { id: Number(id) },
        data: fields,
      });
      return { connector, error: null };
    } catch (error) {
      console.error("WorkspaceSQLConnector.update", error.message);
      if (error.code === "P2002")
        return {
          connector: null,
          error: "Подключение с таким названием уже существует",
        };
      return { connector: null, error: "Не удалось обновить подключение" };
    }
  },

  async remove({ id = null, workspaceId = null } = {}) {
    const existing = await this.get({ id, workspaceId });
    if (!existing) return { success: false, error: "Подключение не найдено" };

    try {
      await prisma.workspace_sql_connectors.delete({
        where: { id: Number(id) },
      });
      return { success: true, error: null };
    } catch (error) {
      console.error("WorkspaceSQLConnector.remove", error.message);
      return { success: false, error: "Не удалось удалить подключение" };
    }
  },

  /**
   * Attempts a real connection with the given credentials. Nothing is saved -
   * the settings form uses it to validate before submitting.
   * @param {{engine: string, connectionString: string}} params
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async validate({ engine = "", connectionString = "" } = {}) {
    if (!this.ENGINES.includes(engine))
      return { success: false, error: "Выберите тип базы данных" };
    if (!connectionString)
      return { success: false, error: "Укажите параметры подключения" };

    const {
      validateConnection,
    } = require("../utils/agents/aibitat/plugins/sql-agent/SQLConnectors");
    return validateConnection(engine, { connectionString });
  },

  /**
   * Runs a test against a saved connector and stores the outcome so the list
   * shows the current state.
   * @param {{connector: object}} params
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async test({ connector = null } = {}) {
    if (!connector) return { success: false, error: "Подключение не найдено" };
    const result = await this.validate({
      engine: connector.engine,
      connectionString: this.connectionStringOf(connector),
    });

    await prisma.workspace_sql_connectors
      .update({
        where: { id: Number(connector.id) },
        data: {
          last_status: result.success ? "ok" : "error",
          last_error: result.success ? null : result.error,
          last_checked_at: new Date(),
        },
      })
      .catch((error) =>
        console.error("WorkspaceSQLConnector.test", error.message)
      );

    return result;
  },
};

module.exports = { WorkspaceSQLConnector };
