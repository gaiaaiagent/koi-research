import {
  IAgentRuntime,
  ModelType,
  UUID,
  Memory,
  MemoryType,
  logger,
} from '@elizaos/core';
import { v5 as uuidv5 } from 'uuid';
import {
  DocumentMetadata,
  FragmentMetadata,
  KnowledgeItem,
  ProcessingOptions,
} from '../types';
// createDocumentMemory is defined in this file

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 100;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RATE_LIMIT_PAUSE = 500; // ms between batches
const MAX_RETRIES = 6;
const INITIAL_BACKOFF_DELAY = 1000; // 1 second

// Rate limit tracking
interface RateLimitState {
  remainingRequests: number;
  remainingTokens: number;
  requestsResetTime: Date;
  tokensResetTime: Date;
}

class RateLimitManager {
  private state: RateLimitState = {
    remainingRequests: 10000,
    remainingTokens: 10000000,
    requestsResetTime: new Date(),
    tokensResetTime: new Date()
  };

  updateFromHeaders(headers: Record<string, string>) {
    if (headers['x-ratelimit-remaining-requests']) {
      this.state.remainingRequests = parseInt(headers['x-ratelimit-remaining-requests']);
    }
    if (headers['x-ratelimit-remaining-tokens']) {
      this.state.remainingTokens = parseInt(headers['x-ratelimit-remaining-tokens']);
    }
    if (headers['x-ratelimit-reset-requests']) {
      this.state.requestsResetTime = this.parseResetTime(headers['x-ratelimit-reset-requests']);
    }
    if (headers['x-ratelimit-reset-tokens']) {
      this.state.tokensResetTime = this.parseResetTime(headers['x-ratelimit-reset-tokens']);
    }
  }

  private parseResetTime(resetStr: string): Date {
    // Parse format like "1s" or "6m0s"
    const match = resetStr.match(/(\d+)([ms])/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const ms = unit === 's' ? value * 1000 : value * 60 * 1000;
      return new Date(Date.now() + ms);
    }
    return new Date(Date.now() + 60000); // Default 1 minute
  }

