# KOI Infrastructure for GAIA AI: Complete Research & Implementation Plan

## Executive Summary

After extensive research into KOI (Knowledge Organization Infrastructure) and iterative refinement based on architectural feedback, we propose a phased implementation that transforms GAIA AI from a basic RAG system into a sophisticated, distributed knowledge infrastructure aligned with planetary regeneration.

**Key Recommendations:**
1. **Dual Identification**: Use RIDs for semantic identity + CIDs for content deduplication
2. **Transformation Provenance**: Track every operation with Content-Addressable Transformations (CATs)
3. **Temporal Knowledge Graph**: Implement Graphiti (built on Neo4j) with RDF export capability
4. **Separation of Concerns**: Standalone KOI Processor Node separate from ElizaOS agents
5. **Cost-Aware Processing**: Smart optimization with local models where possible
6. **Phased Implementation**: Start simple (2 weeks MVP), evolve to full capabilities (12 weeks total)

## 1. Understanding KOI

### What is KOI?

KOI (Knowledge Organization Infrastructure) is a distributed system for managing knowledge flows across heterogeneous networks, developed through collaborative research between BlockScience, Metagov, and RMIT University.

**Evolution:**
- **v1 (KMS)**: Monolithic knowledge management
- **v2 (KOI Pond)**: API-based with primitive sensors  
- **v3 (KOI-net)**: Network protocol with full/partial nodes ← *We'll use this*

**Core Concepts:**
- **RIDs (Resource Identifiers)**: Stable references that persist across system changes
- **FUN Events**: Forget, Update, New - driving state changes
- **Fractal Architecture**: Networks can act as single nodes
- **Manifests**: SHA-256 hashes tracking all transformations

## 2. Current GAIA Analysis

### What We Have
- ElizaOS agent framework (5 agents running)
- PostgreSQL with pgvector for embeddings
- Basic document chunking and RAG
- 13,000+ documents indexed
- Some KOI registry tables in plugin-knowledge-local

### What's Missing
- Real-time content monitoring
- Knowledge graph capabilities
- Multi-agent coordination
- Semantic entity extraction
- Transformation accountability
- Commons knowledge sharing

### Integration Opportunity
The existing `plugin-knowledge-local` already includes KOI registry components, providing a foundation to build upon rather than starting from scratch.

## 3. Proposed Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    SENSOR LAYER (Real-time)                  │
│  Twitter | Telegram | Discord | Blog | Podcast | Notion      │
└────────────────────────────────┬────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│              KOI PROCESSOR NODE (Port 8100)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Dual ID Generation (RID + CID)                   │    │
│  │  • Modular Processing Pipeline                      │    │
│  │  • Transformation Provenance (CATs)                 │    │
│  │  • Cost Optimization                                │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     STORAGE LAYER                            │
│  PostgreSQL + pgvector | Graphiti (Neo4j) | RDF Export      │
└────────────────────────────────┬────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│               ELIZAOS AGENTS (Port 3000)                     │
│  RegenAI | Advocate | VoiceOfNature | Governor | Narrator    │
│           (Each as lightweight KOI Partial Node)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Dual Identification System

```typescript
interface DualIdentification {
  rid: string;  // WHERE it came from: "orn:regen.document:notion/page-123"
  cid: string;  // WHAT it contains: "cid:sha256:abc123..."
}
```

**Benefits:**
- RIDs provide stable semantic identity
- CIDs enable perfect deduplication
- Together: provenance + efficiency

#### 2. Transformation Provenance (CATs)

```typescript
interface TransformationReceipt {
  cat_id: string;              // Content-Addressable Transformation ID
  input_rid: string;           // Source RID
  output_rid: string;          // Result RID  
  input_cid: string;           // Source content hash
  output_cid: string;          // Result content hash
  recipe: {
    stage: string;             // "enrichment", "embedding", etc.
    model?: string;            // "gpt-4o-mini"
    prompt_template_cid?: string;  // Prompts stored as CIDs!
    parameters: any;           // Temperature, etc.
  };
  timestamp: Date;
  processing_time_ms: number;
  cost: number;                // Track API costs
  signature?: string;          // For verification
}
```

**Benefits:**
- Complete audit trail
- Reproducible transformations
- Cost tracking
- Debugging capability

#### 3. Separation of Concerns

**KOI Processor Node (Standalone Service):**
- Processes documents ONCE
- Generates RIDs and CIDs
- Tracks transformations
- Manages costs

**ElizaOS Agents (Lightweight Clients):**
- Fetch by RID/CID (instant)
- No heavy processing
- Poll for relevant events
- Start in seconds

