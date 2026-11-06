import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const ChatFallback = {
  /**
   * @returns {Promise<{success: boolean, config: {enabled: boolean, provider: string, model: string}, error: string|null}>}
   */
  getConfig: async function () {
    return await fetch(`${API_BASE}/system/chat-fallback`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return {
          success: false,
          config: { enabled: false, provider: "", model: "" },
          error: e.message,
        };
      });
  },

  /**
   * @param {{enabled: boolean, provider: string, model: string}} config
   */
  updateConfig: async function (config = {}) {
    return await fetch(`${API_BASE}/system/chat-fallback`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(config),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default ChatFallback;
