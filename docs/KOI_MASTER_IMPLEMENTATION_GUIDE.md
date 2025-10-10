# KOI Master Implementation Guide

Complete architecture, implementation details, and operational guide for the Knowledge Organization Infrastructure (KOI) system implemented for Regen Network's AI ecosystem.

---

## Executive Summary

The Knowledge Organization Infrastructure (KOI) is a production-ready distributed knowledge management system that provides real-time content ingestion, processing, and semantic search capabilities for AI agents. The implementation spans three primary repositories with clear separation of concerns and full integration between components.

### Current Status (October 2025)

**Production Deployment**: Complete sensor-to-agent pipeline operational with 12 active sensors monitoring multiple platforms in real-time.

**Key Achievements**:
- 12 active sensors monitoring diverse platforms (GitHub, GitLab, Medium, Discourse, Telegram, Twitter, Discord, Podcast, Notion, Ledger, Websites)
- Real-time event processing with RID-based deduplication and content versioning
- BGE embeddings (1024-dimensional vectors) generated and stored in PostgreSQL with pgvector
- Complete provenance tracking via CAT (Content Addressable Transformation) receipts
- Immediate agent RAG access to processed content (<3-5 second latency)
- Dashboard monitoring at https://regen.gaiaai.xyz/koi and https://regen.gaiaai.xyz/digests
- Content curation system generating daily social media posts and weekly digests
- Podcast generation pipeline with automated audio creation

