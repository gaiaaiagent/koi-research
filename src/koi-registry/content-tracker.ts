import { logger } from '@elizaos/core';
import * as crypto from 'crypto';
import { ContentItem, ContentSource, RIDGenerator } from './types';
import { KoiDatabase } from './database';

export class ContentTracker {
  private db: KoiDatabase;

  constructor(db: KoiDatabase) {
    this.db = db;
  }

  /**
   * Track a new content item from a source
   */
  async trackContent(params: {
    sourceRid: string;
    url?: string;
    title?: string;
    content: string;
    originalId?: string;
    author?: string;
    publishedAt?: Date;
    contentType?: string;
    metadata?: Record<string, any>;
  }): Promise<ContentItem> {
    // Generate content hash
    const contentHash = this.generateContentHash(params.content);
    
    // Check if content already exists (by hash)
    const existing = await this.db.getContentByHash(contentHash);
    if (existing) {
      logger.debug(`Content already tracked: ${existing.rid}`);
      return existing;
    }

    // Get source to determine content type
    const source = await this.db.getSource(params.sourceRid);
    if (!source) {
      throw new Error(`Source not found: ${params.sourceRid}`);
    }

    // Generate RID for content
    const identifier = params.originalId || contentHash.substring(0, 8);
    const rid = RIDGenerator.generateContentRID(
      source.type,
      identifier
    );

    // Create content item
    const contentItem: ContentItem = {
      rid,
      sourceRid: params.sourceRid,
      contentHash,
      url: params.url,
      title: params.title,
      metadata: {
        originalId: params.originalId,
        author: params.author,
        publishedAt: params.publishedAt,
        contentType: params.contentType || 'text/plain',
        size: Buffer.byteLength(params.content, 'utf8'),
        ...params.metadata,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.createContent(contentItem);
    logger.info(`Tracked new content: ${rid} from ${source.name}`);
    
    // Initialize processing status for all agents
    await this.initializeProcessingStatus(rid);
    
    return contentItem;
  }

  /**
   * Get all content from a specific source
   */
  async getContentBySource(sourceRid: string): Promise<ContentItem[]> {
    return this.db.getContentBySource(sourceRid);
  }

  /**
   * Get a specific content item
   */
  async getContent(rid: string): Promise<ContentItem | null> {
    return this.db.getContent(rid);
  }

  /**
   * Get content by hash (for deduplication)
   */
  async getContentByHash(hash: string): Promise<ContentItem | null> {
    return this.db.getContentByHash(hash);
  }

  /**
   * Update content metadata
   */
  async updateContent(
    rid: string,
    updates: Partial<ContentItem>
  ): Promise<ContentItem | null> {
    const content = await this.db.getContent(rid);
    if (!content) {
      logger.error(`Content not found: ${rid}`);
      return null;
    }

    Object.assign(content, updates);
    content.updatedAt = new Date();
    
    await this.db.updateContent(content);
    logger.info(`Updated content: ${rid}`);
    
    return content;
  }

  /**
   * Get content needing processing by a specific agent
   */
  async getContentNeedingProcessing(agentId: string): Promise<ContentItem[]> {
    const allContent = await this.db.getAllContent();
    const needsProcessing: ContentItem[] = [];
    
    for (const content of allContent) {
      const status = await this.db.getProcessingStatus(content.rid, agentId);
      if (!status || status.status === 'pending' || status.status === 'failed') {
        needsProcessing.push(content);
      }
    }
    
    return needsProcessing;
  }

  /**
   * Get all content items
   */
  async getAllContent(): Promise<ContentItem[]> {
    return this.db.getAllContent();
  }

  /**
   * Get recently added content
   */
  async getRecentContent(limit = 100): Promise<ContentItem[]> {
    const allContent = await this.db.getAllContent();
    return allContent
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Search content by metadata
   */
  async searchContent(criteria: {
    sourceType?: string;
    author?: string;
    afterDate?: Date;
    beforeDate?: Date;
    hasUrl?: boolean;
  }): Promise<ContentItem[]> {
    const allContent = await this.db.getAllContent();
    
    return allContent.filter(content => {
      if (criteria.sourceType) {
        const source = content.sourceRid.match(/\.source\.([^-]+)-/);
        if (!source || source[1] !== criteria.sourceType) return false;
      }
      
      if (criteria.author && content.metadata.author !== criteria.author) {
        return false;
      }
      
      if (criteria.afterDate && content.createdAt < criteria.afterDate) {
        return false;
      }
      
      if (criteria.beforeDate && content.createdAt > criteria.beforeDate) {
        return false;
      }
      
      if (criteria.hasUrl !== undefined) {
        if (criteria.hasUrl && !content.url) return false;
        if (!criteria.hasUrl && content.url) return false;
      }
      
      return true;
    });
  }

  /**
   * Delete content item
   */
  async deleteContent(rid: string): Promise<boolean> {
    // Delete processing status first
    await this.db.deleteProcessingStatus(rid);
    
    // Then delete content
    const deleted = await this.db.deleteContent(rid);
    
    if (deleted) {
      logger.info(`Deleted content: ${rid}`);
    }
    
    return deleted;
  }

  /**
   * Generate SHA-256 hash of content
   */
  private generateContentHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Initialize processing status for all registered agents
   */
  private async initializeProcessingStatus(contentRid: string): Promise<void> {
    // Get list of agents (hardcoded for now, could be made configurable)
    const agents = [
      'regenai',
      'facilitator',
      'voice-of-nature',
      'governor',
      'narrative',
    ];
    
    for (const agentId of agents) {
      await this.db.createProcessingStatus({
        contentRid,
        agentId,
        status: 'pending',
      });
    }
    
    logger.debug(`Initialized processing status for ${contentRid}`);
  }

  /**
   * Batch track multiple content items
   */
  async batchTrackContent(
    sourceRid: string,
    items: Array<Omit<Parameters<typeof this.trackContent>[0], 'sourceRid'>>
  ): Promise<ContentItem[]> {
    const tracked: ContentItem[] = [];
    
    for (const item of items) {
      try {
        const contentItem = await this.trackContent({
          ...item,
          sourceRid,
        });
        tracked.push(contentItem);
      } catch (error) {
        logger.error(`Failed to track content:`, error);
      }
    }
    
    logger.info(`Batch tracked ${tracked.length} content items from ${sourceRid}`);
    return tracked;
  }
}