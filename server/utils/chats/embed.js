const { v4: uuidv4 } = require("uuid");
const { getVectorDbClass, resolveProviderConnector } = require("../helpers");
const { addChatCostToMetrics } = require("../helpers/modelPricing");
const { chatPrompt, sourceIdentifier } = require("./index");
const { EmbedChats } = require("../../models/embedChats");
const { UsageEvents } = require("../../models/usageEvents");
const {
  convertToPromptHistory,
  writeResponseChunk,
} = require("../helpers/chat/responses");
const { DocumentManager } = require("../DocumentManager");
const { abortConnectorOnClientDisconnect } = require("../helpers/abortSignals");
const {
  resolveChatFallback,
  buildFallbackConnector,
  isRetryableModelError,
} = require("../helpers/chatModelFallback");
const { Telemetry } = require("../../models/telemetry");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../agents/ephemeral");

async function streamChatWithForEmbed(
  response,
  /** @type {import("@prisma/client").embed_configs & {workspace?: import("@prisma/client").workspaces}} */
  embed,
  /** @type {String} */
  message,
  /** @type {String} */
  sessionId,
  { promptOverride, modelOverride, temperatureOverride, username }
) {
  let chatMode = embed.chat_mode ?? "chat";

  const uuid = uuidv4();

  // Agent mode: if chat_mode is "automatic" (or @agent command detected) use
  // EphemeralAgentHandler so the widget receives results over HTTP SSE chunks
  // without needing a WebSocket connection.
  if (
    await EphemeralAgentHandler.isAgentInvocation({
      message,
      workspace: embed.workspace,
      chatMode,
    })
  ) {
    await Telemetry.sendTelemetry("agent_chat_started");
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace: embed.workspace,
      prompt: message,
      userId: null,
      threadId: null,
      sessionId,
    });
    const eventListener = new EphemeralEventListener();
    try {
      await agentHandler.init();
      await agentHandler.createAIbitat({ handler: eventListener });
      agentHandler.startAgentCluster();

      const { thoughts, textResponse, outputs, metrics, citations } =
        await eventListener.streamAgentEvents(response, uuid);

      if (textResponse?.length > 0) {
        await EmbedChats.new({
          embedId: embed.id,
          prompt: message,
          response: {
            text: textResponse,
            type: "agent",
            thoughts,
            sources: citations || [],
            outputs: [
              ...(outputs || []),
              ...(agentHandler.getPendingOutputs?.() || []),
            ],
            metrics,
          },
          connection_information: response.locals.connection
            ? {
                ...response.locals.connection,
                username: !!username ? String(username) : null,
              }
            : { username: !!username ? String(username) : null },
          sessionId,
        });
      }

      await UsageEvents.logLLMUsage({
        metrics,
        workspace: embed.workspace,
        source: "embed",
      });
    } catch (agentError) {
      writeResponseChunk(response, {
        id: uuid,
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: `Agent error: ${agentError.message}`,
      });
    }
    return;
  }

  // If automatic mode but no agent provider — fall back to plain chat.
  if (chatMode === "automatic") chatMode = "chat";

  const chatModel = embed.allow_model_override ? modelOverride : null;

  // If there are overrides in request & they are permitted, override the default workspace ref information.
  if (embed.allow_prompt_override && typeof promptOverride === "string")
    embed.workspace.openAiPrompt = promptOverride;
  const temperatureValue = parseFloat(temperatureOverride);
  if (embed.allow_temperature_override && !Number.isNaN(temperatureValue))
    embed.workspace.openAiTemp = temperatureValue;

  const messageLimit = embed.message_limit ?? 20;
  const {
    connector: LLMConnector,
    routingMetadata,
    prefetchedContext,
    error: routerError,
  } = await resolveLLMConnectorForEmbed({
    embed,
    chatModel,
    message,
    sessionId,
    messageLimit,
  });

  if (routerError) {
    return writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: routerError,
    });
  }

  // Stopping the generation (or closing the tab) should stop the provider
  // generating too, not just stop us reading the response.
  abortConnectorOnClientDisconnect(response, LLMConnector);

  const VectorDb = getVectorDbClass();

  const hasVectorizedSpace = await VectorDb.hasNamespace(embed.workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(embed.workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query") {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse:
        embed.workspace?.queryRefusalResponse ??
        "I do not have enough information to answer that. Try another question.",
      sources: [],
      close: true,
      error: null,
    });
    return;
  }

  let completeText;
  let metrics = {};
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  const {
    rawHistory,
    chatHistory,
    pinnedDocs: prefetchedPinnedDocs,
  } = prefetchedContext ??
  (await recentEmbedChatHistory(sessionId, embed, messageLimit));

  const pinnedDocs =
    prefetchedPinnedDocs ??
    (await new DocumentManager({
      workspace: embed.workspace,
      maxTokens: LLMConnector.promptWindowLimit(),
    }).pinnedDocs());
  pinnedDocs.forEach((doc) => {
    const { pageContent, ...metadata } = doc;
    pinnedDocIdentifiers.push(sourceIdentifier(doc));
    contextTexts.push(doc.pageContent);
    sources.push({
      text:
        pageContent.slice(0, 1_000) + "...continued on in source document...",
      ...metadata,
    });
  });

  const vectorSearchResults =
    embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: embed.workspace.slug,
          input: message,
          LLMConnector,
          similarityThreshold: embed.workspace?.similarityThreshold,
          topN: embed.workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: embed.workspace?.vectorSearchMode === "rerank",
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };

  // Failed similarity search if it was run at all and failed.
  if (!!vectorSearchResults.message) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: "Failed to connect to vector database provider.",
    });
    return;
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: embed.workspace?.topN || 4,
    searchResults: vectorSearchResults.sources,
    history: rawHistory,
    filterIdentifiers: pinnedDocIdentifiers,
  });

  // Why does contextTexts get all the info, but sources only get current search?
  // This is to give the ability of the LLM to "comprehend" a contextual response without
  // populating the Citations under a response with documents the user "thinks" are irrelevant
  // due to how we manage backfilling of the context to keep chats with the LLM more correct in responses.
  // If a past citation was used to answer the question - that is visible in the history so it logically makes sense
  // and does not appear to the user that a new response used information that is otherwise irrelevant for a given prompt.
  // TLDR; reduces GitHub issues for "LLM citing document that has no answer in it" while keep answers highly accurate.
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...vectorSearchResults.sources];

  // If in query mode and no sources are found in current search or backfilled from history, do not
  // let the LLM try to hallucinate a response or use general knowledge
  if (chatMode === "query" && contextTexts.length === 0) {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse:
        embed.workspace?.queryRefusalResponse ??
        "There is no relevant information in this workspace to answer your query.",
      sources: [],
      close: true,
      error: null,
    });
    return;
  }

  // Compress message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const systemPrompt = await chatPrompt(embed.workspace, null, {
    // Embed visitors are anonymous - never pass request-supplied identity
    // into chatPrompt and never inject stored memories into the prompt.
    skipMemories: true,
  });
  const promptArgs = {
    systemPrompt,
    userPrompt: message,
    contextTexts,
    chatHistory,
  };
  const messages = await LLMConnector.compressMessages(promptArgs, rawHistory);

  // Runs inference on a connector and returns the finished text + metrics.
  // Non-streaming results are returned unwritten so a fallback retry emits
  // exactly once; streaming can only retry before the first token because the
  // request-creating call throws first.
  async function runInference(connector, msgs, routeMeta) {
    if (connector.streamingEnabled() !== true) {
      console.log(
        `\x1b[31m[STREAMING DISABLED]\x1b[0m Streaming is not available for ${connector.constructor.name}. Will use regular chat method.`
      );
      const { textResponse, metrics: performanceMetrics } =
        await connector.getChatCompletion(msgs);
      return {
        streamed: false,
        completeText: textResponse,
        metrics: addChatCostToMetrics(performanceMetrics, {
          routingMetadata: routeMeta,
          workspace: embed.workspace,
          connector,
        }),
      };
    }
    const stream = await connector.streamGetChatCompletion(msgs);
    const text = await connector.handleStream(response, stream, {
      uuid,
      sources: [],
    });
    return {
      streamed: true,
      completeText: text,
      metrics: addChatCostToMetrics(stream.metrics, {
        routingMetadata: routeMeta,
        workspace: embed.workspace,
        connector,
      }),
    };
  }

  function emitUnstreamed(result) {
    writeResponseChunk(response, {
      uuid,
      sources: [],
      type: "textResponseChunk",
      textResponse: result.completeText,
      close: true,
      error: false,
    });
  }

  try {
    const result = await runInference(LLMConnector, messages, routingMetadata);
    completeText = result.completeText;
    metrics = result.metrics;
    if (!result.streamed) emitUnstreamed(result);
  } catch (inferenceError) {
    // Transparent model fallback on transient provider failures (429/5xx/net).
    const fallbackConnector = buildFallbackConnector(
      await resolveChatFallback(),
      embed.workspace?.openAiTemp
    );
    if (!fallbackConnector || !isRetryableModelError(inferenceError))
      throw inferenceError;

    console.warn(
      `\x1b[33m[ChatFallback]\x1b[0m Embed primary model failed (${inferenceError.message}); retrying on fallback ${fallbackConnector.constructor.name}.`
    );

    const fallbackMessages = await fallbackConnector.compressMessages(
      promptArgs,
      rawHistory
    );
    abortConnectorOnClientDisconnect(response, fallbackConnector);
    const result = await runInference(fallbackConnector, fallbackMessages, null);
    completeText = result.completeText;
    metrics = result.metrics;
    if (!result.streamed) emitUnstreamed(result);
  }

  await UsageEvents.logLLMUsage({
    metrics,
    workspace: embed.workspace,
    source: "embed",
  });

  if (completeText?.length > 0) {
    await EmbedChats.new({
      embedId: embed.id,
      prompt: message,
      response: { text: completeText, type: chatMode, sources, metrics },
      connection_information: response.locals.connection
        ? {
            ...response.locals.connection,
            username: !!username ? String(username) : null,
          }
        : { username: !!username ? String(username) : null },
      sessionId,
    });
  }
  return;
}

