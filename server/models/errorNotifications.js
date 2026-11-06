const { SystemSettings } = require("./systemSettings");
const { safeJsonParse } = require("../utils/http");
const { EncryptionManager } = require("../utils/EncryptionManager");

// Secrets (SMTP password, Telegram bot token) are stored encrypted with this
// prefix so they are never persisted in plaintext in the settings table.
const ENCRYPTED_PREFIX = "enc:";

function encryptSecret(value) {
  if (!value) return null;
  const manager = new EncryptionManager();
  const encrypted = manager.encrypt(String(value));
  return encrypted ? ENCRYPTED_PREFIX + encrypted : null;
}

function decryptSecret(value) {
  if (!value) return null;
  if (!String(value).startsWith(ENCRYPTED_PREFIX)) return value;
  const manager = new EncryptionManager();
  return manager.decrypt(String(value).slice(ENCRYPTED_PREFIX.length));
}

const LABEL = "error_alert_config";

// Shape of the stored config. Secrets are kept in their encrypted form here.
const DEFAULT_CONFIG = {
  enabled: false,
  serverName: "",
  minIntervalSec: 60,
  email: {
    enabled: false,
    smtpHost: "",
    smtpPort: 587,
    secure: false,
    authUser: "",
    authPass: null, // encrypted
    from: "",
    to: "",
  },
  telegram: {
    enabled: false,
    botToken: null, // encrypted
    chatId: "",
  },
  capture: {
    processCrashes: true,
    http500: true,
    agentErrors: true,
    // When true, a fatal uncaughtException exits the process after the alert
    // is dispatched, so an orchestrator (Docker restart policy / k8s) brings a
    // fresh instance back up instead of running in a possibly-corrupt state.
    exitOnFatal: false,
  },
};

/**
 * Deep-merge incoming partial updates onto the existing config. Empty/omitted
 * secret fields keep their previously stored (encrypted) value so an admin does
 * not have to retype the SMTP password or bot token on every save.
 */
function mergeConfig(existing, updates) {
  const merged = {
    ...existing,
    ...updates,
    email: { ...existing.email, ...(updates.email || {}) },
    telegram: { ...existing.telegram, ...(updates.telegram || {}) },
    capture: { ...existing.capture, ...(updates.capture || {}) },
  };

  // Preserve stored secrets when the caller left them blank.
  if (!updates.email?.authPass) merged.email.authPass = existing.email.authPass;
  if (!updates.telegram?.botToken)
    merged.telegram.botToken = existing.telegram.botToken;

  return merged;
}

const ErrorNotifications = {
  /**
   * Read the raw stored config (secrets still encrypted), merged over defaults.
   * @returns {Promise<object>}
   */
  _raw: async function () {
    const setting = await SystemSettings.get({ label: LABEL });
    const stored = safeJsonParse(setting?.value, null);
    if (!stored) return structuredClone(DEFAULT_CONFIG);
    return mergeConfig(structuredClone(DEFAULT_CONFIG), stored);
  },

  /**
   * The effective config with secrets decrypted. For internal sending only —
   * never return this to the frontend.
   * @returns {Promise<object>}
   */
  resolve: async function () {
    const config = await this._raw();
    return {
      ...config,
      email: {
        ...config.email,
        authPass: decryptSecret(config.email.authPass),
      },
      telegram: {
        ...config.telegram,
        botToken: decryptSecret(config.telegram.botToken),
      },
    };
  },

  /**
   * Config safe to serve to the admin UI: secrets masked to booleans.
   * @returns {Promise<object>}
   */
  safeConfig: async function () {
    const config = await this._raw();
    return {
      enabled: config.enabled,
      serverName: config.serverName,
      minIntervalSec: config.minIntervalSec,
      capture: config.capture,
      email: {
        ...config.email,
        authPass: null,
        hasAuthPass: !!config.email.authPass,
      },
      telegram: {
        ...config.telegram,
        botToken: null,
        hasBotToken: !!config.telegram.botToken,
      },
    };
  },

  /**
   * Persist a partial update. Newly-provided secrets are encrypted before save.
   * @param {object} updates
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  update: async function (updates = {}) {
    try {
      const existing = await this._raw();
      const normalized = {
        ...updates,
        email: { ...(updates.email || {}) },
        telegram: { ...(updates.telegram || {}) },
      };

      if (normalized.email.authPass)
        normalized.email.authPass = encryptSecret(normalized.email.authPass);
      if (normalized.telegram.botToken)
        normalized.telegram.botToken = encryptSecret(
          normalized.telegram.botToken
        );

      const merged = mergeConfig(existing, normalized);
      await SystemSettings._updateSettings({
        [LABEL]: JSON.stringify(merged),
      });
      return { success: true, error: null };
    } catch (error) {
      console.error("ErrorNotifications.update", error.message);
      return { success: false, error: error.message };
    }
  },
};

module.exports = { ErrorNotifications };
