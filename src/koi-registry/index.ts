/**
 * KOI Registry - Content Source and Processing Tracker
 * 
 * This module provides a complete content management system for tracking:
 * - Content sources (Twitter, websites, Notion, etc.)
 * - Individual content items from each source
 * - Processing status for each agent
 * - Statistics and reporting
 */

import { logger } from '@elizaos/core';
import { KoiDatabase } from './database';
import { ContentSourceManager } from './content-source-manager';
import { ContentTracker } from './content-tracker';
import { ProcessingStatusTracker } from './processing-status';

export * from './types';
export { KoiDatabase } from './database';
export { ContentSourceManager } from './content-source-manager';
export { ContentTracker } from './content-tracker';
export { ProcessingStatusTracker } from './processing-status';
export { JsonLdGenerator, RIDGenerator } from './jsonld-generator';
export { KoiQueryInterface } from './query-interface';
export { EmbeddingsCache } from './embeddings-cache';

/**
 * Main KOI Registry class that combines all functionality
 */
export class KoiRegistry {
  public db: KoiDatabase;
  public sources: ContentSourceManager;
  public content: ContentTracker;
  public processing: ProcessingStatusTracker;

  constructor(databaseUrl: string) {
    this.db = new KoiDatabase(databaseUrl);
    this.sources = new ContentSourceManager(this.db);
    this.content = new ContentTracker(this.db);
    this.processing = new ProcessingStatusTracker(this.db);
  }

  /**
   * Initialize the KOI registry (create tables, set up default sources)
   */
  async initialize(): Promise<void> {
    logger.info('Initializing KOI Registry...');
    
    // Create database tables
    await this.db.initialize();
    
    // Initialize default sources
    await this.sources.initializeDefaultSources();
    
    logger.info('KOI Registry initialized successfully');
  }

  /**
   * Get comprehensive statistics about the registry
   */
  async getStatistics() {
    return this.processing.getStatistics();
  }

  /**
   * Generate a report of content processing status
   */
  async generateReport(): Promise<string> {
    const stats = await this.getStatistics();
    
    let report = '# KOI Registry Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    // Sources summary
    report += `## Content Sources (${stats.sources.total})\n\n`;
    for (const [type, count] of Object.entries(stats.sources.byType)) {
      report += `- **${type}**: ${count} source(s)\n`;
    }
    report += '\n';
    
    // Content summary
    report += `## Content Items (${stats.content.total})\n\n`;
    report += `- **Processed**: ${stats.content.processed}\n`;
    report += `- **Pending**: ${stats.content.pending}\n`;
    report += `- **Failed**: ${stats.content.failed}\n\n`;
    
    // Agent summary
    report += '## Agent Processing Status\n\n';
    for (const [agentId, agentStats] of Object.entries(stats.agents)) {
      const total = agentStats.processed + agentStats.pending + agentStats.failed;
      const percentage = total > 0 ? (agentStats.processed / total * 100).toFixed(1) : '0';
      
      report += `### ${agentId}\n`;
      report += `- Processed: ${agentStats.processed} (${percentage}%)\n`;
      report += `- Pending: ${agentStats.pending}\n`;
      report += `- Failed: ${agentStats.failed}\n`;
      if (agentStats.avgProcessingTime) {
        report += `- Avg Processing Time: ${(agentStats.avgProcessingTime / 1000).toFixed(2)}s\n`;
      }
      report += '\n';
    }
    
    return report;
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}

/**
 * Singleton instance for easy access
 */
let registryInstance: KoiRegistry | null = null;

export function getKoiRegistry(databaseUrl?: string): KoiRegistry {
  if (!registryInstance) {
    if (!databaseUrl) {
      throw new Error('Database URL required for first initialization');
    }
    registryInstance = new KoiRegistry(databaseUrl);
  }
  return registryInstance;
}