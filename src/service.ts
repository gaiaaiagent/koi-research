import {
  Content,
  createUniqueUuid,
  FragmentMetadata,
  IAgentRuntime,
  KnowledgeItem,
  logger,
  Memory,
  MemoryMetadata,
  MemoryType,
  ModelType,
  Semaphore,
  Service,
  splitChunks,
  UUID,
} from '@elizaos/core';
import {
  createDocumentMemory,
  extractTextFromDocument,
  processFragmentsSynchronously,
} from './document-processor.ts';
import { AddKnowledgeOptions, KnowledgeServiceType } from './types.ts';
import type { KnowledgeConfig, LoadResult } from './types';
import { loadDocsFromPath } from './docs-loader';
import fs from 'node:fs'; // For potential direct file operations in service

/**
 * Knowledge Service - Provides retrieval augmented generation capabilities
 */
export class KnowledgeService extends Service {
  static readonly serviceType = 'knowledge';
  public config: KnowledgeConfig;
  capabilityDescription =
    'Provides Retrieval Augmented Generation capabilities, including knowledge upload and querying.';

  private knowledgeProcessingSemaphore: Semaphore;

  /**
   * Create a new Knowledge service
   * @param runtime Agent runtime
   */
  constructor(runtime: IAgentRuntime, config?: Partial<KnowledgeConfig>) {
    super(runtime);
    this.knowledgeProcessingSemaphore = new Semaphore(10);

    const parseBooleanEnv = (value: any): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return false; // Default to false if undefined or other type
    };

    this.config = {
      CTX_KNOWLEDGE_ENABLED: parseBooleanEnv(config?.CTX_KNOWLEDGE_ENABLED),
      LOAD_DOCS_ON_STARTUP: parseBooleanEnv(config?.LOAD_DOCS_ON_STARTUP),
      MAX_INPUT_TOKENS: config?.MAX_INPUT_TOKENS,
      MAX_OUTPUT_TOKENS: config?.MAX_OUTPUT_TOKENS,
      EMBEDDING_PROVIDER: config?.EMBEDDING_PROVIDER,
      TEXT_PROVIDER: config?.TEXT_PROVIDER,
      TEXT_EMBEDDING_MODEL: config?.TEXT_EMBEDDING_MODEL,
    };

    logger.info(
      `KnowledgeService initialized for agent ${this.runtime.agentId} with config:`,
      this.config
    );

