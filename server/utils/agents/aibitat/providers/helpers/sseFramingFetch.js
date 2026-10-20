/**
 * Some OpenAI-compatible gateways (notably OpenRouter) write consecutive
 * `data:` lines for what should be separate events without the blank line that
 * terminates an SSE event. Per the SSE spec the OpenAI SDK joins those lines
 * with "\n", so `JSON.parse` receives two objects back-to-back and throws
 * `Unexpected token { in JSON at position N`.
 *
 * This fetch wrapper re-frames such streams by inserting the missing blank line
 * between two adjacent `data:` lines. Properly framed streams are untouched,
 * and non-SSE responses are returned as-is.
 */

/**
 * A data line already holding a complete JSON value cannot be a fragment of a
 * multi-line event, so the next data line must start a new event. Legal
 * multi-line payloads (pretty-printed JSON) stay merged the way the SSE spec
 * expects, because a single fragment of them is not valid JSON on its own.
 *
 * @param {string} payload - text after the `data:` field name
 * @returns {boolean}
 */
function isCompleteJsonPayload(payload) {
  const text = payload.trim();
  if (!text) return false;
  if (text === "[DONE]") return true;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize SSE framing for an OpenAI-compatible response body.
 *
 * @param {Response} response
 * @returns {Response}
 */
function reframeSseResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!response.body || !contentType.includes("text/event-stream"))
    return response;

  try {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let pending = "";
    let previousLineWasData = false;
    let previousDataWasCompleteJson = false;

    const transform = new TransformStream({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        // Keep the trailing partial line for the next chunk.
        pending = lines.pop();

        let output = "";
        for (const line of lines) {
          const bare = line.endsWith("\r") ? line.slice(0, -1) : line;
          const isData = bare.startsWith("data:");
          // A complete JSON payload followed by another data line means the
          // blank line separating two events was lost - restore it.
          if (isData && previousLineWasData && previousDataWasCompleteJson)
            output += "\n";
          output += `${line}\n`;
          previousLineWasData = isData;
          if (isData)
            previousDataWasCompleteJson = isCompleteJsonPayload(bare.slice(5));
        }

        if (output) controller.enqueue(encoder.encode(output));
      },
      flush(controller) {
        pending += decoder.decode();
        if (!pending) return;

        const bare = pending.endsWith("\r") ? pending.slice(0, -1) : pending;
        const isData = bare.startsWith("data:");
        if (isData && previousLineWasData && previousDataWasCompleteJson)
          controller.enqueue(encoder.encode("\n"));
        controller.enqueue(encoder.encode(pending));
      },
    });

    const headers = new Headers(response.headers);
    // The body is decoded and re-encoded, so these no longer apply.
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(response.body.pipeThrough(transform), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    // Anything unexpected (older runtime, exotic body) must not break chat -
    // fall back to the original stream.
    return response;
  }
}

/**
 * Build a fetch implementation that repairs malformed SSE event framing.
 *
 * @param {typeof fetch} [baseFetch]
 * @returns {typeof fetch}
 */
function createSseFramingFetch(baseFetch = globalThis.fetch) {
  return async function sseFramingFetch(url, init) {
    const response = await baseFetch(url, init);
    return reframeSseResponse(response);
  };
}

module.exports = { createSseFramingFetch, reframeSseResponse };
