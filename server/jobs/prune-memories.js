const { log, conclude } = require("./helpers/index.js");
const { SystemSettings } = require("../models/systemSettings.js");
const { pruneExpiredMemories } = require("../utils/memories/eviction.js");

// Deletes memories that have not been used or edited within MEMORY_TTL_DAYS
// (default 90 days). Pinned memories are always kept.
(async () => {
  try {
    if (!(await SystemSettings.memoriesEnabled())) {
      log("Personalization is disabled. Skipping memory pruning.");
      return;
    }

    const { deleted, ttlDays } = await pruneExpiredMemories();
    if (!ttlDays || ttlDays <= 0) {
      log("Memory TTL is disabled (MEMORY_TTL_DAYS <= 0). Skipping pruning.");
      return;
    }

    log(
      `Pruned ${deleted} expired memor${deleted === 1 ? "y" : "ies"} (TTL ${ttlDays}d).`
    );
  } catch (e) {
    console.error(e);
    log(`errored with ${e.message}`);
  } finally {
    conclude();
  }
})();
