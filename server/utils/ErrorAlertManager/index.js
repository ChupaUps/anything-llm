const { ErrorNotifications } = require("../../models/errorNotifications");

/**
 * Sends operational error alerts to the administrator via email (SMTP) and/or
 * Telegram whenever something notable goes wrong on the server:
 *   - process-level crashes (uncaughtException / unhandledRejection)
 *   - HTTP 500 responses
 *   - agent / background-task errors (via explicit `.notify()` calls)
 *
 * Configuration is managed by the admin in the UI and stored through the
 * {@link ErrorNotifications} model. This class is a singleton and safe to
 * import anywhere; every send is wrapped so it can never itself throw and cause
 * a secondary crash inside an error handler.
 */
class ErrorAlertManager {
  static _instance;
  /** @type {Map<string, number>} signature -> last sent epoch ms (dedup) */
  #recent = new Map();
  /** @type {Map<string, object>} cache of nodemailer transports by host config */
  #transports = new Map();

  constructor() {
    if (ErrorAlertManager._instance) return ErrorAlertManager._instance;
    ErrorAlertManager._instance = this;
  }

  #log(text, ...args) {
    console.log(`\x1b[35m[ErrorAlerts]\x1b[0m ${text}`, ...args);
  }

  /**
   * Normalize anything thrown/logged into a human readable message + stack.
   * @param {any} error
   * @returns {{message: string, stack: string}}
   */
  #describe(error) {
    if (error instanceof Error)
      return {
        message: error.message || String(error),
        stack: error.stack || "",
      };
    if (typeof error === "string") return { message: error, stack: "" };
    try {
      return { message: JSON.stringify(error), stack: "" };
    } catch {
      return { message: String(error), stack: "" };
    }
  }

  /**
   * Build a short stable signature so identical failures firing in a loop only
   * alert once within the configured cooldown window.
   */
  #signature(message, source) {
    return `${source}:${message.slice(0, 200)}`;
  }

  /**
   * @returns {Promise<boolean>} true when a fresh alert should be dispatched.
   */
  async #shouldSend(signature, minIntervalSec) {
    const now = Date.now();
    const last = this.#recent.get(signature);
    const cooldown = Math.max(0, Number(minIntervalSec) || 0) * 1000;
    if (last && now - last < cooldown) return false;
    this.#recent.set(signature, now);

    // Keep the dedup cache bounded so it can't grow without limit.
    if (this.#recent.size > 500) {
      const cutoff = now - 3_600_000;
      for (const [key, ts] of this.#recent) {
        if (ts < cutoff) this.#recent.delete(key);
      }
    }
    return true;
  }

  /**
   * Render the alert body for a given error and context.
   */
  #format({ serverName, message, stack, context }) {
    const lines = [];
    lines.push(`⚠️ Ошибка на сервере: ${serverName || "(не задано имя)"}`);
    lines.push(`Время: ${new Date().toISOString()}`);
    if (context?.source) lines.push(`Источник: ${context.source}`);
    if (context?.method && context?.path)
      lines.push(`Запрос: ${context.method} ${context.path}`);
    if (context?.status) lines.push(`HTTP статус: ${context.status}`);
    if (context?.detail) lines.push(`Детали: ${context.detail}`);
    lines.push("");
    lines.push(`Сообщение: ${message}`);
    if (stack) lines.push("", "Стек-трейс:", stack);
    return lines.join("\n");
  }

  /**
   * Fire an operational alert. Never throws.
   * @param {any} error - Error object, string, or arbitrary value.
   * @param {object} [context] - { source, method, path, status, detail }
   * @returns {Promise<void>}
   */
  async notify(error, context = {}) {
    try {
      const config = await ErrorNotifications.resolve();
      if (!config.enabled) return;

      const captureKey = {
        process: "processCrashes",
        http: "http500",
        agent: "agentErrors",
      }[context.source];
      if (captureKey && config.capture?.[captureKey] === false) return;

      const { message, stack } = this.#describe(error);
      const signature = this.#signature(message, context.source || "general");
      if (!(await this.#shouldSend(signature, config.minIntervalSec))) return;

      const body = this.#format({
        serverName: config.serverName,
        message,
        stack,
        context,
      });
      const subject = `[${config.serverName || "server"}] ${message.slice(
        0,
        120
      )}`;

      const tasks = [];
      if (config.email.enabled && config.email.smtpHost && config.email.to)
        tasks.push(this.#sendEmail(config.email, subject, body));
      if (
        config.telegram.enabled &&
        config.telegram.botToken &&
        config.telegram.chatId
      )
        tasks.push(this.#sendTelegram(config.telegram, body));

      await Promise.allSettled(tasks);
    } catch (e) {
      // Alerts must never trigger a secondary failure.
      this.#log(`Failed to dispatch alert: ${e.message}`);
    }
  }

  #getTransport(emailConfig) {
    const key = `${emailConfig.smtpHost}:${emailConfig.smtpPort}:${emailConfig.secure}:${emailConfig.authUser}`;
    if (this.#transports.has(key)) return this.#transports.get(key);
    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch {
      throw new Error(
        "nodemailer is not installed. Run `yarn install` in the server directory."
      );
    }
    const transport = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: Number(emailConfig.smtpPort) || 587,
      secure: Boolean(emailConfig.secure),
      auth: emailConfig.authUser
        ? { user: emailConfig.authUser, pass: emailConfig.authPass }
        : undefined,
    });
    this.#transports.set(key, transport);
    return transport;
  }

  /**
   * @returns {Promise<void>} rejects on failure so callers can surface errors.
   */
  async #sendEmail(emailConfig, subject, text) {
    const transport = this.#getTransport(emailConfig);
    const from =
      emailConfig.from || emailConfig.authUser || "anythingllm@localhost";
    await transport.sendMail({
      from,
      to: emailConfig.to,
      subject,
      text,
    });
    this.#log(`Email alert sent to ${emailConfig.to}`);
  }

  /**
   * Send a plain-text message through the Telegram Bot HTTP API. Uses the
   * built-in global fetch so it stays decoupled from the interactive chat bot.
   * @returns {Promise<void>}
   */
  async #sendTelegram(telegramConfig, text) {
    const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
    // Telegram caps messages at 4096 chars.
    const capped =
      text.length > 4000 ? `${text.slice(0, 3990)}\n…(обрезано)` : text;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text: capped,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Telegram API ${res.status}: ${detail}`);
    }
    this.#log(`Telegram alert sent to chat ${telegramConfig.chatId}`);
  }

  /**
   * Send a test email using the currently saved config.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async testEmail() {
    try {
      const config = await ErrorNotifications.resolve();
      if (!config.email.smtpHost || !config.email.to)
        throw new Error("SMTP host and recipient are required.");
      const body = this.#format({
        serverName: config.serverName,
        message: "Тестовое уведомление системы оповещений об ошибках.",
        stack: "",
        context: { source: "test" },
      });
      await this.#sendEmail(
        config.email,
        `[${config.serverName || "server"}] Тест email-оповещения`,
        body
      );
      return { success: true, error: null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Send a test Telegram message using the currently saved config.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async testTelegram() {
    try {
      const config = await ErrorNotifications.resolve();
      if (!config.telegram.botToken || !config.telegram.chatId)
        throw new Error("Bot token and chat id are required.");
      const body = this.#format({
        serverName: config.serverName,
        message: "Тестовое уведомление системы оповещений об ошибках.",
        stack: "",
        context: { source: "test" },
      });
      await this.#sendTelegram(config.telegram, body);
      return { success: true, error: null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  static singleton() {
    return new ErrorAlertManager();
  }
}

module.exports = {
  ErrorAlertManager,
  errorAlertService: new ErrorAlertManager(),
};