  async waitIfNeeded() {
    // If we're low on requests, wait until reset
    if (this.state.remainingRequests < 100) {
      const waitTime = this.state.requestsResetTime.getTime() - Date.now();
      if (waitTime > 0) {
        logger.info(`[Document Processor] Rate limit approaching, waiting ${Math.ceil(waitTime/1000)}s`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  canProceed(): boolean {
    return this.state.remainingRequests > 100;
  }
}

const rateLimitManager = new RateLimitManager();

interface ProcessingResult {
  storedDocumentId: UUID;
  fragmentCount: number;
  errors?: string[];
}

// Exponential backoff with jitter
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.status === 429 || error.status === 503) {
        const delay = Math.min(INITIAL_BACKOFF_DELAY * Math.pow(2, i), 60000) + Math.random() * 1000;
        logger.info(`[Document Processor] Retry ${i + 1}/${maxRetries} after ${Math.ceil(delay/1000)}s delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

export class DocumentProcessor {
  private contextWindow: number;
  private contextEnabled: boolean;

  constructor(config?: { contextWindow?: number; contextEnabled?: boolean }) {
    this.contextWindow = config?.contextWindow || 2048;
    this.contextEnabled = config?.contextEnabled !== false;
  }

  /**
   * Process a knowledge item into document and fragment memories
   */
  async processDocument(
    runtime: IAgentRuntime,
    item: KnowledgeItem,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    logger.info(
      `[Document Processor] Processing "${item.metadata?.filename || item.id}"`
    );

    // Create and store document memory
    const document = await this.createAndStoreDocument(runtime, item, options);

    // Split into chunks and create fragments
    const chunks = await this.splitIntoChunks(item.content.text, options);
    logger.info(
      `[Document Processor] "${
        item.metadata?.filename || item.id
      }": Split into ${chunks.length} chunks`
    );

    // Process chunks and create fragments with batching
    return await this.processChunksWithBatching(runtime, document, chunks, item, options);
  }

  /**
   * Create and store the document memory
   */
  private async createAndStoreDocument(
    runtime: IAgentRuntime,
    item: KnowledgeItem,
    options?: ProcessingOptions
  ): Promise<Memory> {
    const document = createDocumentMemory(item, runtime, options);

    // Store document
    await runtime.createMemory(document, 'documents');
    logger.debug(
      `[Document Processor] Stored document with ID: ${document.id}`
    );

    return document;
  }

  /**
   * Split text into chunks for processing
   */
  private async splitIntoChunks(
    text: string,
    options?: ProcessingOptions
  ): Promise<Array<{ content: string; metadata?: any }>> {
    const chunkSize = options?.chunkSize || DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options?.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

    // Handle undefined or empty text
    if (!text || typeof text !== 'string') {
      logger.warn(`[splitIntoChunks] Received invalid text: ${typeof text}`);
      return [];
    }

    // Simple token-based chunking
    const words = text.split(/\s+/);
    const chunks: Array<{ content: string; metadata?: any }> = [];

    for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
      const chunkWords = words.slice(i, i + chunkSize);
      if (chunkWords.length > 0) {
        chunks.push({
          content: chunkWords.join(' '),
          metadata: {
            startIndex: i,
            endIndex: Math.min(i + chunkSize, words.length),
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Process chunks with batching for efficient embedding generation
   */
  private async processChunksWithBatching(
    runtime: IAgentRuntime,
    document: Memory,
    chunks: Array<{ content: string; metadata?: any }>,
    item: KnowledgeItem,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    const processingResult: ProcessingResult = {
      storedDocumentId: document.id as UUID,
      fragmentCount: 0,
    };

    // Batch processing for embeddings
    const batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
    const results: Array<{ success: boolean; error?: any }> = [];
    
    logger.info(`[Document Processor] Processing ${chunks.length} chunks in batches of ${batchSize}`);
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      const batchIndex = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chunks.length / batchSize);
      
      logger.info(`[Document Processor] Processing batch ${batchIndex}/${totalBatches} (${batch.length} chunks)`);
      
      // Check rate limits before processing batch
      await rateLimitManager.waitIfNeeded();
      
      try {
        // Process batch with exponential backoff
        const batchResults = await withExponentialBackoff(async () => {
          // Create embeddings for all chunks in batch at once
          const embeddings = await this.createBatchEmbeddings(runtime, batch.map(chunk => chunk.content));
          
          // Store fragments with their embeddings
          return await Promise.all(
            batch.map(async (chunk, idx) => {
              try {
                const embedding = embeddings[idx];
                await this.storeFragmentWithEmbedding(
                  runtime,
                  document,
                  chunk,
                  i + idx,
                  embedding,
                  chunks.length,
                  options
                );
                return { success: true };
              } catch (error) {
                logger.error({ error }, `Failed to store chunk ${i + idx}`);
                return { success: false, error };
              }
            })
          );
        });
        
        results.push(...batchResults);
        
        // Pause between batches to respect rate limits
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, DEFAULT_RATE_LIMIT_PAUSE));
        }
      } catch (error) {
        // If batch fails after retries, mark all chunks as failed
        logger.error({ error }, `Batch ${batchIndex} failed after retries`);
        results.push(...batch.map(() => ({ success: false, error })));
      }
    }

    const successfulChunks = results.filter((r) => r.success).length;
    const errors = results.filter((r) => !r.success).map((r) => r.error);

    processingResult.fragmentCount = successfulChunks;
    if (errors.length > 0) {
      processingResult.errors = errors;
    }

    logger.info(
      `[Document Processor] "${item.metadata?.filename || item.id}" complete: ${successfulChunks}/${chunks.length} fragments saved (${(
        (successfulChunks / chunks.length) *
        100
      ).toFixed(1)}% success)`
    );

    return processingResult;
  }

  /**
   * Create embeddings for multiple texts in a single API call
   */
    private async createBatchEmbeddings(
    runtime: IAgentRuntime,
    texts: string[]
  ): Promise<number[][]> {
    try {
      // Process embeddings sequentially with rate limit awareness
      const embeddings: number[][] = [];
      
      for (let i = 0; i < texts.length; i++) {
        try {
          const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
            text: texts[i]
          });
          embeddings.push(embedding);
          
          // Add delay to respect rate limits (10 req/sec = 100ms between requests)
          if (i < texts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          if (error.headers) {
            rateLimitManager.updateFromHeaders(error.headers);
          }
          // If we hit a rate limit, wait and retry
          if (error.status === 429) {
            const retryAfter = parseInt(error.headers?.['retry-after'] || '60');
            logger.info(`[Document Processor] Rate limit hit, waiting ${retryAfter}s`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            i--; // Retry the same text
            continue;
          }
          throw error;
        }
      }
      
      return embeddings;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Store a fragment with pre-computed embedding
   */
  private async storeFragmentWithEmbedding(
    runtime: IAgentRuntime,
    document: Memory,
    chunk: { content: string; metadata?: any },
    index: number,
    embedding: number[],
    totalChunks: number,
    options?: ProcessingOptions
  ): Promise<void> {
    const fragmentId = this.generateFragmentId(document.id as UUID, index);
    const fragmentMetadata: FragmentMetadata = {
      type: MemoryType.FRAGMENT,
      documentId: document.id as UUID,
      chunkIndex: index,
      totalChunks,
      characterCount: chunk.content.length,
      ...chunk.metadata,
    };

    const fragment: Memory = {
      id: fragmentId,
      userId: document.userId,
      agentId: document.agentId,
      roomId: document.roomId,
      worldId: document.worldId,
      content: { text: chunk.content },
      metadata: fragmentMetadata,
      type: MemoryType.FRAGMENT,
      createdAt: Date.now(),
      embedding, // Use pre-computed embedding
    };

    await runtime.createMemory(fragment, 'knowledge');
  }

  /**
   * Generate deterministic fragment ID
   */
  private generateFragmentId(documentId: UUID, chunkIndex: number): UUID {
    const FRAGMENT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    return uuidv5(`${documentId}-fragment-${chunkIndex}`, FRAGMENT_NAMESPACE) as UUID;
  }

  /**
   * Create and store a single fragment (legacy method for compatibility)
   */
  private async createAndStoreFragment(
    runtime: IAgentRuntime,
    document: Memory,
    chunk: { content: string; metadata?: any },
    index: number,
    options?: ProcessingOptions
  ): Promise<{ success: boolean; error?: any }> {
    try {
      const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
        text: chunk.content,
      });
      
      await this.storeFragmentWithEmbedding(
        runtime,
        document,
        chunk,
        index,
        embedding,
        1, // Total chunks not known in legacy method
        options
      );
      
      return { success: true };
    } catch (error) {
      logger.error({ error }, `Failed to process chunk ${index}`);
      return { success: false, error };
    }
  }

  /**
   * Process fragments from text (for KOI integration and compatibility)
   * This method processes fragments without creating a document memory
   */
  async processFragments(
    runtime: IAgentRuntime,
    documentId: string,
    text: string,
    metadata?: any
  ): Promise<number> {
    logger.info(`[DEBUG] processFragments called for documentId: ${documentId}`);
    
    try {
      // Split text into chunks
      const chunks = await this.splitIntoChunks(text);
      logger.info(`[DEBUG] Split text into ${chunks.length} chunks for ${documentId}`);
      
      // Create a minimal document memory for fragment linking
      const documentMemory: Memory = {
        id: documentId as UUID,
        userId: runtime.entityId,
        agentId: runtime.agentId,
        type: 'documents' as MemoryType,
        content: {
          text: text.substring(0, 500) + (text.length > 500 ? '...' : ''), // Truncated for memory
          metadata: metadata
        },
        roomId: runtime.roomId,
        worldId: runtime.worldId,
        createdAt: Date.now(),
        similarity: 1.0,
        unique: true
      };

      // Process chunks with batching
      const result = await this.processChunksWithBatching(runtime, documentMemory, chunks, {
        id: documentId,
        content: { text },
        metadata
      } as KnowledgeItem);
      
      logger.info(`[DEBUG] processFragments completed for ${documentId}, created ${result.totalFragments} fragments`);
      return result.totalFragments;
      
    } catch (error) {
      logger.error({ error }, `Failed to process fragments for ${documentId}`);
      throw error;
    }
  }
}
// =============================================================================
// COMPATIBILITY EXPORTS FOR SERVICE.TS
// =============================================================================

// Create singleton instance for compatibility
const processorInstance = new DocumentProcessor();

export async function processFragmentsSynchronously(options: any) {
  // This function is called by service.ts
  // Delegate to the class method
  // Support both 'text' and 'fullDocumentText' property names
  const textContent = options.fullDocumentText || options.text;
  
  return processorInstance.processFragments(
    options.runtime,
    options.documentId,
    textContent,
    options.metadata
  );
}

export async function extractTextFromDocument(
  contentBuffer: Buffer | string,
  contentType: string,
  originalFilename: string
): Promise<string> {
  // Static utility function - doesn't need instance
  // Just extract text based on content type
  if (contentType.includes('text/') || contentType.includes('application/json')) {
    return typeof contentBuffer === 'string' ? contentBuffer : contentBuffer.toString('utf-8');
  }
  
  // For other types, return empty or throw error
  throw new Error(`Unsupported content type: ${contentType}`);
}

export function createDocumentMemory(options: any): any {
  // This creates a memory object for storage
  // Convert to the format expected by service.ts
  const { 
    text, 
    agentId, 
    clientDocumentId, 
    originalFilename, 
    contentType, 
    worldId, 
    fileSize,
    documentId,
    customMetadata 
  } = options;
  
  const fileExt = originalFilename.split('.').pop()?.toLowerCase() || '';
  const title = originalFilename.replace(`.${fileExt}`, '');
  
  return {
    id: documentId || clientDocumentId,
    agentId,
    roomId: agentId,
    worldId,
    entityId: agentId,
    content: { text },
    metadata: {
      type: 'document',
      documentId: clientDocumentId,
      originalFilename,
      contentType,
      title,
      fileExt,
      fileSize,
      source: 'rag-service-main-upload',
      timestamp: Date.now(),
      ...(customMetadata || {})
    }
  };
}