**Architecture Progress**: 95% Complete - Core pipeline operational, semantic extraction and advanced querying under active development

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository Structure](#2-repository-structure)
3. [KOI Protocol Implementation](#3-koi-protocol-implementation)
4. [Sensor Network](#4-sensor-network)
5. [Processing Pipeline](#5-processing-pipeline)
6. [Storage Architecture](#6-storage-architecture)
7. [Agent Integration](#7-agent-integration)
8. [Deployment & Operations](#8-deployment--operations)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Development Guide](#10-development-guide)
11. [Production Considerations](#11-production-considerations)

---

## 1. System Architecture

### 1.1 High-Level Overview

The KOI system follows a distributed microservices architecture with clear data flow from sensors through processing to agent consumption:

```
┌─────────────┐
│   SENSORS   │ ─── Monitor sources (12 platforms)
│  (Partial)  │
└──────┬──────┘
       │ KOI Events (NEW/UPDATE/FORGET)
       ▼
┌─────────────┐
│ COORDINATOR │ ─── Route events, track health
│ (Full Node) │
└──────┬──────┘
       │ Forward events
       ▼
┌─────────────┐
│EVENT BRIDGE │ ─── Deduplicate, version, chunk
│    (v2)     │
└──────┬──────┘
       │ Process content
       ▼
┌─────────────┐
│ BGE SERVER  │ ─── Generate 1024D embeddings
└──────┬──────┘
       │ Store vectors
       ▼
┌─────────────┐
│ POSTGRESQL  │ ─── koi_memories + pgvector
│ (pgvector)  │
└──────┬──────┘
       │ Query via MCP
       ▼
┌─────────────┐
│   AGENTS    │ ─── RAG access to knowledge
│  (ElizaOS)  │
└─────────────┘
```

### 1.2 Component Responsibilities

**Sensors (koi-sensors)**:
- Monitor external data sources continuously
- Generate KOI-compliant events with RIDs and bundles
- Report health status via heartbeats
- Emit NEW/UPDATE/FORGET events based on content changes

**Coordinator (koi-sensors)**:
- Central event routing hub (port 8005)
- Sensor registry and health monitoring
- Event forwarding to processors
- Delivery confirmation tracking

**Event Bridge v2 (koi-processor)**:
- Receive and validate KOI events (port 8100)
- RID-based deduplication (prevents duplicate processing)
- Content versioning with `superseded_at` timestamps
- Document chunking (1000 chars, 200 char overlap)
- CAT receipt generation for provenance
- Direct PostgreSQL storage

**BGE Server (koi-processor)**:
- Generate semantic embeddings (port 8090)
- BAAI/bge-large-en-v1.5 model (1024 dimensions)
- Model-agnostic API design
- Batch processing support

**PostgreSQL (koi-processor)**:
- Primary data store (port 5433)
- pgvector extension for embeddings
- Isolated KOI tables (koi_memories, koi_embeddings)
- Agent state tables (memories, conversations, etc.)
- Full-text search with GIN indexes

**Dashboard (koi-processor)**:
- Real-time sensor status monitoring
- Content operations interface
- Daily curator and weekly digest management
- Podcast generation workflow

**Agents (GAIA)**:
- ElizaOS-based AI agents
- Direct PostgreSQL queries for RAG
- MCP integration for external tools
- Real-time knowledge access

---

## 2. Repository Structure

### 2.1 koi-sensors

**Purpose**: Real-time data collection from distributed sources

**Location**: `/opt/projects/koi-sensors`

**Structure**:
```
koi-sensors/
├── sensors/                    # Individual sensor implementations
│   ├── websites/              # Website monitoring
│   ├── github/                # GitHub repositories
│   ├── github_activity/       # GitHub activity tracking
│   ├── gitlab/                # GitLab documentation
│   ├── medium/                # Medium blog posts
│   ├── discourse/             # Forum monitoring
│   ├── telegram/              # Telegram channels
│   ├── twitter/               # Twitter/X monitoring
│   ├── discord/               # Discord servers
│   ├── podcast/               # Podcast RSS feeds
│   ├── notion/                # Notion workspaces
│   └── ledger/                # Blockchain data
├── koi_protocol/              # Core KOI protocol
│   ├── core/                  # RID, Bundle, Event systems
│   └── coordinator/           # Event routing hub
├── shared/                    # Shared utilities
│   ├── handlers/              # Base sensor class
│   ├── config/                # Configuration management
│   └── rid_types/             # RID type definitions
├── scheduler/                 # Job scheduling
├── bots/                      # Social media bots
├── knowledge_graph/           # Graph processing
├── setup_all.sh              # Master setup script
├── start_all.sh              # Start all sensors
├── stop_all.sh               # Stop all sensors
└── status.sh                 # Check sensor status
```

**Key Files**:
- `koi_protocol/core/rid_system.py`: RID generation and validation (283 lines)
- `koi_protocol/core/bundle_system.py`: Bundle creation and manifest handling (307 lines)
- `shared/handlers/base_sensor.py`: Abstract base class for sensors (344 lines)

### 2.2 koi-processor

**Purpose**: Content processing, embedding generation, and agent integration

**Location**: `/opt/projects/koi-processor`

**Structure**:
```
koi-processor/
├── src/                       # Source code
│   ├── core/                  # Core processing
│   │   ├── koi_event_bridge_v2.py    # Event processing
│   │   ├── koi_types.py              # Type definitions
│   │   ├── koi_permissions_api.py    # Access control
│   │   └── bge_server.py             # Embedding server
│   ├── content/               # Content generation
│   │   ├── content_dashboard.py      # Web dashboard
│   │   ├── daily_curator_llm.py      # Daily posts
│   │   ├── weekly_curator_llm.py     # Weekly digests
│   │   └── quality_control.py        # QA checks
│   ├── audio/                 # Podcast generation
│   │   ├── audio_pipeline_enhanced.py
│   │   └── podcast_integration.py
│   ├── services/              # External services
│   │   └── regen_ledger.py           # Blockchain integration
│   ├── cat/                   # Provenance tracking
│   │   └── cat_receipt_chain_v2.py
│   ├── provenance/            # Apache Jena integration
│   └── utils/                 # Utilities
├── scripts/                   # Operational scripts
│   ├── start_all_services.sh
│   ├── run_daily_curator.py
│   ├── run_weekly_aggregator.py
│   └── backup_koi_databases.py
├── migrations/                # Database migrations
│   ├── 001_create_transformation_receipts.sql
│   ├── 002_create_agent_knowledge_permissions.sql
│   ├── 003_create_isolated_koi_tables.sql
│   ├── 004_add_publication_dates.sql
│   ├── 005_create_dashboard_tables.sql
│   └── 013_create_kg_tables.sql
├── templates/                 # Web UI templates
├── static/                    # Static assets
├── start_dashboard.sh        # Start dashboard
└── verify_setup.sh           # Verify configuration
```

**Key Files**:
- `src/core/koi_event_bridge_v2.py`: Main processing pipeline
- `src/core/bge_server.py`: Embedding generation service
- `src/content/content_dashboard.py`: Monitoring dashboard

### 2.3 koi-research

**Purpose**: Documentation, ontologies, and research artifacts

**Location**: `/opt/projects/koi-research`

**Structure**:
```
koi-research/
├── docs/
│   ├── KOI_MASTER_IMPLEMENTATION_GUIDE.md  # This document
│   ├── KOI_COMPLETE_RESEARCH.md
│   └── ontology/
└── ontologies/
    └── regen-unified-ontology.ttl
```

---

## 3. KOI Protocol Implementation

### 3.1 Resource Identifiers (RIDs)

RIDs provide stable semantic references following the ORN (Object Reference Name) format.

**Format**: `orn:namespace:reference`

**Examples**:
```
orn:web.page:docs.regen.network/1ef62e1ed208c19c
orn:twitter.tweet:123456789/987654321
orn:discourse.post:forum.regen.network/42/1
orn:notion.page:workspace/abc-123-def
orn:github.file:owner/repo/main/a1b2c3d4e5f6
```

**Implementation** (`koi_protocol/core/rid_system.py`):

```python
class ORN(ABC):
    """Object Reference Name - specific RID format"""
    namespace: str = None

    @property
    @abstractmethod
    def reference(self) -> str:
        """Generate reference string"""
        pass

    def to_string(self) -> str:
        return f"{self.context}:{self.namespace}:{self.reference}"
```

**Platform-Specific RIDs**:
- `WebPageRID`: Uses domain + URL hash (16 chars from SHA-256)
- `TwitterTweetRID`: Uses user_id/tweet_id structure
- `DiscoursePostRID`: Uses domain/topic_id/post_id structure
- `NotionPageRID`: Uses workspace_id/page_id structure
- `GitHubFileRID`: Uses owner/repo/branch/path_hash structure

### 3.2 Bundles and Manifests

Bundles package content with integrity verification.

**Bundle Structure**:
```python
@dataclass
class Bundle:
    rid: str                    # Resource identifier
    manifest: Manifest          # Content metadata
    contents: Any               # Actual content
```

**Manifest Fields**:
```python
@dataclass
class Manifest:
    rid: str                    # RID as string
    timestamp: str              # ISO format
    content_hash: str           # SHA-256 hash
    size_bytes: int             # Content size
    content_type: str           # MIME type
    version: str = "1.0"        # Manifest version
    metadata: Optional[Dict]    # Additional metadata
```

**Implementation** (`koi_protocol/core/bundle_system.py`):

```python
@classmethod
def generate(cls, rid: RID, contents: Any, content_type: str = "application/json",
            metadata: Optional[Dict[str, Any]] = None) -> 'Bundle':
    """Generate bundle with manifest"""
    manifest = Manifest.generate(
        rid=rid,
        content=contents,
        content_type=content_type,
        metadata=metadata
    )
    return cls(rid=rid.to_string(), manifest=manifest, contents=contents)
```

### 3.3 FUN Events

Three event types drive the distributed system:

**NEW Event**: First observation of content
```json
{
  "event_type": "NEW",
  "rid": "orn:web.page:example.com/abc123",
  "source_node": "website_sensor",
  "timestamp": "2025-10-10T12:00:00Z",
  "bundle": { ... }
}
```

**UPDATE Event**: Content has changed
```json
{
  "event_type": "UPDATE",
  "rid": "orn:web.page:example.com/abc123",
  "source_node": "website_sensor",
  "timestamp": "2025-10-10T13:00:00Z",
  "bundle": { ... }
}
```

**FORGET Event**: Content should be removed
```json
{
  "event_type": "FORGET",
  "rid": "orn:web.page:example.com/abc123",
  "source_node": "website_sensor",
  "timestamp": "2025-10-10T14:00:00Z",
  "reason": "Content deleted at source"
}
```

### 3.4 CAT Receipts

Content Addressable Transformation receipts provide complete provenance tracking.

**Receipt Structure** (`src/cat/cat_receipt_chain_v2.py`):
```python
{
  "transformation_id": "uuid",
  "rid": "orn:...",
  "cid": "sha256:...",
  "transformation_type": "sensor_collection|embedding_generation|chunking",
  "input_manifest": { ... },
  "output_manifest": { ... },
  "transformation_metadata": {
    "sensor_name": "github_sensor",
    "processing_time_ms": 123,
    "model": "BAAI/bge-large-en-v1.5"
  },
  "timestamp": "ISO 8601",
  "agent_id": "sensor.github",
  "chain": "previous_receipt_hash"
}
```

**Generation Points**:
1. Sensor collection (sensor → bundle)
2. Event bridge processing (bundle → chunks)
3. Embedding generation (chunk → vector)
4. Storage (vector → database)

---

## 4. Sensor Network

### 4.1 Active Sensors

**Website Sensor** (`sensors/websites/`):
- Platform: Generic web pages
- Method: HTTP scraping with BeautifulSoup
- Features: Hash-based change detection, site-specific handlers
- Configuration: YAML-based with per-site settings
- Status: Production (9+ sites monitored)

**GitHub Sensor** (`sensors/github/`):
- Platform: GitHub repositories
- Method: GitHub API v3
- Features: File monitoring, commit tracking
- Configuration: Repository list, branch selection
- Status: Production (5+ repos monitored)

**GitHub Activity Sensor** (`sensors/github_activity/`):
- Platform: GitHub comprehensive activity
- Method: GitHub API v3 (commits, issues, PRs)
- Features: Daily/weekly aggregation for curation
- Configuration: Repository list with activity types
- Status: Production (added September 28, 2025)

**GitLab Sensor** (`sensors/gitlab/`):
- Platform: GitLab repositories
- Method: GitLab API v4
- Features: Documentation monitoring
- Configuration: Project IDs, file patterns
- Status: Production

**Medium Sensor** (`sensors/medium/`):
- Platform: Medium publications
- Method: RSS feed parsing
- Features: Article extraction, author tracking
- Configuration: Publication RSS URLs
- Status: Production

**Discourse Sensor** (`sensors/discourse/`):
- Platform: Discourse forums
- Method: Discourse API with pagination
- Features: Topic and post monitoring, full pagination support
- Configuration: Forum URL, categories
- Status: Production (fixed September 18, 2025)

**Telegram Sensor** (`sensors/telegram/`):
- Platform: Telegram channels/groups
- Method: Telegram Bot API
- Features: Real-time message monitoring, media handling
- Configuration: Bot token, channel IDs
- Status: Production

**Twitter Sensor** (`sensors/twitter/`):
- Platform: Twitter/X
- Method: Playwright-based scraping (no auth required)
- Features: Tweet monitoring, thread detection
- Configuration: Accounts to monitor
- Status: Production

**Discord Sensor** (`sensors/discord/`):
- Platform: Discord servers
- Method: Discord Bot API
- Features: Channel monitoring, message tracking
- Configuration: Bot token, server/channel IDs
- Status: Production

**Podcast Sensor** (`sensors/podcast/`):
- Platform: Podcast RSS feeds
- Method: RSS parsing + audio transcription
- Features: Episode detection, Whisper transcription
- Configuration: Podcast RSS URLs
- Status: Production (68/70 episodes transcribed)

**Notion Sensor** (`sensors/notion/`):
- Platform: Notion workspaces
- Method: Notion API v1
- Features: Database/page monitoring, property extraction
- Configuration: Integration token, database IDs
- Status: Production

**Ledger Sensor** (`sensors/ledger/`):
- Platform: Regen Ledger blockchain
- Method: Blockchain RPC
- Features: On-chain data monitoring, credit tracking
- Configuration: Node endpoint, query filters
- Status: Production

### 4.2 Sensor Architecture

All sensors inherit from `BaseSensor` class (`shared/handlers/base_sensor.py`):

```python
class BaseSensor(ABC):
    """Abstract base class for KOI sensor nodes"""

    @abstractmethod
    async def collect_data(self) -> List[Dict[str, Any]]:
        """Collect data from platform API"""
        pass

    @abstractmethod
    def create_rid(self, item_data: Dict[str, Any]) -> RID:
        """Create Resource Identifier"""
        pass

    @abstractmethod
    def extract_content(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and normalize content"""
        pass

    async def collection_loop(self):
        """Main data collection loop"""
        while self.running:
            raw_items = await self.collect_data()
            for item in raw_items:
                if self.apply_content_filters(item):
                    rid = self.create_rid(item)
                    if not self.is_cached(rid):
                        bundle = self.create_bundle(rid, item)
                        self.cache_bundle(bundle)
                        await self.emit_koi_event(bundle, "NEW")
            await asyncio.sleep(self.config.processing_interval)
```

### 4.3 Sensor Deployment

**Individual Sensor**:
```bash
cd sensors/github
./setup.sh          # Create venv, install dependencies
./start.sh          # Start in foreground
./start.sh -b       # Start in background
```

**All Sensors**:
```bash
./setup_all.sh      # Setup all sensors
./start_all.sh      # Start all configured sensors
./status.sh         # Check sensor status
./stop_all.sh       # Stop all sensors
```

**Configuration** (`.env` file):
```bash
# Coordinator
KOI_COORDINATOR_URL=http://localhost:8005

# Platform credentials
NOTION_API_KEY=secret_...
TELEGRAM_BOT_TOKEN=123456789:ABC...
TWITTER_BEARER_TOKEN=AAA...
GITHUB_TOKEN=ghp_...
DISCORD_BOT_TOKEN=MTk...
```

### 4.4 Health Monitoring

**Smart Hybrid Architecture**:
- Periodic heartbeats: Every 30 minutes from each sensor
- On-demand ping: Coordinator can query specific sensors
- Smart refresh: Dashboard only pings sensors inactive >10 minutes
- Status levels: Active (<5 min), Idle (5-30 min), Offline (>30 min)

**Heartbeat Event**:
```json
{
  "event_type": "HEARTBEAT",
  "source_sensor": "github_sensor",
  "timestamp": "2025-10-10T12:00:00Z",
  "metrics": {
    "items_collected": 42,
    "errors_encountered": 0,
    "last_collection_time": "2025-10-10T11:55:00Z"
  }
}
```

---

## 5. Processing Pipeline

### 5.1 KOI Coordinator

**Purpose**: Central event routing and sensor management

**Location**: Port 8005

**Responsibilities**:
- Receive events from all sensors
- Maintain sensor registry
- Forward events to Event Bridge v2
- Track delivery confirmations
- Health status aggregation

**API Endpoints**:
```
POST   /koi/event           # Receive sensor events
GET    /koi/sensors         # List registered sensors
POST   /koi/ping/{sensor}   # Ping specific sensor
GET    /health              # Health check
GET    /stats               # System statistics
```

### 5.2 Event Bridge v2

**Purpose**: Content processing, deduplication, and storage

**Location**: Port 8100

**File**: `src/core/koi_event_bridge_v2.py`

**Processing Flow**:

1. **Event Reception**:
   - Validate KOI event structure
   - Extract bundle and manifest
   - Verify content hash

2. **Deduplication**:
   - Check RID existence in `koi_memories`
   - For NEW events: Reject if RID exists
   - For UPDATE events: Create new version, mark previous as `superseded_at`
   - Content hash comparison prevents unnecessary reprocessing

3. **Document Chunking**:
   - Extract text from bundle contents
   - Split into 1000-character chunks with 200-character overlap
   - Preserve semantic boundaries (sentence/paragraph breaks)
   - Generate chunk IDs linked to parent document

4. **Embedding Generation**:
   - Send each chunk to BGE server (port 8090)
   - Receive 1024-dimensional vector
   - Store in `koi_embeddings` table with pgvector

5. **CAT Receipt Creation**:
   - Generate transformation receipt for each step
   - Link receipts in chain (previous receipt hash)
   - Store in `transformation_receipts` table

6. **Storage**:
   - Insert into `koi_memories` (source documents)
   - Insert into `koi_embeddings` (vectors)
   - Create entries in `memories` table (agent-compatible format)

**Configuration**:
```bash
POSTGRES_URL=postgresql://postgres:postgres@localhost:5433/eliza
BGE_API_URL=http://localhost:8090/encode
USE_ISOLATED_TABLES=true
KG_EXTRACTION_ENABLED=false
```

**API Endpoints**:
```
POST   /process-koi-event   # Main processing endpoint
GET    /                    # Health and feature list
GET    /stats               # Pipeline statistics
```

### 5.3 BGE Embedding Server

**Purpose**: Generate semantic embeddings for text

**Location**: Port 8090

**File**: `src/core/bge_server.py`

**Model**: BAAI/bge-large-en-v1.5
- Embedding dimension: 1024
- Context window: 512 tokens
- Language: English-optimized

**API**:
```bash
curl -X POST http://localhost:8090/encode \
  -H "Content-Type: application/json" \
  -d '{"text": "Regenerative agriculture practices"}'

# Response:
{
  "embedding": [0.123, -0.456, ...],  # 1024 dimensions
  "model": "BAAI/bge-large-en-v1.5"
}
```

**Performance**:
- Throughput: ~100 chunks/second
- Latency: ~10ms per chunk
- Batch processing supported

### 5.4 Event Filtering

**Purpose**: Prevent unnecessary processing of non-content events

**Implementation** (`src/core/koi_event_filter.py`):

```python
def filter_koi_event(event: Dict) -> bool:
    """Return False to filter out (skip), True to process"""

    # Filter heartbeats
    if event.get("event_type") == "HEARTBEAT":
        return False

    # Filter test data
    bundle = event.get("bundle", {})
    metadata = bundle.get("manifest", {}).get("metadata", {})
    if metadata.get("is_test_data"):
        return False

    # Filter empty content
    contents = bundle.get("contents", {})
    if not contents.get("document", {}).get("content"):
        return False

    return True
```

**Filtered Event Types**:
- HEARTBEAT events (sensor health checks)
- Test data (marked with `is_test_data: true`)
- Empty content (no actual text)
- Malformed events (validation failures)

---

## 6. Storage Architecture

### 6.1 PostgreSQL Schema

**Database**: `eliza` (port 5433)

**Extensions**:
- `pgvector`: Vector similarity search
- `pg_trgm`: Trigram matching for fuzzy search
- `uuid-ossp`: UUID generation

### 6.2 KOI Pipeline Tables

**koi_memories**: Source documents from sensors

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

**koi_embeddings**: Vector embeddings with pgvector

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

**transformation_receipts**: CAT receipt provenance

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

### 6.3 Agent State Tables

**memories**: Agent-accessible chunks for RAG

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

**conversations**: Agent chat history

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

### 6.4 Database Queries

**Get Latest Version of Document**:
```sql
SELECT * FROM koi_memories
WHERE rid = 'orn:web.page:example.com/abc123'
  AND superseded_at IS NULL;
```

**Get Version History**:
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

**Semantic Search**:
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

**Pipeline Statistics**:
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

---

## 7. Agent Integration

### 7.1 ElizaOS Agents

**Location**: `/opt/projects/GAIA`

**Active Agents**:
1. RegenAI - Primary Regen Network representative
2. Advocate - Community advocacy and outreach
3. Voice of Nature - Ecological perspective
4. Governor - Governance and coordination
5. Narrative - Storytelling and communication

### 7.2 Knowledge Access Patterns

**Direct PostgreSQL Queries**:
```typescript
// Agent retrieves relevant memories
const memories = await runtime.databaseAdapter.searchMemoriesByEmbedding(
    queryEmbedding,
    {
        tableName: "memories",
        roomId: message.roomId,
        match_threshold: 0.7,
        count: 10
    }
);
```

**MCP Tool Integration**:
```typescript
// Agent uses MCP tool for external queries
const results = await runtime.callTool("bge_search", {
    query: "regenerative agriculture practices",
    limit: 5,
    threshold: 0.75
});
```

### 7.3 RAG Workflow

1. **User Query**: Agent receives question
2. **Query Embedding**: Generate vector for query text
3. **Semantic Search**: Query `koi_embeddings` with cosine similarity
4. **Context Assembly**: Retrieve top-k matching chunks
5. **Provenance Lookup**: Get source document metadata from `koi_memories`
6. **Response Generation**: LLM generates response with context
7. **Citation**: Include source URLs and RIDs in response

**Example Implementation**:
```typescript
async function answerQuestion(query: string, agentId: string) {
    // 1. Generate query embedding
    const embedding = await generateEmbedding(query);

    // 2. Search for relevant chunks
    const chunks = await db.query(`
        SELECT
            m.content,
            e.chunk_text,
            1 - (e.dim_1024 <=> $1) AS similarity,
            m.content->>'url' AS source_url,
            m.rid
        FROM koi_memories m
        JOIN koi_embeddings e ON e.memory_id = m.id
        WHERE m.superseded_at IS NULL
        ORDER BY e.dim_1024 <=> $1
        LIMIT 5
    `, [embedding]);

    // 3. Assemble context
    const context = chunks.map(c => c.chunk_text).join("\n\n");

    // 4. Generate response
    const response = await llm.complete({
        messages: [
            { role: "system", content: "Answer based on context." },
            { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` }
        ]
    });

    // 5. Add citations
    const citations = chunks.map(c => ({
        url: c.source_url,
        rid: c.rid,
        similarity: c.similarity
    }));

    return { answer: response, citations };
}
```

---

## 8. Deployment & Operations

### 8.1 System Requirements

**Hardware**:
- CPU: 4+ cores
- RAM: 8GB minimum, 16GB recommended
- Storage: 50GB+ (depends on document volume)
- Network: Stable internet connection

**Software**:
- Ubuntu 20.04+ or similar Linux distribution
- Python 3.8+
- PostgreSQL 14+ with pgvector extension
- Node.js 18+ (for dashboard)
- Docker (optional, for containerized deployment)

### 8.2 Installation

**koi-sensors**:
```bash
cd /opt/projects/koi-sensors

# Setup all sensors (creates individual venvs)
./setup_all.sh

# Configure credentials
cp .env.template .env
nano .env  # Add API keys

# Start all sensors
./start_all.sh
```

**koi-processor**:
```bash
cd /opt/projects/koi-processor

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env  # Add database credentials, API keys

# Run migrations
bash scripts/run_migrations.sh

# Start services
bash scripts/start_all_services.sh
```

### 8.3 Service Management

**Sensor Status**:
```bash
cd /opt/projects/koi-sensors
./status.sh
```

**Start/Stop Sensors**:
```bash
# All sensors
./start_all.sh
./stop_all.sh

# Individual sensor
cd sensors/github
./start.sh -b    # Background mode
pkill -f github_sensor.py
```

**Processor Services**:
```bash
# Event Bridge v2
cd /opt/projects/koi-processor
source venv/bin/activate
python src/core/koi_event_bridge_v2.py &

# BGE Server
python src/core/bge_server.py &

# Dashboard
./start_dashboard.sh
```

### 8.4 Configuration Files

**Sensor Configuration** (YAML):
```yaml
# sensors/github/config.yaml
sensor:
  name: github_sensor
  platform: github
  poll_interval: 1800  # 30 minutes

repositories:
  - owner: regen-network
    repo: regen-ledger
    branch: main

koi_net:
  coordinator_url: http://localhost:8005
  cache_directory: ./cache
```

**Environment Variables** (`.env`):
```bash
# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5433/eliza

# Services
BGE_API_URL=http://localhost:8090/encode
KOI_COORDINATOR_URL=http://localhost:8005

# Platform Credentials
NOTION_API_KEY=secret_...
TELEGRAM_BOT_TOKEN=123:ABC...
GITHUB_TOKEN=ghp_...
TWITTER_BEARER_TOKEN=AAA...
DISCORD_BOT_TOKEN=MTk...

# OpenAI (for podcast generation)
OPENAI_API_KEY=sk-...
```

### 8.5 Port Assignments

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| KOI Coordinator | 8005 | HTTP | Event routing |
| Event Bridge v2 | 8100 | HTTP | Event processing |
| BGE Server | 8090 | HTTP | Embedding generation |
| Dashboard | 8400 | HTTP | Monitoring UI |
| PostgreSQL | 5433 | PostgreSQL | Database |
| Apache Jena (future) | 3030 | HTTP | SPARQL endpoint |

---

## 9. Monitoring & Observability

### 9.1 Dashboard Access

**Sensor Dashboard**: https://regen.gaiaai.xyz/koi
- Real-time sensor status
- Health monitoring
- Event statistics
- Error logs

**Content Dashboard**: https://regen.gaiaai.xyz/digests
- Daily curator status
- Weekly digest generation
- Podcast creation workflow
- Content quality metrics

### 9.2 Log Files

**Sensor Logs**:
```bash
# Individual sensor
tail -f /opt/projects/koi-sensors/sensors/github/github_sensor.log

# All sensors
tail -f /opt/projects/koi-sensors/sensors/*/\*.log
```

**Processor Logs**:
```bash
# Event Bridge
tail -f /opt/projects/koi-processor/forwarder.log

# Dashboard
tail -f /opt/projects/koi-processor/logs/dashboard.log

# BGE Server
tail -f /opt/projects/koi-processor/bge_server.log
```

### 9.3 Metrics

**Pipeline Statistics** (SQL):
```sql
-- Overall stats
SELECT
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE superseded_at IS NULL) as current_documents,
    COUNT(DISTINCT source_sensor) as active_sensors,
    COUNT(DISTINCT DATE(created_at)) as active_days
FROM koi_memories;

-- Per-sensor breakdown
SELECT
    source_sensor,
    COUNT(*) as docs,
    MAX(created_at) as last_update,
    AVG(LENGTH(content::TEXT)) as avg_size
FROM koi_memories
WHERE superseded_at IS NULL
GROUP BY source_sensor
ORDER BY docs DESC;

-- Embedding coverage
SELECT
    COUNT(DISTINCT m.id) as documents_with_embeddings,
    COUNT(e.id) as total_chunks,
    AVG(e.chunk_index + 1) as avg_chunks_per_doc
FROM koi_memories m
JOIN koi_embeddings e ON e.memory_id = m.id
WHERE m.superseded_at IS NULL;
```

### 9.4 Health Checks

**Coordinator Health**:
```bash
curl http://localhost:8005/health
```

**Event Bridge Health**:
```bash
curl http://localhost:8100/
```

**Database Connection**:
```bash
psql -h localhost -p 5433 -U postgres -d eliza -c "SELECT COUNT(*) FROM koi_memories;"
```

**BGE Server**:
```bash
curl -X POST http://localhost:8090/encode \
  -H "Content-Type: application/json" \
  -d '{"text": "test"}'
```

---

## 10. Development Guide

### 10.1 Adding a New Sensor

1. **Create Sensor Directory**:
```bash
cd /opt/projects/koi-sensors/sensors
mkdir my_sensor
cd my_sensor
```

2. **Implement Sensor Class**:
```python
# my_sensor.py
from shared.handlers.base_sensor import BaseSensor
from koi_protocol.core.rid_system import GenericRID
from shared.config.base import BaseSensorConfig

class MySensor(BaseSensor):
    async def collect_data(self) -> List[Dict]:
        # Fetch data from platform API
        response = await self.http_client.get("https://api.platform.com/data")
        return response.json()

    def create_rid(self, item: Dict) -> RID:
        # Create unique RID for item
        return GenericRID("my.platform", item["id"])

    def extract_content(self, item: Dict) -> Dict:
        # Extract normalized content
        return {
            "text": item["body"],
            "title": item["title"],
            "author": item["author"],
            "created_at": item["timestamp"]
        }
```

3. **Create Configuration**:
```yaml
# config.yaml
sensor:
  name: my_sensor
  platform: my_platform
  poll_interval: 1800

api:
  base_url: https://api.platform.com
  api_key_env: MY_PLATFORM_API_KEY

koi_net:
  coordinator_url: http://localhost:8005
  cache_directory: ./cache
```

4. **Create Setup Script**:
```bash
# setup.sh
#!/bin/bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

5. **Create Start Script**:
```bash
# start.sh
#!/bin/bash
source ../../.env
source venv/bin/activate
python my_sensor.py
```

6. **Test Sensor**:
```bash
./setup.sh
./start.sh
```

### 10.2 Custom RID Types

```python
# shared/rid_types/my_platform.py
from koi_protocol.core.rid_system import ORN
import hashlib

class MyPlatformRID(ORN):
    """My Platform RID: orn:my.platform:user_id/item_id"""
    namespace = "my.platform"

    def __init__(self, user_id: str, item_id: str):
        self.user_id = user_id
        self.item_id = item_id
        super().__init__()

    @property
    def reference(self) -> str:
        return f"{self.user_id}/{self.item_id}"

# Register with RID registry
from koi_protocol.core.rid_system import rid_registry
rid_registry.register("my.platform", MyPlatformRID)
```

### 10.3 Testing

**Unit Tests**:
```python
# tests/test_my_sensor.py
import pytest
from sensors.my_sensor.my_sensor import MySensor

@pytest.mark.asyncio
async def test_collect_data():
    config = load_test_config()
    sensor = MySensor(config)

    data = await sensor.collect_data()
    assert len(data) > 0
    assert "id" in data[0]

def test_create_rid():
    sensor = MySensor(load_test_config())
    item = {"id": "123", "user": "456"}

    rid = sensor.create_rid(item)
    assert rid.to_string() == "orn:my.platform:456/123"
```

**Integration Tests**:
```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run tests
pytest tests/integration/
```

---

## 11. Production Considerations

### 11.1 Performance Optimization

**Database Indexing**:
```sql
-- Essential indexes
CREATE INDEX CONCURRENTLY idx_koi_memories_rid ON koi_memories(rid);
CREATE INDEX CONCURRENTLY idx_koi_memories_current
    ON koi_memories(rid) WHERE superseded_at IS NULL;
CREATE INDEX CONCURRENTLY idx_koi_embeddings_vector
    ON koi_embeddings USING ivfflat (dim_1024 vector_cosine_ops)
    WITH (lists = 100);

-- Analyze tables
ANALYZE koi_memories;
ANALYZE koi_embeddings;
```

**Connection Pooling**:
```python
# Use asyncpg pool
pool = await asyncpg.create_pool(
    dsn=DATABASE_URL,
    min_size=10,
    max_size=50,
    command_timeout=60
)
```

**Batch Processing**:
```python
# Process embeddings in batches
async def process_chunks_batch(chunks: List[str]):
    embeddings = await bge_client.encode_batch(chunks, batch_size=32)
    await db.executemany(
        "INSERT INTO koi_embeddings (memory_id, dim_1024) VALUES ($1, $2)",
        [(chunk.memory_id, emb) for chunk, emb in zip(chunks, embeddings)]
    )
```

### 11.2 Backup Strategy

**Database Backup** (`scripts/backup_koi_databases.py`):
```bash
# Daily automated backup
0 2 * * * /opt/projects/koi-processor/scripts/backup_koi_databases.py
```

**Backup Script**:
```python
#!/usr/bin/env python3
import subprocess
from datetime import datetime

backup_file = f"koi_backup_{datetime.now():%Y%m%d}.sql"
subprocess.run([
    "pg_dump",
    "-h", "localhost",
    "-p", "5433",
    "-U", "postgres",
    "-d", "eliza",
    "-f", backup_file,
    "--clean",
    "--create"
])
```

**Restore**:
```bash
psql -h localhost -p 5433 -U postgres -f koi_backup_20251010.sql
```

### 11.3 Scaling Considerations

**Horizontal Scaling**:
- Multiple Event Bridge instances (load balanced)
- Dedicated BGE servers (GPU-accelerated)
- Database read replicas for query load
- Sensor distribution across machines

**Vertical Scaling**:
- Increase PostgreSQL shared_buffers
- Add more RAM for pgvector index caching
- GPU for BGE embedding generation
- SSD storage for database

**Monitoring**:
- Prometheus metrics export
- Grafana dashboards
- Alert thresholds for errors, latency
- Resource usage tracking

### 11.4 Security

**API Keys**:
- Store in `.env` file (never commit)
- Use environment variables
- Rotate keys regularly
- Minimal permission scope

**Database**:
- Use strong passwords
- Enable SSL connections
- Restrict network access
- Regular security updates

**Network**:
- Firewall rules for internal ports
- HTTPS for public endpoints
- Rate limiting on APIs
- DDoS protection

### 11.5 Content Operations

**Daily Curator** (`scripts/run_daily_curator.py`):
- Queries recent content (24-48 hours)
- Generates social media posts
- Validates style compliance
- Outputs JSON for X bot

**Weekly Aggregator** (`scripts/run_weekly_aggregator.py`):
- Aggregates past 7 days of content
- Creates comprehensive digest
- Includes on-chain activity
- Feeds podcast generator

**Podcast Pipeline** (`src/audio/podcast_integration.py`):
- Takes weekly digest text
- Generates audio with Podcastfy
- Creates RSS feed
- Publishes episodes

---

## Conclusion

The KOI system represents a comprehensive knowledge management infrastructure that successfully bridges real-time data collection, semantic processing, and AI agent integration. The implementation demonstrates production-grade architecture with clear separation of concerns, robust error handling, complete provenance tracking, and immediate knowledge availability for intelligent systems.

**Key Strengths**:
- Distributed microservices architecture with clear interfaces
- Full KOI protocol compliance (RIDs, Bundles, FUN events, CAT receipts)
- Real-time processing with <5 second latency
- Comprehensive deduplication and versioning
- Complete provenance tracking
- Production-ready deployment with monitoring

**Next Steps**:
- Semantic entity extraction with unified ontology
- Apache Jena Fuseki integration for SPARQL queries
- Advanced knowledge graph reasoning
- Multi-modal content support (images, video)
- Cross-organization knowledge federation

---

**Document Version**: 3.0
**Last Updated**: October 10, 2025
**Maintained By**: Regen Network AI Team
