#!/usr/bin/env node
/**
 * One-time import of the legacy SQLite database into PostgreSQL.
 *
 * AnythingLLM used to keep its relational data in `server/storage/anythingllm.db`.
 * This script copies that data into the PostgreSQL database pointed to by
 * DATABASE_URL. Documents, the vector DB and the rest of `server/storage` are
 * NOT touched - only the Prisma models listed in TABLE_ORDER are copied.
 *
 * Usage (inside the app container, from docker/):
 *   docker compose run --rm --entrypoint /bin/bash anything-llm \
 *     -c "cd /app/server && yarn migrate:sqlite2pg"
 *
 * Usage (bare metal, from the repo root):
 *   yarn migrate:sqlite2pg
 *
 * Flags:
 *   --force   wipe the PostgreSQL tables listed below before importing.
 *             Without it the script refuses to run against a non-empty database.
 *
 * Env:
 *   DATABASE_URL    destination PostgreSQL connection string (required)
 *   SQLITE_DB_PATH  source file, defaults to server/storage/anythingllm.db
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SERVER_DIR = path.join(__dirname, "..");
const DEFAULT_SQLITE_PATH = path.join(SERVER_DIR, "storage", "anythingllm.db");
const CHUNK_SIZE = 500;

function prismaBinary() {
  const local = path.join(SERVER_DIR, "node_modules", ".bin", "prisma");
  return fs.existsSync(local) ? local : "npx";
}

function runPrisma(command, args = [], stdio = ["ignore", "ignore", "inherit"]) {
  const binary = prismaBinary();
  const base = binary === "npx" ? ["--no-install", "prisma", command] : [command];
  execFileSync(binary, [...base, ...args], {
    cwd: SERVER_DIR,
    stdio,
    env: { ...process.env, CHECKPOINT_DISABLE: "1" },
  });
}

// Docker images built before the switch may still contain a Prisma client
// generated for the legacy SQLite datasource. Regenerate it quietly before the
// client module is required.
runPrisma("generate", [
  "--schema",
  path.join(SERVER_DIR, "prisma", "schema.prisma"),
]);

const { Prisma } = require("@prisma/client");
const prisma = require("../utils/prisma");

// Parents must be copied before the rows that reference them, otherwise the
// PostgreSQL foreign keys reject the inserts.
const TABLE_ORDER = [
  "users",
  "api_keys",
  "system_settings",
  "invites",
  "workspaces",
  "workspace_users",
  "workspace_documents",
  "document_sync_queues",
  "document_sync_executions",
  "document_vectors",
  "workspace_threads",
  "workspace_suggested_messages",
  "workspace_chats",
  "workspace_agent_invocations",
  "embed_configs",
  "embed_chats",
  "recovery_codes",
  "password_reset_tokens",
  "temporary_auth_tokens",
  "browser_extension_api_keys",
  "system_prompt_variables",
  "prompt_history",
  "desktop_mobile_devices",
  "memories",
  "workspace_parsed_files",
  "slash_command_presets",
  "cache_data",
  "event_logs",
  "external_communication_connectors",
  "model_routers",
  "model_router_rules",
  "scheduled_jobs",
  "scheduled_job_runs",
];

const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const force = process.argv.includes("--force");
let stagingDir = null;

function log(message) {
  console.log(`[sqlite2pg] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function cleanup() {
  if (!stagingDir) return;
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {
    // Best effort - the temp copy is disposable.
  }
  stagingDir = null;
}

/**
 * SQLite keeps recently written pages in `<db>-wal`. Copying only the main file
 * would silently lose the newest rows, and reading the live file while the app
 * is running is not safe either. So import works on a throwaway copy of the
 * database together with its WAL/SHM files.
 */
function stageSqliteCopy(sourcePath) {
  stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "anythingllm-sqlite-"));
  const targetPath = path.join(stagingDir, "anythingllm.db");
  fs.copyFileSync(sourcePath, targetPath);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(`${sourcePath}${suffix}`))
      fs.copyFileSync(`${sourcePath}${suffix}`, `${targetPath}${suffix}`);
  }
  return targetPath;
}

function sqliteQuery(dbPath, sql) {
  const stdout = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return stdout ? JSON.parse(stdout) : [];
}

function sqliteTables(dbPath) {
  return sqliteQuery(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table';").map(
    (row) => row.name
  );
}

function deployMigrations() {
  log("PostgreSQL schema is empty - applying migrations first");
  runPrisma(
    "migrate",
    [
      "deploy",
      "--schema",
      path.join(SERVER_DIR, "prisma", "schema.prisma"),
    ],
    "inherit"
  );
}

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name::text = $1;`,
    table
  );
  return rows[0]?.count > 0;
}

async function countRows(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}";`);
  return rows[0]?.count ?? 0;
}

