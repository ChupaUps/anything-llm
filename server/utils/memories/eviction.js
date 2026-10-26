/**
 * Memory retention
 *
 * Memories that have not been used (injected into a prompt) or edited within
 * the TTL window are removed so personalization stays relevant and the prompt
 * does not fill up with stale facts. Pinned memories never expire.
 *
 * Capacity eviction happens at write time inside Memory.applyExtractedMemories
 * so fresh facts replace the least-recently-used ones instead of being dropped.
 */
const { Memory } = require("../../models/memory");

/**
 * Delete memories whose activity date is older than MEMORY_TTL_DAYS.
 * TTL <= 0 disables pruning.
 * @returns {Promise<{deleted: number, ttlDays: number}>}
 */
async function pruneExpiredMemories() {
  const ttlDays = Memory.TTL_DAYS;
  if (!ttlDays || ttlDays <= 0) return { deleted: 0, ttlDays };
  const deleted = await Memory.deleteExpired(ttlDays);
  return { deleted, ttlDays };
}

module.exports = { pruneExpiredMemories };
