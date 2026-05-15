import {
  executeD1Command,
  executeD1Statements,
  getD1TargetLabel,
  sqlJson,
  sqlQuote
} from "./_lib/d1.js";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function getMemoryId(candidate) {
  if (candidate.id.startsWith("openai-")) {
    return candidate.id;
  }

  return `cand-${slugify(candidate.candidate_title)}-${candidate.id.slice(-6)}`;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function main() {
  const result = executeD1Command(
    `SELECT
      id,
      candidate_title,
      category,
      answer,
      supporting_thought,
      tags_json,
      question_variants_json
    FROM memory_candidates
    WHERE status = 'approved'
    ORDER BY created_at ASC;`
  );

  const candidates = result.results || [];

  if (candidates.length === 0) {
    console.log("No approved memory candidates found.");
    return;
  }

  const statements = [];

  for (const candidate of candidates) {
    const memoryId = getMemoryId(candidate);

    statements.push(
      `INSERT OR REPLACE INTO memories (
        id,
        category,
        title,
        answer,
        supporting_thought,
        tags_json,
        question_variants_json,
        sort_order,
        is_active,
        updated_at
      ) VALUES (
        ${sqlQuote(memoryId)},
        ${sqlQuote(candidate.category)},
        ${sqlQuote(candidate.candidate_title)},
        ${sqlQuote(candidate.answer)},
        ${sqlQuote(candidate.supporting_thought || "")},
        ${sqlJson(parseJsonArray(candidate.tags_json))},
        ${sqlJson(parseJsonArray(candidate.question_variants_json))},
        5000,
        1,
        unixepoch()
      );`
    );

    statements.push(
      `UPDATE memory_candidates
       SET status = 'applied',
           applied_memory_id = ${sqlQuote(memoryId)},
           updated_at = unixepoch()
       WHERE id = ${sqlQuote(candidate.id)};`
    );
  }

  executeD1Statements(statements);

  console.log(
    `Applied ${candidates.length} approved candidate(s) into the memories table in ${getD1TargetLabel()}.`
  );
}

main();
