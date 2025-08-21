import { logger } from '@elizaos/core';
import { AgentProcessingStatus, ProcessingStatus, KoiRegistryStats } from './types';
import { KoiDatabase } from './database';

export class ProcessingStatusTracker {
  private db: KoiDatabase;

  constructor(db: KoiDatabase) {
    this.db = db;
  }

  /**
   * Update processing status for a content item and agent
   */
  async updateStatus(params: {
    contentRid: string;
    agentId: string;
    status: ProcessingStatus;
    documentId?: string;
    fragmentCount?: number;
    error?: {
      message: string;
      code?: string;
      details?: any;
    };
    metadata?: Record<string, any>;
  }): Promise<AgentProcessingStatus> {
    const existingStatus = await this.db.getProcessingStatus(
      params.contentRid,
      params.agentId
    );

    const processingStatus: AgentProcessingStatus = {
      agentId: params.agentId,
      status: params.status,
      documentId: params.documentId,
      fragmentCount: params.fragmentCount,
      error: params.error,
      attemptCount: (existingStatus?.attemptCount || 0) + (params.status === 'processing' ? 1 : 0),
      lastAttemptAt: params.status === 'processing' ? new Date() : existingStatus?.lastAttemptAt,
      processedAt: params.status === 'processed' ? new Date() : existingStatus?.processedAt,
      metadata: {
        ...existingStatus?.metadata,
        ...params.metadata,
      },
    };

    await this.db.updateProcessingStatus({
      contentRid: params.contentRid,
      ...processingStatus,
    });

    logger.info(
      `Updated processing status for ${params.contentRid} / ${params.agentId}: ${params.status}`
    );

    return processingStatus;
  }

  /**
   * Mark content as processing (to prevent concurrent processing)
   */
  async markAsProcessing(
    contentRid: string,
    agentId: string
  ): Promise<AgentProcessingStatus> {
    return this.updateStatus({
      contentRid,
      agentId,
      status: 'processing',
    });
  }

  /**
   * Mark content as successfully processed
   */
  async markAsProcessed(params: {
    contentRid: string;
    agentId: string;
    documentId: string;
    fragmentCount?: number;
    processingTime?: number;
  }): Promise<AgentProcessingStatus> {
    return this.updateStatus({
      contentRid: params.contentRid,
      agentId: params.agentId,
      status: 'processed',
      documentId: params.documentId,
      fragmentCount: params.fragmentCount,
      metadata: {
        processingTime: params.processingTime,
      },
    });
  }

  /**
   * Mark content as failed
   */
  async markAsFailed(params: {
    contentRid: string;
    agentId: string;
    error: {
      message: string;
      code?: string;
      details?: any;
    };
  }): Promise<AgentProcessingStatus> {
    return this.updateStatus({
      contentRid: params.contentRid,
      agentId: params.agentId,
      status: 'failed',
      error: params.error,
    });
  }

  /**
   * Get processing status for a content item across all agents
   */
  async getContentStatus(contentRid: string): Promise<Record<string, AgentProcessingStatus>> {
    return this.db.getContentProcessingStatus(contentRid);
  }

  /**
   * Mark content as skipped (e.g., duplicate)
   */
  async markAsSkipped(params: {
    contentRid: string;
    agentId: string;
    reason: string;
  }): Promise<AgentProcessingStatus> {
    return this.updateStatus({
      contentRid: params.contentRid,
      agentId: params.agentId,
      status: 'skipped',
      metadata: {
        skipReason: params.reason,
      },
    });
  }

  /**
   * Get all content with a specific status for an agent
   */
  async getContentByStatus(
    agentId: string,
    status: ProcessingStatus
  ): Promise<string[]> {
    const allStatus = await this.db.getAllProcessingStatus();
    return allStatus
      .filter(s => s.agentId === agentId && s.status === status)
      .map(s => s.contentRid);
  }

  /**
   * Get failed content for retry
   */
  async getFailedContent(
    agentId: string,
    maxAttempts = 3
  ): Promise<Array<{ contentRid: string; status: AgentProcessingStatus }>> {
    const allStatus = await this.db.getAllProcessingStatus();
    
    return allStatus
      .filter(s => 
        s.agentId === agentId && 
        s.status === 'failed' && 
        (s.attemptCount || 0) < maxAttempts
      )
      .map(s => ({
        contentRid: s.contentRid,
        status: s,
      }));
  }

