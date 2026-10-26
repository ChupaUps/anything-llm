const prisma = require("../utils/prisma");

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
 * @property {Date|null} lastUsedAt
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads a non-negative integer from the environment, falling back to a default.
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toInt(v) {
  const n = Number(v);
  if (!Number.isInteger(n))
    throw new Error(`Expected integer, got ${JSON.stringify(v)}`);
  return n;
}

/**
 * Activity timestamp used for TTL pruning and LRU eviction. A memory counts as
 * "used" when it was last injected into a prompt; edits also count as attention.
 * @param {object} memory
 * @returns {number}
 */
function activityMs(memory) {
  const dates = [memory?.lastUsedAt, memory?.updatedAt, memory?.createdAt]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t));
  return dates.length > 0 ? Math.max(...dates) : 0;
}

const Memory = {
  // Limits are env-configurable so a deployment can tune capacity without a
  // code change. "Injected" limits only cap how much memory text goes into
  // the system prompt on a single turn.
  GLOBAL_LIMIT: envInt("MEMORY_GLOBAL_LIMIT", 15),
  WORKSPACE_LIMIT: envInt("MEMORY_WORKSPACE_LIMIT", 20),
  MAX_INJECTED_GLOBAL_LIMIT: envInt("MEMORY_INJECT_GLOBAL_LIMIT", 10),
  MAX_INJECTED_WORKSPACE_LIMIT: envInt("MEMORY_INJECT_WORKSPACE_LIMIT", 5),
  TTL_DAYS: envInt("MEMORY_TTL_DAYS", 90),
  VALID_SCOPES: ["workspace", "global"],
  VALID_SOURCES: ["user", "auto"],

  validations: {
    id: (v) => toInt(v),
    userId: (v = null) => (v === null || v === undefined ? null : toInt(v)),
    workspaceId: (v = null) =>
      v === null || v === undefined ? null : toInt(v),
    scope: (v = "workspace") => {
      if (!Memory.VALID_SCOPES.includes(v))
        throw new Error(`Invalid scope: ${JSON.stringify(v)}`);
      return v;
    },
    source: (v = "auto") => {
      if (!Memory.VALID_SOURCES.includes(v))
        throw new Error(`Invalid source: ${JSON.stringify(v)}`);
      return v;
    },
    pinned: (v = false) => Boolean(v),
    content: (v) => {
      if (typeof v !== "string" || v.trim().length === 0)
        throw new Error("Content must be a non-empty string");
      return v;
    },
  },

  /**
   * Current limits, exposed to clients so the UI does not hardcode capacity.
   * @returns {{global: number, workspace: number, ttlDays: number}}
   */
  limits: function () {
    return {
      global: this.GLOBAL_LIMIT,
      workspace: this.WORKSPACE_LIMIT,
      ttlDays: this.TTL_DAYS,
    };
  },

  /**
   * Timestamp after which a non-pinned memory becomes eligible for pruning.
   * Pinned memories never expire.
   * @param {object} memory
   * @returns {Date|null}
   */
  expiresAt: function (memory) {
    if (!memory || memory.pinned) return null;
    const ttlMs = this.TTL_DAYS * DAY_MS;
    if (ttlMs <= 0) return null;
    return new Date(activityMs(memory) + ttlMs);
  },

  /**
   * List a user's workspace-scoped memories, newest first.
   * @param {number|null} userId
   * @param {number} workspaceId
   * @returns {Promise<Memory[]>}
   */
  forUserWorkspace: async function (userId, workspaceId) {
    try {
      const memories = await prisma.memories.findMany({
        where: {
          userId: this.validations.userId(userId),
          workspaceId: this.validations.id(workspaceId),
          scope: "workspace",
        },
        orderBy: { createdAt: "desc" },
      });
      return memories;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * List a user's global-scoped memories, newest first.
   * @param {number|null} userId
   * @returns {Promise<Memory[]>}
   */
  globalForUser: async function (userId) {
    try {
      const memories = await prisma.memories.findMany({
        where: {
          userId: this.validations.userId(userId),
          scope: "global",
        },
        orderBy: { createdAt: "desc" },
      });
      return memories;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * List every memory owned by a user (both scopes), pinned first.
   * Used by the account-level memories block.
   * @param {number|null} userId
   * @returns {Promise<Memory[]>}
   */
  allForUser: async function (userId) {
    try {
      const memories = await prisma.memories.findMany({
        where: { userId: this.validations.userId(userId) },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
        },
      });
      return memories;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * Delete memories that have not been used or edited within the TTL window.
   * Pinned memories are never deleted. Never-used memories age from `updatedAt`
   * (which equals `createdAt` on insert), so fresh facts are not pruned early.
   * @param {number} [ttlDays]
   * @returns {Promise<number>} number of deleted rows
   */
  deleteExpired: async function (ttlDays = this.TTL_DAYS) {
    if (!ttlDays || ttlDays <= 0) return 0;
    const cutoff = new Date(Date.now() - ttlDays * DAY_MS);
    try {
      const expired = await prisma.memories.findMany({
        where: {
          pinned: false,
          AND: [
            { OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
            { updatedAt: { lt: cutoff } },
          ],
        },
        select: { id: true },
      });
      if (expired.length === 0) return 0;

      const { count } = await prisma.memories.deleteMany({
        where: { id: { in: expired.map((m) => m.id) } },
      });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  /**
   * Create a memory, enforcing per-scope limits (global and workspace limits are
   * env-configurable via MEMORY_GLOBAL_LIMIT / MEMORY_WORKSPACE_LIMIT).
   * @param {Object} params
   * @param {number|null} params.userId
   * @param {number|null} [params.workspaceId]
   * @param {"workspace"|"global"} [params.scope]
   * @param {"user"|"auto"} [params.source]
   * @param {string} params.content
   * @returns {Promise<{memory: Memory|null, message: string|null}>}
   */
  create: async function ({
    userId,
    workspaceId = null,
    scope = "workspace",
    source = "user",
    content,
  }) {
    try {
      const count = await this.countForScope(userId, workspaceId, scope);
      const limit =
        this.validations.scope(scope) === "global"
          ? this.GLOBAL_LIMIT
          : this.WORKSPACE_LIMIT;
      if (count >= limit)
        return {
          memory: null,
          message: `Maximum ${scope} memory limit (${limit}) reached.`,
        };

      const memory = await prisma.memories.create({
        data: {
          userId: this.validations.userId(userId),
          workspaceId: this.validations.workspaceId(workspaceId),
          scope: this.validations.scope(scope),
          source: this.validations.source(source),
          content: this.validations.content(content),
        },
      });
      return { memory, message: null };
    } catch (error) {
      console.error(error.message);
      return { memory: null, message: error.message };
    }
  },

  /**
   * Update a memory. Editing content marks it as user-authored; pinning keeps it
   * out of TTL pruning and LRU eviction.
   * @param {number} id
   * @param {{content?: string, pinned?: boolean}} fields
   * @returns {Promise<{memory: Memory|null, message: string|null}>}
   */
  update: async function (id, { content, pinned } = {}) {
    try {
      const data = { updatedAt: new Date() };
      if (content !== undefined) {
        data.content = this.validations.content(content);
        data.source = "user";
      }
      if (pinned !== undefined) data.pinned = this.validations.pinned(pinned);
      if (content === undefined && pinned === undefined)
        return { memory: null, message: "Nothing to update." };

      const memory = await prisma.memories.update({
        where: { id: this.validations.id(id) },
        data,
      });
      return { memory, message: null };
    } catch (error) {
      console.error(error.message);
      return { memory: null, message: error.message };
    }
  },

  /**
   * Delete a memory by id.
   * @param {number} id
   * @returns {Promise<boolean>} true on success, false on error
   */
  delete: async function (id) {
    try {
      await prisma.memories.delete({
        where: { id: this.validations.id(id) },
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  /**
   * Promote a workspace-scoped memory to global scope.
   * Enforces the global limit and clears its workspaceId.
   * @param {number} id
   * @returns {Promise<{memory: Memory|null, message: string|null}>}
   */
  promoteToGlobal: async function (id) {
    try {
      const existing = await prisma.memories.findUnique({
        where: { id: this.validations.id(id) },
      });
      if (!existing) return { memory: null, message: "Memory not found." };
      if (existing.scope === "global")
        return { memory: existing, message: "Memory is already global." };

      const globalCount = await this.countForScope(
        existing.userId,
        null,
        "global"
      );
      if (globalCount >= this.GLOBAL_LIMIT)
        return {
          memory: null,
          message: `Maximum global memory limit (${this.GLOBAL_LIMIT}) reached.`,
        };

      const memory = await prisma.memories.update({
        where: { id: this.validations.id(id) },
        data: { scope: "global", workspaceId: null, updatedAt: new Date() },
      });
      return { memory, message: null };
    } catch (error) {
      console.error(error.message);
      return { memory: null, message: error.message };
    }
  },

  /**
   * Demote a global memory to workspace scope, assigning it to the target workspace.
   * Enforces the per-workspace limit.
   * @param {number} id
   * @param {number} workspaceId
   * @returns {Promise<{memory: Memory|null, message: string|null}>}
   */
  demoteToWorkspace: async function (id, workspaceId) {
    try {
      const existing = await prisma.memories.findUnique({
        where: { id: this.validations.id(id) },
      });
      if (!existing) return { memory: null, message: "Memory not found." };
      if (existing.scope === "workspace")
        return {
          memory: existing,
          message: "Memory is already workspace-scoped.",
        };

      const wsCount = await this.countForScope(
        existing.userId,
        workspaceId,
        "workspace"
      );
      if (wsCount >= this.WORKSPACE_LIMIT)
        return {
          memory: null,
          message: `Maximum workspace memory limit (${this.WORKSPACE_LIMIT}) reached.`,
        };

      const memory = await prisma.memories.update({
        where: { id: this.validations.id(id) },
        data: {
          scope: "workspace",
          workspaceId: this.validations.id(workspaceId),
          updatedAt: new Date(),
        },
      });
      return { memory, message: null };
    } catch (error) {
      console.error(error.message);
      return { memory: null, message: error.message };
    }
  },

  /**
   * Stamp memories as injected into a prompt (for TTL/LRU recency tracking).
   * @param {number[]} [ids]
   * @returns {Promise<void>}
   */
  touch: async function (ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    try {
      await prisma.memories.updateMany({
        where: { id: { in: ids.map(this.validations.id) } },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      });
    } catch (error) {
      console.error(error.message);
    }
  },

  /**
   * @deprecated Use Memory.touch() - kept for existing call sites.
   * @param {number[]} [ids]
   * @returns {Promise<void>}
   */
  updateLastUsed: async function (ids = []) {
    return this.touch(ids);
  },

  /**
   * Count a user's memories in a given scope. For "workspace" scope the workspaceId is required.
   * @param {number|null} userId
   * @param {number|null} workspaceId
   * @param {"workspace"|"global"} scope
   * @returns {Promise<number>}
   */
  countForScope: async function (userId, workspaceId, scope) {
    try {
      const where = {
        userId: this.validations.userId(userId),
        scope: this.validations.scope(scope),
      };
      if (scope === "workspace")
        where.workspaceId = this.validations.workspaceId(workspaceId);
      return await prisma.memories.count({ where });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  /**
   * Replace all of a user's workspace-scoped memories for a workspace with the given set.
   * Runs in a transaction so a failure mid-write does not leave a partial state.
   * Caps the input at this.WORKSPACE_LIMIT.
   * @param {number|null} userId
   * @param {number} workspaceId
   * @param {string[]} memories - memory contents to insert
   * @returns {Promise<boolean>}
   */
  replaceWorkspaceMemories: async function (userId, workspaceId, memories) {
    try {
      const safeMemories = Array.isArray(memories)
        ? memories.filter((m) => typeof m === "string" && m.trim().length > 0)
        : [];

      await prisma.$transaction(async (tx) => {
        await tx.memories.deleteMany({
          where: {
            userId: this.validations.userId(userId),
            workspaceId: this.validations.id(workspaceId),
            scope: "workspace",
          },
        });

        for (const content of safeMemories.slice(0, this.WORKSPACE_LIMIT)) {
          await tx.memories.create({
            data: {
              userId: this.validations.userId(userId),
              workspaceId: this.validations.id(workspaceId),
              scope: "workspace",
              content,
            },
          });
        }
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  /**
   * Apply extracted memories from the two-phase Observer/Reflector pipeline.
   * Each memory has an `action` field:
   *   - "create": insert a new memory (WORKSPACE or GLOBAL)
   *   - "update": revise an existing WORKSPACE memory by ID
   * When a scope is at capacity, the least-recently-used non-pinned memories are
   * evicted to make room, so fresh facts replace stale ones instead of being
   * silently dropped. Skipped items are already filtered out before this call.
   * @param {number|null} userId
   * @param {number} workspaceId
   * @param {{content: string, scope: "WORKSPACE"|"GLOBAL", action: "create"|"update", updateId?: number}[]} newMemories
   * @returns {Promise<{workspaceCount: number, globalCount: number, updatedCount: number, evictedCount: number}>}
   */
  applyExtractedMemories: async function (userId, workspaceId, newMemories) {
    const result = {
      workspaceCount: 0,
      globalCount: 0,
      updatedCount: 0,
      evictedCount: 0,
    };
    try {
      const safeMemories = Array.isArray(newMemories)
        ? newMemories.filter(
            (m) =>
              typeof m === "object" &&
              m !== null &&
              typeof m.content === "string" &&
              m.content.trim().length > 0 &&
              ["WORKSPACE", "GLOBAL"].includes(m.scope) &&
              ["create", "update"].includes(m.action)
          )
        : [];

      const creates = safeMemories.filter((m) => m.action === "create");
      const updates = safeMemories.filter(
        (m) => m.action === "update" && typeof m.updateId === "number"
      );

      let workspaceCount = 0;
      let globalCount = 0;
      let appliedUpdates = 0;
      let evictedCount = 0;

      await prisma.$transaction(async (tx) => {
        const applyCreates = async (scope, contentList) => {
          const limit =
            scope === "global" ? this.GLOBAL_LIMIT : this.WORKSPACE_LIMIT;
          const where = {
            userId: this.validations.userId(userId),
            scope,
          };
          if (scope === "workspace")
            where.workspaceId = this.validations.id(workspaceId);

          const existing = await tx.memories.count({ where });
          const overflow = existing + contentList.length - limit;
          if (overflow > 0)
            evictedCount += await this.evictOldest(tx, where, overflow);

          // Pinned memories cannot be evicted, so a full pinned scope still
          // drops new creates instead of growing past its limit.
          const remaining = await tx.memories.count({ where });
          const selected = contentList.slice(0, Math.max(0, limit - remaining));
          for (const content of selected) {
            await tx.memories.create({
              data: {
                userId: this.validations.userId(userId),
                workspaceId:
                  scope === "global" ? null : this.validations.id(workspaceId),
                scope,
                source: "auto",
                content,
              },
            });
          }
          return selected.length;
        };

        workspaceCount = await applyCreates(
          "workspace",
          creates.filter((m) => m.scope === "WORKSPACE").map((m) => m.content)
        );
        globalCount = await applyCreates(
          "global",
          creates.filter((m) => m.scope === "GLOBAL").map((m) => m.content)
        );

        // The updateId comes from the LLM and is untrusted, so the update is
        // scoped to memories this user owns: workspace memories in the current
        // workspace, or the user's global memories. Anything else matches no row.
        for (const { updateId, content } of updates) {
          const { count } = await tx.memories.updateMany({
            where: {
              id: this.validations.id(updateId),
              userId: this.validations.userId(userId),
              OR: [
                {
                  scope: "workspace",
                  workspaceId: this.validations.id(workspaceId),
                },
                { scope: "global" },
              ],
            },
            data: { content, source: "auto", updatedAt: new Date() },
          });
          appliedUpdates += count;
        }
      });

      result.workspaceCount = workspaceCount;
      result.globalCount = globalCount;
      result.updatedCount = appliedUpdates;
      result.evictedCount = evictedCount;
    } catch (error) {
      console.error(error.message);
    }
    return result;
  },

  /**
   * Delete the `count` least-recently-used non-pinned memories matching `where`.
   * Must run inside the caller's transaction. Sorting happens in JS on purpose:
   * Postgres orders NULLS LAST on ASC, which would evict recently-used rows
   * before never-used ones.
   * @param {object} tx - Prisma transaction client
   * @param {object} where - Prisma where clause without `pinned`
   * @param {number} count
   * @returns {Promise<number>} deleted row count
   */
  evictOldest: async function (tx, where, count) {
    if (count <= 0) return 0;
    const candidates = await tx.memories.findMany({
      where: { ...where, pinned: false },
      select: { id: true, lastUsedAt: true, updatedAt: true, createdAt: true },
    });
    const ids = candidates
      .sort((a, b) => activityMs(a) - activityMs(b))
      .slice(0, count)
      .map((m) => m.id);
    if (ids.length === 0) return 0;

    const { count: deleted } = await tx.memories.deleteMany({
      where: { id: { in: ids } },
    });
    return deleted;
  },

  /**
   * Assign all unowned memories (userId null) to the admin account when the system enters multi-user mode.
   * @param {number} adminUserId
   * @returns {Promise<boolean>}
   */
  migrateToMultiUser: async function (adminUserId) {
    try {
      await prisma.memories.updateMany({
        where: { userId: null },
        data: { userId: this.validations.id(adminUserId) },
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  /**
   * Fetch the first memory matching the given where clause.
   * @param {object} [clause] - Prisma where clause
   * @returns {Promise<Memory|null>}
   */
  get: async function (clause = {}) {
    try {
      const memory = await prisma.memories.findFirst({ where: clause });
      return memory || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },
};

module.exports = { Memory };
