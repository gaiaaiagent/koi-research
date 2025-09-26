# Hybrid RAG & Knowledge Graph Architecture

## Executive Summary

Our system implements a sophisticated hybrid approach to Retrieval-Augmented Generation (RAG) that combines traditional vector similarity search with structured knowledge graph queries. This dual-path architecture enables both semantic understanding through embeddings and precise ontological reasoning through RDF triples, providing AI agents with comprehensive knowledge access capabilities.

## System Overview

### Core Philosophy
The architecture is designed around the concept of "living systems" - treating knowledge as a metabolic process where information flows, transforms, and evolves through various stages. This biomimetic approach aligns with Regen Network's regenerative principles, creating a knowledge ecosystem that grows and adapts organically.

### Key Innovation: Dual Knowledge Representation
Unlike traditional RAG systems that rely solely on vector embeddings, our architecture maintains knowledge in two complementary forms:
1. **Vector Embeddings** - For semantic similarity and contextual understanding
2. **RDF Knowledge Graph** - For structured relationships and ontological reasoning

## Architecture Components

### Data Ingestion Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ KOI Sensors │────▶│ Coordinator  │────▶│ Event Bridge │
│  (Various)  │     │  (Port 8200) │     │  (Port 8100) │
└─────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                 ┌───────────────┴───────────────┐
                                 │                               │
                                 ▼                               ▼
                         ┌──────────────┐            ┌──────────────────┐
                         │  Embedding   │            │ Entity Extractor │
                         │   Server     │            │  (LLM + Ontology)│
                         │  (Port 8090) │            │                  │
                         └──────────────┘            └──────────────────┘
                                 │                               │
                                 ▼                               ▼
                         ┌──────────────┐            ┌──────────────────┐
                         │ PostgreSQL   │            │  Apache Jena     │
                         │  (pgvector)  │            │    Fuseki        │
                         │              │            │  (Port 3030)     │
                         └──────────────┘            └──────────────────┘
```

### 1. KOI Sensors Network
The system begins with a distributed network of sensors that monitor various content sources:

- **Website Monitor Sensors** - Track changes in web content
- **GitHub Sensors** - Monitor repository updates and documentation
- **Medium Sensors** - Collect blog posts and articles
- **Telegram Sensors** - Capture community discussions
- **Discord Sensors** - Monitor governance and technical discussions
- **Twitter/X Sensors** - Track social media mentions and threads

Each sensor:
- Assigns a unique Resource Identifier (RID) to content
- Generates Content Identifiers (CIDs) for deduplication
- Extracts basic metadata (title, author, timestamp, source)
- Packages content into standardized KOI event bundles

### 2. KOI Event Processing

#### Event Bridge v2 (Port 8100)
The central processing hub that:

**Deduplication & Versioning:**
- Uses RID-based tracking to prevent duplicate processing
- Maintains version history for updated content
- Handles NEW, UPDATE, and FORGET event types
- Creates CAT (Content Addressable Transformation) receipts for provenance

**Content Chunking:**
- Intelligently splits documents into processable chunks (1000 chars with 200 char overlap)
- Preserves context across chunk boundaries
- Maintains chunk-to-document relationships
- Optimizes for both embedding generation and LLM context windows

### 3. Dual Processing Paths

#### Path A: Embedding Generation (Semantic Understanding)

**BGE Embedding Server (Port 8090):**
- Uses BAAI/bge-large-en-v1.5 model (1024-dimensional vectors)
- Generates high-quality semantic embeddings for each chunk
- Model-agnostic API allows swapping to other embedding models
- Supports multiple embedding dimensions (768, 1024, 1536)

**Storage in PostgreSQL with pgvector:**
```sql
CREATE TABLE koi_embeddings (
    id SERIAL PRIMARY KEY,
    memory_id UUID REFERENCES koi_memories(id),
    dim_768 vector(768),   -- Alternative models
    dim_1024 vector(1024), -- BGE embeddings
    dim_1536 vector(1536), -- OpenAI embeddings
    created_at TIMESTAMP
);
```

**Semantic Search Capabilities:**
- Cosine similarity search across embeddings
- Fast k-nearest neighbor retrieval
- Filtering by agent permissions and metadata
- Relevance scoring and ranking

#### Path B: Entity & Relationship Extraction (Ontological Understanding)

**LLM-Based Extraction Pipeline:**
- Uses Mistral 7B or similar models via Ollama
- Guided by unified ontology (36 classes)
- Extracts entities, relationships, and properties
- Generates JSON-LD structured data

**Ontology-Driven Processing:**
```turtle
# Unified Ontology Structure
@prefix regen: <https://regen.network/ontology#> .

