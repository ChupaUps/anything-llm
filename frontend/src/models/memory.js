import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * @typedef {Object} Memory
 * @property {number} id
 * @property {number|null} userId
 * @property {number|null} workspaceId
 * @property {"workspace"|"global"} scope
 * @property {string} content
 * @property {"user"|"auto"} source
 * @property {boolean} pinned
 * @property {number} useCount
 * @property {string|null} lastUsedAt
 * @property {string|null} expiresAt
 * @property {{id: number, name: string, slug: string}|null} [workspace]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const DEFAULT_LIMITS = { global: 15, workspace: 20, ttlDays: 90 };

const Memory = {
  /**
   * Fetch all memories (global + workspace) for a workspace.
   * @param {string} slug
   * @returns {Promise<{global: Memory[], workspace: Memory[], limits: object}>}
   */
  forWorkspace: async function (slug) {
    return await fetch(`${API_BASE}/workspaces/${slug}/memories`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => ({
        global: res?.memories?.global || [],
        workspace: res?.memories?.workspace || [],
        limits: res?.limits || DEFAULT_LIMITS,
      }))
      .catch(() => ({
        global: [],
        workspace: [],
        limits: DEFAULT_LIMITS,
      }));
  },

  /**
   * Fetch every memory owned by the current user, across all workspaces.
   * Used by the account-level memories block.
   * @returns {Promise<{global: Memory[], workspace: Memory[], limits: object, error?: string}>}
   */
  forUser: async function () {
    return await fetch(`${API_BASE}/memories`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          return {
            global: [],
            workspace: [],
            limits: DEFAULT_LIMITS,
            error: data?.error || "Failed to load memories.",
          };
        return {
          global: data?.memories?.global || [],
          workspace: data?.memories?.workspace || [],
          limits: data?.limits || DEFAULT_LIMITS,
        };
      })
      .catch((e) => ({
        global: [],
        workspace: [],
        limits: DEFAULT_LIMITS,
        error: e.message,
      }));
  },

  /**
   * Create a new memory for a workspace.
   * @param {string} slug
   * @param {{content: string, scope?: "workspace"|"global"}} body
   * @returns {Promise<{memory: Memory|null, error?: string}>}
   */
  create: async function (slug, { content, scope = "workspace" }) {
    return await fetch(`${API_BASE}/workspaces/${slug}/memories`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ content, scope }),
    })
      .then((res) => res.json())
      .catch((e) => ({ memory: null, error: e.message }));
  },

  /**
   * Create a new personal (global) memory from the account block.
   * @param {string} content
   * @returns {Promise<{memory: Memory|null, limits?: object, error?: string}>}
   */
  createPersonal: async function (content) {
    return await fetch(`${API_BASE}/memories`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ content }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return { memory: null, error: data?.error };
        return { memory: data?.memory || null, limits: data?.limits };
      })
      .catch((e) => ({ memory: null, error: e.message }));
  },

  /**
   * Update an existing memory's content and/or pinned state.
   * @param {number} memoryId
   * @param {{content?: string, pinned?: boolean}} body
   * @returns {Promise<{memory: Memory|null, error?: string}>}
   */
  update: async function (memoryId, { content, pinned } = {}) {
    return await fetch(`${API_BASE}/memories/${memoryId}`, {
      method: "PUT",
      headers: baseHeaders(),
      body: JSON.stringify({ content, pinned }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return { memory: null, error: data?.error };
        return { memory: data?.memory || null };
      })
      .catch((e) => ({ memory: null, error: e.message }));
  },

  /**
   * Delete a memory.
   * @param {number} memoryId
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  delete: async function (memoryId) {
    return await fetch(`${API_BASE}/memories/${memoryId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({ success: false, error: e.message }));
  },

  /**
   * Promote a workspace-scoped memory to global.
   * @param {number} memoryId
   * @returns {Promise<{memory: Memory|null, error?: string}>}
   */
  promoteToGlobal: async function (memoryId) {
    return await fetch(`${API_BASE}/memories/${memoryId}/promote`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({ memory: null, error: e.message }));
  },

  /**
   * Demote a global memory to a specific workspace.
   * @param {number} memoryId
   * @param {string} slug
   * @returns {Promise<{memory: Memory|null, error?: string}>}
   */
  demoteToWorkspace: async function (memoryId, slug) {
    return await fetch(`${API_BASE}/memories/${memoryId}/demote/${slug}`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({ memory: null, error: e.message }));
  },
};

export default Memory;
