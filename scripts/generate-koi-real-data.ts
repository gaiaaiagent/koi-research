#!/usr/bin/env bun

import { logger } from '@elizaos/core';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { KoiRegistry, JsonLdGenerator, RIDGenerator } from '../src/koi-registry';

async function generateFromRealData() {
  logger.info('Generating KOI manifest from REAL production data using optimized bulk operations...');
  
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5433/eliza'
  });
  
  // Initialize KOI registry
  const registry = new KoiRegistry('postgresql://postgres:postgres@localhost:5433/eliza');
  await registry.initialize();
  
  // Get all documents with agent names in one optimized query
  const documentsResult = await pool.query(`
    SELECT 
      m.id,
      m.content,
      m.metadata,
      m."agentId",
      m."createdAt",
      a.name as agent_name,
      CASE 
        WHEN e.dim_1536 IS NOT NULL THEN 'dim_1536'
        WHEN e.dim_768 IS NOT NULL THEN 'dim_768'
        WHEN e.dim_384 IS NOT NULL THEN 'dim_384'
        ELSE 'none'
      END as embedding_type
    FROM memories m
    JOIN agents a ON m."agentId" = a.id
    LEFT JOIN embeddings e ON m.id = e.memory_id
    WHERE m.type = 'documents'
    ORDER BY m."createdAt" DESC
  `);
  
  logger.info(`Found ${documentsResult.rows.length} REAL documents from ${new Set(documentsResult.rows.map(r => r.agent_name)).size} agents`);
  
  // Get knowledge fragments count per document in one query  
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
  
  // Pre-process all data in memory for bulk operations
  logger.info('Pre-processing documents and generating content hashes...');
  
  const contentItems = [];
  const processingRecords = [];
  const sourceTypes = new Set();
  const agentDocCounts = new Map();
  
  for (const doc of documentsResult.rows) {
    const content = typeof doc.content === 'string' 
      ? doc.content 
      : JSON.stringify(doc.content);
    
    const metadata = doc.metadata || {};
    
    // Generate content hash
    const contentHash = createHash('sha256').update(content).digest('hex');
    
    // Determine source type
    let sourceType = 'unknown';
    if (metadata.source) sourceType = metadata.source;
    else if (metadata.sourceType) sourceType = metadata.sourceType;
    else if (metadata.filename) {
      if (metadata.filename.includes('notion')) sourceType = 'notion';
      else if (metadata.filename.includes('github')) sourceType = 'github';
      else if (metadata.filename.includes('medium')) sourceType = 'medium';
      else if (metadata.filename.includes('twitter')) sourceType = 'twitter';
      else if (metadata.filename.includes('website')) sourceType = 'website';
    }
    
    sourceTypes.add(sourceType);
    
    // Generate RID for content
    const rid = RIDGenerator.generateContentRID(
      'relevant', // relevance
      'content', // objectType  
      `${sourceType}-${doc.id}`, // subject
      '1.0.0', // version
      contentHash.substring(0, 8) // contentHash
    );
    
    // Prepare content item
    contentItems.push({
      rid,
      sourceType,
      contentHash,
      title: metadata.title || metadata.filename || `Document ${doc.id}`,
      metadata: {
        ...metadata,
        agentId: doc.agentId,
        agentName: doc.agent_name,
        hasEmbedding: doc.embedding_type !== 'none',
        embeddingType: doc.embedding_type,
        createdAt: doc.createdAt,
        isRealData: true
      },
      originalId: doc.id
    });
    
    // Prepare processing record
    const fragmentCount = fragmentCounts.get(doc.id) || 0;
    processingRecords.push({
      contentRid: rid,
      agentId: doc.agentId,
      documentId: doc.id,
      fragmentCount
    });
    
    // Count docs per agent
    const agentKey = `${doc.agentId} (${doc.agent_name})`;
    agentDocCounts.set(agentKey, (agentDocCounts.get(agentKey) || 0) + 1);
  }
  
  logger.info(`Pre-processed ${contentItems.length} content items from ${sourceTypes.size} source types`);
  
  // Register all sources first
  for (const sourceType of sourceTypes) {
    await registry.sources.registerSource({
      type: sourceType,
      name: `Regen Network ${sourceType}`,
      description: `Real content from ${sourceType}`,
      metadata: { isProduction: true, isRealData: true }
    });
  }
  
  // Get all sources to build RID mapping
  const allSources = await registry.sources.getAllSources();
  const sourceRidMap = new Map();
  for (const source of allSources) {
    sourceRidMap.set(source.type, source.rid);
  }
  
  // Add source RIDs to content items
  for (const item of contentItems) {
    item.sourceRid = sourceRidMap.get(item.sourceType);
  }
  
  logger.info('Starting bulk content tracking...');
  
  // Process in large batches for better performance
  const batchSize = 500;
  let processedCount = 0;
  
  for (let i = 0; i < contentItems.length; i += batchSize) {
    const batch = contentItems.slice(i, i + batchSize);
    
    // Use PostgreSQL transaction for atomic batch processing
    await pool.query('BEGIN');
    
    try {
      // Track content items and collect successful RIDs
      const successfulRids = [];
      
      for (const item of batch) {
        try {
          const doc = documentsResult.rows.find(d => d.id === item.originalId);
          const content = typeof doc?.content === 'string' 
            ? doc.content 
            : JSON.stringify(doc?.content || '');
            
          const trackedContent = await registry.content.trackContent({
            sourceRid: item.sourceRid,
            title: item.title,
            content: content,
            originalId: item.originalId,
            metadata: item.metadata
          });
          
          successfulRids.push({
            contentRid: trackedContent.rid,
            originalId: item.originalId
          });
          
        } catch (error) {
          logger.error(`Failed to track content for ${item.originalId}:`, error.message);
        }
      }
      
      // Insert processing records only for successfully tracked content
      const batchProcessingRecords = processingRecords.slice(i, i + batchSize);
      for (const record of batchProcessingRecords) {
        const successful = successfulRids.find(s => s.originalId === record.documentId);
        if (successful) {
          try {
            await registry.processing.markAsProcessed({
              ...record,
              contentRid: successful.contentRid
            });
          } catch (error) {
            logger.error(`Failed to mark as processed ${record.documentId}:`, error.message);
          }
        }
      }
      
      await pool.query('COMMIT');
      processedCount += successfulRids.length;
      
      logger.info(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(contentItems.length/batchSize)} - ${processedCount}/${contentItems.length} documents (${successfulRids.length}/${batch.length} successful)`);
      
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error(`Failed to process batch starting at ${i}:`, error);
    }
  }
  
  logger.info(`Successfully tracked ${processedCount} REAL documents`);
  logger.info('Documents per agent:', Object.fromEntries(agentDocCounts));
  
  // Generate manifests
  const generator = new JsonLdGenerator(registry);
  
  await generator.saveManifest('/opt/projects/plugin-knowledge-gaia/manifests/koi-manifest-real.jsonld');
  await generator.saveQueryManifest('/opt/projects/plugin-knowledge-gaia/manifests/koi-query-manifest-real.json');
  
  // Generate report
  const report = await registry.generateReport();
  const enhancedReport = `${report}

## Production Data Summary (REAL DATA)
- Total Documents: ${documentsResult.rows.length}
- Total Fragments: ${Array.from(fragmentCounts.values()).reduce((a, b) => a + b, 0)}
- Active Agents: ${agentDocCounts.size}
- Documents per Agent:
${Array.from(agentDocCounts.entries())
  .map(([agent, count]) => `  - ${agent}: ${count} documents`)
  .join('\n')}

## Agent IDs Found:
${Array.from(agentDocCounts.keys()).map(id => `- ${id}`).join('\n')}
`;
  
  await fs.writeFile(
    '/opt/projects/plugin-knowledge-gaia/reports/koi-registry-report-real.md',
    enhancedReport,
    'utf-8'
  );
  
  logger.info('✅ Real data KOI manifest generated!');
  logger.info('  - Manifest: manifests/koi-manifest-real.jsonld');
  logger.info('  - Query manifest: manifests/koi-query-manifest-real.json');
  logger.info('  - Report: reports/koi-registry-report-real.md');
  
  await pool.end();
  await registry.close();
}

generateFromRealData().catch(console.error);