# Core Classes
regen:System           # Living systems
regen:MetabolicFlow    # Information flows
regen:Agent           # Actors in the system
regen:SemanticAsset   # Knowledge artifacts
regen:EcologicalAsset # Environmental data

# Relationships
regen:produces        # Agent produces asset
regen:derivesFrom     # Asset lineage
regen:alignsWith      # Conceptual alignment
```

**RDF Triple Generation:**
The system converts extracted entities into RDF triples:
```
<document:123> regen:discusses <concept:regenerative-agriculture> .
<concept:regenerative-agriculture> regen:alignsWith "soil-health" .
<project:xyz> regen:produces <outcome:carbon-credits> .
```

### 4. Storage Layer

#### PostgreSQL Database (Port 5433)
Dual-table architecture for optimal performance:

**koi_memories Table:**
- Stores original documents with RIDs
- Maintains version history
- Tracks source sensors and metadata
- Ensures deduplication at document level

**memories Table:**
- Stores chunked content for RAG
- Links to agent access permissions
- Optimized for retrieval operations
- Contains 40,000+ searchable chunks

#### Apache Jena Fuseki (Port 3030)
SPARQL triplestore for knowledge graph:

**Features:**
- Stores 3,900+ RDF triples
- OWL ontology reasoning capabilities
- SPARQL 1.1 query support
- Persistent TDB2 storage
- RESTful HTTP interface

**Dataset Structure:**
```
/koi
  ├── ontologies/      # OWL ontology definitions
  ├── entities/        # Extracted entities
  ├── relationships/   # Inter-entity connections
  └── metadata/        # Provenance and timestamps
```

### 5. Query & Access Layer

#### Knowledge MCP Server
Provides unified access to both knowledge representations:

**Hybrid Query Capabilities:**
1. **Semantic Search** → Routes to PostgreSQL pgvector
2. **Ontological Query** → Routes to Apache Jena Fuseki
3. **Hybrid Query** → Combines results from both systems

**Query Examples:**
```javascript
// Semantic search
{
  "tool": "bge_search",
  "query": "regenerative agriculture practices",
  "top_k": 10
}

// SPARQL query
{
  "tool": "sparql_query",
  "query": "SELECT ?project WHERE { ?project regen:implements ?practice . ?practice rdf:type regen:RegenerativePractice }"
}

// Hybrid query (combines both)
{
  "tool": "hybrid_search",
  "semantic_query": "carbon sequestration",
  "ontological_filter": "?entity rdf:type regen:CarbonProject"
}
```

### 6. Agent Integration

#### ElizaOS Agents
Five AI agents with specialized roles:
- **RegenAI** - Development orchestrator
- **Advocate** - Community engagement
- **Voice of Nature** - Philosophical perspective
- **Governor** - Governance expertise
- **Narrator** - Storytelling and synthesis

**Access Patterns:**
1. Direct PostgreSQL queries for agent state
2. MCP tools for knowledge retrieval
3. Plugin-based architecture for extensibility

## Hybrid RAG Implementation

### Query Processing Flow

```
User Query
    │
    ▼
Query Analysis
    ├─► Semantic Intent Extraction
    └─► Entity Recognition
              │
              ▼
        Query Router
        ├─► Vector Search (if semantic)
        ├─► SPARQL Query (if structured)
        └─► Hybrid Query (if both)
              │
              ▼
        Result Fusion
        ├─► Rank by relevance
        ├─► Apply permissions
        └─► Format response
              │
              ▼
        Agent Response
```

### Semantic Search Pipeline

1. **Query Embedding Generation**
   - Convert user query to BGE embedding
   - Apply query expansion techniques

2. **Vector Similarity Search**
   ```sql
   SELECT content, 1 - (embedding <=> query_vector) as similarity
   FROM koi_embeddings
   WHERE similarity > threshold
   ORDER BY similarity DESC
   LIMIT k;
   ```

3. **Context Retrieval**
   - Fetch surrounding chunks
   - Retrieve document metadata
   - Apply agent-specific filters

### Knowledge Graph Query Pipeline

1. **Natural Language to SPARQL**
   - LLM converts questions to SPARQL
   - Ontology guides query construction
   - Validation against schema

2. **SPARQL Execution**
   ```sparql
   PREFIX regen: <https://regen.network/ontology#>

   SELECT ?doc ?title ?concept WHERE {
     ?doc regen:discusses ?concept .
     ?doc regen:title ?title .
     ?concept rdf:type regen:RegenerativeConcept .
     FILTER(REGEX(?title, "carbon", "i"))
   }
   ```

3. **Graph Traversal**
   - Follow relationship paths
   - Aggregate connected entities
   - Apply reasoning rules

### Result Fusion Strategy

**Scoring Algorithm:**
```python
def fusion_score(semantic_score, graph_score, query_type):
    if query_type == "factual":
        # Prioritize knowledge graph
        return 0.3 * semantic_score + 0.7 * graph_score
    elif query_type == "exploratory":
        # Prioritize semantic search
        return 0.7 * semantic_score + 0.3 * graph_score
    else:
        # Balanced approach
        return 0.5 * semantic_score + 0.5 * graph_score
