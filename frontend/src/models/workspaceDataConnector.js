import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * External systems (1C, Bitrix24, any REST API) connected to a workspace. The
 * workspace owner manages them; the agent uses them to pull live data.
 */
const WorkspaceDataConnector = {
  list: async function (slug) {
    return fetch(`${API_BASE}/workspace/${slug}/connectors`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res.connectors || [])
      .catch(() => []);
  },

  create: async function (slug, data = {}) {
    return fetch(`${API_BASE}/workspace/${slug}/connectors`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => ({ connector: null, error: e.message }));
  },

  update: async function (slug, connectorId, data = {}) {
    return fetch(`${API_BASE}/workspace/${slug}/connectors/${connectorId}`, {
      method: "PUT",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => ({ connector: null, error: e.message }));
  },

  remove: async function (slug, connectorId) {
    return fetch(`${API_BASE}/workspace/${slug}/connectors/${connectorId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /** Tests the values currently in the form. Nothing is persisted. */
  testDraft: async function (slug, data = {}) {
    return fetch(`${API_BASE}/workspace/${slug}/connectors/test`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /** Tests a saved connector with its stored key and refreshes its schema. */
  testSaved: async function (slug, connectorId) {
    return fetch(
      `${API_BASE}/workspace/${slug}/connectors/${connectorId}/test`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },
};

export default WorkspaceDataConnector;
