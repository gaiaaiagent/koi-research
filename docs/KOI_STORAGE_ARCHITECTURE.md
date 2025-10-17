# KOI Storage Architecture

This document describes KOI’s storage layer across PostgreSQL (pgvector) and Apache Jena Fuseki, moved out of the Master Guide for clarity and focus.

## PostgreSQL Schema

Database: `eliza` (port 5433)

Extensions:
- `pgvector`: Vector similarity search
- `pg_trgm`: Trigram matching for fuzzy search
- `uuid-ossp`: UUID generation

## KOI Pipeline Tables

`koi_memories`: Source documents from sensors

```sql
CREATE TABLE koi_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rid VARCHAR(500) NOT NULL,
    cid VARCHAR(500),
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES koi_memories(id),
    event_type VARCHAR(20),                -- NEW, UPDATE, FORGET
    source_sensor VARCHAR(200),
    content JSONB,                         -- Full document content
    metadata JSONB,                        -- Platform-specific metadata
    published_at TIMESTAMP,                -- Publication date (if available)
    published_confidence FLOAT,            -- Confidence in publication date
    superseded_at TIMESTAMP,               -- When this version was replaced
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(rid, version)
);

CREATE INDEX idx_koi_memories_rid ON koi_memories(rid);
CREATE INDEX idx_koi_memories_source ON koi_memories(source_sensor);
CREATE INDEX idx_koi_memories_published ON koi_memories(published_at);
CREATE INDEX idx_koi_memories_current ON koi_memories(rid)
    WHERE superseded_at IS NULL;
```

`koi_embeddings`: Vector embeddings with pgvector

```sql
CREATE TABLE koi_embeddings (
    id SERIAL PRIMARY KEY,
    memory_id UUID REFERENCES koi_memories(id) ON DELETE CASCADE,
    chunk_index INTEGER DEFAULT 0,         -- Chunk number within document
    chunk_text TEXT,                       -- The actual chunk text
    dim_1024 vector(1024),                 -- BGE embeddings
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(memory_id, chunk_index)
);

CREATE INDEX idx_koi_embeddings_vector ON koi_embeddings
    USING ivfflat (dim_1024 vector_cosine_ops)
    WITH (lists = 100);
```

`transformation_receipts`: CAT receipt provenance

```sql
CREATE TABLE transformation_receipts (
    transformation_id UUID PRIMARY KEY,
    rid VARCHAR(500) NOT NULL,
    cid VARCHAR(500),
    transformation_type VARCHAR(100),      -- sensor_collection, chunking, embedding
    input_manifest JSONB,
    output_manifest JSONB,
    transformation_metadata JSONB,
    timestamp TIMESTAMP DEFAULT NOW(),
    agent_id VARCHAR(200),
    previous_receipt_hash VARCHAR(64)      -- Chain to previous receipt
);

CREATE INDEX idx_receipts_rid ON transformation_receipts(rid);
CREATE INDEX idx_receipts_type ON transformation_receipts(transformation_type);
```

## Agent State Tables

`memories`: Agent-accessible chunks for RAG

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY,
    type VARCHAR(50),                      -- message_embedding, document_chunk
    content JSONB,                         -- Chunk content
    embedding vector(1024),                -- For semantic search
    user_id UUID,
    room_id UUID,
    agent_id UUID,
    unique BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memories_embedding ON memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

`conversations`: Agent chat history

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    user_id UUID,
    content JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Useful Queries

Latest version of a document:
```sql
SELECT * FROM koi_memories
WHERE rid = 'orn:web.page:example.com/abc123'
  AND superseded_at IS NULL;
```

Version history:
```sql
WITH RECURSIVE version_chain AS (
  SELECT * FROM koi_memories
  WHERE rid = 'orn:web.page:example.com/abc123'
    AND superseded_at IS NULL
  UNION ALL
  SELECT m.* FROM koi_memories m
  INNER JOIN version_chain v ON m.id = v.previous_version_id
)
SELECT * FROM version_chain ORDER BY version DESC;
```

Semantic search:
```sql
SELECT
    m.id,
    m.content->>'title' AS title,
    m.content->>'url' AS url,
    1 - (e.dim_1024 <=> $1::vector) AS similarity
FROM koi_memories m
JOIN koi_embeddings e ON e.memory_id = m.id
WHERE m.superseded_at IS NULL
ORDER BY e.dim_1024 <=> $1::vector
LIMIT 10;
```

Pipeline statistics:
```sql
SELECT
    source_sensor,
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE superseded_at IS NULL) as current_docs,
    COUNT(*) FILTER (WHERE event_type = 'UPDATE') as updates,
    MAX(created_at) as last_update
FROM koi_memories
GROUP BY source_sensor;
```

## Graph (Apache Jena Fuseki)

The refined graph stores reified statements with canonical categories for topic routing:

Per statement:
- `regx:Statement` (rdf:type)
- `regx:subject` (string literal)
- `regx:predicate` (string literal; consolidated at t=0.25)
- `regx:object` (string literal)
- `regx:canonicalPredicate` (string literal; one of eco_credit, finance, funding, governance, water, creation, leadership, collaboration, location, general)
- Optional `regx:originalPredicate` (when consolidated)

Snapshot:
- Statements: 20,325 (≈5 triples each = ~101,903 triples total)
- Consolidation: t=0.25 “all” mapping (final_consolidation_all_t0.25.json)
- Predicate communities: computed (19 communities)

Endpoint: `http://localhost:3030/koi/sparql`

