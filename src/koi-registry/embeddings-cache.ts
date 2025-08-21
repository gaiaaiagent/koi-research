/**
 * Shared Embeddings Cache for KOI Registry
 * 
 * Prevents duplicate embedding generation across agents by maintaining
 * a shared cache of embeddings that can be reused.
 */

import { logger, UUID } from '@elizaos/core';
import { Pool } from 'pg';
import { createHash } from 'crypto';

interface CachedEmbedding {
  contentHash: string;
  embedding: number[];
  model: string;
  dimensions: number;
  createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
  metadata?: any;
}

interface EmbeddingRequest {
  content: string;
  contentHash?: string;
  model?: string;
  agentId?: string;
}

interface EmbeddingResponse {
  embedding: number[];
  contentHash: string;
  fromCache: boolean;
  model: string;
  dimensions: number;
}

export class EmbeddingsCache {
  private pool: Pool;
  private memoryCache: Map<string, CachedEmbedding> = new Map();
  private memoryCacheLimit = 1000;
  private defaultModel = 'text-embedding-ada-002';
  
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Embeddings cache database error:', err);
    });
  }

  /**
   * Initialize the embeddings cache database
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Create embeddings cache table
      await client.query(`
        CREATE TABLE IF NOT EXISTS koi_embeddings_cache (
          content_hash VARCHAR PRIMARY KEY,
          embedding FLOAT8[],
          model VARCHAR NOT NULL,
          dimensions INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          usage_count INTEGER DEFAULT 1,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create index for faster lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_koi_embeddings_model 
        ON koi_embeddings_cache(model);
        
        CREATE INDEX IF NOT EXISTS idx_koi_embeddings_last_used 
        ON koi_embeddings_cache(last_used_at DESC);
      `);

      // Create usage tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS koi_embeddings_usage (
          id SERIAL PRIMARY KEY,
          content_hash VARCHAR REFERENCES koi_embeddings_cache(content_hash) ON DELETE CASCADE,
          agent_id VARCHAR NOT NULL,
          used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          document_id VARCHAR,
          fragment_index INTEGER
        )
      `);

      // Create index for usage tracking
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_koi_embeddings_usage_agent 
        ON koi_embeddings_usage(agent_id);
        
        CREATE INDEX IF NOT EXISTS idx_koi_embeddings_usage_hash 
        ON koi_embeddings_usage(content_hash);
      `);

      logger.info('Embeddings cache initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Get or create embedding for content
   */
  async getOrCreateEmbedding(
    request: EmbeddingRequest,
    generateEmbedding: (content: string) => Promise<number[]>
  ): Promise<EmbeddingResponse> {
    const contentHash = request.contentHash || this.hashContent(request.content);
    const model = request.model || this.defaultModel;
    
    // Check memory cache first
    const memoryCached = this.memoryCache.get(`${contentHash}:${model}`);
    if (memoryCached) {
      await this.recordUsage(contentHash, request.agentId);
      
      return {
        embedding: memoryCached.embedding,
        contentHash,
        fromCache: true,
        model: memoryCached.model,
        dimensions: memoryCached.dimensions
      };
    }
    
    // Check database cache
    const dbCached = await this.getFromDatabase(contentHash, model);
    if (dbCached) {
      // Add to memory cache
      this.addToMemoryCache(`${contentHash}:${model}`, dbCached);
      await this.recordUsage(contentHash, request.agentId);
      
      return {
        embedding: dbCached.embedding,
        contentHash,
        fromCache: true,
        model: dbCached.model,
        dimensions: dbCached.dimensions
      };
    }
    
    // Generate new embedding
    logger.debug(`Generating new embedding for content hash: ${contentHash}`);
    const embedding = await generateEmbedding(request.content);
    
    // Cache the embedding
    const cached: CachedEmbedding = {
      contentHash,
      embedding,
      model,
      dimensions: embedding.length,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 1,
      metadata: { agentId: request.agentId }
    };
    
    await this.saveToDatabase(cached);
    this.addToMemoryCache(`${contentHash}:${model}`, cached);
    
    if (request.agentId) {
      await this.recordUsage(contentHash, request.agentId);
    }
    
    return {
      embedding,
      contentHash,
      fromCache: false,
      model,
      dimensions: embedding.length
    };
  }

  /**
   * Get embedding from cache only (no generation)
   */
  async getEmbedding(contentHash: string, model?: string): Promise<CachedEmbedding | null> {
    const targetModel = model || this.defaultModel;
    
    // Check memory cache
    const memoryCached = this.memoryCache.get(`${contentHash}:${targetModel}`);
    if (memoryCached) {
      return memoryCached;
    }
    
    // Check database
    return await this.getFromDatabase(contentHash, targetModel);
  }

  /**
   * Check if embedding exists in cache
   */
  async hasEmbedding(contentHash: string, model?: string): Promise<boolean> {
    const targetModel = model || this.defaultModel;
    
    // Check memory cache
    if (this.memoryCache.has(`${contentHash}:${targetModel}`)) {
      return true;
    }
    
    // Check database
    const result = await this.pool.query(
      'SELECT 1 FROM koi_embeddings_cache WHERE content_hash = $1 AND model = $2',
      [contentHash, targetModel]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Get embeddings for multiple content hashes
   */
  async getBatchEmbeddings(
    contentHashes: string[],
    model?: string
  ): Promise<Map<string, CachedEmbedding>> {
    const targetModel = model || this.defaultModel;
    const results = new Map<string, CachedEmbedding>();
    const missingHashes: string[] = [];
    
    // Check memory cache first
    for (const hash of contentHashes) {
      const cached = this.memoryCache.get(`${hash}:${targetModel}`);
      if (cached) {
        results.set(hash, cached);
      } else {
        missingHashes.push(hash);
      }
    }
    
    // Batch fetch from database
    if (missingHashes.length > 0) {
      const dbResults = await this.pool.query(
        `SELECT * FROM koi_embeddings_cache 
         WHERE content_hash = ANY($1) AND model = $2`,
        [missingHashes, targetModel]
      );
      
      for (const row of dbResults.rows) {
        const cached: CachedEmbedding = {
          contentHash: row.content_hash,
          embedding: row.embedding,
          model: row.model,
          dimensions: row.dimensions,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
          usageCount: row.usage_count,
          metadata: row.metadata
        };
        
        results.set(row.content_hash, cached);
        this.addToMemoryCache(`${row.content_hash}:${row.model}`, cached);
      }
    }
    
    return results;
  }

  /**
   * Get statistics about cache usage
   */
  async getStatistics(): Promise<{
    totalEmbeddings: number;
    uniqueContent: number;
    byModel: Record<string, number>;
    byAgent: Record<string, number>;
    cacheHitRate: number;
    averageReuse: number;
    memoryCacheSize: number;
    topReused: Array<{ contentHash: string; usageCount: number }>;
  }> {
    // Get overall statistics
    const statsResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT content_hash) as unique_content,
        AVG(usage_count) as avg_reuse
      FROM koi_embeddings_cache
    `);
    
    // Get by model
    const byModelResult = await this.pool.query(`
      SELECT model, COUNT(*) as count
      FROM koi_embeddings_cache
      GROUP BY model
    `);
    
    // Get by agent
    const byAgentResult = await this.pool.query(`
      SELECT agent_id, COUNT(DISTINCT content_hash) as count
      FROM koi_embeddings_usage
      GROUP BY agent_id
    `);
    
    // Get top reused
    const topReusedResult = await this.pool.query(`
      SELECT content_hash, usage_count
      FROM koi_embeddings_cache
      ORDER BY usage_count DESC
      LIMIT 10
    `);
    
    const stats = statsResult.rows[0];
    
    const byModel: Record<string, number> = {};
    for (const row of byModelResult.rows) {
      byModel[row.model] = parseInt(row.count);
    }
    
    const byAgent: Record<string, number> = {};
    for (const row of byAgentResult.rows) {
      byAgent[row.agent_id] = parseInt(row.count);
    }
    
    // Calculate cache hit rate from usage table
    const usageStats = await this.pool.query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(DISTINCT content_hash) as unique_hashes
      FROM koi_embeddings_usage
    `);
    
    const totalRequests = parseInt(usageStats.rows[0].total_requests) || 1;
    const uniqueHashes = parseInt(usageStats.rows[0].unique_hashes) || 1;
    const cacheHitRate = (totalRequests - uniqueHashes) / totalRequests;
    
    return {
      totalEmbeddings: parseInt(stats.total),
      uniqueContent: parseInt(stats.unique_content),
      byModel,
      byAgent,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      averageReuse: parseFloat(stats.avg_reuse) || 1,
      memoryCacheSize: this.memoryCache.size,
      topReused: topReusedResult.rows.map(row => ({
        contentHash: row.content_hash,
        usageCount: row.usage_count
      }))
    };
  }

  /**
   * Clean up old or unused embeddings
   */
  async cleanup(options: {
    maxAge?: number; // Days
    minUsageCount?: number;
    keepTopPercent?: number;
  } = {}): Promise<number> {
    const maxAge = options.maxAge || 30;
    const minUsageCount = options.minUsageCount || 1;
    
    let deletedCount = 0;
    
    // Delete old, unused embeddings
    const deleteOldResult = await this.pool.query(`
      DELETE FROM koi_embeddings_cache
      WHERE last_used_at < NOW() - INTERVAL '${maxAge} days'
        AND usage_count < $1
      RETURNING content_hash
    `, [minUsageCount]);
    
    deletedCount += deleteOldResult.rowCount;
    
    // Clear from memory cache
    for (const row of deleteOldResult.rows) {
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(row.content_hash)) {
          this.memoryCache.delete(key);
        }
      }
    }
    
    logger.info(`Cleaned up ${deletedCount} old embeddings`);
    
    return deletedCount;
  }

  /**
   * Hash content to create a content ID
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get embedding from database
   */
  private async getFromDatabase(
    contentHash: string,
    model: string
  ): Promise<CachedEmbedding | null> {
    const result = await this.pool.query(
      `SELECT * FROM koi_embeddings_cache 
       WHERE content_hash = $1 AND model = $2`,
      [contentHash, model]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    
    // Update last used timestamp
    await this.pool.query(
      `UPDATE koi_embeddings_cache 
       SET last_used_at = CURRENT_TIMESTAMP, 
           usage_count = usage_count + 1
       WHERE content_hash = $1 AND model = $2`,
      [contentHash, model]
    );
    
    return {
      contentHash: row.content_hash,
      embedding: row.embedding,
      model: row.model,
      dimensions: row.dimensions,
      createdAt: row.created_at,
      lastUsedAt: new Date(),
      usageCount: row.usage_count + 1,
      metadata: row.metadata
    };
  }

  /**
   * Save embedding to database
   */
  private async saveToDatabase(cached: CachedEmbedding): Promise<void> {
    await this.pool.query(
      `INSERT INTO koi_embeddings_cache 
       (content_hash, embedding, model, dimensions, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (content_hash) DO UPDATE
       SET last_used_at = CURRENT_TIMESTAMP,
           usage_count = koi_embeddings_cache.usage_count + 1`,
      [
        cached.contentHash,
        cached.embedding,
        cached.model,
        cached.dimensions,
        cached.metadata || {}
      ]
    );
  }

  /**
   * Record usage by an agent
   */
  private async recordUsage(
    contentHash: string,
    agentId?: string,
    documentId?: string,
    fragmentIndex?: number
  ): Promise<void> {
    if (!agentId) return;
    
    await this.pool.query(
      `INSERT INTO koi_embeddings_usage 
       (content_hash, agent_id, document_id, fragment_index)
       VALUES ($1, $2, $3, $4)`,
      [contentHash, agentId, documentId, fragmentIndex]
    );
  }

  /**
   * Add to memory cache with LRU eviction
   */
  private addToMemoryCache(key: string, cached: CachedEmbedding): void {
    // Remove oldest if at limit
    if (this.memoryCache.size >= this.memoryCacheLimit) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, cached);
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
    logger.info('Memory cache cleared');
  }

  /**
   * Export embeddings for backup or migration
   */
  async exportEmbeddings(outputPath: string): Promise<void> {
    const fs = await import('fs/promises');
    
    const result = await this.pool.query(
      'SELECT * FROM koi_embeddings_cache ORDER BY content_hash'
    );
    
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      embeddings: result.rows
    };
    
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    
    logger.info(`Exported ${result.rows.length} embeddings to ${outputPath}`);
  }

  /**
   * Import embeddings from backup
   */
  async importEmbeddings(inputPath: string): Promise<number> {
    const fs = await import('fs/promises');
    
    const content = await fs.readFile(inputPath, 'utf-8');
    const data = JSON.parse(content);
    
    let imported = 0;
    
    for (const row of data.embeddings) {
      try {
        await this.pool.query(
          `INSERT INTO koi_embeddings_cache 
           (content_hash, embedding, model, dimensions, created_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (content_hash) DO NOTHING`,
          [
            row.content_hash,
            row.embedding,
            row.model,
            row.dimensions,
            row.created_at,
            row.metadata || {}
          ]
        );
        imported++;
      } catch (error) {
        logger.error(`Failed to import embedding ${row.content_hash}:`, error);
      }
    }
    
    logger.info(`Imported ${imported} embeddings from ${inputPath}`);
    
    return imported;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}