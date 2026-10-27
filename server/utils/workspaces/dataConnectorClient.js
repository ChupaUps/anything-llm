/**
 * HTTP client for workspace data connectors (1C, Bitrix24 and any other REST
 * service a user connects to their workspace).
 *
 * The connector stores a base URL, an auth strategy and an optional JSON schema
 * describing the response. Requests are always GET - the goal is to pull the
 * current state of an external system into the agent context, never to mutate
 * it, so no other verb is supported on purpose.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SCHEMA_PATHS = 200;
const MAX_SCHEMA_DEPTH = 5;
const MAX_ARRAY_ITEMS = 20;
const MAX_TOOL_PAYLOAD_CHARS = 24_000;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
]);

/**
 * Rejects URLs that can never be an external business system (non HTTP schemes,
 * loopback/LAN metadata endpoints). Private networks stay allowed because 1C
 * and Bitrix24 portals are routinely hosted on-premise.
 * @param {string} rawUrl
 * @returns {URL}
 */
function parseConnectorUrl(rawUrl = "") {
  let parsed = null;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    throw new Error("Некорректный адрес: укажите полный URL с http:// или https://");
  }

  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Поддерживаются только адреса http:// и https://");

  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    /^(127\.|0\.|::1$|\[::1\])/.test(host) ||
    /^169\.254\./.test(host)
  )
    throw new Error("Этот адрес запрещён: подключите внешний сервер, а не локальный");

  return parsed;
}

/**
 * Builds the final request URL from the connector URL and optional relative
 * path/query. A relative path can never escape the configured base URL.
 * @param {string} baseUrl
 * @param {{path?: string|null, query?: object|null}} opts
 * @returns {URL}
 */
function buildRequestUrl(baseUrl = "", { path = null, query = null } = {}) {
  const base = parseConnectorUrl(baseUrl);
  let url = base;

  if (path && String(path).trim()) {
    const relative = String(path).trim();
    if (/^[a-z]+:\/\//i.test(relative))
      throw new Error("Путь должен быть относительным - адрес задаётся в подключении");
    // Resolve against the current URL and make sure the origin did not change.
    const resolved = new URL(
      relative.replace(/^\/+/, ""),
      base.href.endsWith("/") ? base.href : `${base.href}/`
    );
    if (resolved.origin !== base.origin)
      throw new Error("Путь выходит за пределы адреса подключения");
    url = resolved;
  }

  appendQuery(url, query);
  return url;
}

/**
 * Applies user supplied query parameters. Empty values are skipped so optional
 * filters can be passed as null by the model.
 * @param {URL} url
 * @param {object|null} query
 */
function appendQuery(url, query = null) {
  if (!query || typeof query !== "object") return;
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object")
      url.searchParams.set(key, JSON.stringify(value));
    else url.searchParams.set(key, String(value));
  }
}

/**
 * Bitrix24 methods are plain names such as `crm.deal.list`; `.json` is added
 * when the user or the model forgot it.
 * @param {string|null} rawPath
 * @returns {string}
 */
