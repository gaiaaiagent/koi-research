/**
 * KOI Registry Types
 * Defines the structure for content source tracking and RAG processing status
 */

export interface ContentSource {
  rid: string; // e.g., "core.source.twitter-regennetwork.v1.0.0"
  type: 'twitter' | 'website' | 'notion' | 'medium' | 'youtube' | 'discord' | 'telegram' | 'other';
  name: string;
  url?: string;
  metadata: {
    description?: string;
    fetchFrequency?: string; // e.g., "daily", "weekly", "manual"
    lastFetched?: Date;
    totalItems?: number;
    credentials?: any; // API keys, tokens, etc (encrypted)
    config?: any; // Source-specific configuration
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentItem {
  rid: string; // e.g., "relevant.content.tweet-123456.v1.0.0"
  sourceRid: string; // Reference to parent ContentSource
  contentHash: string; // SHA-256 hash of content
  url?: string;
  title?: string;
  metadata: {
    originalId?: string; // Original ID from source (tweet ID, page ID, etc)
    author?: string;
    publishedAt?: Date;
    tags?: string[];
    contentType?: string; // text/markdown, text/html, etc
    size?: number; // Content size in bytes
    [key: string]: any; // Source-specific metadata
  };
  createdAt: Date;
  updatedAt: Date;
}

export type ProcessingStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'skipped';

export interface AgentProcessingStatus {
  agentId: string;
  status: ProcessingStatus;
  documentId?: string; // RAG document ID if processed
  fragmentCount?: number;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  attemptCount?: number;
  lastAttemptAt?: Date;
  processedAt?: Date;
  metadata?: {
    processingTime?: number; // ms
    embeddingModel?: string;
    [key: string]: any;
  };
}

export interface ContentProcessingRecord {
  contentRid: string;
  agents: Record<string, AgentProcessingStatus>;
}

export interface KoiRegistryStats {
  sources: {
    total: number;
    byType: Record<string, number>;
  };
  content: {
    total: number;
    processed: number;
    pending: number;
    failed: number;
    bySource: Record<string, {
      total: number;
      processed: number;
      pending: number;
      failed: number;
    }>;
  };
  agents: {
    [agentId: string]: {
      processed: number;
      pending: number;
      failed: number;
      avgProcessingTime?: number;
    };
  };
}

// RID Generation helpers
export class RIDGenerator {
  static generateSourceRID(type: string, identifier: string, version = '1.0.0'): string {
    const sanitized = identifier.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `core.source.${type}-${sanitized}.v${version}`;
  }

  static generateContentRID(
    type: string, 
    identifier: string, 
    version = '1.0.0',
    relevance: 'core' | 'relevant' | 'background' = 'relevant'
  ): string {
    const sanitized = identifier.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${relevance}.content.${type}-${sanitized}.v${version}`;
  }

  static parseRID(rid: string): {
    relevance: string;
    type: string;
    subject: string;
    version: string;
  } | null {
    const match = rid.match(/^([^.]+)\.([^.]+)\.([^.]+)\.v(.+)$/);
    if (!match) return null;
    
    return {
      relevance: match[1],
      type: match[2],
      subject: match[3],
      version: match[4],
    };
  }
}