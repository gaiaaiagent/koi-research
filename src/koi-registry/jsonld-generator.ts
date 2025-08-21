/**
 * JSON-LD Manifest Generator for KOI Registry
 * 
 * Generates a JSON-LD knowledge graph manifest that allows the KOI node
 * to answer questions about what content is in each agent's RAG system.
 */

import { logger } from '@elizaos/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { KoiRegistry } from './index';
import { ContentSource, ContentItem } from './types';

interface JsonLdContext {
  '@vocab': string;
  'koi': string;
  'regen': string;
  'schema': string;
  'dc': string;
  'foaf': string;
}

interface JsonLdContentItem {
  '@id': string;
  '@type': string;
  'dc:title': string;
  'dc:source': string;
  'koi:rid': string;
  'koi:contentHash': string;
  'koi:processingStatus': {
    [agentId: string]: {
      '@type': 'koi:ProcessingStatus';
      'koi:status': string;
      'koi:fragmentCount'?: number;
      'koi:processedAt'?: string;
      'koi:documentId'?: string;
    };
  };
  'schema:url'?: string;
  'schema:dateCreated': string;
  'schema:dateModified': string;
  'regen:relevance'?: string;
  'regen:objectType'?: string;
  'regen:metadata'?: any;
}

interface JsonLdContentSource {
  '@id': string;
  '@type': string;
  'dc:title': string;
  'schema:url'?: string;
  'koi:rid': string;
  'koi:sourceType': string;
  'koi:contentItems': string[]; // References to content items
  'schema:dateCreated': string;
  'regen:metadata'?: any;
}

interface JsonLdManifest {
  '@context': JsonLdContext;
  '@graph': Array<JsonLdContentSource | JsonLdContentItem | JsonLdAgent>;
  'koi:statistics': {
    'koi:totalSources': number;
    'koi:totalContent': number;
    'koi:totalProcessed': number;
    'koi:totalPending': number;
    'koi:totalFailed': number;
    'koi:agentStatistics': {
      [agentId: string]: {
        'koi:processed': number;
        'koi:pending': number;
        'koi:failed': number;
        'koi:totalFragments': number;
      };
    };
  };
  'koi:generatedAt': string;
  'koi:version': string;
}

interface JsonLdAgent {
  '@id': string;
  '@type': 'koi:Agent';
  'foaf:name': string;
  'koi:processedContent': string[]; // References to content items
  'koi:statistics': {
    'koi:totalProcessed': number;
    'koi:totalFragments': number;
    'koi:averageProcessingTime'?: number;
  };
}

export class JsonLdGenerator {
  private registry: KoiRegistry;
  
  constructor(registry: KoiRegistry) {
    this.registry = registry;
  }

