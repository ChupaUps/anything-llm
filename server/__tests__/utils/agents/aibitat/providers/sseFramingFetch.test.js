/* eslint-env jest */
const {
  createSseFramingFetch,
  reframeSseResponse,
} = require("../../../../../utils/agents/aibitat/providers/helpers/sseFramingFetch.js");

/**
 * Build a streaming Response from pre-encoded string chunks.
 * @param {string[]} chunks
 * @param {Object} [options]
 * @returns {Response}
 */
function streamResponse(chunks, { contentType = "text/event-stream" } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-length": String(chunks.join("").length),
      "content-encoding": "gzip",
    },
  });
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readBody(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Parse SSE text the same way the OpenAI SDK does: events are separated by a
 * blank line and all `data:` lines of one event are joined with "\n".
 * @param {string} text
 * @returns {string[]}
 */
function parseEventData(text) {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
    );
}

test("splits adjacent data lines that are missing the blank separator", async () => {
  const input = 'data: {"a":1}\ndata: {"b":2}\n\n';
  const output = await readBody(reframeSseResponse(streamResponse([input])));

  expect(parseEventData(output)).toEqual(['{"a":1}', '{"b":2}']);
  expect(JSON.parse(parseEventData(output)[1])).toEqual({ b: 2 });
});

test("leaves correctly framed events untouched", async () => {
  const input = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
  const output = await readBody(reframeSseResponse(streamResponse([input])));
  expect(output).toBe(input);
});

test("keeps a pretty-printed JSON payload split across data lines in one event", async () => {
  const input = 'data: {\ndata:   "a": 1,\ndata:   "b": [1, 2]\ndata: }\n\n';
  const output = await readBody(reframeSseResponse(streamResponse([input])));

  expect(output).toBe(input);
  const frames = parseEventData(output);
  expect(frames).toHaveLength(1);
  expect(JSON.parse(frames[0])).toEqual({ a: 1, b: [1, 2] });
});

test("splits a complete payload before a multi-line one", async () => {
  const input = 'data: {"a":1}\ndata: {\ndata:   "b": 2\ndata: }\n\n';
  const output = await readBody(reframeSseResponse(streamResponse([input])));

  const frames = parseEventData(output);
  expect(frames).toHaveLength(2);
  expect(JSON.parse(frames[0])).toEqual({ a: 1 });
  expect(JSON.parse(frames[1])).toEqual({ b: 2 });
});

test("separates a complete payload from a trailing [DONE] marker", async () => {
  const input = 'data: {"a":1}\ndata: [DONE]\n\n';
  const output = await readBody(reframeSseResponse(streamResponse([input])));

  expect(parseEventData(output)).toEqual(['{"a":1}', "[DONE]"]);
});

test("repairs a separator split across chunk boundaries", async () => {
  const chunks = ['data: {"a":1}\ndat', 'a: {"b":2}\n\n'];
  const output = await readBody(reframeSseResponse(streamResponse(chunks)));
  expect(parseEventData(output)).toEqual(['{"a":1}', '{"b":2}']);
});

test("keeps multi-byte characters split across chunks intact", async () => {
  const input = 'data: {"t":"Привет"}\ndata: {"t":"Мир"}\n\n';
  const bytes = new TextEncoder().encode(input);
  const cut = input.indexOf("Привет") + 3;
  const head = bytes.slice(0, cut);
  const tail = bytes.slice(cut);

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(head);
      controller.enqueue(tail);
      controller.close();
    },
  });
  const response = new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });

  const output = await readBody(reframeSseResponse(response));
  const frames = parseEventData(output);
  expect(frames).toHaveLength(2);
  expect(JSON.parse(frames[0])).toEqual({ t: "Привет" });
  expect(JSON.parse(frames[1])).toEqual({ t: "Мир" });
});

test("returns non-SSE responses as-is", () => {
  const response = streamResponse(['{"ok":true}'], {
    contentType: "application/json",
  });
  expect(reframeSseResponse(response)).toBe(response);
});

test("drops stale body headers and keeps the status", async () => {
  const response = await reframeSseResponse(
    streamResponse(['data: {"a":1}\ndata: {"b":2}\n\n'])
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("content-length")).toBeNull();
  expect(response.headers.get("content-encoding")).toBeNull();
});

test("createSseFramingFetch wraps the base fetch and repairs the stream", async () => {
  const baseFetch = jest.fn(async () =>
    streamResponse(['data: {"a":1}\ndata: {"b":2}\n\n'])
  );
  const fetchImpl = createSseFramingFetch(baseFetch);

  const response = await fetchImpl("https://openrouter.ai/api/v1/chat", {});
  const frames = parseEventData(await readBody(response));

  expect(baseFetch).toHaveBeenCalledTimes(1);
  expect(frames).toEqual(['{"a":1}', '{"b":2}']);
});
