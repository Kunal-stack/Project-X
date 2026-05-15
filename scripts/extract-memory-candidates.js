import { createHash } from "node:crypto";
import { callWorkersAiPrompt } from "./_lib/workers-ai-rest.js";
import { executeD1Command, executeD1SqlFile, sqlJson, sqlQuote } from "./_lib/d1.js";
import { loadLocalEnv } from "./_lib/dev-vars.js";

function makeCandidateId(sourceDocumentId, windowIndex, candidate) {
  const fingerprint = `${sourceDocumentId}:${windowIndex}:${candidate.title}:${candidate.answer}`;
  return `cand-${createHash("sha1").update(fingerprint).digest("hex").slice(0, 16)}`;
}

function buildWindows(chunks, maxMessages = 10, maxChars = 5000) {
  const windows = [];
  let current = [];
  let currentChars = 0;

  for (const chunk of chunks) {
    const nextChars = currentChars + chunk.content_text.length;

    if (
      current.length > 0 &&
      (current.length >= maxMessages || nextChars > maxChars)
    ) {
      windows.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(chunk);
    currentChars += chunk.content_text.length;
  }

  if (current.length > 0) {
    windows.push(current);
  }

  return windows;
}

function buildExtractionPrompt(documentRow, windowChunks) {
  const transcript = windowChunks
    .map(
      (chunk) =>
        `${chunk.speaker_role.toUpperCase()}: ${chunk.content_text.replace(/\s+/g, " ").trim()}`
    )
    .join("\n\n");

  return `You are extracting structured digital-twin memories about Kunal from his conversation history.

Only extract durable information about Kunal himself:
- values
- preferences
- decision patterns
- communication style
- repeated beliefs
- self-descriptions
- work style
- emotional coping patterns

Do not extract facts about the assistant.
Do not extract one-off logistical details.
Do not invent anything that is not clearly supported by the transcript.
If the transcript does not contain durable personal information, return an empty JSON array.

Return only valid JSON with this shape:
[
  {
    "title": "short memory title",
    "category": "identity | work | career | pressure | design | learning | relationships | communication | decisions | ambition | project | greeting | other",
    "answer": "first-person statement that Kunal could plausibly say",
    "supportingThought": "short supporting thought or null",
    "tags": ["tag1", "tag2"],
    "questionVariants": ["question 1", "question 2"],
    "confidence": 0.0
  }
]

Conversation title: ${documentRow.title || "Untitled"}
Transcript window:
${transcript}`;
}

function parseCandidates(text) {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

function sanitizeCandidate(candidate) {
  const title = String(candidate?.title || "").trim();
  const category = String(candidate?.category || "other").trim() || "other";
  const answer = String(candidate?.answer || "").trim();

  if (!title || !answer) {
    return null;
  }

  const tags = Array.isArray(candidate?.tags)
    ? candidate.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const questionVariants = Array.isArray(candidate?.questionVariants)
    ? candidate.questionVariants
        .map((value) => String(value).trim())
        .filter(Boolean)
    : [];

  return {
    title,
    category,
    answer,
    supportingThought:
      candidate?.supportingThought === null ||
      candidate?.supportingThought === undefined
        ? ""
        : String(candidate.supportingThought).trim(),
    tags,
    questionVariants,
    confidence: Number(candidate?.confidence || 0)
  };
}

function buildInsertSql(candidateRows) {
  if (candidateRows.length === 0) {
    return null;
  }

  const statements = ["BEGIN TRANSACTION;"];

  for (const row of candidateRows) {
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
        ${sqlQuote(row.sourceDocumentId)},
        ${sqlQuote(row.title)},
        ${sqlQuote(row.category)},
        ${sqlQuote(row.answer)},
        ${sqlQuote(row.supportingThought)},
        ${sqlJson(row.tags)},
        ${sqlJson(row.questionVariants)},
        ${Number.isFinite(row.confidence) ? row.confidence : 0},
        'pending',
        'workers-ai',
        ${sqlJson(row.metadata)},
        unixepoch()
      );`
    );

    statements.push(
      `DELETE FROM memory_candidate_sources WHERE candidate_id = ${sqlQuote(row.id)};`
    );

    row.sourceChunkIds.forEach((chunkId, index) => {
      statements.push(
        `INSERT INTO memory_candidate_sources (candidate_id, source_chunk_id, source_order)
         VALUES (${sqlQuote(row.id)}, ${sqlQuote(chunkId)}, ${index + 1});`
      );
    });
  }

  statements.push("COMMIT;");
  return statements.join("\n");
}

async function main() {
  const env = loadLocalEnv();
  const force = process.argv.includes("--force");

  const documentResult = executeD1Command(
    `SELECT id, title, source_type
     FROM source_documents
     WHERE source_type = 'chatgpt_export'
     ORDER BY imported_at DESC;`
  );

  const documents = documentResult.results || [];

  if (documents.length === 0) {
    console.log("No imported ChatGPT source documents found. Run ingest:chatgpt first.");
    return;
  }

  let insertedCount = 0;

  for (const documentRow of documents) {
    const existingCandidateCount = executeD1Command(
      `SELECT COUNT(*) AS count
       FROM memory_candidates
       WHERE source_document_id = ${sqlQuote(documentRow.id)};`
    ).results?.[0]?.count;

    if (!force && Number(existingCandidateCount || 0) > 0) {
      continue;
    }

    const chunkResult = executeD1Command(
      `SELECT id, sequence_no, speaker_role, content_text
       FROM source_chunks
       WHERE source_document_id = ${sqlQuote(documentRow.id)}
       ORDER BY sequence_no ASC;`
    );

    const chunks = chunkResult.results || [];

    if (chunks.length === 0) {
      continue;
    }

    const windows = buildWindows(chunks);
    const candidateRows = [];

    for (const [windowIndex, windowChunks] of windows.entries()) {
      const prompt = buildExtractionPrompt(documentRow, windowChunks);
      const aiResult = await callWorkersAiPrompt(env, prompt, {
        maxTokens: 650,
        temperature: 0.15
      });

      let parsedCandidates;

      try {
        parsedCandidates = parseCandidates(aiResult.text);
      } catch {
        continue;
      }

      for (const candidate of parsedCandidates) {
        const sanitized = sanitizeCandidate(candidate);

        if (!sanitized) {
          continue;
        }

        candidateRows.push({
          id: makeCandidateId(documentRow.id, windowIndex, sanitized),
          sourceDocumentId: documentRow.id,
          sourceChunkIds: windowChunks.map((chunk) => chunk.id),
          metadata: {
            source_type: documentRow.source_type,
            source_title: documentRow.title,
            extraction_window_index: windowIndex + 1,
            model: aiResult.model,
            usage: aiResult.usage
          },
          ...sanitized
        });
      }
    }

    const sql = buildInsertSql(candidateRows);

    if (sql) {
      executeD1SqlFile(sql);
      insertedCount += candidateRows.length;
    }
  }

  console.log(`Candidate extraction finished. Inserted or refreshed ${insertedCount} candidate memories.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
