/**
 * Durable copy of every setting the settings UI writes into process.env.
 *
 * updateENV dumps those values into `server/.env`. Inside Docker that file
 * belongs to the container unless the operator bind mounts it, so rebuilding
 * the image starts the app from the packaged `.env.example`: the LLM
 * credentials and the embedding selection are gone. A missing embedding
 * selection falls back to the default model, which does not match the vectors
 * that are already stored, so every workspace loses its RAG context.
 *
 * Every managed key is therefore mirrored in the `system_settings` table next
 * to the users and workspaces, which survives image updates. On boot the stored
 * value fills in whatever the ENV file is missing.
 *
 * Precedence:
 * - A value present in the ENV file is an explicit operator configuration and
 *   is copied into the database.
 * - A missing ENV value is restored from the database.
 * - `VECTOR_KEYS` are never moved by the ENV file once they are stored. The
 *   index was built with that selection and switching it during an update would
 *   silently invalidate every embedding, so it only changes through the
 *   settings UI (which resets and re-embeds deliberately).
 */

const LABEL_PREFIX = "env:";
const VECTOR_SIGNATURE_LABEL = "vector_store_signature";
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1500;

// Signature this process already wrote, so vector inserts do not upsert the
// same row on every document.
let recordedSignature = null;

// Changing any of these makes every stored vector unusable.
const VECTOR_KEYS = [
  "VECTOR_DB",
  "EMBEDDING_ENGINE",
  "EMBEDDING_MODEL_PREF",
  "EMBEDDING_OUTPUT_DIMENSIONS",
];

// Authentication stays in the ENV file only: removing AUTH_TOKEN is how an
// operator disables authentication, and restoring it from the database would
// make that impossible.
const ENV_ONLY_KEYS = ["AUTH_TOKEN", "JWT_SECRET"];

// Generated once and used to encrypt connector/agent secrets. A regenerated
// pair makes every previously encrypted value unreadable.
const EXTRA_KEYS = ["SIG_KEY", "SIG_SALT"];

function isDisabled() {
  return ["true", "1"].includes(process.env.DISABLE_DB_SETTINGS);
}

function isUsable() {
  return !isDisabled() && process.env.NODE_ENV !== "test";
}

function log(text, ...args) {
  console.log(`\x1b[36m[DB Settings]\x1b[0m ${text}`, ...args);
}

function warn(text, ...args) {
  console.log(`\x1b[33m[DB Settings]\x1b[0m ${text}`, ...args);
}

/**
 * All ENV keys reachable from the settings UI. Read lazily because
 * updateENV depends on this module while it is being loaded.
 * @returns {string[]}
 */
function managedEnvKeys() {
  const { KEY_MAPPING } = require("../helpers/updateENV");
  const keys = new Set(
    Object.values(KEY_MAPPING)
      .map((mapping) => mapping.envKey)
      .filter(Boolean)
  );

  for (const key of EXTRA_KEYS) keys.add(key);
  for (const key of ENV_ONLY_KEYS) keys.delete(key);
  return [...keys];
}

/**
 * The model an embedding call would actually use. The native embedder falls back
 * to its built-in model when nothing is configured, so the resolved name is
 * recorded - otherwise a changed default would look like no change at all.
 * @returns {string}
 */
function embeddingModelForSignature() {
  const configured = process.env.EMBEDDING_MODEL_PREF || null;
  if ((process.env.EMBEDDING_ENGINE || "native") !== "native")
    return configured || "";

  const { NativeEmbedder } = require("../EmbeddingEngines/native");
  if (configured && NativeEmbedder.supportedModels?.[configured])
    return configured;
  return NativeEmbedder.defaultModel;
}

/**
 * The configuration the stored vectors were built with.
 * @returns {{ vectorDb: string, engine: string, model: string, dimensions: string }}
 */
function currentVectorSignature() {
  return {
    vectorDb: process.env.VECTOR_DB || "lancedb",
    engine: process.env.EMBEDDING_ENGINE || "native",
    model: embeddingModelForSignature(),
    dimensions: process.env.EMBEDDING_OUTPUT_DIMENSIONS || "",
  };
}

function describeSignature(signature) {
  const model = signature.model ? ` ${signature.model}` : "";
  return `${signature.vectorDb} / ${signature.engine}${model}`;
}

