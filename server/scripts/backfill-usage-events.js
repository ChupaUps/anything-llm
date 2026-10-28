#!/usr/bin/env node
/**
 * Importer that fills `usage_events` with the token metrics already stored on
 * historical chat rows (`workspace_chats.response.metrics`).
 *
 * Run it inside the running container so it uses the app's own database and
 * model files:
 *
 *   docker exec anythingllm sh -c "cd /app/server && node scripts/backfill-usage-events.js --dry-run"
 *   docker exec anythingllm sh -c "cd /app/server && node scripts/backfill-usage-events.js"
 *
 * Flags:
 *   --dry-run     report the outcome without writing anything
 *   --estimate    when a chat stores no metrics, estimate the tokens from the
 *                 prompt + answer text instead of skipping the row
 *   --sample N    how many unusable rows to print for inspection (default 2)
 *
 * The import is idempotent - each row is keyed as `chat:<id>` and the unique
 * index on `sourceRef` drops duplicates, so re-runs are safe.
 *
 * Caveat: an agent run can persist the same cumulative metrics on several
 * messages, so historical agent chats may be slightly overcounted.
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const prisma = require("../utils/prisma");
const { TokenManager } = require("../utils/helpers/tiktoken");

const BATCH_SIZE = 250;
const INSERT_CHUNK = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ESTIMATE = args.includes("--estimate");
const sampleFlag = args.indexOf("--sample");
const SAMPLE_LIMIT =
  sampleFlag === -1 ? 2 : Math.max(1, Number(args[sampleFlag + 1]) || 2);

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

// Databases migrated from SQLite can hold timestamps as plain strings, which
// Prisma refuses - fall back to the import time instead of dropping the row.
function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function databaseLabel() {
  const url = process.env.DATABASE_URL || "";
  return (
    url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@") ||
    "(DATABASE_URL is not set)"
  );
}

function parseChatResponse(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    let parsed = JSON.parse(raw);
    // Rows migrated from SQLite can hold the JSON document as a JSON string.
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads the token counters stored on the chat row. Older rows may miss
 * `total_tokens` or use the input/output naming, so every shape is accepted.
 * @param {Object|null} parsed
 * @returns {{prompt: number, completion: number, total: number, model: string|null, provider: string|null, totalCost: number|null}|null}
 */
function metricsFromChat(parsed) {
  const metrics = parsed?.metrics ?? parsed?.usage;
  if (!metrics || typeof metrics !== "object") return null;

  const prompt = Number(metrics.prompt_tokens ?? metrics.input_tokens) || 0;
  const completion =
    Number(metrics.completion_tokens ?? metrics.output_tokens) || 0;
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
}

/**
 * Approximation for chats saved before metrics were stored: tokenize the
 * prompt and the answer text with the same encoder the app uses. Opt-in via
 * `--estimate` because it is only an approximation of what the provider billed.
 * @param {Object|null} parsed
 * @param {string} prompt
 * @param {TokenManager} tokenizer
 */
function estimateFromChat(parsed, prompt, tokenizer) {
  const answer = typeof parsed?.text === "string" ? parsed.text : "";
  if (!prompt && !answer) return null;

  const promptTokens = tokenizer.tokensFromString(prompt || "").length;
  const completionTokens = tokenizer.tokensFromString(answer).length;
  const total = promptTokens + completionTokens;
  if (!total) return null;

  return {
    prompt: promptTokens,
    completion: completionTokens,
    total,
    model: parsed?.metrics?.model || parsed?.model || null,
    provider: parsed?.metrics?.provider || parsed?.provider || null,
    totalCost: null,
    estimated: true,
  };
}

async function flushBatch(buffer) {
  if (!buffer.length) return 0;
  const rows = buffer.splice(0, buffer.length);
  if (DRY_RUN) return 0;

  try {
    const { count } = await prisma.usage_events.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return count;
  } catch (error) {
    // One malformed row must not discard the whole batch on a foreign database.
    console.error(
      `[usage backfill] batch insert failed (${error.message}) - retrying row by row`
    );
    let count = 0;
    for (const row of rows) {
      try {
        const result = await prisma.usage_events.createMany({
          data: [row],
          skipDuplicates: true,
        });
        count += result.count;
      } catch (rowError) {
        console.error(
          `[usage backfill] ${row.sourceRef} skipped: ${rowError.message}`
        );
      }
    }
    return count;
  }
}

