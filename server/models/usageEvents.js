const { Prisma } = require("@prisma/client");
const prisma = require("../utils/prisma");
const {
  addDays,
  resolveTimeZone,
  wallDayKey,
  zonedMidnight,
  zonedParts,
} = require("../utils/time/zone");

const USAGE_KINDS = {
  llm: "llm",
  image: "image",
  transcription: "transcription",
};

// Metric -> column used by the dashboard aggregations. `kind` narrows the rows
// so one table can hold every kind without cross-contaminating the sums.
const SERIES_METRICS = {
  tokens: {
    kind: USAGE_KINDS.llm,
    column: Prisma.raw('"totalTokens"'),
    cast: Prisma.raw("::bigint"),
  },
  images: {
    kind: USAGE_KINDS.image,
    column: Prisma.raw('"images"'),
    cast: Prisma.raw("::bigint"),
  },
  audioSeconds: {
    kind: USAGE_KINDS.transcription,
    column: Prisma.raw('"audioSeconds"'),
    cast: Prisma.raw("::float8"),
  },
};

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toPlainNumber(value) {
  if (typeof value === "bigint") return Number(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Prisma stores DateTime columns as naive UTC timestamps, so boundaries are
// serialized the same way - this keeps day buckets independent of the
// PostgreSQL session time zone.
function toNaiveUtc(date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

/**
 * Reporting periods can start on any day of the month (1 = calendar month,
 * 15 = 15th to 15th) so settlements that do not follow the calendar month are
 * supported. Capped at 28 because every month has at least 28 days.
 * @param {number|string} value
 * @returns {number}
 */
function normalizePeriodStartDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : 1;
}

/**
 * Wall date that starts the reporting period containing `now` - the latest
 * occurrence of `startDay` in the configured time zone, so today is always
 * inside the window.
 * @param {Date} now
 * @param {number} startDay - 1..28
 * @param {string} timeZone
 * @returns {{ year: number, month: number, day: number }}
 */
function startOfReportPeriod(now, startDay, timeZone) {
  const day = normalizePeriodStartDay(startDay);
  const today = zonedParts(now, timeZone);
  if (today.day >= day) return { year: today.year, month: today.month, day };

  // Before this month's start day - the period began last month. Every month
  // has at least 28 days, so `day` always exists there.
  const lastDayOfPreviousMonth = addDays(
    { year: today.year, month: today.month, day: 1 },
    -1
  );
  return {
    year: lastDayOfPreviousMonth.year,
    month: lastDayOfPreviousMonth.month,
    day,
  };
}

const UsageEvents = {
  kinds: USAGE_KINDS,

  /**
   * Persists a single usage row. Never throws - usage accounting must not break
   * the request that produced it.
   * @param {Object} payload
   * @returns {Promise<Object|null>}
   */
  log: async function ({
    kind,
    source = null,
    userId = null,
    workspaceId = null,
    model = null,
    provider = null,
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    images = 0,
    audioSeconds = 0,
    totalCost = null,
    sourceRef = null,
    occurredAt = new Date(),
  }) {
    try {
      if (!Object.values(USAGE_KINDS).includes(kind))
        throw new Error(`Unknown usage kind: ${kind}`);
      // Unit tests run without a database - skip persistence there.
      if (process.env.NODE_ENV === "test") return null;

      const event = await prisma.usage_events.create({
        data: {
          kind,
          source,
          user_id: userId ? Number(userId) : null,
          workspace_id: workspaceId ? Number(workspaceId) : null,
          model: model || null,
          provider: provider || null,
          promptTokens: toPositiveInt(promptTokens),
          completionTokens: toPositiveInt(completionTokens),
          totalTokens: toPositiveInt(totalTokens),
          images: toPositiveInt(images),
          audioSeconds: toPositiveNumber(audioSeconds),
          totalCost: Number.isFinite(Number(totalCost))
            ? Number(totalCost)
            : null,
          sourceRef: sourceRef || null,
          occurredAt,
        },
      });
      return event;
    } catch (error) {
      // Duplicate backfill rows are expected when the script is re-run.
      if (!error.message?.includes("Unique constraint"))
        console.error(
          `\x1b[31m[Usage Logging Failed]\x1b[0m - ${kind}: ${error.message}`
        );
      return null;
    }
  },

  /**
   * Records token usage for one LLM completion (or a whole agent run, when the
   * caller passes accumulated provider usage).
   * @param {Object} params
   * @param {Object} params.metrics - provider metrics (prompt_tokens/completion_tokens/total_tokens)
   * @param {Object|null} params.user
   * @param {Object|null} params.workspace
   * @param {string} params.source - chat | agent | api | embed | telegram
   * @param {string|null} params.sourceRef
   * @returns {Promise<Object|null>}
   */
  logLLMUsage: async function ({
    metrics = {},
    user = null,
    workspace = null,
    source = "chat",
    sourceRef = null,
  }) {
    const promptTokens = toPositiveInt(metrics?.prompt_tokens);
    const completionTokens = toPositiveInt(metrics?.completion_tokens);
    const totalTokens =
      toPositiveInt(metrics?.total_tokens) || promptTokens + completionTokens;
    if (!totalTokens) return null;

    return this.log({
      kind: USAGE_KINDS.llm,
      source,
      userId: user?.id ?? null,
      workspaceId: workspace?.id ?? workspace?.workspace_id ?? null,
      model: metrics?.model ?? null,
      provider: metrics?.provider ?? null,
      promptTokens,
      completionTokens,
      totalTokens,
      totalCost: metrics?.totalCost ?? null,
      sourceRef,
    });
  },

  /**
   * Records one generated (or edited) image.
   * @param {Object} params
   * @param {Object|null} params.user
   * @param {number|null} params.workspaceId
   * @param {string} params.source - agent | command | api
   * @param {string|null} params.model
   * @param {string|null} params.provider
   * @returns {Promise<Object|null>}
   */
  logImageGeneration: async function ({
    user = null,
    workspaceId = null,
    source = "agent",
    model = null,
    provider = null,
    images = 1,
  }) {
    return this.log({
      kind: USAGE_KINDS.image,
      source,
      userId: user?.id ?? null,
      workspaceId,
      model,
      provider,
      images: toPositiveInt(images) || 1,
    });
  },

  /**
   * Records audio sent for transcription - either a chat voice clip or an audio
   * document the collector transcribed on upload.
   * @param {Object} params
   * @param {Object|null} params.user
   * @param {number|null} [params.workspaceId]
   * @param {number} params.audioSeconds
   * @param {string} params.source - stt | document | telegram
   * @param {string|null} params.provider
   * @param {string|null} params.model
   * @returns {Promise<Object|null>}
   */
  logTranscription: async function ({
    user = null,
    workspaceId = null,
    audioSeconds = 0,
    source = "stt",
    provider = null,
    model = null,
  }) {
    const seconds = toPositiveNumber(audioSeconds);
    if (!seconds) return null;

    return this.log({
      kind: USAGE_KINDS.transcription,
      source,
      userId: user?.id ?? null,
      workspaceId,
      audioSeconds: Math.round(seconds * 100) / 100,
      provider,
      model,
    });
  },

  /**
   * Aggregates everything the admin dashboard renders.
   * @param {Object} options
   * @param {number} [options.days=90] - length of the daily chart window
   * @param {number} [options.topUsersLimit=10] - rows for the token leaderboard
   * @param {number} [options.topMetricLimit=5] - rows for the image/audio leaderboards
   * @param {number} [options.periodStartDay=1] - day of the month the reporting period starts on
   * @param {string} [options.timeZone] - IANA zone the days and period are computed in
   * @param {Date} [options.now]
   * @returns {Promise<Object>}
   */
  dashboard: async function ({
    days = 90,
    topUsersLimit = 10,
    topMetricLimit = 5,
    periodStartDay = 1,
    timeZone: requestedTimeZone = null,
    now = new Date(),
  } = {}) {
    const windowDays = Number.isFinite(Number(days))
      ? Math.min(Math.max(Math.round(Number(days)), 1), 365)
      : 90;
    const reportStartDay = normalizePeriodStartDay(periodStartDay);
    const timeZone = resolveTimeZone(requestedTimeZone);
    const today = zonedParts(now, timeZone);
    const seriesStartWall = addDays(today, -(windowDays - 1));
    const seriesStart = zonedMidnight(seriesStartWall, timeZone);
    const periodStartWall = startOfReportPeriod(now, reportStartDay, timeZone);
    const periodStart = zonedMidnight(periodStartWall, timeZone);
    const topSinceWall = addDays(today, -29);
    const topSince = zonedMidnight(topSinceWall, timeZone);

    const [totals] = await prisma.$queryRaw`
      SELECT
        COALESCE(SUM("totalTokens") FILTER (WHERE "kind" = 'llm'), 0)::bigint AS all_time_tokens,
        COALESCE(SUM("promptTokens") FILTER (WHERE "kind" = 'llm'), 0)::bigint AS all_time_prompt_tokens,
        COALESCE(SUM("completionTokens") FILTER (WHERE "kind" = 'llm'), 0)::bigint AS all_time_completion_tokens,
        COALESCE(SUM("totalTokens") FILTER (WHERE "kind" = 'llm' AND "occurredAt" >= ${toNaiveUtc(periodStart)}::timestamp), 0)::bigint AS period_tokens,
        COALESCE(SUM("images") FILTER (WHERE "kind" = 'image'), 0)::bigint AS all_time_images,
        COALESCE(SUM("images") FILTER (WHERE "kind" = 'image' AND "occurredAt" >= ${toNaiveUtc(periodStart)}::timestamp), 0)::bigint AS period_images,
        COALESCE(SUM("audioSeconds") FILTER (WHERE "kind" = 'transcription'), 0)::float8 AS all_time_audio_seconds,
        COALESCE(SUM("audioSeconds") FILTER (WHERE "kind" = 'transcription' AND "occurredAt" >= ${toNaiveUtc(periodStart)}::timestamp), 0)::float8 AS period_audio_seconds,
        COALESCE(SUM("totalCost"), 0)::float8 AS all_time_cost
      FROM "usage_events"
    `;

    const series = {
      start: wallDayKey(seriesStartWall),
      days: [],
      tokens: [],
      images: [],
      audioSeconds: [],
    };
    for (let index = 0; index < windowDays; index++)
      series.days.push(wallDayKey(addDays(seriesStartWall, index)));

    for (const metric of Object.keys(SERIES_METRICS)) {
      const values = await this.dailyValues({
        metric,
        since: seriesStart,
        timeZone,
      });
      series[metric] = series.days.map((day) => values.get(day) ?? 0);
    }

    return {
      generatedAt: now.toISOString(),
      range: {
        days: windowDays,
        timeZone,
        seriesStart: wallDayKey(seriesStartWall),
        topUsersSince: wallDayKey(topSinceWall),
        periodStart: wallDayKey(periodStartWall),
        periodStartDay: reportStartDay,
      },
      totals: {
        tokens: {
          allTime: toPlainNumber(totals?.all_time_tokens),
          period: toPlainNumber(totals?.period_tokens),
          prompt: toPlainNumber(totals?.all_time_prompt_tokens),
          completion: toPlainNumber(totals?.all_time_completion_tokens),
        },
        images: {
          allTime: toPlainNumber(totals?.all_time_images),
          period: toPlainNumber(totals?.period_images),
        },
        transcription: {
          allTimeSeconds: toPlainNumber(totals?.all_time_audio_seconds),
          periodSeconds: toPlainNumber(totals?.period_audio_seconds),
        },
        cost: {
          allTime: toPlainNumber(totals?.all_time_cost),
        },
      },
      series,
      topUsers: {
        tokens: await this.topUsers({
          metric: "tokens",
          since: topSince,
          limit: topUsersLimit,
        }),
        images: await this.topUsers({
          metric: "images",
          since: periodStart,
          limit: topMetricLimit,
        }),
        audioSeconds: await this.topUsers({
          metric: "audioSeconds",
          since: periodStart,
          limit: topMetricLimit,
        }),
      },
    };
  },

  /**
   * Per-day sums for one metric, keyed by local calendar day (YYYY-MM-DD).
   * @param {Object} params
   * @param {string} params.metric
   * @param {Date} params.since
   * @param {string} params.timeZone
   * @returns {Promise<Map<string, number>>}
   */
  dailyValues: async function ({ metric, since, timeZone }) {
    const config = SERIES_METRICS[metric];
    if (!config) return new Map();

    const rows = await prisma.$queryRaw`
      SELECT to_char(
               timezone(${timeZone}, timezone('UTC', "occurredAt")),
               'YYYY-MM-DD'
             ) AS day,
             COALESCE(SUM(${config.column}), 0)${config.cast} AS value
      FROM "usage_events"
      WHERE "kind" = ${config.kind}
        AND "occurredAt" >= ${toNaiveUtc(since)}::timestamp
      GROUP BY 1
    `;

    return new Map(rows.map((row) => [row.day, toPlainNumber(row.value)]));
  },

  /**
   * Leaderboard of users for one metric inside a time window.
   * @param {Object} params
   * @param {string} params.metric
   * @param {Date} params.since
   * @param {number} params.limit
   * @returns {Promise<Array<{userId: number|null, username: string, total: number}>>}
   */
  topUsers: async function ({ metric, since, limit = 10 }) {
    const config = SERIES_METRICS[metric];
    if (!config) return [];

    const rows = await prisma.$queryRaw`
      SELECT e."user_id" AS user_id,
             COALESCE(u."username", 'Unknown user') AS username,
             COALESCE(SUM(e.${config.column}), 0)${config.cast} AS total
      FROM "usage_events" e
      LEFT JOIN "users" u ON u."id" = e."user_id"
      WHERE e."kind" = ${config.kind}
        AND e."occurredAt" >= ${toNaiveUtc(since)}::timestamp
      GROUP BY e."user_id", u."username"
      ORDER BY total DESC
      LIMIT ${Number(limit)}
    `;

    return rows.map((row) => ({
      userId: row.user_id ?? null,
      username: row.username,
      total: toPlainNumber(row.total),
    }));
  },
};

module.exports = { UsageEvents };
