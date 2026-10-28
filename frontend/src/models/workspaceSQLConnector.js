import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * SQL databases connected to a workspace. The workspace owner manages them
 * here; the sql-agent reads them to answer questions about live data.
 */
const WorkspaceSQLConnector = {
  list: async function (slug) {
    return fetch(`${API_BASE}/workspace/${slug}/sql-connectors`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res.connectors || [])
      .catch(() => []);
  },

  create: async function (slug, data = {}) {
    return fetch(`${API_BASE}/workspace/${slug}/sql-connectors`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => ({ connector: null, error: e.message }));
  },

  update: async function (slug, connectorId, data = {}) {
    return fetch(
      `${API_BASE}/workspace/${slug}/sql-connectors/${connectorId}`,
      {
        method: "PUT",
        headers: baseHeaders(),
        body: JSON.stringify(data),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ connector: null, error: e.message }));
  },

  remove: async function (slug, connectorId) {
    return fetch(
      `${API_BASE}/workspace/${slug}/sql-connectors/${connectorId}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /**
   * Real connection attempt with credentials from the form. Nothing is saved.
   */
  validate: async function (slug, engine, connectionString) {
    return fetch(`${API_BASE}/workspace/${slug}/sql-connectors/validate`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ engine, connectionString }),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  testSaved: async function (slug, connectorId) {
    return fetch(
      `${API_BASE}/workspace/${slug}/sql-connectors/${connectorId}/test`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },
};

export default WorkspaceSQLConnector;
