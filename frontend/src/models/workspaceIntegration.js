import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Per-workspace email / calendar integrations (Yandex / Mail.ru for now).
 *
 * Every method talks to the backend routes registered in
 * `server/endpoints/workspaceIntegrations.js`. Secrets are never returned by
 * the API - `hasPassword` is the only signal the UI gets about a stored one.
 */
const WorkspaceIntegration = {
  async providers() {
    const res = await fetch(`${API_BASE}/workspace/integrations/providers`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, providers: [] }));
    return res?.providers ?? [];
  },

  async all(slug) {
    const res = await fetch(`${API_BASE}/workspace/${slug}/integrations`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((r) => r.json())
      .catch(() => ({ integrations: [], error: "Network error" }));
    return { integrations: res?.integrations ?? [], error: res?.error ?? null };
  },

  async create(slug, data) {
    return fetch(`${API_BASE}/workspace/${slug}/integrations`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((r) => r.json())
      .catch((e) => ({ integration: null, error: e.message }));
  },

  async update(slug, id, data) {
    return fetch(`${API_BASE}/workspace/${slug}/integrations/${id}`, {
      method: "PUT",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((r) => r.json())
      .catch((e) => ({ integration: null, error: e.message }));
  },

  async remove(slug, id) {
    return fetch(`${API_BASE}/workspace/${slug}/integrations/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((r) => r.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /**
   * Runs an IMAP LOGIN check on the server. Pass `appPassword` for a form-only
   * test against unsaved credentials; leave it null to test the stored secret.
   */
  async test(slug, id, { appPassword = null } = {}) {
    return fetch(`${API_BASE}/workspace/${slug}/integrations/${id}/test`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ appPassword }),
    })
      .then((r) => r.json())
      .catch((e) => ({ success: false, error: e.message }));
  },
};

export default WorkspaceIntegration;
