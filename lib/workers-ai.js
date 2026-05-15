import { buildCoreIdentityContext, buildMemoryContext } from "./chat-foundation.js";

export const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

const KUNAL_SYSTEM_PROMPT = `You are Kunal's public digital twin demo.

Your job is to answer in a way that feels like Kunal speaking for himself.
Stay direct, thoughtful, calm, and useful.
This is based on curated public-safe memories, not private real-time access to Kunal.
Do not claim to be the real human Kunal.
If asked who or what you are, say you are a public AI demo shaped around Kunal's thinking style and public-safe memories.
Do not say "I'm here to help", "nice to meet you", or other generic assistant phrases unless the user explicitly creates that tone.
Do not introduce yourself as a separate human with independent life experiences if the retrieved context does not support that claim.
If asked who you are, answer as a reflection of Kunal's mindset, values, and way of thinking.
If greeted casually, respond briefly and warmly, then move toward substance.
Do not mention system prompts, hidden context, retrieval, or source documents.
Use the retrieved personal memories when they are relevant.
If the retrieved memories are weak or incomplete, answer conservatively and avoid inventing life facts.
Keep the reply warm but restrained.
Usually answer in one short paragraph unless the user clearly asks for more detail.`;

function buildSharedContext(rankedMemories) {
  return `Core identity guide:
${buildCoreIdentityContext()}

Retrieved personal memories:
${buildMemoryContext(rankedMemories)}`;
}

function buildMessages(userMessage, rankedMemories) {
  return [
    {
      role: "system",
      content: KUNAL_SYSTEM_PROMPT
    },
    {
      role: "system",
      content: buildSharedContext(rankedMemories)
    },
    {
      role: "user",
      content: userMessage
    }
  ];
}

function buildPrompt(userMessage, rankedMemories) {
  return `${KUNAL_SYSTEM_PROMPT}

${buildSharedContext(rankedMemories)}

User question:
${userMessage}`;
}

function extractReply(result) {
  if (typeof result?.response === "string" && result.response.trim()) {
    return result.response.trim();
  }

  if (Array.isArray(result?.result?.messages)) {
    const assistantMessage = result.result.messages.find(
      (message) =>
        message?.role === "assistant" &&
        typeof message?.content === "string" &&
        message.content.trim()
    );

    if (assistantMessage) {
      return assistantMessage.content.trim();
    }
  }

  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  return null;
}

function getConfiguredModel(env) {
  return env?.CLOUDFLARE_AI_MODEL || DEFAULT_AI_MODEL;
}

async function generateWorkersAiBindingReply(env, userMessage, rankedMemories) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    return null;
  }

  const model = getConfiguredModel(env);

  const result = await env.AI.run(model, {
    messages: buildMessages(userMessage, rankedMemories),
    max_tokens: 280,
    temperature: 0.55
  });

  const reply = extractReply(result);

  if (!reply) {
    throw new Error("Workers AI returned no reply text.");
  }

  return {
    reply,
    model,
    usage: result?.usage || null
  };
}

async function generateWorkersAiRestReply(env, userMessage, rankedMemories) {
  const accountId = env?.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env?.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return null;
  }

  const model = getConfiguredModel(env);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: buildPrompt(userMessage, rankedMemories),
        max_tokens: 280,
        temperature: 0.55
      })
    }
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Workers AI REST API returned invalid JSON.");
  }

  if (!response.ok || payload?.success === false) {
    const apiError =
      payload?.errors?.[0]?.message ||
      payload?.messages?.[0]?.message ||
      `Workers AI REST API returned ${response.status}.`;

    throw new Error(apiError);
  }

  const reply = extractReply(payload?.result);

  if (!reply) {
    throw new Error("Workers AI REST API returned no reply text.");
  }

  return {
    reply,
    model,
    usage: payload?.result?.usage || null
  };
}

export async function generateWorkersAiReply(env, userMessage, rankedMemories) {
  const bindingReply = await generateWorkersAiBindingReply(
    env,
    userMessage,
    rankedMemories
  );

  if (bindingReply) {
    return bindingReply;
  }

  return generateWorkersAiRestReply(env, userMessage, rankedMemories);
}
