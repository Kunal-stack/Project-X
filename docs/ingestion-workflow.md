# Ingestion Workflow

This project now supports a staged ingestion flow for turning raw ChatGPT export data into reviewable digital-twin memories.

## Supported source right now

- Extracted ChatGPT export folders that contain `conversations.json`
- A direct path to `conversations.json`
- The temporary `openAIResponse.txt` curated memory dataset

ZIP files are not imported directly yet. Unzip the export first.

## Local workflow

### Temporary curated dataset

While waiting for the official export, import the curated JSON saved in
`openAIResponse.txt`:

```bash
npm run ingest:openai-response
```

This loads public-safe memories into `memory_candidates` with status
`approved`. Then apply them into the chatbot memory table:

```bash
npm run ingest:apply
```

For production D1, use the remote variants after remote migrations are applied:

```bash
npm run ingest:openai-response:remote
npm run ingest:apply:remote
```

If you want to review each item before approval, import as pending instead:

```bash
npm run ingest:openai-response -- --pending
npm run ingest:review
```

Remote scripts target Cloudflare D1 only when `--remote` is present. Local D1
remains the default.

### Official ChatGPT export

1. Apply local D1 migrations:

```bash
npm run db:migrate:local
```

2. Import the extracted ChatGPT export:

```bash
npm run ingest:chatgpt -- /absolute/path/to/export-folder
```

3. Extract candidate memories with Workers AI:

```bash
npm run ingest:extract
```

This uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `.dev.vars`.

4. Review pending candidates:

```bash
npm run ingest:review
```

5. Approve or reject candidates:

```bash
npm run ingest:approve -- <candidate-id>
npm run ingest:reject -- <candidate-id>
```

6. Apply approved candidates into the chatbot memory table:

```bash
npm run ingest:apply
```

Use `--remote` with these scripts only after you intentionally want to import
into production D1.

## D1 tables

- `source_documents`
- `source_chunks`
- `memory_candidates`
- `memory_candidate_sources`
- existing final table: `memories`

## Current limits

- Import expects `conversations.json`
- Candidate extraction is document/window based and uses Workers AI REST
- Review is terminal-based for now
- Embedding/vector retrieval is not part of this ingestion pass yet