async function truncateAll(tables) {
  log("--force set: truncating target tables");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE;`
  );
}

/** `pg_get_serial_sequence` keeps working after explicit ids were inserted. */
async function resetSequences(tables) {
  for (const table of tables) {
    await prisma.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX("id") FROM "${table}"), 0) + 1, false);`
    );
  }
}

function toBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "t";
}

/**
 * Prisma stores DateTime in SQLite as unix milliseconds (integer), but very old
 * rows can be text. Both shapes are normalized to a JS Date here.
 */
function toDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return new Date(Number(value));
    const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function coerceRow(model, raw) {
  const row = {};
  for (const field of model.fields) {
    if (field.kind !== "scalar") continue;
    const column = field.dbName || field.name;
    if (!(column in raw)) continue;

    const value = raw[column];
    switch (field.type) {
      case "Boolean":
        row[field.name] = toBoolean(value);
        break;
      case "DateTime":
        row[field.name] = toDate(value);
        break;
      case "Int":
        row[field.name] = value === null || value === undefined ? null : Number(value);
        break;
      case "Float":
        row[field.name] = value === null || value === undefined ? null : Number(value);
        break;
      case "BigInt":
        row[field.name] = value === null || value === undefined ? null : BigInt(value);
        break;
      default:
        row[field.name] = value === null || value === undefined ? null : String(value);
    }
  }
  return row;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

async function importTable(table, rows) {
  const model = models.get(table);
  if (!model) fail(`Unknown Prisma model "${table}"`);

  const data = rows.map((row) => coerceRow(model, row));
  for (const chunk of chunks(data, CHUNK_SIZE))
    await prisma[model.name].createMany({ data: chunk });

  return data.length;
}

async function main() {
  if (!process.env.DATABASE_URL)
    fail("DATABASE_URL is not set. Export it or put it into server/.env.");

  const sqlitePath = process.env.SQLITE_DB_PATH || DEFAULT_SQLITE_PATH;
  if (!fs.existsSync(sqlitePath))
    fail(`No SQLite database found at ${sqlitePath} - nothing to migrate.`);

  log(`Source: ${sqlitePath}`);
  log(`Target: ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":****@")}`);
  log("Make sure AnythingLLM (and any other writer) is stopped while the import runs.");

  const stagedPath = stageSqliteCopy(sqlitePath);
  const available = new Set(sqliteTables(stagedPath));
  const tables = TABLE_ORDER.filter((table) => models.has(table) && available.has(table));
  const skipped = TABLE_ORDER.filter((table) => !available.has(table));
  const unknown = [...available].filter(
    (table) =>
      !table.startsWith("_") &&
      table !== "sqlite_sequence" &&
      !TABLE_ORDER.includes(table)
  );

  if (unknown.length > 0)
    log(`Ignoring SQLite tables without a Prisma model: ${unknown.join(", ")}`);
  if (skipped.length > 0)
    log(`Skipping tables missing from the SQLite file: ${skipped.join(", ")}`);
  if (tables.length === 0) fail("The SQLite database does not contain any known table.");

  if (!(await tableExists(tables[0]))) {
    deployMigrations();
    if (!(await tableExists(tables[0])))
      fail("PostgreSQL schema is still missing after `prisma migrate deploy`.");
  }

  const existing = {};
  for (const table of tables) existing[table] = await countRows(table);
  const occupied = Object.entries(existing).filter(([, count]) => count > 0);
  if (occupied.length > 0) {
    const summary = occupied.map(([table, count]) => `${table}=${count}`).join(", ");
    if (!force)
      fail(
        `PostgreSQL already contains data (${summary}). Re-run with --force to replace it.`
      );
    await truncateAll(tables);
  }

  const imported = {};
  for (const table of tables) {
    const rows = sqliteQuery(stagedPath, `SELECT * FROM "${table}";`);
    imported[table] = await importTable(table, rows);
    log(`copied ${String(imported[table]).padStart(6)} rows <- ${table}`);
  }

  await resetSequences(tables);

  const mismatched = [];
  for (const table of tables) {
    const count = await countRows(table);
    if (count !== imported[table])
      mismatched.push(`${table} (sqlite=${imported[table]}, postgres=${count})`);
  }

  if (mismatched.length > 0) fail(`Row count mismatch after import: ${mismatched.join(", ")}`);

  log(
    `Done. ${Object.values(imported).reduce((sum, count) => sum + count, 0)} rows imported into ${tables.length} tables.`
  );
  log("Documents, vector DB and other files in server/storage were not modified.");
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`[sqlite2pg] ERROR: ${error.message}`);
  })
  .finally(async () => {
    cleanup();
    await prisma.$disconnect();
  });
