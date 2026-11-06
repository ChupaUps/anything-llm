const { SystemSettings } = require("../models/systemSettings");
const { safeJsonParse } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");

const LABEL = "chat_fallback_config";
const DEFAULTS = { enabled: false, provider: "", model: "" };

function chatFallbackEndpoints(app) {
  if (!app) return;

  const guards = [validatedRequest, flexUserRoleValid([ROLES.admin])];

  app.get("/system/chat-fallback", guards, async (_request, response) => {
    try {
      const setting = await SystemSettings.get({ label: LABEL });
      const config = { ...DEFAULTS, ...(safeJsonParse(setting?.value, {}) || {}) };
      return response.status(200).json({ success: true, config });
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/system/chat-fallback", guards, async (request, response) => {
    try {
      const body = reqBody(request);
      const config = {
        enabled: body.enabled === true,
        provider:
          body.provider === "anythingllm-router"
            ? ""
            : String(body.provider || ""),
        model: String(body.model || ""),
      };
      await SystemSettings._updateSettings({ [LABEL]: JSON.stringify(config) });
      return response.status(200).json({ success: true, config });
    } catch (e) {
      console.error(e.message, e);
      response.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { chatFallbackEndpoints };
