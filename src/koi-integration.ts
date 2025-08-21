/**
 * KOI Integration for Knowledge Plugin
 * Tracks content processing in the KOI registry
 */

import { logger, UUID } from '@elizaos/core';
import { KoiRegistry, RIDGenerator } from './koi-registry';
import { AddKnowledgeOptions } from './types';

export class KoiIntegration {
  private registry: KoiRegistry | null = null;
  private agentId: string;
  private enabled: boolean;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.enabled = false;
  }

  /**
   * Initialize KOI integration
   */
  async initialize(databaseUrl?: string): Promise<void> {
    try {
      // Use same database as RAG or specified URL
      const koiDbUrl = databaseUrl || process.env.POSTGRES_URL;
      
      if (!koiDbUrl) {
        logger.warn('KOI integration disabled: No database URL provided');
        return;
      }

      this.registry = new KoiRegistry(koiDbUrl);
      await this.registry.initialize();
      
      this.enabled = true;
      logger.info(`KOI integration initialized for agent: ${this.agentId}`);
    } catch (error) {
      logger.error('Failed to initialize KOI integration:', error);
      this.enabled = false;
    }
  }

  /**
   * Track content before processing
   */
  async trackContentBeforeProcessing(options: AddKnowledgeOptions): Promise<string | null> {
    if (!this.enabled || !this.registry) return null;

    try {
      // Determine source RID based on file path or metadata
      const sourceRid = await this.determineSourceRid(options);
      if (!sourceRid) return null;

      // Track the content item
      const contentItem = await this.registry.content.trackContent({
        sourceRid,
        url: options.metadata?.url as string,
        title: (options.metadata?.title as string) || options.originalFilename || 'Unknown',
        content: options.content,
        originalId: options.clientDocumentId,
        contentType: options.contentType,
        metadata: options.metadata,
      });

      // Mark as processing for this agent
      await this.registry.processing.markAsProcessing(
        contentItem.rid,
        this.agentId
      );

      logger.debug(`KOI: Tracking content ${contentItem.rid} for ${this.agentId}`);
      return contentItem.rid;
    } catch (error) {
      logger.error('KOI: Failed to track content before processing:', error);
      return null;
    }
  }

  /**
   * Update status after successful processing
   */
  async markProcessingSuccess(
    contentRid: string,
    documentId: UUID,
    fragmentCount: number,
    processingTime?: number
  ): Promise<void> {
    if (!this.enabled || !this.registry || !contentRid) return;

    try {
      await this.registry.processing.markAsProcessed({
        contentRid,
        agentId: this.agentId,
        documentId,
        fragmentCount,
        processingTime,
      });

      logger.debug(`KOI: Marked ${contentRid} as processed for ${this.agentId}`);
    } catch (error) {
      logger.error('KOI: Failed to mark processing success:', error);
    }
  }

  /**
   * Update status after processing failure
   */
  async markProcessingFailure(
    contentRid: string,
    error: Error | any
  ): Promise<void> {
    if (!this.enabled || !this.registry || !contentRid) return;

    try {
      await this.registry.processing.markAsFailed({
        contentRid,
        agentId: this.agentId,
        error: {
          message: error.message || String(error),
          code: error.code,
          details: error.stack || error,
        },
      });

      logger.debug(`KOI: Marked ${contentRid} as failed for ${this.agentId}`);
    } catch (err) {
      logger.error('KOI: Failed to mark processing failure:', err);
    }
  }

  /**
   * Mark content as skipped (duplicate)
   */
  async markAsSkipped(
    contentRid: string,
    reason: string
  ): Promise<void> {
    if (!this.enabled || !this.registry || !contentRid) return;

    try {
      await this.registry.processing.markAsSkipped({
        contentRid,
        agentId: this.agentId,
        reason,
      });

      logger.debug(`KOI: Marked ${contentRid} as skipped for ${this.agentId}: ${reason}`);
    } catch (error) {
      logger.error('KOI: Failed to mark as skipped:', error);
    }
  }

  /**
   * Check if content has already been processed by this agent
   */
  async isAlreadyProcessed(contentHash: string): Promise<boolean> {
    if (!this.enabled || !this.registry) return false;

    try {
      const content = await this.registry.content.getContentByHash(contentHash);
      if (!content) return false;

      const status = await this.registry.processing.getContentStatus(content.rid);
      const agentStatus = status[this.agentId];
      
      return agentStatus?.status === 'processed';
    } catch (error) {
      logger.error('KOI: Failed to check processing status:', error);
      return false;
    }
  }

  /**
   * Get content needing processing by this agent
   */
  async getContentNeedingProcessing(): Promise<Array<{
    rid: string;
    sourceRid: string;
    url?: string;
    title?: string;
    contentHash: string;
  }>> {
    if (!this.enabled || !this.registry) return [];

    try {
      const content = await this.registry.content.getContentNeedingProcessing(this.agentId);
      
      return content.map(item => ({
        rid: item.rid,
        sourceRid: item.sourceRid,
        url: item.url,
        title: item.title,
        contentHash: item.contentHash,
      }));
    } catch (error) {
      logger.error('KOI: Failed to get content needing processing:', error);
      return [];
    }
  }

  /**
   * Get processing statistics for this agent
   */
  async getAgentStatistics() {
    if (!this.enabled || !this.registry) return null;

    try {
      return await this.registry.processing.getAgentProgress(this.agentId);
    } catch (error) {
      logger.error('KOI: Failed to get agent statistics:', error);
      return null;
    }
  }

  /**
   * Generate a processing report
   */
  async generateReport(): Promise<string | null> {
    if (!this.enabled || !this.registry) return null;

    try {
      return await this.registry.generateReport();
    } catch (error) {
      logger.error('KOI: Failed to generate report:', error);
      return null;
    }
  }

  /**
   * Determine source RID from document options
   */
  private async determineSourceRid(options: AddKnowledgeOptions): Promise<string | null> {
    if (!this.registry) return null;

    // Check if source is explicitly provided
    if (options.metadata?.sourceRid) {
      return options.metadata.sourceRid as string;
    }

    // Try to determine from file path
    if (options.originalFilename) {
      const filePath = options.originalFilename;
      
      // Check for known source patterns
      if (filePath.includes('notion')) {
        return RIDGenerator.generateSourceRID('notion', 'regen-network-notion');
      }
      if (filePath.includes('medium')) {
        return RIDGenerator.generateSourceRID('medium', 'regen-network-blog');
      }
      if (filePath.includes('website') || filePath.includes('registry')) {
        return RIDGenerator.generateSourceRID('website', 'registry-regen-network');
      }
      if (filePath.includes('twitter') || filePath.includes('tweet')) {
        return RIDGenerator.generateSourceRID('twitter', 'regennetwork');
      }
    }

    // Default to a generic source if can't determine
    const sources = await this.registry.sources.getAllSources();
    if (sources.length > 0) {
      // Use first source as default
      return sources[0].rid;
    }

    // Create a default source if none exists
    const defaultSource = await this.registry.sources.registerSource({
      type: 'other',
      name: 'unknown',
      description: 'Unknown content source',
    });
    
    return defaultSource.rid;
  }

  /**
   * Close KOI registry connections
   */
  async close(): Promise<void> {
    if (this.registry) {
      await this.registry.close();
      this.registry = null;
      this.enabled = false;
    }
  }
}