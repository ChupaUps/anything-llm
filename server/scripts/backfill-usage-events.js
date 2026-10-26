#!/usr/bin/env node
/**
 * One-off importer that fills `usage_events` with the token metrics already
 * stored on historical chat rows (`workspace_chats.response.metrics`).
 *
 * Run it once after deploying the usage dashboard so the "all time" figures
 * include chats sent before usage logging existed:
 *
 *   cd server && yarn backfill:usage
 *
 * The script is idempotent - each imported row is keyed as `chat:<id>` and the
 * unique index on `sourceRef` drops duplicates on re-runs.
 *
 * Caveat: an agent run can persist the same cumulative metrics on several
 * messages, so historical agent chats may be slightly overcounted.
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const prisma = require("../utils/prisma");
const { UsageEvents } = require("../models/usageEvents");

const BATCH_SIZE = 250;

function extractMetrics(response) {
  try {
    const parsed = JSON.parse(response);
    const metrics = parsed?.metrics;
    if (!metrics || typeof metrics !== "object") return null;

    const prompt = Number(metrics.prompt_tokens) || 0;
    const completion = Number(metrics.completion_tokens) || 0;
    const total = Number(metrics.total_tokens) || prompt + completion;
    if (!total) return null;

    return {
      prompt,
      completion,
      total,
      model: metrics.model || null,
      provider: metrics.provider || null,
      totalCost: Number.isFinite(Number(metrics.totalCost))
        ? Number(metrics.totalCost)
        : null,
    };
  } catch {
    return null;
  }
}

async function main() {
  let cursor = 0;
  let imported = 0;
  let skipped = 0;

  console.log("[usage backfill] scanning workspace_chats...");
  while (true) {
    const rows = await prisma.$queryRaw`
      SELECT "id", "workspaceId", "user_id", "response", "createdAt"
      FROM "workspace_chats"
      WHERE "id" > ${cursor} AND "response" LIKE '%"total_tokens"%'
      ORDER BY "id" ASC
      LIMIT ${BATCH_SIZE}
    `;
    if (!rows.length) break;

    for (const row of rows) {
      cursor = row.id;
      const metrics = extractMetrics(row.response);
      if (!metrics) {
        skipped++;
        continue;
      }

      await UsageEvents.log({
        kind: "llm",
        source: "backfill",
        userId: row.user_id,
        workspaceId: row.workspaceId,
        model: metrics.model,
        provider: metrics.provider,
        promptTokens: metrics.prompt,
        completionTokens: metrics.completion,
        totalTokens: metrics.total,
        totalCost: metrics.totalCost,
        sourceRef: `chat:${row.id}`,
        occurredAt: row.createdAt,
      });
      imported++;
    }

    console.log(
      `[usage backfill] processed up to chat #${cursor} (imported ${imported}, skipped ${skipped})`
    );
  }

  console.log(
    `[usage backfill] done - imported ${imported} chat rows, skipped ${skipped}.`
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[usage backfill] failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