  /**
   * Generate a complete JSON-LD manifest of all content in the registry
   */
  async generateManifest(): Promise<JsonLdManifest> {
    logger.info('Generating JSON-LD manifest...');
    
    // Get all data from registry
    const sources = await this.registry.sources.getAllSources();
    const content = await this.registry.content.getAllContent();
    const statistics = await this.registry.getStatistics();
    
    // Build the context
    const context: JsonLdContext = {
      '@vocab': 'https://koi.regen.network/v1/',
      'koi': 'https://koi.regen.network/v1/',
      'regen': 'https://regen.network/ontology/',
      'schema': 'https://schema.org/',
      'dc': 'http://purl.org/dc/elements/1.1/',
      'foaf': 'http://xmlns.com/foaf/0.1/'
    };
    
    // Build the graph
    const graph: Array<JsonLdContentSource | JsonLdContentItem | JsonLdAgent> = [];
    
    // Add sources to graph
    for (const source of sources) {
      const sourceContentItems = await this.registry.content.getContentBySource(source.rid);
      
      const jsonldSource: JsonLdContentSource = {
        '@id': `koi:source/${source.rid}`,
        '@type': 'koi:ContentSource',
        'dc:title': source.name,
        'schema:url': source.url,
        'koi:rid': source.rid,
        'koi:sourceType': source.type,
        'koi:contentItems': sourceContentItems.map(item => `koi:content/${item.rid}`),
        'schema:dateCreated': source.createdAt ? source.createdAt.toISOString() : new Date().toISOString(),
        'regen:metadata': source.metadata
      };
      
      graph.push(jsonldSource);
    }
    
    // Add content items to graph
    for (const item of content) {
      const processingStatus = await this.registry.processing.getContentStatus(item.rid);
      
      const jsonldContent: JsonLdContentItem = {
        '@id': `koi:content/${item.rid}`,
        '@type': 'koi:ContentItem',
        'dc:title': item.title || 'Untitled',
        'dc:source': `koi:source/${item.sourceRid}`,
        'koi:rid': item.rid,
        'koi:contentHash': item.contentHash,
        'koi:processingStatus': {},
        'schema:url': item.url,
        'schema:dateCreated': item.createdAt ? item.createdAt.toISOString() : new Date().toISOString(),
        'schema:dateModified': item.updatedAt ? item.updatedAt.toISOString() : new Date().toISOString(),
        'regen:metadata': item.metadata
      };
      
      // Add processing status for each agent
      for (const [agentId, status] of Object.entries(processingStatus)) {
        jsonldContent['koi:processingStatus'][agentId] = {
          '@type': 'koi:ProcessingStatus',
          'koi:status': status.status,
          'koi:fragmentCount': status.fragmentCount,
          'koi:processedAt': status.processedAt ? (typeof status.processedAt === 'string' ? status.processedAt : status.processedAt.toISOString()) : undefined,
          'koi:documentId': status.documentId
        };
      }
      
      // Determine relevance and object type from RID
      const ridParts = item.rid.split('.');
      if (ridParts.length >= 2) {
        jsonldContent['regen:relevance'] = ridParts[0]; // core, relevant, background
        jsonldContent['regen:objectType'] = ridParts[1]; // analysis, memo, notes, etc.
      }
      
      graph.push(jsonldContent);
    }
    
    // Add agent summaries to graph
    const agentIds = new Set<string>();
    for (const item of content) {
      const status = await this.registry.processing.getContentStatus(item.rid);
      Object.keys(status).forEach(id => agentIds.add(id));
    }
    
    for (const agentId of agentIds) {
      const agentStats = statistics.agents[agentId];
      if (!agentStats) continue;
      
      // Get all content processed by this agent
      const processedContent: string[] = [];
      for (const item of content) {
        const status = await this.registry.processing.getContentStatus(item.rid);
        if (status[agentId]?.status === 'processed') {
          processedContent.push(`koi:content/${item.rid}`);
        }
      }
      
      const jsonldAgent: JsonLdAgent = {
        '@id': `koi:agent/${agentId}`,
        '@type': 'koi:Agent',
        'foaf:name': agentId,
        'koi:processedContent': processedContent,
        'koi:statistics': {
          'koi:totalProcessed': agentStats.processed,
          'koi:totalFragments': agentStats.totalFragments || 0,
          'koi:averageProcessingTime': agentStats.avgProcessingTime
        }
      };
      
      graph.push(jsonldAgent);
    }
    
    // Build the complete manifest
    const manifest: JsonLdManifest = {
      '@context': context,
      '@graph': graph,
      'koi:statistics': {
        'koi:totalSources': statistics.sources.total,
        'koi:totalContent': statistics.content.total,
        'koi:totalProcessed': statistics.content.processed,
        'koi:totalPending': statistics.content.pending,
        'koi:totalFailed': statistics.content.failed,
        'koi:agentStatistics': {}
      },
      'koi:generatedAt': new Date().toISOString(),
      'koi:version': '1.0.0'
    };
    
    // Add per-agent statistics
    for (const [agentId, agentStats] of Object.entries(statistics.agents)) {
      manifest['koi:statistics']['koi:agentStatistics'][agentId] = {
        'koi:processed': agentStats.processed,
        'koi:pending': agentStats.pending,
        'koi:failed': agentStats.failed,
        'koi:totalFragments': agentStats.totalFragments || 0
      };
    }
    
    logger.info(`Generated JSON-LD manifest with ${graph.length} entities`);
    
    return manifest;
  }

  /**
   * Generate a simplified query-friendly manifest for the KOI node
   */
  async generateQueryManifest(): Promise<any> {
    logger.info('Generating query-friendly manifest...');
    
    const sources = await this.registry.sources.getAllSources();
    const statistics = await this.registry.getStatistics();
    
    // Create a simplified structure optimized for natural language queries
    const manifest = {
      '@context': {
        '@vocab': 'https://koi.regen.network/v1/',
        'question': 'koi:question',
        'answer': 'koi:answer'
      },
      'koi:queryResponses': [
        {
          'question': 'What content is in the RegenAI agent\'s RAG system?',
          'answer': await this.getAgentContentSummary('regenai')
        },
        {
          'question': 'What content is in the Facilitator agent\'s RAG system?',
          'answer': await this.getAgentContentSummary('facilitator')
        },
        {
          'question': 'What content is in the Voice of Nature agent\'s RAG system?',
          'answer': await this.getAgentContentSummary('voiceofnature')
        },
        {
          'question': 'What content is in the Governor agent\'s RAG system?',
          'answer': await this.getAgentContentSummary('governor')
        },
        {
          'question': 'What content is in the Narrative agent\'s RAG system?',
          'answer': await this.getAgentContentSummary('narrative')
        },
        {
          'question': 'How many documents are indexed in total?',
          'answer': {
            'total': statistics.content.total,
            'processed': statistics.content.processed,
            'pending': statistics.content.pending,
            'failed': statistics.content.failed
          }
        },
        {
          'question': 'What are the content sources?',
          'answer': sources.map(s => ({
            'name': s.name,
            'type': s.type,
            'rid': s.rid,
            'url': s.url
          }))
        }
      ],
      'koi:contentBySource': await this.getContentBySource(),
      'koi:contentByRelevance': await this.getContentByRelevance(),
      'koi:generatedAt': new Date().toISOString()
    };
    
    return manifest;
  }

