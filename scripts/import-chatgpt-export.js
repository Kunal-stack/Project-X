import { loadChatGptConversations } from "./_lib/chatgpt-export.js";
import {
  executeD1SqlFile,
  getD1TargetLabel,
  getScriptArgs,
  sqlJson,
  sqlQuote
} from "./_lib/d1.js";

function buildImportSql(conversations, sourcePath) {
  const statements = [
    "BEGIN TRANSACTION;",
    `DELETE FROM memory_candidate_sources WHERE candidate_id IN (SELECT id FROM memory_candidates WHERE source_document_id IN (${conversations
      .map((conversation) => sqlQuote(conversation.id))
      .join(", ")}));`,
    `DELETE FROM memory_candidates WHERE source_document_id IN (${conversations
      .map((conversation) => sqlQuote(conversation.id))
      .join(", ")});`
  ];

  for (const conversation of conversations) {
    statements.push(
      `INSERT OR REPLACE INTO source_documents (id, source_type, external_id, title, metadata_json, imported_at)
       VALUES (${sqlQuote(conversation.id)}, ${sqlQuote(conversation.sourceType)}, ${sqlQuote(conversation.externalId)}, ${sqlQuote(conversation.title)}, ${sqlJson({
         ...conversation.metadata,
         source_path: sourcePath
       })}, unixepoch());`
    );

    statements.push(
      `DELETE FROM source_chunks WHERE source_document_id = ${sqlQuote(conversation.id)};`
    );

    for (const message of conversation.messages) {
      statements.push(
        `INSERT INTO source_chunks (id, source_document_id, external_id, sequence_no, speaker_role, content_text, token_estimate, metadata_json)
         VALUES (${sqlQuote(message.id)}, ${sqlQuote(conversation.id)}, ${sqlQuote(message.externalId)}, ${message.sequenceNo}, ${sqlQuote(message.speakerRole)}, ${sqlQuote(message.contentText)}, ${message.tokenEstimate}, ${sqlJson(message.metadata)});`
      );
    }
  }

  statements.push("COMMIT;");
  return statements.join("\n");
}

async function main() {
  const inputPath = getScriptArgs()[0];

  if (!inputPath) {
    console.error("Usage: npm run ingest:chatgpt -- /path/to/extracted-export-or-conversations.json");
    process.exit(1);
  }

  const { filePath, conversations } = loadChatGptConversations(inputPath);

  if (conversations.length === 0) {
    console.error("No usable conversations were found in the export.");
    process.exit(1);
  }

  const sql = buildImportSql(conversations, filePath);
  executeD1SqlFile(sql);

  const messageCount = conversations.reduce(
    (total, conversation) => total + conversation.messages.length,
    0
  );

  console.log(
    `Imported ${conversations.length} conversation documents and ${messageCount} messages from ${filePath} into ${getD1TargetLabel()}.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