## 4. Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Document Storage** | PostgreSQL + pgvector | Already working, proven scale |
| **Knowledge Graph** | Graphiti (on Neo4j) | Temporal tracking, LLM-native |
| **Local Embeddings** | Ollama (nomic-embed-text) | Free, fast, private |
| **Text Generation** | OpenAI GPT-4o-mini | Cost-effective, quality |
| **Event System** | KOI-net protocol | Distributed coordination |
| **Export Format** | RDF/JSON-LD | Standards compliance |
| **Processing** | TypeScript/Bun | Fast, familiar |

### Why Graphiti?

After comparing Neo4j, RDF/SPARQL, and [Graphiti](https://github.com/getzep/graphiti):

**Graphiti Advantages:**
- **Temporal by default**: Tracks when facts were true
- **LLM-native**: Built-in entity extraction
- **Fact invalidation**: Knowledge can expire/update
- **Neo4j foundation**: Familiar tools
- **Python-first**: Easier than RDF

```python
# Example: Temporal knowledge tracking
await graphiti.add_episode({
    "content": fact.content,
    "valid_from": fact.discovered_at,
    "valid_until": fact.invalidated_at,  # Facts can expire!
    "confidence": fact.confidence_score
})
```

## 5. Implementation Components

### Core Component 1: Dual ID Manager

```typescript
class DualIDManager {
  generateRID(source: string, identifier: string): string {
    // Semantic identity
    return `orn:regen.${source}:${identifier}`;
  }
  
  async calculateCID(content: string): Promise<string> {
    // Content hash for deduplication
    const hash = createHash('sha256').update(content).digest('hex');
    return `cid:sha256:${hash}`;
  }
  
  async processDocument(doc: Document): Promise<DualIDResult> {
    const rid = this.generateRID(doc.source, doc.id);
    const cid = await this.calculateCID(doc.content);
    
    if (this.cidExists(cid)) {
      // Content already processed, just map new RID
      return { status: 'duplicate', rid, cid };
    }
    
    // New content, process it
    return { status: 'new', rid, cid };
  }
}
```

### Core Component 2: Modular Processing Pipeline

```typescript
class ProcessingPipeline {
  stages = [
    new ChunkingStage({ maxTokens: 1000 }),
    new ConditionalEnrichmentStage({ costOptimizer }),
    new EmbeddingStage({ provider: 'ollama' }),
    new EntityExtractionStage({ provider: 'graphiti' }),
    new DeduplicationStage()
  ];
  
  async process(doc: Document): Promise<ProcessingResult> {
    let current = doc;
    const receipts = [];
    
    for (const stage of this.stages) {
      const inputCid = await this.calculateCID(current);
      current = await stage.process(current);
      const outputCid = await this.calculateCID(current);
      
      // Record transformation
      const receipt = await this.recordTransformation({
        inputCid, outputCid, stage: stage.name
      });
      receipts.push(receipt);
    }
    
    return { final: current, receipts };
  }
}
```

### Core Component 3: Cost Optimizer

```typescript
class CostOptimizer {
  private budgets = {
    daily: 100,     // $100/day total
    enrichment: 50, // $50/day for enrichment
    embedding: 20   // $20/day for embeddings
  };
  
  async shouldProcess(task: ProcessingTask): Promise<Decision> {
    // Check budget
    if (this.spent.daily >= this.budgets.daily) {
      return { should: false, reason: 'Budget exceeded' };
    }
    
    // Skip code blocks for enrichment
    if (task.type === 'enrich' && this.isCode(task.content)) {
      return { should: false, reason: 'Skip code enrichment' };
    }
    
    // Skip tiny chunks
    if (task.tokens < 50) {
      return { should: false, reason: 'Too small' };
    }
    
    // Select model based on importance
    const model = task.priority > 0.8 ? 'gpt-4o-mini' : 'gpt-3.5-turbo';
    
    return { should: true, model };
  }
}
```

### Core Component 4: Incremental Processing

```typescript
class IncrementalProcessor {
  async processUpdate(doc: Document) {
    const existingCid = await this.getExistingCID(doc.rid);
    const newCid = await this.calculateCID(doc.content);
    
    if (existingCid === newCid) {
      return { status: 'unchanged' };
    }
    
    // Find what changed
    const diff = await this.diffContent(existingCid, newCid);
    
    // Process only changed chunks
    for (const change of diff.changes) {
      if (change.type === 'addition') {
        await this.processChunk(change.content);
      } else if (change.type === 'modification') {
        await this.reprocessChunk(change.content);
      } else if (change.type === 'deletion') {
        await this.markDeleted(change.chunkId);
      }
    }
    
    return {
      status: 'updated',
      version: doc.version + 1,
      saved_cost: this.calculateSavedCost(diff.unchanged)
    };
  }
}
```

### Core Component 5: KOI-Enhanced Agent

```typescript
class KOIEnhancedAgent {
  private koiClient: KOIClient;
  
  async initialize(runtime: IAgentRuntime) {
    // Lightweight KOI client instead of heavy processing
    this.koiClient = new KOIClient({
      endpoint: 'http://localhost:8100',
      agentId: runtime.agentId
    });
    
    // Poll for relevant events
    this.subscriptions = this.getAgentPatterns();
    setInterval(() => this.pollEvents(), 30000);
  }
  
  private getAgentPatterns(): string[] {
    // Subscribe based on agent personality
    if (this.character.name === 'Governor') {
      return ['orn:regen.governance:*', 'orn:regen.proposal:*'];
    } else if (this.character.name === 'VoiceOfNature') {
      return ['orn:regen.ecology:*', 'orn:regen.climate:*'];
    }
    // etc...
  }
  
  async query(text: string): Promise<any> {
    // Fetch pre-processed knowledge by RID/CID
    return await this.koiClient.query(text);
  }
}
```

## 6. Implementation Roadmap

### Phase 1: MVP Foundation (Weeks 1-2)
**Goal:** Basic KOI infrastructure with dual identification

```bash
Week 1:
✅ Set up KOI Processor Node (port 8100)
✅ Implement RID + CID generation
✅ Create transformation receipt system (CATs)

Week 2:
✅ Create lightweight KOI plugin for ElizaOS
✅ Test with one agent (RegenAI)
✅ Deploy to production
```

**Success Metrics:**
- First agent using KOI: Day 7
- Processing latency < 5 seconds
- Zero document reprocessing

### Phase 2: Processing Pipeline (Weeks 3-4)
**Goal:** Modular pipeline with cost optimization

```bash
Week 3:
✅ Chunking + Enrichment stages
✅ Ollama embedding stage (free)
✅ Deduplication stage

Week 4:
✅ Cost optimizer implementation
✅ Incremental processing
✅ Performance testing
```

**Success Metrics:**
- Daily costs < $100
- 10x deduplication ratio
- Incremental updates working

### Phase 3: Knowledge Graph (Weeks 5-6)
**Goal:** Graphiti temporal knowledge graph

```bash
Week 5:
✅ Deploy Neo4j + Graphiti
✅ Create temporal schema
✅ Import existing knowledge

Week 6:
✅ Connect to processing pipeline
✅ Build query interface
✅ Agent integration
```

**Success Metrics:**
- 10,000+ entities in graph
- Query latency < 100ms
- Temporal queries working

### Phase 4: Sensor Network (Weeks 7-8)
**Goal:** Real-time content monitoring

```bash
Week 7:
✅ Twitter sensor (priority)
✅ Telegram sensor
✅ Discord sensor

Week 8:
✅ RSS/Blog sensor
✅ Notion webhook sensor
✅ Integration testing
```

**Success Metrics:**
- < 1 minute detection latency
- 100% content coverage
- Auto RID generation

### Phase 5: Multi-Agent Coordination (Weeks 9-10)
**Goal:** All agents on KOI infrastructure

```bash
Week 9:
✅ Migrate all 5 agents to KOI
✅ Implement event subscriptions

Week 10:
✅ Test multi-agent scenarios
✅ Performance optimization
```

**Success Metrics:**
- Agent startup < 10 seconds
- Coordinated responses
- Shared knowledge working

### Phase 6: Commons Protocol (Weeks 11-12)
**Goal:** Enable partner knowledge sharing

```bash
Week 11:
✅ RDF ontology design
✅ JSON-LD exporter
✅ SPARQL endpoint

Week 12:
✅ Permission system
✅ Federation protocol
✅ Partner testing
```

**Success Metrics:**
- RDF export working
- 1+ partner connected
- Federated queries successful

## 7. Deployment Configuration

### Docker Compose Setup

```yaml
version: '3.8'

services:
  koi-processor:
    build: ./koi-processor
    ports:
      - "8100:8100"
    environment:
      - POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/koi
      - OLLAMA_URL=http://ollama:11434
      - NEO4J_URI=bolt://neo4j:7687
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - ollama
      - neo4j

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=koi
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/regennetwork
      - NEO4J_PLUGINS=["apoc", "graph-data-science"]
    volumes:
      - neo4j_data:/data

  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  postgres_data:
  neo4j_data:
  ollama_data:
```

### Agent Configuration Update

```json
{
  "name": "Governor",
  "plugins": [
    "@elizaos/plugin-knowledge-koi"  // New lightweight plugin
  ],
  "settings": {
    "KOI_PROCESSOR_URL": "http://localhost:8100",
    "KOI_POLL_INTERVAL": 30000,
    "KNOWLEDGE_FILTER": "governance"  // Agent-specific filter
  }
}
```

## 8. Success Metrics & KPIs

### Technical Metrics
- **Content ingestion**: 1000+ items/day
- **Processing latency**: < 5 seconds
- **Knowledge graph**: 100,000+ entities
- **Query response**: < 100ms
- **System uptime**: 99.9%
- **Deduplication ratio**: 10:1
- **Daily cost**: < $100

### Business Metrics
- **Agent response quality**: 90% relevance
- **Knowledge reuse**: 50% from cache
- **Commons participation**: 10+ organizations
- **Developer adoption**: 5+ integrations
- **Content coverage**: 100% of sources

## 9. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Complexity** | Start with MVP, add features incrementally |
| **Cost overrun** | Strict budget controls, local models |
| **Learning curve** | Comprehensive documentation, training |
| **Integration issues** | Backward compatibility, fallback mode |
| **Data consistency** | Manifests, reconciliation protocols |

## 10. Critical Success Factors

### 1. Start Simple
Begin with RID/CID and basic processing. Add advanced features gradually.

### 2. Maintain Compatibility
```typescript
class BackwardCompatiblePlugin {
  async query(text: string) {
    try {
      return await this.koiClient.query(text);  // New system
    } catch {
      return await this.legacyQuery(text);      // Fallback
    }
  }
}
```

### 3. Track Everything
Every transformation must have a CAT receipt. No exceptions.

### 4. Optimize Costs
- Use Ollama for embeddings (free)
- Skip enrichment for code
- Cache aggressively
- Batch API calls

### 5. Test Early
Load test with 10,000 documents in week 2, not week 12.

## 11. Key Innovations

### Our Unique Contributions

1. **Dual Identification Pattern**: RID + CID solving both semantic identity and deduplication
2. **CAT Receipts**: Complete transformation provenance with cost tracking
3. **Hybrid Graph Strategy**: Graphiti now, RDF export for commons later
4. **Cost-Aware Pipeline**: Smart model selection based on content value
5. **Incremental Processing**: Only process what changed

### Why This Architecture Wins

- **Scalable**: Fractal architecture, unlimited growth
- **Efficient**: Process once, use everywhere
- **Accountable**: Complete audit trail via CATs
- **Flexible**: Modular pipeline, easy to extend
- **Future-proof**: Commons-ready from day one

## 12. Next Steps

### Immediate Actions (This Week)

1. **Day 1-2**: Set up KOI Processor Node repository
2. **Day 3-4**: Implement dual ID system
3. **Day 5**: Create first transformation receipt

### Quick Validation

```bash
# Test dual identification
curl -X POST http://localhost:8100/process \
  -H 'Content-Type: application/json' \
  -d '{"source":"test","id":"1","content":"Test document"}'

# Expected response:
{
  "rid": "orn:regen.test:1",
  "cid": "cid:sha256:abc123...",
  "status": "processed",
  "receipts": [...]
}
```

## Conclusion

This KOI-enhanced architecture transforms GAIA from a basic RAG system into a sophisticated knowledge infrastructure that:

1. **Processes content once** with complete provenance
2. **Enables real-time monitoring** via sensor nodes
3. **Builds temporal knowledge graphs** with Graphiti
4. **Coordinates multiple agents** through events
5. **Prepares for commons sharing** with RDF export

The phased implementation reduces risk while delivering value quickly. Starting with the dual identification MVP (2 weeks), we progressively add capabilities to reach full commons-ready infrastructure (12 weeks).

By combining KOI's distributed architecture with practical optimizations (cost management, incremental processing, backward compatibility), we create a system that's both powerful and sustainable.

---

*Version: 3.0 - Final Consolidated Research*
*Date: 2024*
*Status: Ready for Implementation*

## Appendix: Quick Reference

### RID Namespace Convention
```
orn:regen.{type}:{identifier}

Types:
- document, twitter, telegram, discord, blog, podcast
- person, org, project, location, concept
- claim, evidence, question
- agent, response, transformation
```

### Cost Model
```
GPT-4o: $0.03/1K tokens
GPT-4o-mini: $0.002/1K tokens
GPT-3.5-turbo: $0.001/1K tokens
Ollama: $0 (local)
```

### Key Repositories
- [BlockScience/koi-net](https://github.com/BlockScience/koi-net)
- [BlockScience/rid-lib](https://github.com/BlockScience/rid-lib)
- [getzep/graphiti](https://github.com/getzep/graphiti)

### Contact Points
- GAIA AI: /opt/projects/GAIA
- KOI Processor: http://localhost:8100
- Neo4j Browser: http://localhost:7474
- ElizaOS Agents: http://localhost:3000