function sameSignature(left, right) {
  return (
    left?.vectorDb === right?.vectorDb &&
    left?.engine === right?.engine &&
    left?.model === right?.model &&
    (left?.dimensions || "") === (right?.dimensions || "")
  );
}

/**
 * Turns a stored signature back into the ENV keys that produce it.
 * @param {object} signature
 * @returns {Record<string, string>}
 */
function signatureEnvValues(signature) {
  const values = {};
  if (signature?.vectorDb) values.VECTOR_DB = signature.vectorDb;
  if (signature?.engine) values.EMBEDDING_ENGINE = signature.engine;
  if (signature?.model) values.EMBEDDING_MODEL_PREF = signature.model;
  if (signature?.dimensions)
    values.EMBEDDING_OUTPUT_DIMENSIONS = signature.dimensions;
  return values;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the stored rows, retrying while the database is still starting so a
 * slow boot cannot fall through to the packaged .env values.
 * @param {object} prisma
 * @returns {Promise<Map<string, string>>}
 */
async function readStoredValues(prisma) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const rows = await prisma.system_settings.findMany({
        where: { label: { startsWith: LABEL_PREFIX } },
        select: { label: true, value: true },
      });
      return new Map(
        rows.map((row) => [row.label.slice(LABEL_PREFIX.length), row.value])
      );
    } catch (error) {
      if (attempt === RETRY_ATTEMPTS) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }

  return new Map();
}

function upsertValue(prisma, envKey, value) {
  const label = `${LABEL_PREFIX}${envKey}`;
  const stored = value === null || value === undefined ? null : String(value);
  return prisma.system_settings.upsert({
    where: { label },
    update: { value: stored },
    create: { label, value: stored },
  });
}

/**
 * Records (or refreshes) the embedding signature the current vectors belong to.
 * @param {object} prisma
 * @param {object|null} signature
 */
async function recordVectorSignature(prisma, signature = null) {
  const label = VECTOR_SIGNATURE_LABEL;
  const value = JSON.stringify(signature || currentVectorSignature());
  const written = await prisma.system_settings.upsert({
    where: { label },
    update: { value },
    create: { label, value },
  });
  recordedSignature = value;
  return written;
}

function parseSignature(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Keeps the instance on the embedder that produced the vectors already stored.
 * A replaced ENV file or a new default model in a newer image would otherwise
 * point the app at a different embedder and every document would stop matching.
 * @param {object} prisma
 */
async function alignVectorSignature(prisma) {
  const active = currentVectorSignature();
  const row = await prisma.system_settings.findUnique({
    where: { label: VECTOR_SIGNATURE_LABEL },
  });
  const stored = parseSignature(row?.value);
  if (!stored) {
    await recordVectorSignature(prisma, active);
    return;
  }

  if (sameSignature(stored, active)) {
    recordedSignature = JSON.stringify(active);
    return;
  }

  // Nothing has been embedded with the stored selection yet (fresh install, or
  // replacement of an empty index), so the instance is free to move.
  if ((await prisma.document_vectors.count()) === 0) {
    await recordVectorSignature(prisma, active);
    return;
  }

  const restored = signatureEnvValues(stored);
  for (const [envKey, value] of Object.entries(restored)) {
    process.env[envKey] = value;
  }
  recordedSignature = JSON.stringify(stored);
  warn(
    `Stored vectors were embedded with ${describeSignature(
      stored
    )} but the instance was configured for ${describeSignature(
      active
    )}. Switched back to the stored embedder - change it from Settings to re-embed.`
  );
}

/**
 * Remembers the embedder that just produced vectors. Called on every vector
 * insert, so the write is skipped while the signature is unchanged.
 * @returns {Promise<boolean>}
 */
async function rememberVectorSignature() {
  if (!isUsable() || !process.env.DATABASE_URL) return false;
  if (recordedSignature === JSON.stringify(currentVectorSignature()))
    return true;

  try {
    await recordVectorSignature(require("../prisma"));
    return true;
  } catch (error) {
    warn(`Could not store the embedding signature: ${error.message}`);
    return false;
  }
}

/**
 * Values are written back in the single-quoted form dumpENV uses, and the same
 * characters are stripped so a restored value cannot inject another line.
 * @param {string} value
 * @returns {string}
 */
function sanitizeEnvValue(value = "") {
  const text = String(value);
  const offending =
    /[\n\r\t\v\f\u0085\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000"'`#]/;
  const index = text.search(offending);
  return index === -1 ? text : text.slice(0, index);
}

function envFilePath() {
  return require("path").join(__dirname, "../../.env");
}

/**
 * Merges restored values into the ENV file in place.
 *
 * dumpENV rewrites the whole file from process.env, which would drop comments
 * and keys only docker compose reads (UID, GID), so the restored values are
 * merged into the existing lines instead. In the docker deployment the file is
 * bind mounted, so this repairs the operator's own .env as well.
 * @param {Record<string, string>} values
 * @param {string} envPath
 * @returns {number} number of keys written
 */
function syncEnvFile(values = {}, envPath = envFilePath()) {
  const fs = require("fs");
  const pending = new Map(
    Object.entries(values).filter(
      ([envKey, value]) => !!envKey && value != null
    )
  );
  if (!pending.size) return 0;

  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, { encoding: "utf8" })
    : "";
  let written = 0;
  const lines = (existing ? existing.split("\n") : []).map((line) => {
    const envKey = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!envKey || !pending.has(envKey)) return line;
    written += 1;
    const value = pending.get(envKey);
    pending.delete(envKey);
    return `${envKey}='${sanitizeEnvValue(value)}'`;
  });

  if (pending.size) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push("# Restored from the database by [DB Settings]");
    for (const [envKey, value] of pending) {
      lines.push(`${envKey}='${sanitizeEnvValue(value)}'`);
      written += 1;
    }
  }

  fs.writeFileSync(envPath, `${lines.join("\n").trimEnd()}\n`, {
    encoding: "utf8",
    flag: "w",
  });
  return written;
}

