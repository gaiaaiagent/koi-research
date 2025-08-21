# KOI Production Data Guide

## Current Data Status

The RegenAI system has **REAL production data** in the PostgreSQL database:

### Actual Database Schema

The ElizaOS agents use the `memories` table (not `knowledge_documents`):

```sql
-- Current production data (as of generation time)
memories table:
- 26,508 knowledge entries (fragments)
- 14,863 document entries
- 208 message entries
- Data from 5-6 different agents
```

### Table Structure

```sql
-- The memories table stores all agent data
SELECT * FROM memories WHERE type = 'documents' LIMIT 1;
-- Contains: id, type, content, embedding, metadata, agentId, unique, createdAt

SELECT * FROM memories WHERE type = 'knowledge' LIMIT 1;  
-- Contains: knowledge fragments with embeddings
```

## Accessing Real Production Data

### 1. Check Current Data

```bash
# Total documents stored by agents
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT 
    \"agentId\",
    COUNT(*) as doc_count
  FROM memories 
  WHERE type = 'documents'
  GROUP BY \"agentId\"
  ORDER BY doc_count DESC;
"

# Total knowledge fragments
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT 
    COUNT(*) as total_fragments
  FROM memories 
  WHERE type = 'knowledge';
"

# Sample document with metadata
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT 
    id,
    \"agentId\",
    jsonb_pretty(content::jsonb) as content,
    jsonb_pretty(metadata) as metadata
  FROM memories 
  WHERE type = 'documents'
  LIMIT 1;
"
```

### 2. Generate KOI Manifest from Real Data

Create this script to use the actual production data:

```bash
cat > /opt/projects/plugin-knowledge-gaia/scripts/generate-koi-real-data.ts << 'EOF'
#!/usr/bin/env bun

import { logger } from '@elizaos/core';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { KoiRegistry, JsonLdGenerator, RIDGenerator } from '../src/koi-registry';

async function generateFromRealData() {
  logger.info('Generating KOI manifest from REAL production data...');
  
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5433/eliza'
  });
  
  // Initialize KOI registry
  const registry = new KoiRegistry('postgresql://postgres:postgres@localhost:5433/eliza');
  await registry.initialize();
  
  // Get real documents from memories table
  const documentsResult = await pool.query(`
    SELECT 
      id,
      content,
      embedding,
      metadata,
      "agentId",
      "createdAt"
    FROM memories
    WHERE type = 'documents'
    ORDER BY "createdAt" DESC
  `);
  
  logger.info(`Found ${documentsResult.rows.length} REAL documents from agents`);
  
  // Get knowledge fragments count per document
  const fragmentsResult = await pool.query(`
    SELECT 
      metadata->>'documentId' as doc_id,
      COUNT(*) as fragment_count
    FROM memories
    WHERE type = 'knowledge'
    AND metadata->>'documentId' IS NOT NULL
    GROUP BY metadata->>'documentId'
  `);
  
  const fragmentCounts = new Map();
  for (const row of fragmentsResult.rows) {
    fragmentCounts.set(row.doc_id, parseInt(row.fragment_count));
  }
  
  logger.info(`Found ${fragmentCounts.size} documents with fragments`);
  
  // Register sources based on actual data
  const sources = new Set();
  for (const doc of documentsResult.rows) {
    const metadata = doc.metadata || {};
    const source = metadata.source || metadata.sourceType || 'unknown';
    sources.add(source);
  }
  
  for (const source of sources) {
    const sourceRid = RIDGenerator.generateSourceRID(source, `regen-${source}`);
    await registry.sources.registerSource({
      type: source,
      name: `Regen Network ${source}`,
      description: `Content from ${source}`,
      metadata: { isProduction: true }
    });
    logger.info(`Registered source: ${sourceRid}`);
  }
  
  // Track real documents
  let trackedCount = 0;
  const agentDocCounts = new Map();
  
  for (const doc of documentsResult.rows) {
    try {
      const content = typeof doc.content === 'string' 
        ? doc.content 
        : JSON.stringify(doc.content);
      
      const metadata = doc.metadata || {};
      const sourceType = metadata.source || metadata.sourceType || 'unknown';
      const sourceRid = RIDGenerator.generateSourceRID(sourceType, `regen-${sourceType}`);
      
      const contentHash = createHash('sha256')
        .update(content)
        .digest('hex');
      
      // Track content
      const trackedContent = await registry.content.trackContent({
        sourceRid,
        title: metadata.title || metadata.filename || `Document ${doc.id}`,
        content: content,
        originalId: doc.id,
        metadata: {
          ...metadata,
          agentId: doc.agentId,
          hasEmbedding: !!doc.embedding,
          createdAt: doc.createdAt
        }
      });
      
      // Track processing status for the agent that processed it
      const fragmentCount = fragmentCounts.get(doc.id) || 0;
      
      await registry.processing.markAsProcessed({
        contentRid: trackedContent.rid,
        agentId: doc.agentId,
        documentId: doc.id,
        fragmentCount: fragmentCount
      });
      
      // Count docs per agent
      agentDocCounts.set(doc.agentId, (agentDocCounts.get(doc.agentId) || 0) + 1);
      
      trackedCount++;
      if (trackedCount % 100 === 0) {
        logger.info(`Tracked ${trackedCount} documents...`);
      }
      
    } catch (error) {
      logger.error(`Error tracking document ${doc.id}:`, error);
    }
  }
  
  logger.info(`Successfully tracked ${trackedCount} REAL documents`);
  logger.info('Documents per agent:', Object.fromEntries(agentDocCounts));
  
  // Generate manifests
  const generator = new JsonLdGenerator(registry);
  
  await generator.saveManifest('/opt/projects/plugin-knowledge-gaia/koi-manifest-real.jsonld');
  await generator.saveQueryManifest('/opt/projects/plugin-knowledge-gaia/koi-query-manifest-real.json');
  
  // Generate report
  const report = await registry.generateReport();
  const enhancedReport = `${report}

