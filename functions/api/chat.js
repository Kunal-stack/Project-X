import {
  buildFoundationReply,
  formatMemorySources,
  rankMemoriesFromCollection
} from "../../lib/chat-foundation.js";
import { loadMemories } from "../../lib/memory-store.js";
import { generateWorkersAiReply } from "../../lib/workers-ai.js";

export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    route: "/api/chat",
    method: "POST",
    expectedBody: {
      message: "How do you think about career decisions?"
    },
    mode: "foundation-or-workers-ai",
    publicSafety:
      "This is a public AI demo based on curated public-safe memories, not the real Kunal.",
    aiBindingAvailable: Boolean(context.env?.AI),
    d1BindingAvailable: Boolean(context.env?.DB),
    aiRestConfigured: Boolean(
      context.env?.CLOUDFLARE_ACCOUNT_ID && context.env?.CLOUDFLARE_API_TOKEN
    )
  });
}

export async function onRequestPost(context) {
  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const message = payload?.message?.trim();

  if (!message) {
    return Response.json(
      { error: "The `message` field is required." },
      { status: 400 }
    );
  }

  const memoryState = await loadMemories(context.env);
  const rankedMemories = rankMemoriesFromCollection(
    memoryState.memories,
    message
  );
  const sources = formatMemorySources(rankedMemories);
  const foundationReply = buildFoundationReply(message, rankedMemories);

  let response = {
    reply: foundationReply,
    sources,
    retrievalMode: "keyword-foundation",
    memoryCount: rankedMemories.length,
    aiEnabled: false,
    memoryStore: memoryState.memoryStore,
    publicSafety:
      "This is a public AI demo based on curated public-safe memories, not the real Kunal."
  };

  if (memoryState.memoryStoreWarning) {
    response.memoryStoreWarning = memoryState.memoryStoreWarning;
  }

  if (memoryState.memoryStoreError) {
    response.memoryStoreError = memoryState.memoryStoreError;
  }

  try {
    const aiReply = await generateWorkersAiReply(context.env, message, rankedMemories);

    if (aiReply) {
      response = {
        ...response,
        reply: aiReply.reply,
        retrievalMode: "workers-ai",
        aiEnabled: true,
        model: aiReply.model,
        usage: aiReply.usage
      };
    }
  } catch (error) {
    response = {
      ...response,
      aiEnabled: false,
      aiError: error instanceof Error ? error.message : "Workers AI request failed."
    };
  }

  return Response.json(response, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
