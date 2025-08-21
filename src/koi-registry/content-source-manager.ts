import { logger } from '@elizaos/core';
import { ContentSource, RIDGenerator } from './types';
import { KoiDatabase } from './database';

export class ContentSourceManager {
  private db: KoiDatabase;

  constructor(db: KoiDatabase) {
    this.db = db;
  }

  /**
   * Register a new content source
   */
  async registerSource(params: {
    type: ContentSource['type'];
    name: string;
    url?: string;
    description?: string;
    fetchFrequency?: string;
    config?: any;
  }): Promise<ContentSource> {
    // Generate RID for the source
    const rid = RIDGenerator.generateSourceRID(params.type, params.name);
    
    // Check if source already exists
    const existing = await this.db.getSource(rid);
    if (existing) {
      logger.info(`Content source already exists: ${rid}`);
      return existing;
    }

    // Create new source
    const source: ContentSource = {
      rid,
      type: params.type,
      name: params.name,
      url: params.url,
      metadata: {
        description: params.description,
        fetchFrequency: params.fetchFrequency,
        config: params.config,
        totalItems: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.createSource(source);
    logger.info(`Registered new content source: ${rid}`);
    
    return source;
  }

  /**
   * Get all registered sources
   */
  async getAllSources(): Promise<ContentSource[]> {
    return this.db.getAllSources();
  }

  /**
   * Get sources by type
   */
  async getSourcesByType(type: ContentSource['type']): Promise<ContentSource[]> {
    return this.db.getSourcesByType(type);
  }

  /**
   * Get a specific source by RID
   */
  async getSource(rid: string): Promise<ContentSource | null> {
    return this.db.getSource(rid);
  }

  /**
   * Update source metadata
   */
  async updateSource(
    rid: string, 
    updates: Partial<ContentSource['metadata']>
  ): Promise<ContentSource | null> {
    const source = await this.db.getSource(rid);
    if (!source) {
      logger.error(`Source not found: ${rid}`);
      return null;
    }

    source.metadata = { ...source.metadata, ...updates };
    source.updatedAt = new Date();
    
    await this.db.updateSource(source);
    logger.info(`Updated source: ${rid}`);
    
    return source;
  }

  /**
   * Mark source as fetched
   */
  async markSourceFetched(rid: string, itemCount?: number): Promise<void> {
    const source = await this.db.getSource(rid);
    if (!source) {
      logger.error(`Source not found: ${rid}`);
      return;
    }

    source.metadata.lastFetched = new Date();
    if (itemCount !== undefined) {
      source.metadata.totalItems = itemCount;
    }
    source.updatedAt = new Date();
    
    await this.db.updateSource(source);
    logger.info(`Marked source as fetched: ${rid} (${itemCount} items)`);
  }

  /**
   * Delete a source and all its content
   */
  async deleteSource(rid: string): Promise<boolean> {
    // First delete all content from this source
    await this.db.deleteContentBySource(rid);
    
    // Then delete the source itself
    const deleted = await this.db.deleteSource(rid);
    
    if (deleted) {
      logger.info(`Deleted source and all content: ${rid}`);
    }
    
    return deleted;
  }

  /**
   * Get sources that need fetching based on their frequency
   */
  async getSourcesNeedingFetch(): Promise<ContentSource[]> {
    const sources = await this.getAllSources();
    const now = new Date();
    
    return sources.filter(source => {
      if (!source.metadata.fetchFrequency) return false;
      if (!source.metadata.lastFetched) return true;
      
      const lastFetch = new Date(source.metadata.lastFetched);
      const hoursSinceLastFetch = (now.getTime() - lastFetch.getTime()) / (1000 * 60 * 60);
      
      switch (source.metadata.fetchFrequency) {
        case 'hourly':
          return hoursSinceLastFetch >= 1;
        case 'daily':
          return hoursSinceLastFetch >= 24;
        case 'weekly':
          return hoursSinceLastFetch >= 168;
        case 'monthly':
          return hoursSinceLastFetch >= 720;
        default:
          return false;
      }
    });
  }

  /**
   * Initialize default sources for RegenAI
   */
  async initializeDefaultSources(): Promise<void> {
    const defaultSources = [
      {
        type: 'notion' as const,
        name: 'regen-network-notion',
        description: 'Regen Network Notion workspace export',
        fetchFrequency: 'weekly',
      },
      {
        type: 'website' as const,
        name: 'registry-regen-network',
        url: 'https://registry.regen.network',
        description: 'Regen Registry website',
        fetchFrequency: 'daily',
      },
      {
        type: 'medium' as const,
        name: 'regen-network-blog',
        url: 'https://medium.com/regen-network',
        description: 'Regen Network Medium blog',
        fetchFrequency: 'weekly',
      },
      {
        type: 'twitter' as const,
        name: 'regennetwork',
        url: 'https://twitter.com/regennetwork',
        description: 'Regen Network Twitter account',
        fetchFrequency: 'daily',
      },
      {
        type: 'discord' as const,
        name: 'regen-discord',
        description: 'Regen Network Discord server',
        fetchFrequency: 'manual',
      },
    ];

    for (const source of defaultSources) {
      try {
        await this.registerSource(source);
      } catch (error) {
        logger.error(`Failed to register default source ${source.name}:`, error);
      }
    }
    
    logger.info('Initialized default content sources');
  }
}