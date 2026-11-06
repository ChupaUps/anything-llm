const { ErrorNotifications } = require("../models/errorNotifications");
const { errorAlertService } = require("../utils/ErrorAlertManager");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");

function errorNotificationEndpoints(app) {
  if (!app) return;

  const guards = [validatedRequest, flexUserRoleValid([ROLES.admin])];

  /**
   * Get the current error-alert configuration (secrets masked).
   */
  app.get("/system/error-notifications", guards, async (_request, response) => {
    try {
      const config = await ErrorNotifications.safeConfig();
      return response.status(200).json({ success: true, config });
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * Save the error-alert configuration.
   */
  app.post("/system/error-notifications", guards, async (request, response) => {
    try {
      const body = reqBody(request);
      const { success, error } = await ErrorNotifications.update(body);
      if (error) return response.status(500).json({ success: false, error });
      const config = await ErrorNotifications.safeConfig();
      return response.status(200).json({ success: true, config });
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * Send a test alert to a given channel ("email" | "telegram").
   */
  app.post(
    "/system/error-notifications/test",
    guards,
    async (request, response) => {
      try {
        const { channel } = reqBody(request);
        if (channel === "email") {
          const { success, error } = await errorAlertService.testEmail();
          return response.status(200).json({ success, error });
        }
        if (channel === "telegram") {
          const { success, error } = await errorAlertService.testTelegram();
          return response.status(200).json({ success, error });
        }
        return response.status(400).json({
          success: false,
          error: "channel must be 'email' or 'telegram'.",
        });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );

  /**
   * Fire a synthetic error alert through the full pipeline so the admin can
   * verify end-to-end delivery of a real "error occurred" notification.
   */
  app.post(
    "/system/error-notifications/simulate",
    guards,
    async (_request, response) => {
      try {
        await errorAlertService.notify(
          new Error("Тестовая ошибка (simulate)"),
          {
            source: "agent",
            detail: "Ручная проверка из админ-панели",
          }
        );
        return response.status(200).json({ success: true });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

module.exports = { errorNotificationEndpoints };
