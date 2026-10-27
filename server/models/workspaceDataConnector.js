const prisma = require("../utils/prisma");
const { EncryptionManager } = require("../utils/EncryptionManager");
const {
  parseConnectorUrl,
  fetchConnectorData,
  generateSchema,
  splitBitrixWebhookUrl,
} = require("../utils/workspaces/dataConnectorClient");

let encryption = null;

/**
 * Secrets are encrypted with the instance-wide SIG_KEY/SIG_SALT pair, so a
 * database dump alone does not expose customer API keys.
 * @returns {EncryptionManager}
 */
function encryptionManager() {
  if (!encryption) encryption = new EncryptionManager();
  return encryption;
}

/**
 * Workspace data connectors - external REST systems (1C, Bitrix24, anything
 * else) a workspace owner added so the agent can pull live data on demand.
 */
const WorkspaceDataConnector = {
  PROVIDERS: ["1c", "bitrix24", "generic"],
  // Bitrix24 grants access in two ways: an inbound webhook that carries the
  // token inside the address, or an OAuth application token passed as `auth`.
  VARIANTS: { bitrix24: ["webhook", "oauth"] },
  AUTH_TYPES: ["none", "bearer", "basic", "header", "query"],
  MAX_PER_WORKSPACE: 25,

  toPublic(connector = null) {
    if (!connector) return null;
    const { auth_secret, ...rest } = connector;
    return { ...rest, hasSecret: Boolean(auth_secret) };
  },

  /**
   * Connector row prepared for a request: secret decrypted into `secret`.
   * @param {object|null} connector
   * @returns {object|null}
   */
  withSecret(connector = null) {
    if (!connector) return null;
    let secret = null;
    if (connector.auth_secret) {
      try {
        secret = encryptionManager().decrypt(connector.auth_secret);
      } catch (error) {
        console.error("WorkspaceDataConnector.decrypt", error.message);
      }
    }
    return { ...connector, secret };
  },

  async where(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_data_connectors.findMany({
      where: { workspace_id: Number(workspaceId) },
      orderBy: { id: "asc" },
    });
  },

  async enabled(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_data_connectors.findMany({
      where: { workspace_id: Number(workspaceId), enabled: true },
      orderBy: { id: "asc" },
    });
  },

  async hasEnabled(workspaceId = null) {
    if (!workspaceId) return false;
    const count = await prisma.workspace_data_connectors.count({
      where: { workspace_id: Number(workspaceId), enabled: true },
    });
    return count > 0;
  },

  async get({ id = null, workspaceId = null } = {}) {
    if (!id || !workspaceId) return null;
    return prisma.workspace_data_connectors.findFirst({
      where: { id: Number(id), workspace_id: Number(workspaceId) },
    });
  },

  async byName({ workspaceId = null, name = "" } = {}) {
    if (!workspaceId || !name) return null;
    const connectors = await this.enabled(workspaceId);
    const needle = String(name).trim().toLowerCase();
    return (
      connectors.find((connector) => connector.name.toLowerCase() === needle) ||
      null
    );
  },

  /**
   * Finds the connector the model meant. Names are matched exactly first, then
   * by a unique substring, and finally by provider (`1С`, `Битрикс24`), so the
   * agent does not fail on a shortened name.
   * @param {object[]} connectors enabled connectors of the workspace
   * @param {string} needle connector name, id or provider keyword
   * @returns {{connector: object|null, error: string|null}}
   */
  resolve(connectors = [], needle = "") {
    const query = String(needle || "")
      .trim()
      .toLowerCase();
    const names = connectors
      .map((connector) => `"${connector.name}"`)
      .join(", ");
    if (!query)
      return { connector: null, error: `Укажите подключение: ${names}.` };

    const exact = connectors.find(
      (connector) => connector.name.toLowerCase() === query
    );
    if (exact) return { connector: exact, error: null };

    const byId = connectors.find((connector) => String(connector.id) === query);
    if (byId) return { connector: byId, error: null };

    const partial = connectors.filter((connector) =>
      connector.name.toLowerCase().includes(query)
    );
    if (partial.length === 1) return { connector: partial[0], error: null };

    const providerAliases = {
      "1c": ["1c", "1с", "1c-odata", "odata", "1с odata"],
      bitrix24: ["bitrix24", "bitrix", "b24", "битрикс", "битрикс24"],
    };
    const byProvider = connectors.filter((connector) =>
      (providerAliases[connector.provider] || [connector.provider]).includes(
        query
      )
    );
    if (byProvider.length === 1)
      return { connector: byProvider[0], error: null };
    if (byProvider.length > 1)
      return {
        connector: null,
        error: `К системе подходит несколько подключений: ${byProvider
          .map((connector) => `"${connector.name}"`)
          .join(", ")}. Уточните название.`,
      };

    return {
      connector: null,
      error: `Подключение "${needle}" не найдено. Доступны: ${names}.`,
    };
  },

  /**
   * Validates and normalizes user input into database columns.
   * @param {object} data request body
   * @param {{existing?: object|null, requireName?: boolean}} opts
   * @returns {{fields: object|null, error: string|null}}
   */
  prepareFields(data = {}, { existing = null, requireName = true } = {}) {
    const fields = { lastUpdatedAt: new Date() };

    if (data.name !== undefined) fields.name = String(data.name || "").trim();
    if (data.description !== undefined)
      fields.description =
        String(data.description || "")
          .trim()
          .slice(0, 500) || null;
    if (data.provider !== undefined)
      fields.provider = this.PROVIDERS.includes(data.provider)
        ? data.provider
        : "generic";
    if (data.variant !== undefined)
      fields.variant =
        String(data.variant || "")
          .trim()
          .slice(0, 32) || null;
    if (data.defaultPath !== undefined)
      fields.default_path =
        String(data.defaultPath || "")
          .trim()
          .slice(0, 300) || null;

    if (data.url !== undefined) {
      try {
        fields.url = parseConnectorUrl(data.url).href;
      } catch (error) {
        return { fields: null, error: error.message };
      }
    }

    if (data.authType !== undefined)
      fields.auth_type = this.AUTH_TYPES.includes(data.authType)
        ? data.authType
        : "none";
    if (data.authUsername !== undefined)
      fields.auth_username =
        String(data.authUsername || "")
          .trim()
          .slice(0, 200) || null;
    if (data.authKey !== undefined)
      fields.auth_key =
        String(data.authKey || "")
          .trim()
          .slice(0, 200) || null;

    // An empty secret keeps the stored one (the UI never receives it back),
    // `null` explicitly clears it.
    if (data.authSecret !== undefined) {
      const raw = data.authSecret === null ? "" : String(data.authSecret);
      if (raw.length > 0) {
        if (raw.length > 4000)
          return { fields: null, error: "Ключ доступа слишком длинный" };
        const encrypted = encryptionManager().encrypt(raw);
        if (!encrypted)
          return { fields: null, error: "Не удалось зашифровать ключ доступа" };
        fields.auth_secret = encrypted;
      } else if (data.authSecret === null) fields.auth_secret = null;
    }

    if (data.headers !== undefined) {
      const headers = data.headers ?? null;
      if (headers === null || headers === "") fields.headers = null;
      else if (typeof headers === "object")
        fields.headers = JSON.stringify(headers);
      else {
        try {
          const parsed = JSON.parse(headers);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("not an object");
          fields.headers = JSON.stringify(parsed);
        } catch {
          return {
            fields: null,
            error: "Дополнительные заголовки должны быть JSON-объектом",
          };
        }
      }
    }

    if (data.responseSchema !== undefined) {
      const schema = data.responseSchema;
      if (schema === null || schema === "") fields.response_schema = null;
      else if (typeof schema === "object")
        fields.response_schema = JSON.stringify(schema);
      else {
        try {
          JSON.parse(schema);
          fields.response_schema = String(schema);
        } catch {
          return {
            fields: null,
            error: "JSON-схема должна быть валидным JSON",
          };
        }
      }
    }

    if (data.enabled !== undefined) fields.enabled = Boolean(data.enabled);

    // Provider and variant decide how the request is built, so they are
    // resolved before the provider specific normalization below.
    const provider = fields.provider ?? existing?.provider ?? "generic";
    const variants = this.VARIANTS[provider] ?? null;
    let variant =
      fields.variant ?? existing?.variant ?? (variants ? variants[0] : null);
    if (!variants) variant = null;
    else if (!variants.includes(variant)) variant = variants[0];
    fields.variant = variant;

    if (
      fields.url !== undefined &&
      provider === "bitrix24" &&
      variant === "webhook"
    ) {
      // Users usually paste a full webhook method address - the method is kept
      // as the default path instead of staying glued to the address.
      const split = splitBitrixWebhookUrl(fields.url);
      if (split.base !== fields.url) fields.url = split.base;
      if (
        split.method &&
        data.defaultPath === undefined &&
        fields.default_path === undefined
      )
        fields.default_path = split.method;
    }

    if (provider === "bitrix24") {
      if (variant === "webhook") {
        // The webhook token is already part of the address.
        fields.auth_type = "none";
      } else {
        // OAuth applications accept the token as the `auth` query parameter.
        fields.auth_type = "query";
        fields.auth_key = "auth";
      }
    }

    const name = fields.name ?? existing?.name ?? "";
    const url = fields.url ?? existing?.url ?? "";
    if (requireName && !String(name).trim())
      return { fields: null, error: "Укажите название подключения" };
    if (!String(url).trim())
      return { fields: null, error: "Укажите адрес подключения" };

    if (provider === "bitrix24" && variant === "webhook") {
      let pathname = "";
      try {
        pathname = new URL(url).pathname;
      } catch {
        /* the address was validated above */
      }
      if (!/\/rest\/[^/]+\/[^/]+/i.test(pathname))
        return {
          fields: null,
          error: "Адрес вебхука Битрикс24 должен содержать /rest/<ID>/<код>/",
        };
    }

    if (provider === "bitrix24" && variant === "oauth") {
      const hasSecret = Boolean(fields.auth_secret ?? existing?.auth_secret);
      if (!hasSecret)
        return {
          fields: null,
          error: "Укажите access_token приложения Битрикс24",
        };
    }

    const authType = fields.auth_type ?? existing?.auth_type ?? "none";
    if (
      ["header", "query"].includes(authType) &&
      !(fields.auth_key ?? existing?.auth_key)
    )
      return {
        fields: null,
        error:
          authType === "header"
            ? "Укажите имя заголовка для ключа"
            : "Укажите имя параметра для ключа",
      };

    return { fields, error: null };
  },

  /**
   * @param {{workspaceId: number, data: object}} params
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  async create({ workspaceId = null, data = {} } = {}) {
    if (!workspaceId)
      return { connector: null, error: "Рабочее пространство не найдено" };

    const existing = await prisma.workspace_data_connectors.count({
      where: { workspace_id: Number(workspaceId) },
    });
    if (existing >= this.MAX_PER_WORKSPACE)
      return {
        connector: null,
        error: `Достигнут лимит подключений для пространства (${this.MAX_PER_WORKSPACE})`,
      };

    const { fields, error } = this.prepareFields(data);
    if (error) return { connector: null, error };

    try {
      const connector = await prisma.workspace_data_connectors.create({
        data: { workspace_id: Number(workspaceId), ...fields },
      });
      return { connector, error: null };
    } catch (error) {
      console.error("WorkspaceDataConnector.create", error.message);
      if (error.code === "P2002")
        return {
          connector: null,
          error: "Подключение с таким названием уже существует",
        };
      return { connector: null, error: "Не удалось сохранить подключение" };
    }
  },

  /**
   * @param {{id: number, workspaceId: number, data: object}} params
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  async update({ id = null, workspaceId = null, data = {} } = {}) {
    const existing = await this.get({ id, workspaceId });
    if (!existing) return { connector: null, error: "Подключение не найдено" };

    const { fields, error } = this.prepareFields(data, { existing });
    if (error) return { connector: null, error };

    try {
      const connector = await prisma.workspace_data_connectors.update({
        where: { id: Number(id) },
        data: fields,
      });
      return { connector, error: null };
    } catch (error) {
      console.error("WorkspaceDataConnector.update", error.message);
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
      await prisma.workspace_data_connectors.delete({
        where: { id: Number(id) },
      });
      return { success: true, error: null };
    } catch (error) {
      console.error("WorkspaceDataConnector.remove", error.message);
      return { success: false, error: "Не удалось удалить подключение" };
    }
  },

  /**
   * Runs a test GET against a saved connector and stores the outcome.
   * @param {{connector: object, opts?: object}} params
   * @returns {Promise<object>} the fetch result plus a generated schema
   */
  async test({ connector = null, opts = {} } = {}) {
    if (!connector) return { ok: false, error: "Подключение не найдено" };
    const result = await fetchConnectorData(this.withSecret(connector), opts);
    const schema = result.ok ? generateSchema(result.data) : null;

    await prisma.workspace_data_connectors
      .update({
        where: { id: Number(connector.id) },
        data: {
          last_status: result.ok ? "ok" : "error",
          last_error: result.ok ? null : result.error,
          last_checked_at: new Date(),
          ...(schema ? { response_schema: schema } : {}),
        },
      })
      .catch((error) =>
        console.error("WorkspaceDataConnector.test", error.message)
      );

    return { ...result, schema };
  },
};

module.exports = { WorkspaceDataConnector };