## Production Data Summary
- Total Documents: ${documentsResult.rows.length}
- Total Fragments: ${Array.from(fragmentCounts.values()).reduce((a, b) => a + b, 0)}
- Active Agents: ${agentDocCounts.size}
- Documents per Agent:
${Array.from(agentDocCounts.entries())
  .map(([agent, count]) => `  - ${agent}: ${count} documents`)
  .join('\n')}
`;
  
  await fs.writeFile(
    '/opt/projects/plugin-knowledge-gaia/koi-registry-report-real.md',
    enhancedReport,
    'utf-8'
  );
  
  logger.info('✅ Real data KOI manifest generated!');
  logger.info('  - Manifest: koi-manifest-real.jsonld');
  logger.info('  - Query manifest: koi-query-manifest-real.json');
  logger.info('  - Report: koi-registry-report-real.md');
  
  await pool.end();
  await registry.close();
}

generateFromRealData().catch(console.error);
EOF

chmod +x /opt/projects/plugin-knowledge-gaia/scripts/generate-koi-real-data.ts
```

### 3. Run with Real Data

```bash
# Generate KOI manifest from actual production data
bun run /opt/projects/plugin-knowledge-gaia/scripts/generate-koi-real-data.ts

# Start the KOI server to query real data
bun run /opt/projects/plugin-knowledge-gaia/scripts/koi-query-server.ts

# Test queries against real data
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How many documents are in the system?"}'
```

## Understanding the Data

### Document Structure in `memories` Table

```javascript
// type = 'documents' entry
{
  id: "uuid",
  type: "documents",
  content: {
    text: "Document content...",
    // or structured content
  },
  embedding: [0.1, 0.2, ...], // 1536 dimensions
  metadata: {
    title: "Document Title",
    source: "notion",
    filename: "original.md",
    url: "https://...",
    // other metadata
  },
  agentId: "regenai-agent-id",
  createdAt: "2024-01-20T10:00:00Z"
}

// type = 'knowledge' entry (fragment)
{
  id: "uuid",
  type: "knowledge",
  content: {
    text: "Fragment text..."
  },
  embedding: [0.1, 0.2, ...],
  metadata: {
    documentId: "parent-doc-id",
    chunkIndex: 0,
    // other metadata
  },
  agentId: "regenai-agent-id",
  createdAt: "2024-01-20T10:00:00Z"
}
```

### Agent IDs in Production

The actual agent IDs in the database might be UUIDs or specific identifiers. Check with:

```bash
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT DISTINCT \"agentId\" 
  FROM memories 
  WHERE type = 'documents';
"
```

## Data Statistics

### Current Production Stats

```bash
# Get comprehensive statistics
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT 
    type,
    COUNT(*) as total,
    COUNT(DISTINCT \"agentId\") as agents,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
    MIN(\"createdAt\") as oldest,
    MAX(\"createdAt\") as newest
  FROM memories
  GROUP BY type
  ORDER BY total DESC;
"
```

### Content Sources Distribution

```bash
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
  SELECT 
    COALESCE(metadata->>'source', metadata->>'sourceType', 'unknown') as source,
    COUNT(*) as count
  FROM memories
  WHERE type = 'documents'
  GROUP BY source
  ORDER BY count DESC;
"
```

## Important Notes

1. **Real Data**: The system has 14,863 real documents and 26,508 knowledge fragments
2. **Active Agents**: 5-6 agents have been processing documents
3. **Embeddings**: All entries have embeddings (1536 dimensions from OpenAI)
4. **No Test Data**: This is all production data from actual agent operations

## Troubleshooting

If the KOI manifest generation fails:

1. **Check database connection**:
   ```bash
   docker ps | grep postgres
   ```

2. **Verify data exists**:
   ```bash
   docker exec gaia-postgres-1 psql -U postgres -d eliza -c "SELECT COUNT(*) FROM memories;"
   ```

3. **Check agent IDs**:
   ```bash
   docker exec gaia-postgres-1 psql -U postgres -d eliza -c "SELECT DISTINCT \"agentId\" FROM memories;"
   ```

4. **Review metadata structure**:
   ```bash
   docker exec gaia-postgres-1 psql -U postgres -d eliza -c "
     SELECT jsonb_pretty(metadata) 
     FROM memories 
     WHERE type = 'documents' 
     LIMIT 1;
   "
   ```