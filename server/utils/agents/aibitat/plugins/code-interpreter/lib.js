const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const createFilesLib = require("../create-files/lib");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 2_500;
const HEALTH_CACHE_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_SOCKET_PATH = "/sock/ci.sock";

// create-files derives the storage filename from `{fileType}-{uuid}.{ext}`, and
// only accepts letter-only file types - so map extensions onto safe buckets.
const FILE_TYPE_BY_EXTENSION = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  csv: "data",
  tsv: "data",
  json: "data",
  parquet: "data",
  txt: "text",
  md: "text",
  log: "text",
  xlsx: "xlsx",
  pdf: "pdf",
  zip: "archive",
  html: "text",
  xml: "data",
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function transport() {
  const url = (process.env.CODE_INTERPRETER_URL || "").trim();
  const configuredSocket = (process.env.CODE_INTERPRETER_SOCKET || "").trim();
  const socketPath =
    configuredSocket ||
    (process.env.ANYTHING_LLM_RUNTIME === "docker" ? DEFAULT_SOCKET_PATH : "");
  return {
    url,
    socketPath,
    token: (process.env.CODE_INTERPRETER_TOKEN || "").trim(),
  };
}

function normalizeExtension(extension = "") {
  const clean = String(extension).replace(/^\./, "").toLowerCase();
  const safe = clean.replace(/[^a-z0-9]/g, "");
  return safe || "txt";
}

function normalizeDisplayName(name = "") {
  const base = path
    .basename(String(name))
    .replace(/[\\/\r\n"]/g, "_")
    .trim();
  return (base || "output.txt").slice(0, 120);
}

function clampTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(parsed), 1_000), MAX_TIMEOUT_MS);
}

class CodeInterpreterClient {
  #health = { checkedAt: 0, available: false };

  /**
   * Transports are opt-in: a unix socket in Docker Compose, or an explicit URL
   * for bare-metal/development installs.
   * @returns {{url: string, socketPath: string, token: string}}
   */
  get transport() {
    return transport();
  }

  /**
   * Health-check the sandbox. Cached briefly so the tool menu and the agent
   * startup path do not probe on every render/turn.
   * @param {boolean} [force=false] - Skip the cache.
   * @returns {Promise<boolean>}
   */
  async isToolAvailable(force = false) {
    const now = Date.now();
    if (!force && now - this.#health.checkedAt < HEALTH_CACHE_MS)
      return this.#health.available;

    let available = false;
    try {
      await this.#request("GET", "/health", null, HEALTH_TIMEOUT_MS);
      available = true;
    } catch {
      available = false;
    }

    this.#health = { checkedAt: now, available };
    return available;
  }

  /**
   * Stable, filesystem-safe sandbox id for the current conversation.
   * Files persist across turns of the same chat but never leak between chats.
   * @param {object} aibitat
   * @returns {string}
   */
  sessionId(aibitat) {
    const invocation = aibitat?.handlerProps?.invocation || {};
    const workspaceId =
      invocation.workspace?.id ?? invocation.workspace_id ?? "na";
    const chatId = aibitat?.trackedChatId ?? "adhoc";
    return `ws${workspaceId}chat${chatId}`
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 64);
  }