function bitrixMethod(rawPath = "") {
  const method = String(rawPath || "").trim();
  if (!method) return "";
  if (/^[a-z]+:\/\//i.test(method))
    throw new Error("Метод должен быть относительным - адрес задаётся в подключении");
  const clean = method.replace(/^\/+/, "").replace(/[?#].*$/, "");
  return /\.(json|php)$/i.test(clean) ? clean : `${clean}.json`;
}

/**
 * Resolves the target URL of a Bitrix24 call for both supported variants:
 * - `webhook` keeps the secret inside the address (`/rest/<id>/<code>/`) and the
 *   method is appended right after it;
 * - `oauth` talks to the portal itself and places the method under `/rest/`,
 *   the access token travels in the `auth` query parameter.
 * @param {object} connector
 * @param {string|null} rawPath REST method name, e.g. `crm.deal.list`
 * @returns {URL}
 */
function bitrixRequestUrl(connector = {}, rawPath = null) {
  const base = parseConnectorUrl(connector.url);
  const method = bitrixMethod(rawPath || connector.default_path || "");
  const prefix = base.pathname.replace(/\/+$/, "");

  if (String(connector.variant || "webhook") === "oauth") {
    const root = /\/rest$/i.test(prefix) ? prefix : `${prefix}/rest`;
    return new URL(method ? `${base.origin}${root}/${method}` : `${base.origin}${root}/`);
  }

  if (!method) return new URL(`${base.origin}${prefix}`);
  return new URL(`${base.origin}${prefix}/${method}`);
}

/**
 * Splits a Bitrix24 webhook address into the webhook root and the REST method:
 * `/rest/1/token/crm.deal.list.json` -> `/rest/1/token/` + `crm.deal.list`.
 * @param {string} rawUrl
 * @returns {{base: string, method: string|null}}
 */
function splitBitrixWebhookUrl(rawUrl = "") {
  const parsed = new URL(String(rawUrl));
  const match = parsed.pathname.match(/^(.*\/rest\/[^/]+\/[^/]+\/?)(.+)$/i);
  if (!match) return { base: parsed.href, method: null };

  const base = `${parsed.origin}${match[1]}`;
  const method = match[2].replace(/\.json$/i, "").replace(/^\/+|\/+$/g, "");
  return { base, method: method || null };
}

/**
 * Header set for a connector. `secret` must already be decrypted.
 * @param {object} connector
 * @param {string|null} secret
 * @returns {{[key: string]: string}}
 */
function buildRequestHeaders(connector = {}, secret = null) {
  const headers = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  };

  // Extra headers are user supplied JSON - invalid values are ignored so a typo
  // in one header cannot break the whole request.
  try {
    const extra = connector.headers ? JSON.parse(connector.headers) : null;
    if (extra && typeof extra === "object")
      for (const [key, value] of Object.entries(extra))
        if (typeof value === "string") headers[key] = value;
  } catch {
    /* ignored */
  }

  const authType = String(connector.auth_type || "none");
  if (secret) {
    if (authType === "bearer") headers.Authorization = `Bearer ${secret}`;
    if (authType === "basic") {
      const credentials = `${connector.auth_username || ""}:${secret}`;
      headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }
    if (authType === "header")
      headers[connector.auth_key || "X-API-Key"] = secret;
    if (authType === "query") {
      // Handled by the caller through the query string.
    }
  }

  return headers;
}

/**
 * Query parameters that belong to the auth strategy instead of the user.
 * @param {object} connector
 * @param {string|null} secret
 * @returns {{[key: string]: string}}
 */
function authQueryParams(connector = {}, secret = null) {
  if (connector.auth_type !== "query" || !secret) return {};
  return { [connector.auth_key || "apikey"]: secret };
}

/**
 * Performs the GET request and parses the body.
 * @param {object} connector normalized connector with a decrypted `secret`
 * @param {{path?: string|null, query?: object|null, timeoutMs?: number}} opts
 * @returns {Promise<{ok: boolean, status: number, durationMs: number, contentType: string, data: any, text: string, error: string|null, url: string}>}
 */
async function fetchConnectorData(connector = {}, opts = {}) {
  const startedAt = Date.now();
  const timeoutMs = Number(opts.timeoutMs || DEFAULT_TIMEOUT_MS);
  let url = null;
  let href = "";

  try {
    url =
      connector.provider === "bitrix24"
        ? bitrixRequestUrl(connector, opts.path)
        : buildRequestUrl(connector.url, {
            // A custom API may keep the service address in `url` and the
            // endpoint in `default_path`, so the agent can call it without
            // repeating the path on every request.
            path: opts.path || connector.default_path || null,
          });
    appendQuery(url, opts.query);
    for (const [key, value] of Object.entries(
      authQueryParams(connector, connector.secret)
    ))
      url.searchParams.set(key, value);

    // 1C OData answers with XML unless $format is requested explicitly - the
    // agent needs JSON, so the parameter is added when the address is OData.
    if (
      connector.provider === "1c" &&
      /\/odata\//i.test(url.pathname) &&
      !url.searchParams.has("$format")
    )
      url.searchParams.set("$format", "json");

    // `$filter`, `$select` and the like stay readable in logs and in the model
    // context: `$` is a legal sub-delimiter in a query string.
    href = url.href.replace(/%24/gi, "$");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response = null;
    try {
      response = await fetch(href, {
        method: "GET",
        headers: buildRequestHeaders(connector, connector.secret),
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    const contentType = response.headers.get("content-type") || "";
    let text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) text = text.slice(0, MAX_RESPONSE_BYTES);

    let data = text;
    if (contentType.includes("json") || /^\s*[[{]/.test(text)) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      contentType,
      data,
      text,
      error: response.ok
        ? null
        : `HTTP ${response.status} ${response.statusText || ""}`.trim(),
      url: href,
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      contentType: "",
      data: null,
      text: "",
      error: aborted
        ? `Сервер не ответил за ${Math.round(timeoutMs / 1000)} с`
        : error?.cause?.message || error?.message || "Ошибка запроса",
      url: href || url?.href || String(connector.url || ""),
    };
  }
}

function jsonTypeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function shortExample(value) {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
}

/**
 * Walks a JSON payload and returns a flat, model friendly description of its
 * shape: one entry per field path with its type and a scalar example.
 * @param {any} sample
 * @returns {{root: string, fields: Array<{path: string, type: string, count?: number, example?: any}>}}
 */
function describeJson(sample) {
  const fields = [];

  const walk = (value, path, depth) => {
    if (fields.length >= MAX_SCHEMA_PATHS) return;
    const type = jsonTypeOf(value);

    if (type === "array") {
      const item = value.find((entry) => entry !== null && entry !== undefined);
      fields.push({
        path: path || "(root)",
        type: `array<${jsonTypeOf(item)}>`,
        count: value.length,
      });
      if (depth >= MAX_SCHEMA_DEPTH || item === undefined) return;
      walk(item, `${path}[]`, depth + 1);
      return;
    }

    if (type === "object") {
      if (path)
        fields.push({ path, type: "object", count: Object.keys(value).length });
      if (depth >= MAX_SCHEMA_DEPTH) return;
      for (const [key, entry] of Object.entries(value)) {
        if (fields.length >= MAX_SCHEMA_PATHS) return;
        walk(entry, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }

    fields.push({
      path: path || "(root)",
      type,
      example: shortExample(value),
    });
  };

  walk(sample, "", 0);
  return { root: jsonTypeOf(sample), fields };
}

/**
 * Schema string stored on the connector. Kept as JSON so the UI can show and
 * edit it, while the agent receives a plain text rendering.
 * @param {any} sample
 * @returns {string}
 */
function generateSchema(sample) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      ...describeJson(sample),
    },
    null,
    2
  );
}

/**
 * Renders a stored schema for the model.
 * @param {string|null} rawSchema
 * @returns {string}
 */
function renderSchema(rawSchema = null) {
  if (!rawSchema) return "";
  let parsed = null;
  try {
    parsed = JSON.parse(rawSchema);
  } catch {
    return "";
  }
  if (!Array.isArray(parsed?.fields)) return "";

  const lines = parsed.fields.slice(0, 80).map((field) => {
    const count = field.count !== undefined ? `, ${field.count}` : "";
    const example =
      field.example !== undefined && field.example !== null
        ? ` = ${field.example}`
        : "";
    return `  - ${field.path}: ${field.type}${count}${example}`;
  });
  return lines.join("\n");
}

/**
 * Limits arrays/string sizes so a wide 1C catalogue does not blow the context
 * window, then serializes the payload.
 * @param {any} data
 * @param {{maxItems?: number, maxChars?: number}} opts
 * @returns {string}
 */
function compactPayload(
  data,
  { maxItems = MAX_ARRAY_ITEMS, maxChars = MAX_TOOL_PAYLOAD_CHARS } = {}
) {
  const limit = (value, depth) => {
    if (depth > 8) return "…";
    if (Array.isArray(value)) {
      const items = value
        .slice(0, maxItems)
        .map((entry) => limit(entry, depth + 1));
      if (value.length > maxItems) items.push(`…ещё ${value.length - maxItems}`);
      return items;
    }
    if (value && typeof value === "object") {
      const output = {};
      for (const [key, entry] of Object.entries(value))
        output[key] = limit(entry, depth + 1);
      return output;
    }
    return value;
  };

  const serialized =
    typeof data === "string" ? data : JSON.stringify(limit(data, 0), null, 1);
  if (serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, maxChars)}\n… ответ обрезан (${serialized.length} символов)`;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MAX_ARRAY_ITEMS,
  parseConnectorUrl,
  buildRequestUrl,
  bitrixMethod,
  bitrixRequestUrl,
  splitBitrixWebhookUrl,
  fetchConnectorData,
  describeJson,
  generateSchema,
  renderSchema,
  compactPayload,
};