/**
 * Restores saved settings from the database into process.env and seeds the
 * database with the values the ENV file already provides.
 * @param {{envFile?: string|null}} opts
 * @returns {Promise<{restored: string[], pinned: string[], synced: string[]}>}
 */
async function hydrateEnvFromDatabase({ envFile = null } = {}) {
  const summary = { restored: [], pinned: [], synced: [] };
  if (!isUsable()) return summary;
  if (!process.env.DATABASE_URL) {
    warn("DATABASE_URL is not set - settings can only be read from the ENV.");
    return summary;
  }

  const prisma = require("../prisma");
  let stored;
  try {
    stored = await readStoredValues(prisma);
  } catch (error) {
    warn(
      `Could not read saved settings, falling back to the ENV file: ${error.message}`
    );
    return summary;
  }

  const upserts = [];
  const fileUpdates = {};
  for (const envKey of managedEnvKeys()) {
    const envValue = process.env[envKey] || null;
    const dbValue = stored.get(envKey) || null;
    if (!envValue && !dbValue) continue;

    if (!envValue) {
      process.env[envKey] = dbValue;
      fileUpdates[envKey] = dbValue;
      summary.restored.push(envKey);
      continue;
    }

    if (envValue === dbValue) continue;

    // The stored selection is what the vectors were embedded with, so the ENV
    // file cannot move it - only the settings UI can, deliberately.
    if (dbValue && VECTOR_KEYS.includes(envKey)) {
      process.env[envKey] = dbValue;
      fileUpdates[envKey] = dbValue;
      summary.pinned.push(envKey);
      continue;
    }

    upserts.push(upsertValue(prisma, envKey, envValue));
    summary.synced.push(envKey);
  }

  await Promise.allSettled(upserts);
  try {
    await alignVectorSignature(prisma);
  } catch (error) {
    warn(`Could not verify the embedding signature: ${error.message}`);
  }

  // The values just taken from the database are missing from the ENV file, so
  // it is repaired on disk as well - the next start then works before the
  // database is even reachable.
  if (Object.keys(fileUpdates).length) {
    try {
      const written = syncEnvFile(fileUpdates, envFile || envFilePath());
      log(`Wrote ${written} restored value(s) back into the ENV file.`);
    } catch (error) {
      warn(`Could not update the ENV file: ${error.message}`);
    }
  }

  if (summary.restored.length)
    log(`Restored from the database: ${summary.restored.join(", ")}`);
  if (summary.synced.length)
    log(
      `Stored ${summary.synced.length} ENV value(s) in the database for the next update.`
    );
  if (summary.pinned.length)
    warn(
      `Kept the stored vector configuration for ${summary.pinned.join(
        ", "
      )} - change it from Settings to re-embed.`
    );
  return summary;
}

