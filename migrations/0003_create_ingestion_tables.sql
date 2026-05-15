CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  external_id TEXT,
  title TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  imported_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_source_documents_type
ON source_documents (source_type, imported_at);

CREATE TABLE IF NOT EXISTS source_chunks (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  external_id TEXT,
  sequence_no INTEGER NOT NULL,
  speaker_role TEXT NOT NULL,
  content_text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_chunks_doc_sequence
ON source_chunks (source_document_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_source_chunks_doc_role
ON source_chunks (source_document_id, speaker_role, sequence_no);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id TEXT PRIMARY KEY,
  source_document_id TEXT,
  candidate_title TEXT NOT NULL,
  category TEXT NOT NULL,
  answer TEXT NOT NULL,
  supporting_thought TEXT,
  tags_json TEXT NOT NULL,
  question_variants_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  extractor TEXT NOT NULL DEFAULT 'workers-ai',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  applied_memory_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_status
ON memory_candidates (status, created_at);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_document
ON memory_candidates (source_document_id, status);

CREATE TABLE IF NOT EXISTS memory_candidate_sources (
  candidate_id TEXT NOT NULL,
  source_chunk_id TEXT NOT NULL,
  source_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (candidate_id, source_chunk_id),
  FOREIGN KEY (candidate_id) REFERENCES memory_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (source_chunk_id) REFERENCES source_chunks(id) ON DELETE CASCADE
);
