# KOI Architecture Overview

## System Design

KOI (Knowledge Organization Infrastructure) provides a dual-layer system for tracking and querying knowledge across RegenAI agents.

```
┌─────────────────────────────────────────────────────────────────┐
│                        KOI ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────┐ │
│  │   Web Dashboard │    │   Query Server   │    │    API     │ │
│  │ (Port 8100/web) │    │   (Port 8100)    │    │ Endpoints  │ │
│  └─────────────────┘    └──────────────────┘    └────────────┘ │
│           │                       │                     │       │
│           └───────────────────────┼─────────────────────┘       │
│                                   │                             │
│  ┌─────────────────────────────────┴─────────────────────────┐   │
│  │              KOI Registry & Database                    │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │   │
│  │  │ Content     │ │ Processing  │ │    Sources      │   │   │
│  │  │ Tracking    │ │   Status    │ │   Management    │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                   │                             │
├─────────────────────────────────────────────────────────────────┤
│                          DATA LAYER                             │
│                                                                 │
│  ┌──────────────────┐              ┌─────────────────────────┐  │
│  │  Real-time       │              │     Bulk Sync          │  │
│  │  Integration     │◄────────────►│     Scripts            │  │
│  │                  │              │                         │  │
│  │ Knowledge Service│              │ generate-koi-real-data  │  │
│  │ KoiIntegration   │              │ generate-koi-manifest   │  │
│  └──────────────────┘              └─────────────────────────┘  │
│           │                                     │               │
│           ▼                                     ▼               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PostgreSQL Database                        │    │
│  │                   (Port 5433)                          │    │
│  │                                                         │    │
│  │  ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐  │    │
│  │  │   memories  │ │ knowledge_*  │ │    agents       │  │    │
│  │  │   (27K+     │ │   tables     │ │   metadata      │  │    │
│  │  │ documents)  │ │              │ │                 │  │    │
│  │  └─────────────┘ └──────────────┘ └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. KOI Query Server (`koi-query-server.ts`)
- **Purpose**: HTTP API server for querying knowledge
- **Port**: 8100 (accessible via https://regen.gaiaai.xyz/koi/)
- **Features**:
  - REST API endpoints
  - Web dashboard with tooltips
  - Agent mapping and deduplication
  - Statistics aggregation
  - Real-time data updates

### 2. Knowledge Service Integration
- **Purpose**: Real-time tracking of document processing
- **Integration**: `KoiIntegration` class in Knowledge Service
- **Triggers**:
  - Before processing: `trackContentBeforeProcessing()`
  - After success: `markProcessingSuccess()`
  - After failure: `markProcessingFailure()`
  - On duplicates: `markAsSkipped()`

### 3. Bulk Sync Scripts
- **`generate-koi-real-data.ts`**: Sync 27K+ existing documents
- **`generate-koi-manifest-production.ts`**: Generate manifests
- **Purpose**: Populate KOI with historical data

### 4. KOI Registry System
- **Content Tracking**: Track documents across sources
- **Processing Status**: Monitor agent processing states
- **Source Management**: Categorize content by type
- **Database Schema**: Purpose-built tables for KOI data

## Data Flow

### Real-time Processing
```
Agent processes document → Knowledge Service → KoiIntegration → KOI Registry → Database
```

### Bulk Synchronization
```
Existing Documents → Bulk Sync Script → KOI Registry → Database
```

### Query Processing
```
User Query → Query Server → KOI Registry → Database → Formatted Response
```

## Integration Points

### 1. Knowledge Service Integration
```typescript
// In KnowledgeService.addKnowledge()
const koiContentRid = await this.koiIntegration.trackContentBeforeProcessing(options);

// After successful processing
await this.koiIntegration.markProcessingSuccess(koiContentRid, documentId, fragmentCount);
```

### 2. Agent Mapping
```typescript
// Dynamic agent UUID to name mapping
const agentMap = await fetch('http://localhost:3000/api/agents');
// Maps UUIDs like "8e1e4498-..." to "RegenAI"
```

### 3. Source Classification
Documents are automatically classified by source based on:
- File paths (e.g., `/notion/` → Notion source)
- URLs (e.g., `medium.com` → Medium source)
- Metadata (`sourceType` field)

## Directory Organization

```
/opt/projects/plugin-knowledge-gaia/
├── docs/              # Documentation
├── scripts/           # Operational scripts
│   ├── koi-query-server.ts
│   ├── generate-koi-real-data.ts
│   └── test-koi-queries.ts
├── src/               # Source code
│   ├── koi-registry/  # Registry system
│   └── koi-integration.ts
└── dist/              # Built files
```

## Configuration

### Environment Variables
- `POSTGRES_URL`: Database connection
- `KOI_PORT`: Server port (default 8100)
- `KNOWLEDGE_PATH`: Knowledge files path
- `LOG_LEVEL`: Logging verbosity

### Database Tables
- `koi_content_sources`: Source definitions
- `koi_content_items`: Document tracking
- `koi_processing_status`: Agent processing states
- `memories`: ElizaOS document storage
- `agents`: Agent metadata

## Performance Considerations

- **Caching**: Query results cached for performance
- **Bulk Operations**: Batch processing for large datasets
- **Indexing**: Database indexes on frequently queried fields
- **Deduplication**: Merge duplicate agent entries in dashboard
- **Async Processing**: Non-blocking integration with Knowledge Service

## Security

- **CORS**: Enabled for web dashboard access
- **Input Validation**: All API inputs validated
- **SQL Injection**: Parameterized queries used
- **Rate Limiting**: Implicit through nginx proxy

## Scalability

- **Horizontal**: Multiple KOI servers can share same database
- **Vertical**: Database can be scaled independently
- **Caching**: Redis can be added for query caching
- **CDN**: Static assets served via nginx