/**
 * Stores ENV values directly, keyed by ENV name.
 * @param {Record<string, string>} values
 * @returns {Promise<boolean>}
 */
async function persistEnvValues(values = {}) {
  if (!isUsable() || !process.env.DATABASE_URL) return false;
  const prisma = require("../prisma");
  const writes = Object.entries(values)
    .filter(([envKey]) => !!envKey && !ENV_ONLY_KEYS.includes(envKey))
    .map(([envKey, value]) => upsertValue(prisma, envKey, value));
  if (!writes.length) return false;

  try {
    await Promise.all(writes);
    return true;
  } catch (error) {
    warn(`Could not store settings in the database: ${error.message}`);
    return false;
  }
}

/**
 * Stores the result of a settings save (keys as used by updateENV).
 * @param {Record<string, string|null>} newValues
 * @returns {Promise<boolean>}
 */
async function persistEnvSettings(newValues = {}) {
  if (!isUsable() || !process.env.DATABASE_URL) return false;
  const { KEY_MAPPING } = require("../helpers/updateENV");
  const prisma = require("../prisma");

  const writes = [];
  let vectorsChanged = false;
  for (const [key, value] of Object.entries(newValues)) {
    const envKey = KEY_MAPPING[key]?.envKey;
    if (!envKey || ENV_ONLY_KEYS.includes(envKey)) continue;
    writes.push(upsertValue(prisma, envKey, value));
    if (VECTOR_KEYS.includes(envKey)) vectorsChanged = true;
  }
  if (!writes.length) return false;

  try {
    await Promise.all(writes);
    // The reset that follows an embedding change leaves a different index
    // behind, so the signature has to follow the new selection.
    if (vectorsChanged) await recordVectorSignature(prisma);
    return true;
  } catch (error) {
    warn(`Could not store settings in the database: ${error.message}`);
    return false;
  }
}

/**
 * Reports connector credentials that can no longer be decrypted - the state a
 * database is left in when SIG_KEY/SIG_SALT was replaced. The 1C/Bitrix24 and
 * SQL rows stay listed, so the condition is surfaced at boot instead of being
 * discovered by the users whose requests fail.
 * @returns {Promise<{checked: number, unreadable: string[]}>}
 */
async function verifyEncryptedSecrets() {
  const result = { checked: 0, unreadable: [] };
  if (!isUsable() || !process.env.DATABASE_URL) return result;

  const prisma = require("../prisma");
  const { EncryptionManager } = require("../EncryptionManager");
  const encryption = new EncryptionManager();
  const check = (label, encrypted) => {
    result.checked += 1;
    if (encryption.decrypt(encrypted) === null) result.unreadable.push(label);
  };

  try {
    const dataConnectors = await prisma.workspace_data_connectors.findMany({
      where: { auth_secret: { not: null } },
      select: { id: true, name: true, provider: true, auth_secret: true },
    });
    for (const connector of dataConnectors)
      check(
        `${connector.provider} "${connector.name}" (id ${connector.id})`,
        connector.auth_secret
      );

    // A SQL connector always carries a connection string, so every row is one
    // stored credential and there is nothing to filter out.
    const sqlConnectors = await prisma.workspace_sql_connectors.findMany({
      select: { id: true, name: true, engine: true, connection_string: true },
    });
    for (const connector of sqlConnectors)
      check(
        `${connector.engine} "${connector.name}" (id ${connector.id})`,
        connector.connection_string
      );
  } catch (error) {
    warn(
      `Could not verify the stored connection credentials: ${error.message}`
    );
    return result;
  }

  if (result.unreadable.length)
    warn(
      `Stored credentials cannot be decrypted any more (${result.unreadable.join(
        ", "
      )}). Re-enter them in the workspace settings so they are encrypted with the current SIG_KEY.`
    );
  else if (result.checked)
    log(`Read ${result.checked} stored connection credential(s) successfully.`);
  return result;
}

module.exports = {
  hydrateEnvFromDatabase,
  persistEnvSettings,
  persistEnvValues,
  rememberVectorSignature,
  verifyEncryptedSecrets,
  managedEnvKeys,
  currentVectorSignature,
};
