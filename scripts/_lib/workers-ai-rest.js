const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

function stripCodeFence(text) {
  const trimmed = text.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

export async function callWorkersAiPrompt(env, prompt, options = {}) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const model = env.CLOUDFLARE_AI_MODEL || options.model || DEFAULT_MODEL;

  if (!accountId || !apiToken) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .dev.vars."
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        max_tokens: options.maxTokens ?? 700,
        temperature: options.temperature ?? 0.2
      })
    }
  );

  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.messages?.[0]?.message ||
      `Workers AI REST API returned ${response.status}.`;

    throw new Error(message);
  }

  const text =
    payload?.result?.response ||
    payload?.result?.output_text ||
    payload?.result?.text;

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Workers AI extraction call returned no text.");
  }

  return {
    text: stripCodeFence(text),
    usage: payload?.result?.usage || null,
    model
  };
}
