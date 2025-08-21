import { Pool } from 'pg';
import { logger } from '@elizaos/core';
import { 
  ContentSource, 
  ContentItem, 
  AgentProcessingStatus,
  ProcessingStatus 
} from './types';

export class KoiDatabase {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected database error:', err);
    });
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    try {
      await this.createTables();
      logger.info('KOI database tables initialized');
    } catch (error) {
      logger.error('Failed to initialize KOI database:', error);
      throw error;
    }
  }

  /**
   * Create required tables if they don't exist
   */
  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Content sources table
      await client.query(`
        CREATE TABLE IF NOT EXISTS koi_sources (
          rid VARCHAR PRIMARY KEY,
          type VARCHAR NOT NULL,
          name VARCHAR NOT NULL,
          url VARCHAR,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Content items table
      await client.query(`
        CREATE TABLE IF NOT EXISTS koi_content (
          rid VARCHAR PRIMARY KEY,
          source_rid VARCHAR REFERENCES koi_sources(rid) ON DELETE CASCADE,
          content_hash VARCHAR NOT NULL,
          url VARCHAR,
          title VARCHAR,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(content_hash)
        )
      `);

      // Processing status table
      await client.query(`
        CREATE TABLE IF NOT EXISTS koi_processing (
          content_rid VARCHAR,
          agent_id VARCHAR,
          status VARCHAR NOT NULL,
          document_id VARCHAR,
          fragment_count INTEGER,
          error_message TEXT,
          error_details JSONB,
          attempt_count INTEGER DEFAULT 0,
          last_attempt_at TIMESTAMP,
          processed_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (content_rid, agent_id),
          FOREIGN KEY (content_rid) REFERENCES koi_content(rid) ON DELETE CASCADE
        )
      `);

      // Create indexes for better query performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_koi_sources_type ON koi_sources(type);
        CREATE INDEX IF NOT EXISTS idx_koi_content_source ON koi_content(source_rid);
        CREATE INDEX IF NOT EXISTS idx_koi_content_hash ON koi_content(content_hash);
        CREATE INDEX IF NOT EXISTS idx_koi_processing_agent ON koi_processing(agent_id);
        CREATE INDEX IF NOT EXISTS idx_koi_processing_status ON koi_processing(status);
      `);

    } finally {
      client.release();
    }
  }

  // Source operations
  async createSource(source: ContentSource): Promise<void> {
    await this.pool.query(
      `INSERT INTO koi_sources (rid, type, name, url, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [source.rid, source.type, source.name, source.url, source.metadata, source.createdAt, source.updatedAt]
    );
  }

  async getSource(rid: string): Promise<ContentSource | null> {
    const result = await this.pool.query(
      'SELECT * FROM koi_sources WHERE rid = $1',
      [rid]
    );
    return result.rows[0] || null;
  }

  async getAllSources(): Promise<ContentSource[]> {
    const result = await this.pool.query('SELECT * FROM koi_sources ORDER BY created_at DESC');
    return result.rows;
  }

  async getSourcesByType(type: string): Promise<ContentSource[]> {
    const result = await this.pool.query(
      'SELECT * FROM koi_sources WHERE type = $1 ORDER BY created_at DESC',
      [type]
    );
    return result.rows;
  }

  async updateSource(source: ContentSource): Promise<void> {
    await this.pool.query(
      `UPDATE koi_sources 
       SET type = $2, name = $3, url = $4, metadata = $5, updated_at = $6
       WHERE rid = $1`,
      [source.rid, source.type, source.name, source.url, source.metadata, source.updatedAt]
    );
  }

  async deleteSource(rid: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM koi_sources WHERE rid = $1',
      [rid]
    );
    return result.rowCount > 0;
  }

  // Content operations
  async createContent(content: ContentItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO koi_content (rid, source_rid, content_hash, url, title, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [content.rid, content.sourceRid, content.contentHash, content.url, content.title, 
       content.metadata, content.createdAt, content.updatedAt]
    );
  }

  async getContent(rid: string): Promise<ContentItem | null> {
    const result = await this.pool.query(
      'SELECT * FROM koi_content WHERE rid = $1',
      [rid]
    );
    return result.rows[0] || null;
  }

  async getContentByHash(hash: string): Promise<ContentItem | null> {
    const result = await this.pool.query(
      'SELECT * FROM koi_content WHERE content_hash = $1',
      [hash]
    );
    return result.rows[0] || null;
  }

  async getContentBySource(sourceRid: string): Promise<ContentItem[]> {
    const result = await this.pool.query(
      'SELECT * FROM koi_content WHERE source_rid = $1 ORDER BY created_at DESC',
      [sourceRid]
    );
    return result.rows;
  }

  async getAllContent(): Promise<ContentItem[]> {
    const result = await this.pool.query('SELECT * FROM koi_content ORDER BY created_at DESC');
    return result.rows;
  }

  async updateContent(content: ContentItem): Promise<void> {
    await this.pool.query(
      `UPDATE koi_content 
       SET source_rid = $2, content_hash = $3, url = $4, title = $5, metadata = $6, updated_at = $7
       WHERE rid = $1`,
      [content.rid, content.sourceRid, content.contentHash, content.url, 
       content.title, content.metadata, content.updatedAt]
    );
  }

  async deleteContent(rid: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM koi_content WHERE rid = $1',
      [rid]
    );
    return result.rowCount > 0;
  }

  async deleteContentBySource(sourceRid: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM koi_content WHERE source_rid = $1',
      [sourceRid]
    );
    return result.rowCount;
  }

  // Processing status operations
  async createProcessingStatus(params: {
    contentRid: string;
    agentId: string;
    status: ProcessingStatus;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO koi_processing (content_rid, agent_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (content_rid, agent_id) DO NOTHING`,
      [params.contentRid, params.agentId, params.status]
    );
  }

  async updateProcessingStatus(params: {
    contentRid: string;
    agentId: string;
    status: ProcessingStatus;
    documentId?: string;
    fragmentCount?: number;
    error?: { message: string; details?: any };
    attemptCount?: number;
    lastAttemptAt?: Date;
    processedAt?: Date;
    metadata?: any;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO koi_processing 
       (content_rid, agent_id, status, document_id, fragment_count, 
        error_message, error_details, attempt_count, last_attempt_at, 
        processed_at, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
       ON CONFLICT (content_rid, agent_id) 
       DO UPDATE SET 
         status = $3,
         document_id = COALESCE($4, koi_processing.document_id),
         fragment_count = COALESCE($5, koi_processing.fragment_count),
         error_message = $6,
         error_details = $7,
         attempt_count = COALESCE($8, koi_processing.attempt_count),
         last_attempt_at = COALESCE($9, koi_processing.last_attempt_at),
         processed_at = COALESCE($10, koi_processing.processed_at),
         metadata = COALESCE($11, koi_processing.metadata),
         updated_at = CURRENT_TIMESTAMP`,
      [
        params.contentRid, params.agentId, params.status, params.documentId,
        params.fragmentCount, params.error?.message, params.error?.details,
        params.attemptCount, params.lastAttemptAt, params.processedAt, params.metadata
      ]
    );
  }

  async getProcessingStatus(
    contentRid: string,
    agentId: string
  ): Promise<AgentProcessingStatus | null> {
    const result = await this.pool.query(
      'SELECT * FROM koi_processing WHERE content_rid = $1 AND agent_id = $2',
      [contentRid, agentId]
    );
    
    const row = result.rows[0];
    if (!row) return null;

    return {
      agentId: row.agent_id,
      status: row.status,
      documentId: row.document_id,
      fragmentCount: row.fragment_count,
      error: row.error_message ? {
        message: row.error_message,
        details: row.error_details,
      } : undefined,
      attemptCount: row.attempt_count,
      lastAttemptAt: row.last_attempt_at,
      processedAt: row.processed_at,
      metadata: row.metadata,
    };
  }

  async getContentProcessingStatus(
    contentRid: string
  ): Promise<Record<string, AgentProcessingStatus>> {
    const result = await this.pool.query(
      'SELECT * FROM koi_processing WHERE content_rid = $1',
      [contentRid]
    );
    
    const status: Record<string, AgentProcessingStatus> = {};
    
    for (const row of result.rows) {
      status[row.agent_id] = {
        agentId: row.agent_id,
        status: row.status,
        documentId: row.document_id,
        fragmentCount: row.fragment_count,
        error: row.error_message ? {
          message: row.error_message,
          details: row.error_details,
        } : undefined,
        attemptCount: row.attempt_count,
        lastAttemptAt: row.last_attempt_at,
        processedAt: row.processed_at,
        metadata: row.metadata,
      };
    }
    
    return status;
  }

  async getAllProcessingStatus(): Promise<Array<AgentProcessingStatus & { contentRid: string }>> {
    const result = await this.pool.query('SELECT * FROM koi_processing');
    
    return result.rows.map(row => ({
      contentRid: row.content_rid,
      agentId: row.agent_id,
      status: row.status,
      documentId: row.document_id,
      fragmentCount: row.fragment_count,
      error: row.error_message ? {
        message: row.error_message,
        details: row.error_details,
      } : undefined,
      attemptCount: row.attempt_count,
      lastAttemptAt: row.last_attempt_at,
      processedAt: row.processed_at,
      metadata: row.metadata,
    }));
  }

  async deleteProcessingStatus(contentRid: string, agentId?: string): Promise<void> {
    if (agentId) {
      await this.pool.query(
        'DELETE FROM koi_processing WHERE content_rid = $1 AND agent_id = $2',
        [contentRid, agentId]
      );
    } else {
      await this.pool.query(
        'DELETE FROM koi_processing WHERE content_rid = $1',
        [contentRid]
      );
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}