async function main() {
  console.log(`[usage backfill] database: ${databaseLabel()}`);
  const [before] = await prisma.$queryRaw`
    SELECT count(*)::int AS rows, coalesce(sum("totalTokens"), 0)::bigint AS tokens
    FROM "usage_events"
  `;
  console.log(
    `[usage backfill] usage_events before: ${formatNumber(before.rows)} rows / ${formatNumber(
      before.tokens
    )} tokens`
  );
  if (DRY_RUN)
    console.log("[usage backfill] dry run - nothing will be written");

  const tokenizer = ESTIMATE ? new TokenManager() : null;
  const buffer = [];
  const samples = [];
  let cursor = 0;
  let scanned = 0;
  let withMetrics = 0;
  let estimated = 0;
  let withoutData = 0;
  let queued = 0;
  let inserted = 0;

  console.log("[usage backfill] scanning workspace_chats...");
  while (true) {
    const rows = await prisma.$queryRaw`
      SELECT "id", "workspaceId", "user_id", "prompt", "response", "createdAt"
      FROM "workspace_chats"
      WHERE "id" > ${cursor}
      ORDER BY "id" ASC
      LIMIT ${BATCH_SIZE}
    `;
    if (!rows.length) break;

    for (const row of rows) {
      cursor = row.id;
      scanned++;

      const parsed = parseChatResponse(row.response);
      let metrics = parsed ? metricsFromChat(parsed) : null;
      if (metrics) {
        withMetrics++;
      } else if (ESTIMATE && parsed) {
        metrics = estimateFromChat(parsed, row.prompt || "", tokenizer);
        if (metrics) estimated++;
      }

      if (!metrics) {
        withoutData++;
        if (samples.length < SAMPLE_LIMIT) {
          samples.push({
            id: row.id,
            raw: String(row.response ?? "").slice(0, 320),
          });
        }
        continue;
      }

      buffer.push({
        kind: "llm",
        source: "backfill",
        user_id: row.user_id ? Number(row.user_id) : null,
        workspace_id: row.workspaceId ? Number(row.workspaceId) : null,
        model: metrics.model,
        provider: metrics.provider,
        promptTokens: Math.round(metrics.prompt),
        completionTokens: Math.round(metrics.completion),
        totalTokens: Math.round(metrics.total),
        totalCost: metrics.totalCost,
        sourceRef: `chat:${row.id}`,
        occurredAt: toDate(row.createdAt),
      });
      queued++;

      if (buffer.length >= INSERT_CHUNK) inserted += await flushBatch(buffer);
    }

    if (scanned % 5000 < BATCH_SIZE) {
      console.log(
        `[usage backfill] scanned ${formatNumber(scanned)} chats (queued ${formatNumber(
          queued
        )}, written ${formatNumber(inserted)})`
      );
    }
  }

  inserted += await flushBatch(buffer);

  console.log(
    `[usage backfill] scanned ${formatNumber(scanned)} chats - metrics ${formatNumber(
      withMetrics
    )}, estimated ${formatNumber(estimated)}, unusable ${formatNumber(
      withoutData
    )}`
  );
  console.log(
    `[usage backfill] queued ${formatNumber(queued)}, written ${formatNumber(
      inserted
    )}, duplicates ${formatNumber(queued - inserted)}${
      DRY_RUN ? " (dry run)" : ""
    }`
  );

  if (samples.length) {
    console.log(
      "[usage backfill] sample of rows without usable metrics (check the shape):"
    );
    for (const sample of samples)
      console.log(`  #${sample.id}: ${sample.raw || "(empty response)"}`);
  }

  if (!queued) {
    console.log(
      "[usage backfill] nothing to import. If this database should hold history," +
        " check that workspace_chats has rows and that the app ran against this" +
        " DATABASE_URL (run --estimate to fall back to text-based estimates)."
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[usage backfill] failed:", error.message);
  if (error.message?.includes("does not exist"))
    console.error(
      "[usage backfill] the usage_events table is missing - start the container once so" +
        " `prisma migrate deploy` can create it, then re-run this script."
    );
  await prisma.$disconnect();
  process.exit(1);
});