  /**
   * Run a Python cell.
   * @param {object} aibitat
   * @param {{code: string, timeoutMs?: number}} params
   * @returns {Promise<object>} Raw sandbox response
   */
  async execute(aibitat, { code, timeoutMs } = {}) {
    return await this.#request(
      "POST",
      "/execute",
      {
        session: this.sessionId(aibitat),
        code,
        timeoutMs: clampTimeout(timeoutMs),
      },
      clampTimeout(timeoutMs) + 15_000
    );
  }

  /**
   * Push a file into the session sandbox directory.
   * @param {object} aibitat
   * @param {{name: string, buffer: Buffer}} params
   * @returns {Promise<object>}
   */
  async writeFile(aibitat, { name, buffer }) {
    return await this.#request("POST", "/files", {
      session: this.sessionId(aibitat),
      name,
      contentBase64: buffer.toString("base64"),
    });
  }

  /**
   * List files currently living in the session sandbox.
   * @param {object} aibitat
   * @returns {Promise<object>}
   */
  async listFiles(aibitat) {
    const session = this.sessionId(aibitat);
    return await this.#request(
      "GET",
      `/files?session=${encodeURIComponent(session)}`,
      null,
      10_000
    );
  }

  /**
   * Delete every file in the session sandbox.
   * @param {object} aibitat
   * @returns {Promise<object>}
   */
  async reset(aibitat) {
    return await this.#request("POST", "/reset", {
      session: this.sessionId(aibitat),
    });
  }

  /**
   * Persist artifacts produced by a cell: files become chat download cards and
   * images are also attached so the model can actually see its own chart.
   * @param {object} aibitat
   * @param {Array<object>} artifacts
   * @returns {Promise<Array<{name: string, storageFilename: string, size: number}>>}
   */
  async publishArtifacts(aibitat, artifacts = []) {
    const published = [];
    for (const artifact of artifacts) {
      if (!artifact?.contentBase64) continue;

      let buffer;
      try {
        buffer = Buffer.from(artifact.contentBase64, "base64");
      } catch {
        continue;
      }
      if (!buffer.length) continue;

      const extension = normalizeExtension(
        artifact.extension || path.extname(artifact.name || "")
      );
      const displayFilename = normalizeDisplayName(artifact.name);
      const fileType = FILE_TYPE_BY_EXTENSION[extension] || "file";

      try {
        const saved = await createFilesLib.saveGeneratedFile({
          fileType,
          extension,
          buffer,
          displayFilename,
        });
        const payload = {
          filename: saved.displayFilename,
          storageFilename: saved.filename,
          fileSize: saved.fileSize,
        };
        aibitat.socket?.send?.("fileDownloadCard", payload);
        createFilesLib.registerOutput(
          aibitat,
          "CodeInterpreterFileDownload",
          payload
        );

        if (
          IMAGE_EXTENSIONS.has(extension) &&
          buffer.length <= MAX_ATTACHMENT_BYTES
        ) {
          const mime = createFilesLib.getMimeType(`.${extension}`);
          aibitat.addToolAttachment?.({
            name: saved.displayFilename,
            mime,
            contentString: `data:${mime};base64,${artifact.contentBase64}`,
          });
        }

        published.push({
          name: saved.displayFilename,
          storageFilename: saved.filename,
          size: saved.fileSize,
        });
      } catch (error) {
        console.error(
          `[CodeInterpreter] Failed to persist artifact ${artifact.name}: ${error.message}`
        );
      }
    }
    return published;
  }

  /**
   * Minimal HTTP client that speaks either unix sockets or TCP.
   * @param {string} method
   * @param {string} route
   * @param {object|null} body
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  #request(method, route, body, timeoutMs = 30_000) {
    const { url, socketPath, token } = this.transport;
    if (!url && !socketPath) {
      return Promise.reject(
        new Error("Code interpreter transport is not configured")
      );
    }

    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = {
      Accept: "application/json",
      "X-Sandbox-Token": token,
    };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = payload.length;
    }

    const options = { method, path: route, headers, agent: false };
    if (url) {
      const parsed = new URL(url);
      options.host = parsed.hostname;
      options.port = parsed.port || 80;
      options.path = `${parsed.pathname.replace(/\/$/, "")}${route}`;
    } else {
      options.socketPath = socketPath;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const request = http.request(options, (response) => {
        const chunks = [];
        let size = 0;

        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy();
            fail(new Error("Code interpreter response is too large"));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          if (settled) return;
          settled = true;
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { error: raw.slice(0, 500) };
          }
          if (response.statusCode >= 400) {
            reject(
              new Error(
                parsed?.error ||
                  `Code interpreter returned ${response.statusCode}`
              )
            );
            return;
          }
          resolve(parsed);
        });
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error("Code interpreter did not answer in time"));
      });
      request.on("error", (error) => fail(error));
      if (payload) request.write(payload);
      request.end();
    });
  }
}

/**
 * Read a file the agent is allowed to see (the filesystem skill's sandbox) so it
 * can be uploaded into the interpreter.
 * @param {string} requestedPath
 * @returns {Promise<{buffer: Buffer, name: string}>}
 */
async function readAllowedFile(requestedPath) {
  const filesystem = require("../filesystem/lib");
  const validPath = await filesystem.validatePath(requestedPath);
  const stat = await fs.stat(validPath);
  if (!stat.isFile()) throw new Error("Path is not a file");
  const buffer = await fs.readFile(validPath);
  return { buffer, name: path.basename(validPath) };
}

module.exports = new CodeInterpreterClient();
module.exports.readAllowedFile = readAllowedFile;
module.exports.normalizeDisplayName = normalizeDisplayName;
module.exports.normalizeExtension = normalizeExtension;
module.exports.clampTimeout = clampTimeout;
module.exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
module.exports.MAX_TIMEOUT_MS = MAX_TIMEOUT_MS;
