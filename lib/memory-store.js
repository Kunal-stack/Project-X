import { KUNAL_MEMORIES } from "../data/kunal-memories.js";

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMemoryRow(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    answer: row.answer,
    supportingThought: row.supporting_thought || "",
    tags: parseJsonArray(row.tags_json),
    questionVariants: parseJsonArray(row.question_variants_json),
    sortOrder: Number(row.sort_order || 0)
  };
}

export async function loadMemories(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return {
      memories: KUNAL_MEMORIES,
      memoryStore: "seed"
    };
  }

  try {
    const result = await env.DB.prepare(
      `SELECT
        id,
        category,
        title,
        answer,
        supporting_thought,
        tags_json,
        question_variants_json,
        sort_order
      FROM memories
      WHERE is_active = 1
      ORDER BY sort_order ASC, title ASC`
    ).run();

    const rows = Array.isArray(result?.results) ? result.results : [];

    if (rows.length === 0) {
      return {
        memories: KUNAL_MEMORIES,
        memoryStore: "seed-empty-d1",
        memoryStoreWarning: "D1 is bound, but the memories table returned no active rows."
      };
    }

    return {
      memories: rows.map(normalizeMemoryRow),
      memoryStore: "d1"
    };
  } catch (error) {
    return {
      memories: KUNAL_MEMORIES,
      memoryStore: "seed-fallback",
      memoryStoreError:
        error instanceof Error ? error.message : "Unknown D1 loading error."
    };
  }
}
