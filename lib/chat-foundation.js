import { KUNAL_MEMORIES } from "../data/kunal-memories.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "about",
  "and",
  "approach",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "for",
  "from",
  "handle",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "kind",
  "me",
  "most",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "think",
  "through",
  "to",
  "what",
  "whether",
  "when",
  "would",
  "with",
  "you",
  "your"
]);

function normalize(text) {
  return text.toLowerCase();
}

function tokenize(text) {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));
}

function scoreField(text, terms, weight) {
  const fieldTokens = new Set(
    tokenize(Array.isArray(text) ? text.join(" ") : text)
  );
  let score = 0;

  for (const term of terms) {
    if (fieldTokens.has(term)) {
      score += weight;
    }
  }

  return score;
}

function scoreMemory(memory, terms) {
  let score = 0;

  score += scoreField(memory.category, terms, 2);
  score += scoreField(memory.title, terms, 4);
  score += scoreField(memory.tags, terms, 5);
  score += scoreField(memory.questionVariants, terms, 3);
  score += scoreField(memory.answer, terms, 1);
  score += scoreField(memory.supportingThought || "", terms, 1);

  return score;
}

export function buildCoreIdentityContext() {
  return [
    "Kunal values clarity, useful work, steady growth, and choices that hold up over time.",
    "He tends to reason from first principles, reduce noise under pressure, and prefer durable progress over hype.",
    "His communication style is direct, calm, and constructive.",
    "His product taste favors deliberate design, restrained motion, and interfaces that earn trust quickly.",
    "He cares more about consistency, compounding, and reliability than short bursts of intensity."
  ].join("\n");
}

export function rankMemoriesFromCollection(memories, query, limit = 3) {
  const terms = tokenize(query);

  const ranked = memories.map((memory) => ({
    ...memory,
    score: scoreMemory(memory, terms)
  }))
    .filter((memory) => memory.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return ranked;
}

export function rankMemories(query, limit = 3) {
  return rankMemoriesFromCollection(KUNAL_MEMORIES, query, limit);
}

export function buildFoundationReply(query, rankedMemories) {
  if (rankedMemories.length === 0) {
    if (/hello|hi|hey|good morning|good evening/i.test(query)) {
      return "Hey. Good to have you here. Ask me what you want to think through, and I will answer the way I naturally tend to reason about it.";
    }

    if (/who are you|tell me about yourself|describe yourself|what kind of person/i.test(query)) {
      return "I would describe myself as someone who values clarity, useful work, steady growth, and choices that hold up over time. I care about building well, thinking cleanly, and staying grounded instead of noisy.";
    }

    return "I usually come back to clarity first. I try to separate what is true from what is noisy, then put energy into the part that actually moves things forward.";
  }

  const [primary, ...secondary] = rankedMemories;
  const extraThoughts = secondary
    .map((memory) => memory.supportingThought)
    .filter(Boolean)
    .slice(0, 2);

  const replyParts = [primary.answer, ...extraThoughts];

  if (
    /who are you|about you|describe yourself/i.test(query) &&
    primary.category !== "identity"
  ) {
    replyParts.unshift(
      "I think of myself as someone who values clarity, useful work, and steady growth."
    );
  }

  return replyParts.join(" ");
}

export function formatMemorySources(rankedMemories) {
  return rankedMemories.map((memory) => ({
    id: memory.id,
    category: memory.category,
    title: memory.title
  }));
}

export function buildMemoryContext(rankedMemories) {
  if (rankedMemories.length === 0) {
    return "No relevant personal memory was retrieved for this question.";
  }

  return rankedMemories
    .map(
      (memory, index) =>
        `${index + 1}. ${memory.title}\nAnswer: ${memory.answer}\nSupporting thought: ${memory.supportingThought || "None"}`
    )
    .join("\n\n");
}

export function createChatResponse(message, memories = KUNAL_MEMORIES) {
  const rankedMemories = rankMemoriesFromCollection(memories, message);

  return {
    reply: buildFoundationReply(message, rankedMemories),
    sources: formatMemorySources(rankedMemories),
    retrievalMode: "keyword-foundation",
    memoryCount: rankedMemories.length
  };
}
