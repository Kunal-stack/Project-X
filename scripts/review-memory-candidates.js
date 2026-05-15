import { executeD1Command, getD1TargetLabel, getScriptArgs } from "./_lib/d1.js";

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

function renderCandidate(candidate) {
  const tags = parseJsonArray(candidate.tags_json);
  const variants = parseJsonArray(candidate.question_variants_json);

  console.log(`ID: ${candidate.id}`);
  console.log(`Status: ${candidate.status}`);
  console.log(`Category: ${candidate.category}`);
  console.log(`Confidence: ${candidate.confidence}`);
  console.log(`Title: ${candidate.candidate_title}`);
  console.log(`Answer: ${candidate.answer}`);

  if (candidate.supporting_thought) {
    console.log(`Supporting thought: ${candidate.supporting_thought}`);
  }

  if (tags.length > 0) {
    console.log(`Tags: ${tags.join(", ")}`);
  }

  if (variants.length > 0) {
    console.log(`Question variants: ${variants.join(" | ")}`);
  }

  console.log(`Source document: ${candidate.source_title || candidate.source_document_id}`);
  console.log("-".repeat(72));
}

function main() {
  const status = getScriptArgs()[0] || "pending";

  const result = executeD1Command(
    `SELECT
      mc.id,
      mc.status,
      mc.category,
      mc.confidence,
      mc.candidate_title,
      mc.answer,
      mc.supporting_thought,
      mc.tags_json,
      mc.question_variants_json,
      mc.source_document_id,
      sd.title AS source_title
    FROM memory_candidates mc
    LEFT JOIN source_documents sd ON sd.id = mc.source_document_id
    WHERE mc.status = '${status.replace(/'/g, "''")}'
    ORDER BY mc.created_at ASC;`
  );

  const candidates = result.results || [];

  if (candidates.length === 0) {
    console.log(`No ${status} memory candidates found.`);
    return;
  }

  console.log(`Found ${candidates.length} ${status} memory candidate(s) in ${getD1TargetLabel()}.\n`);
  candidates.forEach(renderCandidate);
  console.log(`Use "npm run ingest:approve -- <candidate-id>" or "npm run ingest:reject -- <candidate-id>" to curate them.`);
}

main();
