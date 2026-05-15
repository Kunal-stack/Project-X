import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  executeD1Statements,
  getD1TargetLabel,
  getScriptArgs,
  sqlJson,
  sqlQuote
} from "./_lib/d1.js";
import { projectRoot } from "./_lib/dev-vars.js";

const DEFAULT_INPUT_FILE = "openAIResponse.txt";
const SOURCE_DOCUMENT_ID = "openai-response-memory-dataset";

function stripJsonFence(value) {
  const trimmed = value.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseArgs() {
  const args = getScriptArgs();
  const pending = args.includes("--pending");
  const fileArg = args.find((arg) => !arg.startsWith("--"));

  return {
    inputFile: fileArg || DEFAULT_INPUT_FILE,
    status: pending ? "pending" : "approved"
  };
}

function normalizeString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function confidenceScore(value) {
  if (value === "known") {
    return 0.95;
  }

  if (value === "inferred") {
    return 0.7;
  }

  return 0.5;
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object") {
    throw new Error("Input file must contain a JSON object.");
  }

  if (!Array.isArray(dataset.memories)) {
    throw new Error("Input JSON must contain a memories array.");
  }
}

function makeCandidateRow(memory, index, status) {
  const originalId = normalizeString(memory.id) || `openai-memory-${index + 1}`;
  const title = normalizeString(memory.title);
  const category = normalizeString(memory.category) || "other";
  const answer = normalizeString(memory.ideal_answer || memory.content);
  const supportingThought = normalizeString(memory.content);
  const tags = normalizeStringArray(memory.tags);
  const questionVariants = normalizeStringArray(memory.sample_questions);

  if (!title || !answer || memory.public_safe !== true) {
    return null;
  }

  return {
    id: `openai-${originalId}`,
    originalId,
    title,
    category,
    answer,
    supportingThought,
    tags,
    questionVariants,
    confidence: confidenceScore(memory.confidence),
    confidenceLabel: normalizeString(memory.confidence || "unknown"),
    status
  };
}

function buildSql(dataset, rows) {
  const statements = [];

  statements.push(
    `INSERT OR REPLACE INTO source_documents (
      id,
      source_type,
      external_id,
      title,
      metadata_json,
      imported_at,
      created_at
    ) VALUES (
      ${sqlQuote(SOURCE_DOCUMENT_ID)},
      'openai_response_json',
      ${sqlQuote(DEFAULT_INPUT_FILE)},
      'ChatGPT generated public-safe memory dataset',
      ${sqlJson({
        profile_summary: dataset.profile_summary || null,
        memory_count: rows.length
      })},
      unixepoch(),
      unixepoch()
    );`
  );

  for (const row of rows) {
    statements.push(
      `INSERT OR REPLACE INTO memory_candidates (
        id,
        source_document_id,
        candidate_title,
        category,
        answer,
        supporting_thought,
        tags_json,
        question_variants_json,
        confidence,
        status,
        extractor,
        metadata_json,
        updated_at
      ) VALUES (
        ${sqlQuote(row.id)},
        ${sqlQuote(SOURCE_DOCUMENT_ID)},
        ${sqlQuote(row.title)},
        ${sqlQuote(row.category)},
        ${sqlQuote(row.answer)},
        ${sqlQuote(row.supportingThought)},
        ${sqlJson(row.tags)},
        ${sqlJson(row.questionVariants)},
        ${row.confidence},
        ${sqlQuote(row.status)},
        'openai-response-json',
        ${sqlJson({
          original_id: row.originalId,
          confidence_label: row.confidenceLabel,
          public_safe: true
        })},
        unixepoch()
      );`
    );
  }

  return statements;
}

function main() {
  const { inputFile, status } = parseArgs();
  const inputPath = resolve(projectRoot, inputFile);
  const dataset = JSON.parse(stripJsonFence(readFileSync(inputPath, "utf8")));

  validateDataset(dataset);

  const rows = dataset.memories
    .map((memory, index) => makeCandidateRow(memory, index, status))
    .filter(Boolean);

  if (rows.length === 0) {
    console.log("No public-safe memory candidates found in the input file.");
    return;
  }

  executeD1Statements(buildSql(dataset, rows));

  console.log(
    `Imported ${rows.length} memory candidate(s) from ${inputFile} with status "${status}".`
  );
  console.log(`Target: ${getD1TargetLabel()}.`);
}

main();
