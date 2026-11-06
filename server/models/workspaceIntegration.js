const prisma = require("../utils/prisma");
const { EncryptionManager } = require("../utils/EncryptionManager");
const {
  PROVIDERS,
  SCOPES,
  providerById,
} = require("../utils/integrations/providerCatalog");

let encryption = null;

/**
 * App passwords are encrypted with SIG_KEY/SIG_SALT so a database dump never
 * exposes a user's mailbox to whoever holds the file.
 * @returns {EncryptionManager}
 */
function encryptionManager() {
  if (!encryption) encryption = new EncryptionManager();
  return encryption;
}

/** Parse the stored JSON scope list, ignoring anything malformed. */
function parseScopes(raw = "[]") {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key) => Object.values(SCOPES).includes(key));
  } catch {
    return [];
  }
}

/**
 * Personal email / calendar accounts a user attached to their own workspace.
 * Rows are scoped to the workspace so the agent never reaches into another
 * person's mailbox, and every row carries its own scope list so a user can,
 * for example, allow reading mail but forbid drafting.
 */
const WorkspaceIntegration = {
  MAX_PER_WORKSPACE: 8,
  SCOPES,
  PROVIDERS,

  toPublic(integration = null) {
    if (!integration) return null;
    const { app_password, ...rest } = integration;
    return {
      ...rest,
      scopes: parseScopes(integration.scopes),
      hasPassword: Boolean(app_password),
      providerMeta: this.publicProviderMeta(integration.provider),
    };
  },

  /** Everything the UI needs to render a card without leaking the secret. */
  publicProviderMeta(id = null) {
    const provider = providerById(id);
    if (!provider) return null;
    return {
      id: provider.id,
      label: provider.label,
      labelEn: provider.labelEn,
      capabilities: provider.capabilities,
      passwordHelpUrl: provider.passwordHelpUrl,
      passwordHelpUrlEn: provider.passwordHelpUrlEn,
      hasCalendar: Boolean(provider.caldav),
    };
  },

  /**
   * Row prepared for agent use: app_password decrypted into `password`. Never
   * send this shape to the browser.
   */
  withSecret(integration = null) {
    if (!integration) return null;
    let password = null;
    if (integration.app_password) {
      try {
        password = encryptionManager().decrypt(integration.app_password);
      } catch (error) {
        console.error("WorkspaceIntegration.decrypt", error.message);
      }
    }
    return { ...integration, password, scopes: parseScopes(integration.scopes) };
  },

  async where(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_integrations.findMany({
      where: { workspace_id: Number(workspaceId) },
      orderBy: { id: "asc" },
    });
  },

  async enabled(workspaceId = null) {
    if (!workspaceId) return [];
    return prisma.workspace_integrations.findMany({
      where: { workspace_id: Number(workspaceId), enabled: true },
      orderBy: { id: "asc" },
    });
  },

  async hasEnabled(workspaceId = null) {
    if (!workspaceId) return false;
    const count = await prisma.workspace_integrations.count({
      where: { workspace_id: Number(workspaceId), enabled: true },
    });
    return count > 0;
  },

  async get({ id = null, workspaceId = null } = {}) {
    if (!id || !workspaceId) return null;
    return prisma.workspace_integrations.findFirst({
      where: { id: Number(id), workspace_id: Number(workspaceId) },
    });
  },

  /**
   * All enabled integrations of a workspace that grant the given scope. The
   * agent tool picks one of these to act on - typically the first, unless the
   * model supplied a specific account.
   */
  async withScope(workspaceId = null, scope = null) {
    if (!workspaceId || !Object.values(SCOPES).includes(scope)) return [];
    const rows = await this.enabled(workspaceId);
    return rows
      .map((row) => this.withSecret(row))
      .filter((row) => row.scopes.includes(scope));
  },

  /**
   * Validates and normalizes user input into database columns.
   * @param {object} data
   * @param {{existing?: object|null, requirePassword?: boolean}} opts
   */
  prepareFields(
    data = {},
    { existing = null, requirePassword = true } = {}
  ) {
    const fields = { lastUpdatedAt: new Date() };

    if (data.provider !== undefined) {
      if (!PROVIDERS[data.provider])
        return { fields: null, error: "Неизвестный провайдер" };
      fields.provider = data.provider;
    }
    const provider = providerById(fields.provider ?? existing?.provider);
    if (!provider) return { fields: null, error: "Неизвестный провайдер" };

    if (data.name !== undefined)
      fields.name = String(data.name || "").trim().slice(0, 100);

    if (data.accountEmail !== undefined)
      fields.account_email = String(data.accountEmail || "")
        .trim()
        .toLowerCase()
        .slice(0, 200);

    if (data.authUser !== undefined)
      fields.auth_user = String(data.authUser || "")
        .trim()
        .slice(0, 200) || fields.account_email || existing?.account_email || "";

    // Hosts are pinned by the provider catalog, but the UI can override them
    // (e.g. a corporate Yandex 360 with a custom IMAP endpoint).
    fields.imap_host =
      String(data.imapHost || "").trim() || provider.imap?.host || null;
    fields.imap_port = Number(
      data.imapPort || provider.imap?.port || 993
    );
    fields.smtp_host =
      String(data.smtpHost || "").trim() || provider.smtp?.host || null;
    fields.smtp_port = Number(
      data.smtpPort || provider.smtp?.port || 465
    );
    fields.caldav_url =
      String(data.caldavUrl || "").trim() ||
      provider.caldav?.baseUrl ||
      null;
    fields.calendar_path =
      String(data.calendarPath || "").trim().slice(0, 200) || null;

    if (data.appPassword !== undefined) {
      const raw = String(data.appPassword || "").trim();
      if (raw.length > 0) {
        const encrypted = encryptionManager().encrypt(raw);
        if (!encrypted)
          return {
            fields: null,
            error: "Не удалось зашифровать пароль приложения",
          };
        fields.app_password = encrypted;
      } else if (data.appPassword === null) fields.app_password = null;
    }

    if (data.scopes !== undefined) {
      const requested = Array.isArray(data.scopes) ? data.scopes : [];
      const allowed = new Set(provider.capabilities);
      const cleaned = [...new Set(requested.filter((s) => allowed.has(s)))];
      fields.scopes = JSON.stringify(cleaned);
    }

    if (data.enabled !== undefined) fields.enabled = Boolean(data.enabled);

    const name = fields.name ?? existing?.name ?? "";
    if (!String(name).trim())
      return { fields: null, error: "Укажите название подключения" };

    const accountEmail =
      fields.account_email ?? existing?.account_email ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail))
      return { fields: null, error: "Укажите корректный email" };
    fields.account_email = accountEmail;

    const hasPassword = Boolean(fields.app_password ?? existing?.app_password);
    if (requirePassword && !hasPassword)
      return { fields: null, error: "Укажите пароль приложения" };

    const scopes = parseScopes(
      fields.scopes ?? existing?.scopes ?? "[]"
    );
    if (!scopes.length)
      return {
        fields: null,
        error: "Выберите хотя бы один разрешённый доступ",
      };
    fields.scopes = JSON.stringify(scopes);

    return { fields, error: null };
  },

  async create({ workspaceId = null, data = {} } = {}) {
    if (!workspaceId)
      return { integration: null, error: "Рабочее пространство не найдено" };

    const count = await prisma.workspace_integrations.count({
      where: { workspace_id: Number(workspaceId) },
    });
    if (count >= this.MAX_PER_WORKSPACE)
      return {
        integration: null,
        error: `Достигнут лимит интеграций (${this.MAX_PER_WORKSPACE})`,
      };

    const { fields, error } = this.prepareFields(data, { requirePassword: true });
    if (error) return { integration: null, error };

    try {
      const integration = await prisma.workspace_integrations.create({
        data: { workspace_id: Number(workspaceId), ...fields },
      });
      return { integration, error: null };
    } catch (error) {
      console.error("WorkspaceIntegration.create", error.message);
      if (error.code === "P2002")
        return {
          integration: null,
          error: "Такый ящик уже подключён в этом пространстве",
        };
      return { integration: null, error: "Не удалось сохранить интеграцию" };
    }
  },

  async update({ id = null, workspaceId = null, data = {} } = {}) {
    const existing = await this.get({ id, workspaceId });
    if (!existing) return { integration: null, error: "Интеграция не найдена" };

    const { fields, error } = this.prepareFields(data, {
      existing,
      requirePassword: false,
    });
    if (error) return { integration: null, error };

    try {
      const integration = await prisma.workspace_integrations.update({
        where: { id: Number(id) },
        data: fields,
      });
      return { integration, error: null };
    } catch (error) {
      console.error("WorkspaceIntegration.update", error.message);
      if (error.code === "P2002")
        return {
          integration: null,
          error: "Ящик с таким адресом уже подключён",
        };
      return { integration: null, error: "Не удалось обновить интеграцию" };
    }
  },

  async remove({ id = null, workspaceId = null } = {}) {
    const existing = await this.get({ id, workspaceId });
    if (!existing) return { success: false, error: "Интеграция не найдена" };
    try {
      await prisma.workspace_integrations.delete({ where: { id: Number(id) } });
      return { success: true, error: null };
    } catch (error) {
      console.error("WorkspaceIntegration.remove", error.message);
      return { success: false, error: "Не удалось удалить интеграцию" };
    }
  },

  /**
   * Runs a real IMAP LOGIN against the stored (or in-form) credentials and
   * records the outcome on the row. Never touches the mailbox itself so the
   * test stays fast and does not leak metadata.
   */
  async test({ integration = null } = {}) {
    if (!integration)
      return { success: false, error: "Интеграция не найдена" };
    const { testImapConnection } = require("../utils/integrations/imapClient");
    const row = this.withSecret(integration);
    const result = await testImapConnection({
      host: row.imap_host,
      port: row.imap_port,
      user: row.auth_user,
      password: row.password,
    });

    await prisma.workspace_integrations
      .update({
        where: { id: Number(row.id) },
        data: {
          last_status: result.success ? "ok" : "error",
          last_error: result.success ? null : result.error,
          last_checked_at: new Date(),
          lastUpdatedAt: new Date(),
        },
      })
      .catch((error) => console.error("WorkspaceIntegration.test", error.message));

    return result;
  },
};

module.exports = { WorkspaceIntegration };