  /**
   * Reset failed content for retry
   */
  async resetFailedContent(contentRid: string, agentId: string): Promise<void> {
    await this.updateStatus({
      contentRid,
      agentId,
      status: 'pending',
      metadata: {
        resetAt: new Date(),
      },
    });
  }

  /**
   * Get comprehensive statistics
   */
  async getStatistics(): Promise<KoiRegistryStats> {
    const sources = await this.db.getAllSources();
    const content = await this.db.getAllContent();
    const processingStatus = await this.db.getAllProcessingStatus();

    // Calculate source statistics
    const sourceStats: KoiRegistryStats['sources'] = {
      total: sources.length,
      byType: {},
    };
    
    for (const source of sources) {
      sourceStats.byType[source.type] = (sourceStats.byType[source.type] || 0) + 1;
    }

    // Calculate content statistics
    const contentStats: KoiRegistryStats['content'] = {
      total: content.length,
      processed: 0,
      pending: 0,
      failed: 0,
      bySource: {},
    };

    // Calculate per-source statistics
    for (const item of content) {
      if (!contentStats.bySource[item.sourceRid]) {
        contentStats.bySource[item.sourceRid] = {
          total: 0,
          processed: 0,
          pending: 0,
          failed: 0,
        };
      }
      contentStats.bySource[item.sourceRid].total++;
    }

    // Calculate agent statistics
    const agentStats: KoiRegistryStats['agents'] = {};
    
    for (const status of processingStatus) {
      if (!agentStats[status.agentId]) {
        agentStats[status.agentId] = {
          processed: 0,
          pending: 0,
          failed: 0,
        };
      }

      switch (status.status) {
        case 'processed':
          agentStats[status.agentId].processed++;
          contentStats.processed++;
          if (contentStats.bySource[status.contentRid]) {
            contentStats.bySource[status.contentRid].processed++;
          }
          break;
        case 'pending':
        case 'processing':
          agentStats[status.agentId].pending++;
          contentStats.pending++;
          if (contentStats.bySource[status.contentRid]) {
            contentStats.bySource[status.contentRid].pending++;
          }
          break;
        case 'failed':
          agentStats[status.agentId].failed++;
          contentStats.failed++;
          if (contentStats.bySource[status.contentRid]) {
            contentStats.bySource[status.contentRid].failed++;
          }
          break;
      }

      // Calculate average processing time
      if (status.status === 'processed' && status.metadata?.processingTime) {
        const current = agentStats[status.agentId].avgProcessingTime || 0;
        const count = agentStats[status.agentId].processed;
        agentStats[status.agentId].avgProcessingTime = 
          (current * (count - 1) + status.metadata.processingTime) / count;
      }
    }

    return {
      sources: sourceStats,
      content: contentStats,
      agents: agentStats,
    };
  }

  /**
   * Get content processing progress for an agent
   */
  async getAgentProgress(agentId: string): Promise<{
    total: number;
    processed: number;
    pending: number;
    failed: number;
    percentage: number;
  }> {
    const stats = await this.getStatistics();
    const agentStats = stats.agents[agentId] || {
      processed: 0,
      pending: 0,
      failed: 0,
    };

    const total = agentStats.processed + agentStats.pending + agentStats.failed;
    const percentage = total > 0 ? (agentStats.processed / total) * 100 : 0;

    return {
      total,
      processed: agentStats.processed,
      pending: agentStats.pending,
      failed: agentStats.failed,
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  /**
   * Clean up old processing records
   */
  async cleanupOldRecords(daysToKeep = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const allStatus = await this.db.getAllProcessingStatus();
    let deleted = 0;

    for (const status of allStatus) {
      if (status.processedAt && status.processedAt < cutoffDate) {
        await this.db.deleteProcessingStatus(status.contentRid, status.agentId);
        deleted++;
      }
    }

    logger.info(`Cleaned up ${deleted} old processing records`);
    return deleted;
  }
}