    if (this.config.LOAD_DOCS_ON_STARTUP) {
      this.loadInitialDocuments().catch((error) => {
        logger.error('Error during initial document loading in KnowledgeService:', error);
      });
    }
  }

  private async loadInitialDocuments(): Promise<void> {
    logger.info(
      `KnowledgeService: Checking for documents to load on startup for agent ${this.runtime.agentId}`
    );
    try {
      // Use a small delay to ensure runtime is fully ready if needed, though constructor implies it should be.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result: LoadResult = await loadDocsFromPath(this as any, this.runtime.agentId);
      if (result.successful > 0) {
        logger.info(
          `KnowledgeService: Loaded ${result.successful} documents from docs folder on startup for agent ${this.runtime.agentId}`
        );
      } else {
        logger.info(
          `KnowledgeService: No new documents found to load on startup for agent ${this.runtime.agentId}`
        );
      }
    } catch (error) {
      logger.error(
        `KnowledgeService: Error loading documents on startup for agent ${this.runtime.agentId}:`,
        error
      );
    }
  }

  /**
   * Start the Knowledge service
   * @param runtime Agent runtime
   * @returns Initialized Knowledge service
   */
  static async start(runtime: IAgentRuntime): Promise<KnowledgeService> {
    logger.info(`Starting Knowledge service for agent: ${runtime.agentId}`);
    const service = new KnowledgeService(runtime);

    // Process character knowledge AFTER service is initialized
    if (service.runtime.character?.knowledge && service.runtime.character.knowledge.length > 0) {
      logger.info(
        `KnowledgeService: Processing ${service.runtime.character.knowledge.length} character knowledge items.`
      );
      const stringKnowledge = service.runtime.character.knowledge.filter(
        (item): item is string => typeof item === 'string'
      );
      // Run in background, don't await here to prevent blocking startup
      service.processCharacterKnowledge(stringKnowledge).catch((err) => {
        logger.error(
          `KnowledgeService: Error processing character knowledge during startup: ${err.message}`,
          err
        );
      });
    } else {
      logger.info(
        `KnowledgeService: No character knowledge to process for agent ${runtime.agentId}.`
      );
    }
    return service;
  }

  /**
   * Stop the Knowledge service
   * @param runtime Agent runtime
   */
  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info(`Stopping Knowledge service for agent: ${runtime.agentId}`);
    const service = runtime.getService(KnowledgeService.serviceType) as
      | KnowledgeService
      | undefined;
    if (!service) {
      logger.warn(`KnowledgeService not found for agent ${runtime.agentId} during stop.`);
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    logger.info(`Knowledge service stopping for agent: ${this.runtime.agentId}`);
  }

  /**
   * Add knowledge to the system
   * @param options Knowledge options
   * @returns Promise with document processing result
   */
  async addKnowledge(options: AddKnowledgeOptions): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }> {
    const agentId = this.runtime.agentId as string;
    logger.info(
      `KnowledgeService (agent: ${agentId}) processing document for public addKnowledge: ${options.originalFilename}, type: ${options.contentType}`
    );

    // Check if document already exists in database using clientDocumentId as the primary key for "documents" table
    try {
      // The `getMemoryById` in runtime usually searches generic memories.
      // We need a way to specifically query the 'documents' table or ensure clientDocumentId is unique across all memories if used as ID.
      // For now, assuming clientDocumentId is the ID used when creating document memory.
      const existingDocument = await this.runtime.getMemoryById(options.clientDocumentId);
      if (existingDocument && existingDocument.metadata?.type === MemoryType.DOCUMENT) {
        logger.info(
          `Document ${options.originalFilename} with ID ${options.clientDocumentId} already exists. Skipping processing.`
        );

        // Count existing fragments for this document
        const fragments = await this.runtime.getMemories({
          tableName: 'knowledge',
          // Assuming fragments store original documentId in metadata.documentId
          // This query might need adjustment based on actual fragment metadata structure.
          // A more robust way would be to query where metadata.documentId === options.clientDocumentId
        });

        // Filter fragments related to this specific document
        const relatedFragments = fragments.filter(
          (f) =>
            f.metadata?.type === MemoryType.FRAGMENT &&
            (f.metadata as FragmentMetadata).documentId === options.clientDocumentId
        );

        return {
          clientDocumentId: options.clientDocumentId,
          storedDocumentMemoryId: existingDocument.id as UUID,
          fragmentCount: relatedFragments.length,
        };
      }
    } catch (error) {
      // Document doesn't exist or other error, continue with processing
      logger.debug(
        `Document ${options.clientDocumentId} not found or error checking existence, proceeding with processing: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this.processDocument(options);
  }

  /**
   * Process a document regardless of type - Called by public addKnowledge
   * @param options Document options
   * @returns Promise with document processing result
   */
  private async processDocument({
    clientDocumentId,
    contentType,
    originalFilename,
    worldId,
    content,
    roomId,
    entityId,
  }: AddKnowledgeOptions): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }> {
    const agentId = this.runtime.agentId as UUID;

    try {
      logger.debug(
        `KnowledgeService: Processing document ${originalFilename} (type: ${contentType}) via processDocument`
      );

      let fileBuffer: Buffer | null = null;
      let extractedText: string;
      const isPdfFile =
        contentType === 'application/pdf' || originalFilename.toLowerCase().endsWith('.pdf');
      const isBinaryFile = this.isBinaryContentType(contentType, originalFilename);

      if (isBinaryFile) {
        try {
          fileBuffer = Buffer.from(content, 'base64');
        } catch (e: any) {
          logger.error(
            `KnowledgeService: Failed to convert base64 to buffer for ${originalFilename}: ${e.message}`
          );
          throw new Error(`Invalid base64 content for binary file ${originalFilename}`);
        }
        extractedText = await extractTextFromDocument(fileBuffer, contentType, originalFilename);
      } else {
        extractedText = content;
      }

      if (!extractedText || extractedText.trim() === '') {
        const noTextError = new Error(
          `KnowledgeService: No text content extracted from ${originalFilename} (type: ${contentType}).`
        );
        logger.warn(noTextError.message);
        throw noTextError;
      }

      // Create document memory using the clientDocumentId as the memory ID
      const documentMemory = createDocumentMemory({
        text: isPdfFile ? content : extractedText, // Store base64 for PDF, text for others
        agentId,
        clientDocumentId, // This becomes the memory.id
        originalFilename,
        contentType,
        worldId,
        fileSize: fileBuffer ? fileBuffer.length : extractedText.length,
        documentId: clientDocumentId, // Explicitly set documentId in metadata as well
      });

      const memoryWithScope = {
        ...documentMemory,
        id: clientDocumentId, // Ensure the ID of the memory is the clientDocumentId
        roomId: roomId || agentId,
        entityId: entityId || agentId,
      };

      await this.runtime.createMemory(memoryWithScope, 'documents');

      logger.debug(
        `KnowledgeService: Stored document ${originalFilename} (Memory ID: ${memoryWithScope.id})`
      );

      const fragmentCount = await processFragmentsSynchronously({
        runtime: this.runtime,
        documentId: clientDocumentId, // Pass clientDocumentId to link fragments
        fullDocumentText: extractedText,
        agentId,
        contentType,
        roomId: roomId || agentId,
        entityId: entityId || agentId,
        worldId: worldId || agentId,
      });

      logger.info(
        `KnowledgeService: Document ${originalFilename} processed with ${fragmentCount} fragments for agent ${agentId}`
      );

      return {
        clientDocumentId,
        storedDocumentMemoryId: memoryWithScope.id as UUID,
        fragmentCount,
      };
    } catch (error: any) {
      logger.error(
        `KnowledgeService: Error processing document ${originalFilename}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Determines if a file should be treated as binary based on its content type and filename
   * @param contentType MIME type of the file
   * @param filename Original filename
   * @returns True if the file should be treated as binary (base64 encoded)
   */
  private isBinaryContentType(contentType: string, filename: string): boolean {
    const binaryContentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'image/',
      'audio/',
      'video/',
    ];

    // Check MIME type
    const isBinaryMimeType = binaryContentTypes.some((type) => contentType.includes(type));

    if (isBinaryMimeType) {
      return true;
    }

    // Check file extension as fallback
    const fileExt = filename.split('.').pop()?.toLowerCase() || '';
    const binaryExtensions = [
      'pdf',
      'docx',
      'doc',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'zip',
      'jpg',
      'jpeg',
      'png',
      'gif',
      'mp3',
      'mp4',
      'wav',
    ];

    return binaryExtensions.includes(fileExt);
  }

  // --- Knowledge methods moved from AgentRuntime ---

  private async handleProcessingError(error: any, context: string) {
    logger.error(`KnowledgeService: Error ${context}:`, error?.message || error || 'Unknown error');
    throw error;
  }

  async checkExistingKnowledge(knowledgeId: UUID): Promise<boolean> {
    // This checks if a specific memory (fragment or document) ID exists.
    // In the context of processCharacterKnowledge, knowledgeId is a UUID derived from the content.
    const existingDocument = await this.runtime.getMemoryById(knowledgeId);
    return !!existingDocument;
  }

  async getKnowledge(
    message: Memory,
    scope?: { roomId?: UUID; worldId?: UUID; entityId?: UUID }
  ): Promise<KnowledgeItem[]> {
    logger.debug('KnowledgeService: getKnowledge called for message id: ' + message.id);
    if (!message?.content?.text || message?.content?.text.trim().length === 0) {
      logger.warn('KnowledgeService: Invalid or empty message content for knowledge query.');
      return [];
    }

    const embedding = await this.runtime.useModel(ModelType.TEXT_EMBEDDING, {
      text: message.content.text,
    });

    const filterScope: { roomId?: UUID; worldId?: UUID; entityId?: UUID } = {};
    if (scope?.roomId) filterScope.roomId = scope.roomId;
    if (scope?.worldId) filterScope.worldId = scope.worldId;
    if (scope?.entityId) filterScope.entityId = scope.entityId;

    const fragments = await this.runtime.searchMemories({
      tableName: 'knowledge',
      embedding,
      query: message.content.text,
      ...filterScope,
      count: 20,
      match_threshold: 0.1, // TODO: Make configurable
    });

    return fragments
      .filter((fragment) => fragment.id !== undefined) // Ensure fragment.id is defined
      .map((fragment) => ({
        id: fragment.id as UUID, // Cast as UUID after filtering
        content: fragment.content as Content, // Cast if necessary, ensure Content type matches
        similarity: fragment.similarity,
        metadata: fragment.metadata,
        worldId: fragment.worldId,
      }));
  }

  async processCharacterKnowledge(items: string[]): Promise<void> {
    // Wait briefly to allow services to initialize fully
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logger.info(
      `KnowledgeService: Processing ${items.length} character knowledge items for agent ${this.runtime.agentId}`
    );

    const processingPromises = items.map(async (item) => {
      // ... existing code ...
    });

    logger.info(
      `KnowledgeService: Finished processing character knowledge for agent ${this.runtime.agentId}.`
    );
  }

  // ADDED METHODS START
  /**
   * Retrieves memories, typically documents, for the agent.
   * Corresponds to GET /plugins/knowledge/documents
   */
  async getMemories(params: {
    tableName: string; // Should be 'documents' for this service's context
    // agentId is implicit from this.runtime.agentId
    roomId?: UUID;
    count?: number;
    end?: number; // timestamp for "before"
  }): Promise<Memory[]> {
    if (params.tableName !== 'documents') {
      logger.warn(
        `KnowledgeService.getMemories called with tableName ${params.tableName}, but this service primarily manages 'documents'. Proceeding, but review usage.`
      );
      // Allow fetching from other tables if runtime.getMemories supports it broadly,
      // but log a warning.
    }
    return this.runtime.getMemories({
      ...params, // includes tableName, roomId, count, end
      agentId: this.runtime.agentId, // Ensure agentId is correctly scoped
    });
  }

  /**
   * Deletes a specific memory item (knowledge document) by its ID.
   * Corresponds to DELETE /plugins/knowledge/documents/:knowledgeId
   * Assumes the memoryId corresponds to an item in the 'documents' table or that
   * runtime.deleteMemory can correctly identify it.
   */
  async deleteMemory(memoryId: UUID): Promise<void> {
    // The core runtime.deleteMemory is expected to handle deletion.
    // If it needs a tableName, and we are sure it's 'documents', it could be passed.
    // However, the previous error indicated runtime.deleteMemory takes 1 argument.
    await this.runtime.deleteMemory(memoryId);
    logger.info(
      `KnowledgeService: Deleted memory ${memoryId} for agent ${this.runtime.agentId}. Assumed it was a document or related fragment.`
    );
  }
  // ADDED METHODS END
}