  /**
   * Get a summary of content for a specific agent
   */
  private async getAgentContentSummary(agentId: string): Promise<any> {
    const allContent = await this.registry.content.getAllContent();
    const summary = {
      'agentId': agentId,
      'totalDocuments': 0,
      'totalFragments': 0,
      'contentSources': {} as Record<string, number>,
      'contentTypes': {} as Record<string, number>,
      'processingStatus': {
        'processed': 0,
        'pending': 0,
        'failed': 0
      }
    };
    
    for (const item of allContent) {
      const status = await this.registry.processing.getContentStatus(item.rid);
      const agentStatus = status[agentId];
      
      if (agentStatus) {
        summary.totalDocuments++;
        
        if (agentStatus.status === 'processed') {
          summary.processingStatus.processed++;
          summary.totalFragments += agentStatus.fragmentCount || 0;
        } else if (agentStatus.status === 'pending') {
          summary.processingStatus.pending++;
        } else if (agentStatus.status === 'failed') {
          summary.processingStatus.failed++;
        }
        
        // Count by source
        const source = await this.registry.sources.getSource(item.sourceRid);
        if (source) {
          summary.contentSources[source.type] = (summary.contentSources[source.type] || 0) + 1;
        }
        
        // Count by content type (from RID)
        const ridParts = item.rid.split('.');
        if (ridParts.length >= 2) {
          const objectType = ridParts[1];
          summary.contentTypes[objectType] = (summary.contentTypes[objectType] || 0) + 1;
        }
      }
    }
    
    return summary;
  }

  /**
   * Organize content by source
   */
  private async getContentBySource(): Promise<any> {
    const sources = await this.registry.sources.getAllSources();
    const result: Record<string, any> = {};
    
    for (const source of sources) {
      const content = await this.registry.content.getContentBySource(source.rid);
      result[source.type] = {
        'sourceName': source.name,
        'sourceRid': source.rid,
        'contentCount': content.length,
        'contentItems': content.map(item => ({
          'rid': item.rid,
          'title': item.title,
          'url': item.url
        }))
      };
    }
    
    return result;
  }

  /**
   * Organize content by relevance level
   */
  private async getContentByRelevance(): Promise<any> {
    const allContent = await this.registry.content.getAllContent();
    const result: Record<string, any[]> = {
      'core': [],
      'relevant': [],
      'background': [],
      'unknown': []
    };
    
    for (const item of allContent) {
      const ridParts = item.rid.split('.');
      const relevance = ridParts[0] || 'unknown';
      
      const contentInfo = {
        'rid': item.rid,
        'title': item.title,
        'source': item.sourceRid,
        'url': item.url
      };
      
      if (result[relevance]) {
        result[relevance].push(contentInfo);
      } else {
        result['unknown'].push(contentInfo);
      }
    }
    
    return result;
  }

  /**
   * Save manifest to file
   */
  async saveManifest(filePath: string, manifest?: JsonLdManifest): Promise<void> {
    const manifestToSave = manifest || await this.generateManifest();
    
    await fs.writeFile(
      filePath,
      JSON.stringify(manifestToSave, null, 2),
      'utf-8'
    );
    
    logger.info(`Saved JSON-LD manifest to ${filePath}`);
  }

  /**
   * Save query manifest to file
   */
  async saveQueryManifest(filePath: string): Promise<void> {
    const manifest = await this.generateQueryManifest();
    
    await fs.writeFile(
      filePath,
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    
    logger.info(`Saved query manifest to ${filePath}`);
  }
}

/**
 * RID Generator following Regen's naming convention
 */
export class RIDGenerator {
  /**
   * Generate RID for a source
   */
  static generateSourceRID(type: string, identifier: string, version = '1.0.0'): string {
    const sanitized = identifier
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);
    
    return `core.source.${type}-${sanitized}.v${version}`;
  }

  /**
   * Generate RID for content
   */
  static generateContentRID(
    relevance: 'core' | 'relevant' | 'background',
    objectType: string,
    subject: string,
    version = '1.0.0',
    contentHash?: string
  ): string {
    const sanitizedSubject = subject
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);
    
    const hashSuffix = contentHash ? `.${contentHash.slice(0, 8)}` : '';
    
    return `${relevance}.${objectType}.${sanitizedSubject}.v${version}${hashSuffix}`;
  }

  /**
   * Parse RID components
   */
  static parseRID(rid: string): {
    relevance?: string;
    objectType?: string;
    subject?: string;
    version?: string;
    hash?: string;
  } {
    const parts = rid.split('.');
    
    if (parts.length < 3) {
      return {};
    }
    
    const result: any = {
      relevance: parts[0],
      objectType: parts[1],
      subject: parts[2]
    };
    
    // Extract version
    for (let i = 3; i < parts.length; i++) {
      if (parts[i].startsWith('v')) {
        result.version = parts[i].substring(1);
      } else if (parts[i].length === 8 && /^[a-f0-9]+$/.test(parts[i])) {
        result.hash = parts[i];
      }
    }
    
    return result;
  }
}