/**
 * @param {string} sessionId the session id of the user from embed widget
 * @param {Object} embed the embed config object
 * @param {Number} messageLimit the number of messages to return
 * @returns {Promise<{rawHistory: import("@prisma/client").embed_chats[], chatHistory: {role: string, content: string, attachments?: Object[]}[]}>
 */
async function recentEmbedChatHistory(sessionId, embed, messageLimit = 20) {
  const rawHistory = (
    await EmbedChats.forEmbedByUser(embed.id, sessionId, messageLimit, {
      id: "desc",
    })
  ).reverse();
  return { rawHistory, chatHistory: convertToPromptHistory(rawHistory) };
}

/**
 * Resolves the LLM connector for embed chats, either directly or via the model router.
 * @returns {Promise<{ connector: Object, error: string|null }>}
 */
async function resolveLLMConnectorForEmbed({
  embed,
  chatModel,
  message,
  sessionId,
  messageLimit,
}) {
  // If a chat model is provided, use it to override the workspace chat model
  // otherwise use the workspace chat model as we do everywhere else.
  const workspace = chatModel
    ? { ...embed?.workspace, chatModel }
    : embed?.workspace;
  try {
    const embedHistory = await recentEmbedChatHistory(
      sessionId,
      embed,
      messageLimit
    );
    const embedMessageCount = await EmbedChats.count({
      embed_id: embed.id,
      session_id: sessionId,
      include: true,
    });

    const { connector, routingMetadata, prefetchedContext } =
      await resolveProviderConnector({
        workspace,
        prompt: message,
        chatHistoryOverride: embedHistory,
        // +1 to include the current in-flight message to ensure routing rules are evaluated against the real total.
        messageCountOverride: embedMessageCount + 1,
      });

    return {
      connector,
      routingMetadata,
      prefetchedContext: prefetchedContext
        ? {
            rawHistory: embedHistory.rawHistory,
            chatHistory: embedHistory.chatHistory,
            pinnedDocs: prefetchedContext.pinnedDocs,
          }
        : null,
      error: null,
    };
  } catch (routerError) {
    return {
      connector: null,
      routingMetadata: null,
      prefetchedContext: null,
      error: `Model router error: ${routerError.message}`,
    };
  }
}

module.exports = {
  streamChatWithForEmbed,
};
