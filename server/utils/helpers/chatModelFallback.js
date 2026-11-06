const { SystemSettings } = require("../../models/systemSettings");
const { safeJsonParse } = require("../http");
const { getLLMProvider } = require("./index");

// Network/timeout signatures that mean "the primary never really answered" and
// are worth retrying elsewhere. Matched against the error message/code because
// SDKs surface these inconsistently.
const RETRYABLE_MESSAGE_SIGNS = [
  "429",
  "rate limit",
  "too many requests",
  "overloaded",
  "over capacity",
  "no available instances",
  "temporarily unavailable",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "timeout",
  "timed out",
  "fetch failed",
  "socket hang up",
  "network",
  "econnreset",
  "econnrefused",
  "etimedout",
  "enotfound",
  "eai_again",
  "epipe",
];

/**
 * Whether an LLM call error should trigger a switch to the fallback model.
 * Covers 429 rate-limits, 5xx provider errors, and connection/timeout failures.
 * Deliberately excludes 4xx client errors (bad request, context length, auth)
 * which a different model is unlikely to resolve and would only mask.
 * @param {any} error
 * @returns {boolean}
 */
function isRetryableModelError(error) {
  const status =
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.cause?.status ??
    null;

  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status <= 599) return true;

  const haystack = String(
    `${error?.name || ""} ${error?.message || ""} ${error?.code || ""}`
  ).toLowerCase();
  if (haystack.trim() === "") return false;
  return RETRYABLE_MESSAGE_SIGNS.some((sign) => haystack.includes(sign));
}

/**
 * Read the admin-configured global chat fallback. Returns null when disabled or
 * incomplete so callers skip the fallback path entirely.
 * @returns {Promise<{provider: string, model: string|null}|null>}
 */
async function resolveChatFallback() {
  try {
    const setting = await SystemSettings.get({ label: "chat_fallback_config" });
    const parsed = safeJsonParse(setting?.value, {}) || {};
    if (parsed.enabled !== true) return null;
    if (!parsed.provider) return null;
    // The router cannot itself be a fallback target (would recurse).
    if (parsed.provider === "anythingllm-router") return null;
    return { provider: parsed.provider, model: parsed.model || null };
  } catch {
    return null;
  }
}

/**
 * Build a LLM connector for the configured fallback, or null when there is none.
 * Never throws - a misconfigured provider simply disables the fallback.
 * @param {{provider: string, model: string|null}} fallbackConfig
 * @param {number|null|string} temperature
 * @returns {BaseLLMProvider|null}
 */
function buildFallbackConnector(fallbackConfig, temperature = null) {
  if (!fallbackConfig) return null;
  try {
    return getLLMProvider({
      provider: fallbackConfig.provider,
      model: fallbackConfig.model,
      temperature,
    });
  } catch (e) {
    console.warn(
      `\x1b[33m[ChatFallback]\x1b[0m Could not build fallback connector: ${e.message}`
    );
    return null;
  }
}

module.exports = {
  isRetryableModelError,
  resolveChatFallback,
  buildFallbackConnector,
};