```

## Ontology Design

### Unified Metabolic Ontology
Based on living systems theory with 36 core classes:

**Core Metaphors:**
- **System** - Self-organizing wholes
- **Organ** - Functional components
- **MetabolicFlow** - Information/resource flows
- **Transformation** - State changes
- **FeedbackLoop** - Regulatory mechanisms

**Domain-Specific Extensions:**
- **DiscourseElement** - Communication artifacts
- **ScientificProcess** - Research activities
- **GovernanceAct** - Decision-making events
- **EcologicalAsset** - Environmental resources

### Source-Specific Ontologies
Specialized ontologies for each content source:

**GitHub Ontology:**
- Repository, Commit, Issue, PullRequest
- Contributor, Branch, Release

**Twitter Ontology:**
- Tweet, Thread, Mention, Hashtag
- User, Retweet, Like

**Discourse Ontology:**
- Topic, Post, Category, Tag
- Member, Vote, Solution

## Performance Characteristics

### Throughput Metrics
- **Sensor ingestion**: 1,500+ documents/day
- **Embedding generation**: ~100ms per document
- **Entity extraction**: 2-3 seconds per document
- **End-to-end latency**: 3-5 seconds from sensor to availability

### Storage Efficiency
- **Document deduplication**: 90% reduction in redundant processing
- **Chunk optimization**: 40,000+ chunks from 26 unique documents
- **Embedding storage**: 1024-dimensional vectors with compression
- **Triple storage**: 3,900+ RDF triples with full reasoning

### Query Performance
- **Semantic search**: <200ms average response
- **SPARQL queries**: <500ms for complex traversals
- **Hybrid queries**: <1 second total latency
- **Cache hit rate**: 70%+ for common queries

## Production Deployment

### Service Architecture
```yaml
Services:
  koi-coordinator:
    port: 8200
    role: Sensor event routing

  koi-event-bridge:
    port: 8100
    role: Event processing & deduplication

  bge-embedding-server:
    port: 8090
    role: Vector embedding generation

  apache-jena-fuseki:
    port: 3030
    role: RDF triplestore & SPARQL

  postgresql:
    port: 5433
    role: Vector storage & agent data

  mcp-knowledge-server:
    port: 8200
    role: Unified knowledge API
```

### Monitoring & Observability
- Real-time dashboard at port 8400
- Pipeline statistics and throughput metrics
- Agent processing status tracking
- Content source breakdown visualization

## Future Enhancements

### Planned Improvements

1. **Advanced Reasoning**
   - OWL-DL inference rules
   - Temporal reasoning capabilities
   - Causal relationship extraction

2. **Federated Queries**
   - Cross-organization knowledge sharing
   - Distributed SPARQL endpoints
   - Privacy-preserving aggregation

3. **Adaptive Learning**
   - Reinforcement learning from query feedback
   - Ontology evolution through usage patterns
   - Dynamic embedding model selection

4. **Enhanced Extraction**
   - Multi-modal content processing (images, audio)
   - Scientific paper parsing with equation extraction
   - Code repository semantic analysis

## Conclusion

This hybrid RAG and knowledge graph architecture represents a significant advancement in AI knowledge systems. By combining the semantic understanding of vector embeddings with the structured reasoning of knowledge graphs, we create a system that can handle both exploratory questions requiring contextual understanding and precise queries demanding factual accuracy.

The biomimetic design philosophy, treating knowledge as a living system with metabolic flows and transformations, aligns perfectly with Regen Network's mission of regenerative systems. This architecture not only serves current needs but is designed to evolve and adapt, growing more capable and comprehensive over time.

Through careful integration of cutting-edge technologies - from distributed sensors to advanced embedding models, from RDF reasoning to hybrid query processing - we've built a knowledge infrastructure that empowers AI agents to engage meaningfully with complex regenerative concepts and support the transition to a more sustainable future.