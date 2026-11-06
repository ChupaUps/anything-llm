import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const ErrorNotifications = {
  /**
   * Fetch the current error-alert configuration (secrets are masked server-side).
   * @returns {Promise<{success: boolean, config: object|null, error: string|null}>}
   */
  getConfig: async function () {
    return await fetch(`${API_BASE}/system/error-notifications`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, config: null, error: e.message };
      });
  },

  /**
   * Save a partial configuration update.
   * @param {object} updates
   * @returns {Promise<{success: boolean, config: object|null, error: string|null}>}
   */
  updateConfig: async function (updates = {}) {
    return await fetch(`${API_BASE}/system/error-notifications`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, config: null, error: e.message };
      });
  },

  /**
   * Send a test alert over a single channel.
   * @param {"email" | "telegram"} channel
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  test: async function (channel) {
    return await fetch(`${API_BASE}/system/error-notifications/test`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ channel }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * Fire a synthetic error through the full pipeline (server name + log body).
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  simulate: async function () {
    return await fetch(`${API_BASE}/system/error-notifications/simulate`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default ErrorNotifications;
