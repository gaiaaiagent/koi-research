#!/usr/bin/env bun

/**
 * Generate KOI JSON-LD Manifest from existing content
 * 
 * This script reads the content index from /home/regenai/project/indexing
 * and generates a comprehensive JSON-LD manifest for the KOI node.
 */

import { logger } from '@elizaos/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { KoiRegistry, JsonLdGenerator, RIDGenerator } from '../src/koi-registry';

const INDEXING_PATH = '/home/regenai/project/indexing';
const CONTENT_INDEX_PATH = path.join(INDEXING_PATH, 'CONTENT_INDEX.json');
const OUTPUT_PATH = '/opt/projects/plugin-knowledge-gaia/manifests/koi-manifest.jsonld';
const QUERY_MANIFEST_PATH = '/opt/projects/plugin-knowledge-gaia/manifests/koi-query-manifest.json';

async function main() {
  logger.info('Starting KOI manifest generation...');
  
  try {
    // Read the content index
    const contentIndexData = await fs.readFile(CONTENT_INDEX_PATH, 'utf-8');
    const contentIndex = JSON.parse(contentIndexData);
    
    logger.info(`Found ${contentIndex.total_documents} documents in content index`);
    
    // Initialize KOI registry (using in-memory database for now)
    const databaseUrl = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5433/eliza';
    const registry = new KoiRegistry(databaseUrl);
    await registry.initialize();
    
    // Process each content source
    for (const [sourceType, sourceInfo] of Object.entries(contentIndex.content_sources)) {
      logger.info(`Processing ${sourceType} source...`);
      
      const sourceData = sourceInfo as any;
      
      // Register the source in KOI
      const sourceRid = RIDGenerator.generateSourceRID(
        sourceType,
        sourceType === 'notion' ? 'regen-network-notion' : sourceType
      );
      
      const source = await registry.sources.registerSource({
        type: sourceType,
        name: `Regen Network ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)}`,
        description: sourceData.description,
        url: getSourceUrl(sourceType),
        metadata: {
          location: sourceData.location,
          target: sourceData.target,
          count: sourceData.count || sourceData.tweets || sourceData.total_entries,
          breakdown: sourceData.breakdown
        }
      });
      
      logger.info(`Registered source: ${source.rid}`);
      
      // Add sample content items for each source
      await addSampleContent(registry, source.rid, sourceType, sourceData);
    }
    
    // Generate JSON-LD manifest
    const generator = new JsonLdGenerator(registry);
    
    logger.info('Generating full JSON-LD manifest...');
    const manifest = await generator.generateManifest();
    await generator.saveManifest(OUTPUT_PATH, manifest);
    
    logger.info('Generating query-friendly manifest...');
    await generator.saveQueryManifest(QUERY_MANIFEST_PATH);
    
    // Generate statistics report
    const report = await registry.generateReport();
    await fs.writeFile(
      '/opt/projects/plugin-knowledge-gaia/reports/koi-registry-report.md',
      report,
      'utf-8'
    );
    
    logger.info('✅ KOI manifest generation complete!');
    logger.info(`  - JSON-LD manifest: ${OUTPUT_PATH}`);
    logger.info(`  - Query manifest: ${QUERY_MANIFEST_PATH}`);
    logger.info(`  - Registry report: reports/koi-registry-report.md`);
    
    // Close registry
    await registry.close();
    
  } catch (error) {
    logger.error('Failed to generate KOI manifest:', error);
    process.exit(1);
  }
}

function getSourceUrl(sourceType: string): string {
  const urls: Record<string, string> = {
    'github': 'https://github.com/regen-network',
    'gitlab': 'https://gitlab.com/regen-network',
    'website': 'https://regen.network',
    'podcast': 'https://soundcloud.com/planetary-regeneration-podcast',
    'medium': 'https://medium.com/regen-network',
    'twitter': 'https://twitter.com/regen_network',
    'notion': 'https://notion.so'
  };
  
  return urls[sourceType] || '';
}

async function addSampleContent(
  registry: KoiRegistry,
  sourceRid: string,
  sourceType: string,
  sourceData: any
): Promise<void> {
  // Determine how to process based on source type
  let contentItems: any[] = [];
  
  if (sourceType === 'twitter') {
    // For Twitter, create a few sample entries
    contentItems = [
      {
        title: 'Twitter Archive Collection',
        url: 'https://twitter.com/regen_network',
        metadata: { tweets: sourceData.tweets }
      }
    ];
  } else if (sourceType === 'notion') {
    // For Notion, create entries for each database
    if (sourceData.breakdown) {
      for (const [dbName, count] of Object.entries(sourceData.breakdown)) {
        contentItems.push({
          title: `Notion Database: ${dbName}`,
          metadata: { entries: count, database: dbName }
        });
      }
    }
  } else if (sourceType === 'podcast') {
    // For podcasts, create an entry for transcripts
    contentItems.push({
      title: 'Planetary Regeneration Podcast Transcripts',
      metadata: { 
        episodes: sourceData.transcripts,
        metadata_files: sourceData.soundcloud_metadata
      }
    });
  } else {
    // For other sources, create a general entry
    contentItems.push({
      title: `${sourceType} Content Collection`,
      metadata: { 
        count: sourceData.count,
        location: sourceData.location
      }
    });
  }
  
  // Track each content item
  for (const item of contentItems) {
    const relevance = determineRelevance(sourceType, item.title);
    const objectType = determineObjectType(sourceType);
    
    const contentHash = createHash('sha256')
      .update(JSON.stringify(item))
      .digest('hex');
    
    const contentRid = RIDGenerator.generateContentRID(
      relevance,
      objectType,
      item.title || 'untitled',
      '1.0.0',
      contentHash
    );
    
    const trackedContent = await registry.content.trackContent({
      sourceRid,
      url: item.url,
      title: item.title,
      content: JSON.stringify(item),
      originalId: contentHash.slice(0, 16),
      contentType: sourceType,
      metadata: item.metadata
    });
    
    // Use the actual RID from the tracked content
    const actualContentRid = trackedContent.rid;
    
    // Simulate processing by agents
    const agents = ['regenai', 'facilitator', 'voiceofnature', 'governor', 'narrative'];
    
    for (const agentId of agents) {
      // Randomly decide if this agent has processed this content
      if (Math.random() > 0.3) {
        await registry.processing.markAsProcessed({
          contentRid: actualContentRid,
          agentId,
          documentId: `doc-${contentHash.slice(0, 8)}`,
          fragmentCount: Math.floor(Math.random() * 50) + 1,
          processingTime: Math.floor(Math.random() * 5000) + 1000
        });
      }
    }
  }
}

function determineRelevance(
  sourceType: string,
  title?: string
): 'core' | 'relevant' | 'background' {
  if (sourceType === 'github' || sourceType === 'gitlab') {
    return 'core';
  }
  
  if (sourceType === 'website' && title?.includes('registry')) {
    return 'core';
  }
  
  if (sourceType === 'notion' && title?.includes('KOI')) {
    return 'core';
  }
  
  if (sourceType === 'medium' || sourceType === 'podcast') {
    return 'relevant';
  }
  
  return 'background';
}

function determineObjectType(sourceType: string): string {
  const typeMap: Record<string, string> = {
    'github': 'readme',
    'gitlab': 'analysis',
    'website': 'notes',
    'podcast': 'notes',
    'medium': 'memo',
    'twitter': 'notes',
    'notion': 'analysis'
  };
  
  return typeMap[sourceType] || 'notes';
}

// Run the script
main().catch(error => {
  logger.error('Script failed:', error);
  process.exit(1);
});