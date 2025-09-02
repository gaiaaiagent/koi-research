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
  Metadata,
} from '@elizaos/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  createDocumentMemory,
  extractTextFromDocument,
  processFragmentsSynchronously,
} from './document-processor.ts';
import { validateModelConfig } from './config';
import { AddKnowledgeOptions } from './types.ts';
import type { KnowledgeConfig, LoadResult } from './types';
import { loadDocsFromPath } from './docs-loader';
import { isBinaryContentType, looksLikeBase64, generateContentBasedId } from './utils.ts';

const parseBooleanEnv = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false; // Default to false if undefined or other type
};

/**
 * Knowledge Service - Provides retrieval augmented generation capabilities
 */
export class KnowledgeService extends Service {
  static readonly serviceType = 'knowledge';
  public override config: Metadata = {};
  private knowledgeConfig: KnowledgeConfig = {} as KnowledgeConfig;
  capabilityDescription =
    'Provides Retrieval Augmented Generation capabilities, including knowledge upload and querying.';

  private knowledgeProcessingSemaphore: Semaphore;

  /**
   * Create a new Knowledge service
   * @param runtime Agent runtime
   */
  constructor(runtime: IAgentRuntime, config?: Partial<KnowledgeConfig>) {
    super(runtime);
    console.log('[KNOWLEDGE-SERVICE] Constructor called');
    logger.info('[KNOWLEDGE] KnowledgeService constructor called');
    logger.info(`[KNOWLEDGE] Agent ID: ${runtime.agentId}`);
    logger.info(`[KNOWLEDGE] Service type: ${(this.constructor as any).serviceType}`);
    console.log('[KNOWLEDGE-SERVICE] Service instance created with serviceType:', (this.constructor as any).serviceType);
    this.knowledgeProcessingSemaphore = new Semaphore(10);
  }

  private async loadInitialDocuments(): Promise<void> {
    logger.info(
      `KnowledgeService: Checking for documents to load on startup for agent ${this.runtime.agentId}`
    );
    try {
      // Use a small delay to ensure runtime is fully ready if needed, though constructor implies it should be.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get the agent-specific knowledge path from runtime settings
      const knowledgePath = this.runtime.getSetting('KNOWLEDGE_PATH');

      const result: LoadResult = await loadDocsFromPath(
        this as any,
        this.runtime.agentId,
        undefined, // worldId
        knowledgePath
      );

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
        { error },
        `KnowledgeService: Error loading documents on startup for agent ${this.runtime.agentId}`
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

    logger.info('Initializing Knowledge Plugin...');
    let validatedConfig: any = {};
    try {
      // Validate the model configuration
      logger.info('Validating model configuration for Knowledge plugin...');

      logger.debug(`[Knowledge Plugin] INIT DEBUG:`);
      logger.debug(
        `[Knowledge Plugin] - process.env.CTX_KNOWLEDGE_ENABLED: '${process.env.CTX_KNOWLEDGE_ENABLED}'`
      );

      // just for debug/check
      const config = {
        CTX_KNOWLEDGE_ENABLED: parseBooleanEnv(runtime.getSetting('CTX_KNOWLEDGE_ENABLED')),
      };

      logger.debug(
        `[Knowledge Plugin] - config.CTX_KNOWLEDGE_ENABLED: '${config.CTX_KNOWLEDGE_ENABLED}'`
      );
      logger.debug(
        `[Knowledge Plugin] - runtime.getSetting('CTX_KNOWLEDGE_ENABLED'): '${runtime.getSetting('CTX_KNOWLEDGE_ENABLED')}'`
      );

      validatedConfig = validateModelConfig(runtime);

      // Help inform how this was detected
      const ctxEnabledFromEnv = parseBooleanEnv(process.env.CTX_KNOWLEDGE_ENABLED);
      const ctxEnabledFromRuntime = parseBooleanEnv(runtime.getSetting('CTX_KNOWLEDGE_ENABLED'));
      const ctxEnabledFromValidated = validatedConfig.CTX_KNOWLEDGE_ENABLED;

      // Use the most permissive check during initialization
      const finalCtxEnabled = ctxEnabledFromValidated;

      logger.debug(`[Knowledge Plugin] CTX_KNOWLEDGE_ENABLED sources:`);
      logger.debug(`[Knowledge Plugin] - From env: ${ctxEnabledFromEnv}`);
      logger.debug(`[Knowledge Plugin] - From runtime: ${ctxEnabledFromRuntime}`);
      logger.debug(`[Knowledge Plugin] - FINAL RESULT: ${finalCtxEnabled}`);

      // Log the operational mode
      if (finalCtxEnabled) {
        logger.info('Running in Contextual Knowledge mode with text generation capabilities.');
        logger.info(
          `Using ${validatedConfig.EMBEDDING_PROVIDER || 'auto-detected'} for embeddings and ${validatedConfig.TEXT_PROVIDER} for text generation.`
        );
        logger.info(`Text model: ${validatedConfig.TEXT_MODEL}`);
      } else {
        const usingPluginOpenAI = !process.env.EMBEDDING_PROVIDER;

        logger.warn(
          'Running in Basic Embedding mode - documents will NOT be enriched with context!'
        );
        logger.info('To enable contextual enrichment:');
        logger.info('   - Set CTX_KNOWLEDGE_ENABLED=true');
        logger.info('   - Configure TEXT_PROVIDER (anthropic/openai/openrouter/google)');
        logger.info('   - Configure TEXT_MODEL and API key');

        if (usingPluginOpenAI) {
          logger.info('Using auto-detected configuration from plugin-openai for embeddings.');
        } else {
          logger.info(
            `Using ${validatedConfig.EMBEDDING_PROVIDER} for embeddings with ${validatedConfig.TEXT_EMBEDDING_MODEL}.`
          );
        }
      }

      logger.info('Model configuration validated successfully.');
      logger.info(`Knowledge Plugin initialized for agent: ${runtime.character.name}`);

      logger.info(
        'Knowledge Plugin initialized. Frontend panel should be discoverable via its public route.'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Knowledge plugin');
      throw error;
    }

    const service = new KnowledgeService(runtime);
    service.config = validatedConfig; // as Metadata

    if (service.config.LOAD_DOCS_ON_STARTUP) {
      logger.info('LOAD_DOCS_ON_STARTUP is enabled. Loading documents from docs folder...');
      service.loadInitialDocuments().catch((error) => {
        logger.error({ error }, 'Error during initial document loading in KnowledgeService');
      });
    } else {
      logger.info('LOAD_DOCS_ON_STARTUP is disabled. Skipping automatic document loading.');
    }

    // Process character knowledge AFTER service is initialized
    if (service.runtime.character?.knowledge && service.runtime.character.knowledge.length > 0) {
      logger.info(
        `KnowledgeService: Processing ${service.runtime.character.knowledge.length} character knowledge items.`
      );
      const stringKnowledge = service.runtime.character.knowledge.filter(
        (item): item is string => typeof item === 'string'
      );
      // Run in background, don't await here to prevent blocking startup
      await service.processCharacterKnowledge(stringKnowledge).catch((err) => {
        logger.error(
          { error: err },
          'KnowledgeService: Error processing character knowledge during startup'
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
    const service = runtime.getService(KnowledgeService.serviceType);
    if (!service) {
      logger.warn(`KnowledgeService not found for agent ${runtime.agentId} during stop.`);
    }
    // If we need to perform specific cleanup on the KnowledgeService instance
    if (service instanceof KnowledgeService) {
      await service.stop();
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    logger.info(`Knowledge service stopping for agent: ${this.runtime.character?.name}`);
  }

  /**
   * Add knowledge to the system with semantic deduplication
   * @param options Knowledge options
   * @returns Promise with document processing result
   */
  async addKnowledge(options: AddKnowledgeOptions): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }> {
    // Use agentId from options if provided (from frontend), otherwise fall back to runtime
    const agentId = options.agentId || (this.runtime.agentId as UUID);
    // Extract other IDs from options, using agentId as fallback
    const roomId = options.roomId || agentId;
    const entityId = options.entityId || agentId;
    const worldId = options.worldId || agentId;

    // Generate content-based ID to ensure consistency
    const contentBasedId = generateContentBasedId(options.content, {
      includeFilename: options.originalFilename,
      contentType: options.contentType,
      maxChars: 2000, // Use first 2KB of content for ID generation
    }) as UUID;

    logger.info(`Processing "${options.originalFilename}" (${options.contentType})`);

    // Initialize deduplication logging
    const dedupLogPath = path.join(
      process.env.KNOWLEDGE_PATH || path.join(process.cwd(), 'knowledge'),
      '.deduplication'
    );
    if (!fs.existsSync(dedupLogPath)) {
      fs.mkdirSync(dedupLogPath, { recursive: true });
      fs.mkdirSync(path.join(dedupLogPath, 'reports'), { recursive: true });
      fs.mkdirSync(path.join(dedupLogPath, 'flagged'), { recursive: true });
      fs.mkdirSync(path.join(dedupLogPath, 'merged'), { recursive: true });
    }

    // Check if document already exists in database using content-based ID
    logger.debug(`[DEDUPLICATION] Agent ${agentId}: Checking if document "${options.originalFilename}" with ID ${contentBasedId} already exists`);
    try {
      const existingDocument = await this.runtime.getMemoryById(contentBasedId);
      if (existingDocument && existingDocument.metadata?.type === MemoryType.DOCUMENT) {
        logger.info(`[DEDUPLICATION] ✅ Agent ${agentId}: "${options.originalFilename}" already exists - skipping processing (reusing existing document)`);

        // Count existing fragments for this document
        // Get fragments - using a high enough limit to cover all fragments
        // With 13k docs @ avg 4 fragments = ~52k fragments max expected
        // Using 20k limit provides good performance while ensuring we get all fragments for any document
        const fragments = await this.runtime.getMemories({
          tableName: 'knowledge',
          count: 20000,  // High enough to get all current fragments (14k) with room for growth
        });
        });

        // Filter fragments related to this specific document
        const relatedFragments = fragments.filter(
          (f) =>
            f.metadata?.type === MemoryType.FRAGMENT &&
            (f.metadata as FragmentMetadata).documentId === contentBasedId
        );

        logger.debug(`[DEDUPLICATION] Agent ${agentId}: Found ${relatedFragments.length} existing fragments for document "${options.originalFilename}"`);

        // CRITICAL FIX: If document exists but has no fragments, it was incompletely processed
        if (relatedFragments.length === 0) {
          logger.warn(`[INCOMPLETE DOC] Document "${options.originalFilename}" has NO fragments - skipping for now`);
          return { success: false, error: "Document incomplete", documentId: contentBasedId };
        }
        
        // Create agent-scoped fragment references for RAG access
        let createdFragmentRefs = 0;
        for (const originalFragment of relatedFragments) {
          try {
            // Check if this agent already has a reference to this fragment
            const existingRef = await this.runtime.getMemories({
              tableName: 'knowledge',
              agentId: agentId,
              count: 100,  // Limit query
              roomId: roomId || agentId,
              // Use a deterministic ID for the agent-scoped reference
              // This ensures we don't create duplicate references if the agent processes the same file multiple times
            });
            
            // Check if reference already exists by looking for fragments with same documentId and current agent's roomId
            const hasExistingRef = existingRef.some(ref => 
              ref.metadata?.type === MemoryType.FRAGMENT &&
              (ref.metadata as FragmentMetadata).documentId === contentBasedId &&
              ref.roomId === (roomId || agentId)
            );
            
            if (!hasExistingRef) {
              // Create agent-scoped reference to the shared fragment
              const agentFragmentRef: Memory = {
                id: createUniqueUuid(this.runtime, originalFragment.id) as UUID, // New unique ID for the agent-scoped reference
                agentId: agentId,
                roomId: roomId || agentId, // Agent's scope
                entityId: entityId || agentId,
                worldId: worldId || agentId,
                content: originalFragment.content, // Same content
                embedding: originalFragment.embedding, // Reuse existing embedding!
                metadata: {
                  ...originalFragment.metadata,
                  // Keep the same documentId to maintain relationship
                  // But this fragment reference is scoped to the current agent
                },
                createdAt: Date.now(),
              };
              
              // Store the agent-scoped fragment reference
              await this.runtime.createMemory(agentFragmentRef, 'knowledge');
              createdFragmentRefs++;
              logger.debug(`[DEDUPLICATION] Agent ${agentId}: Created agent-scoped reference for fragment ${originalFragment.id}`);
            }
          } catch (error) {
            logger.error(`[DEDUPLICATION] Agent ${agentId}: Error creating fragment reference:`, error);
          }
        }
        
        logger.info(`[DEDUPLICATION] 🔗 Agent ${agentId}: Created ${createdFragmentRefs} agent-scoped references for "${options.originalFilename}" (reusing ${relatedFragments.length} existing embeddings)`);
        
        return {
          clientDocumentId: contentBasedId,
          storedDocumentMemoryId: existingDocument.id as UUID,
          fragmentCount: createdFragmentRefs, // Return count of references created
        };
      } else {
        logger.debug(`[DEDUPLICATION] ❌ Agent ${agentId}: Document "${options.originalFilename}" not found - will process new document`);
      }
    } catch (error) {
      // Document doesn't exist or other error, continue with processing
      logger.debug(
        `Document ${contentBasedId} not found or error checking existence, proceeding with semantic similarity check: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Semantic similarity check for near-duplicates
    try {
      const similarityCheck = await this.checkSemanticSimilarity(options.content, options.originalFilename);
      
      if (similarityCheck.isDuplicate) {
        logger.info(
          `"${options.originalFilename}" is semantically similar (${(similarityCheck.similarity * 100).toFixed(1)}%) to existing document - ${similarityCheck.action}`
        );

        // Log deduplication action
        const logEntry = {
          timestamp: new Date().toISOString(),
          action: similarityCheck.action.toUpperCase(),
          document: options.originalFilename,
          similarity: similarityCheck.similarity,
          existingId: similarityCheck.existingId,
          mergedMetadata: similarityCheck.mergedMetadata
        };

        fs.appendFileSync(
          path.join(dedupLogPath, 'deduplication.log'),
          `[${logEntry.timestamp}] ${logEntry.action}: ${logEntry.document} (${(logEntry.similarity * 100).toFixed(1)}% similar to ${logEntry.existingId})\n`
        );

        if (similarityCheck.action === 'merged') {
          // Save merge record
          const mergeRecord = {
            ...logEntry,
            originalContent: options.content.substring(0, 500) + '...'
          };
          fs.writeFileSync(
            path.join(dedupLogPath, 'merged', `${Date.now()}_${path.basename(options.originalFilename || 'unknown')}.json`),
            JSON.stringify(mergeRecord, null, 2)
          );

          // Return the existing document info
          return {
            clientDocumentId: similarityCheck.existingId as UUID,
            storedDocumentMemoryId: similarityCheck.existingId as UUID,
            fragmentCount: similarityCheck.fragmentCount || 0,
          };
        }

        if (similarityCheck.action === 'flagged') {
          // Save for review
          const flaggedRecord = {
            ...logEntry,
            instructions: 'Review this potential duplicate and decide whether to merge, skip, or process as new',
            contentPreview: options.content.substring(0, 1000) + '...'
          };
          fs.writeFileSync(
            path.join(dedupLogPath, 'flagged', `${Date.now()}_${path.basename(options.originalFilename || 'unknown')}.json`),
            JSON.stringify(flaggedRecord, null, 2)
          );
        }
      }
    } catch (error) {
      logger.warn(`Semantic similarity check failed, proceeding with normal processing: ${error}`);
    }

    // Process the document with the content-based ID
    return this.processDocument({
      ...options,
      clientDocumentId: contentBasedId,
    });
  }

  /**
   * Process a document regardless of type - Called by public addKnowledge
   * @param options Document options
   * @returns Promise with document processing result
   */
  private async processDocument({
    agentId: passedAgentId,
    clientDocumentId,
    contentType,
    originalFilename,
    worldId,
    content,
    roomId,
    entityId,
    metadata,
  }: AddKnowledgeOptions): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }> {
    // Use agentId from options if provided (from frontend), otherwise fall back to runtime
    const agentId = passedAgentId || (this.runtime.agentId as UUID);

    try {
      logger.debug(
        `KnowledgeService: Processing document ${originalFilename} (type: ${contentType}) via processDocument for agent: ${agentId}`
      );

      let fileBuffer: Buffer | null = null;
      let extractedText: string;
      let documentContentToStore: string;
      const isPdfFile =
        contentType === 'application/pdf' || originalFilename.toLowerCase().endsWith('.pdf');

      if (isPdfFile) {
        // For PDFs: extract text for fragments but store original base64 in main document
        try {
          fileBuffer = Buffer.from(content, 'base64');
        } catch (e: any) {
          logger.error(
            { error: e },
            `KnowledgeService: Failed to convert base64 to buffer for ${originalFilename}`
          );
          throw new Error(`Invalid base64 content for PDF file ${originalFilename}`);
        }
        extractedText = await extractTextFromDocument(fileBuffer, contentType, originalFilename);
        documentContentToStore = content; // Store base64 for PDFs
      } else if (isBinaryContentType(contentType, originalFilename)) {
        // For other binary files: extract text and store as plain text
        try {
          fileBuffer = Buffer.from(content, 'base64');
        } catch (e: any) {
          logger.error(
            { error: e },
            `KnowledgeService: Failed to convert base64 to buffer for ${originalFilename}`
          );
          throw new Error(`Invalid base64 content for binary file ${originalFilename}`);
        }
        extractedText = await extractTextFromDocument(fileBuffer, contentType, originalFilename);
        documentContentToStore = extractedText; // Store extracted text for non-PDF binary files
      } else {
        // For text files (including markdown): content is already plain text or needs decoding from base64
        // Routes always send base64, but docs-loader sends plain text

        // First, check if this looks like base64
        if (looksLikeBase64(content)) {
          try {
            // Try to decode from base64
            const decodedBuffer = Buffer.from(content, 'base64');
            // Check if it's valid UTF-8
            const decodedText = decodedBuffer.toString('utf8');

            // Verify the decoded text doesn't contain too many invalid characters
            const invalidCharCount = (decodedText.match(/\ufffd/g) || []).length;
            const textLength = decodedText.length;

            if (invalidCharCount > 0 && invalidCharCount / textLength > 0.1) {
              // More than 10% invalid characters, probably not a text file
              throw new Error('Decoded content contains too many invalid characters');
            }

            logger.debug(`Successfully decoded base64 content for text file: ${originalFilename}`);
            extractedText = decodedText;
            documentContentToStore = decodedText;
          } catch (e) {
            logger.error({ error: e as any }, `Failed to decode base64 for ${originalFilename}`);
            // If it looked like base64 but failed to decode properly, this is an error
            throw new Error(
              `File ${originalFilename} appears to be corrupted or incorrectly encoded`
            );
          }
        } else {
          // Content doesn't look like base64, treat as plain text
          logger.debug(`Treating content as plain text for file: ${originalFilename}`);
          extractedText = content;
          documentContentToStore = content;
        }
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
        text: documentContentToStore, // Store base64 only for PDFs, plain text for everything else
        agentId,
        clientDocumentId, // This becomes the memory.id
        originalFilename,
        contentType,
        worldId,
        fileSize: fileBuffer ? fileBuffer.length : extractedText.length,
        documentId: clientDocumentId, // Explicitly set documentId in metadata as well
        customMetadata: metadata, // Pass the custom metadata
      });

      const memoryWithScope = {
        ...documentMemory,
        id: clientDocumentId, // Ensure the ID of the memory is the clientDocumentId
        agentId: agentId,
        roomId: roomId || agentId,
        entityId: entityId || agentId,
      };

      logger.debug(
        `KnowledgeService: Creating memory with agentId=${agentId}, entityId=${entityId}, roomId=${roomId}, this.runtime.agentId=${this.runtime.agentId}`
      );
      logger.debug(
        `KnowledgeService: memoryWithScope agentId=${memoryWithScope.agentId}, entityId=${memoryWithScope.entityId}`
      );

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
        documentTitle: originalFilename,
      });

      logger.debug(`"${originalFilename}" stored with ${fragmentCount} fragments`);

      return {
        clientDocumentId,
        storedDocumentMemoryId: memoryWithScope.id as UUID,
        fragmentCount,
      };
    } catch (error: any) {
      logger.error(
        { error, stack: error.stack },
        `KnowledgeService: Error processing document ${originalFilename}`
      );
      throw error;
    }
  }

  // --- Knowledge methods moved from AgentRuntime ---

  private async handleProcessingError(error: any, context: string) {
    logger.error({ error }, `KnowledgeService: Error ${context}`);
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
    logger.info(`🔍 [KNOWLEDGE SERVICE] getKnowledge called for message id: ${message.id}`);
    logger.info(`🔍 [KNOWLEDGE SERVICE] Message text: "${message.content?.text}"`);
    logger.info(`🔍 [KNOWLEDGE SERVICE] Agent ID: ${this.runtime.agentId}`);
    
    if (!message?.content?.text || message?.content?.text.trim().length === 0) {
      logger.warn('🔍 [KNOWLEDGE SERVICE] Invalid or empty message content for knowledge query.');
      return [];
    }

    logger.info(`🔍 [KNOWLEDGE SERVICE] Generating embedding for text: "${message.content.text.substring(0, 100)}..."`);
    const embedding = await this.runtime.useModel(ModelType.TEXT_EMBEDDING, {
      text: message.content.text,
    });
    logger.info(`🔍 [KNOWLEDGE SERVICE] Embedding generated successfully: ${embedding.length} dimensions`);

    const filterScope: { roomId?: UUID; worldId?: UUID; entityId?: UUID } = {};
    if (scope?.roomId) filterScope.roomId = scope.roomId;
    if (scope?.worldId) filterScope.worldId = scope.worldId;
    if (scope?.entityId) filterScope.entityId = scope.entityId;
    
    logger.info(`🔍 [KNOWLEDGE SERVICE] Searching knowledge table with scope: ${JSON.stringify(filterScope)}`);

    const fragments = await this.runtime.searchMemories({
      tableName: 'knowledge',
      embedding,
      query: message.content.text,
      ...filterScope,
      count: 20,
      match_threshold: 0.1, // TODO: Make configurable
    });

    logger.info(`🔍 [KNOWLEDGE SERVICE] Search returned ${fragments.length} fragments`);
    if (fragments.length > 0) {
      logger.info(`🔍 [KNOWLEDGE SERVICE] Top fragment similarity: ${fragments[0]?.similarity}, content preview: "${fragments[0]?.content?.text?.substring(0, 100)}..."`);
    } else {
      logger.warn(`🔍 [KNOWLEDGE SERVICE] No fragments found for query: "${message.content.text}"`);
    }

    const result = fragments
      .filter((fragment) => fragment.id !== undefined) // Ensure fragment.id is defined
      .map((fragment) => ({
        id: fragment.id as UUID, // Cast as UUID after filtering
        content: fragment.content as Content, // Cast if necessary, ensure Content type matches
        similarity: fragment.similarity,
        metadata: fragment.metadata,
        worldId: fragment.worldId,
      }));
      
    logger.info(`🔍 [KNOWLEDGE SERVICE] Returning ${result.length} knowledge items`);
    return result;
  }

  /**
   * Enrich a conversation memory with RAG metadata
   * This can be called after response generation to add RAG tracking data
   * @param memoryId The ID of the conversation memory to enrich
   * @param ragMetadata The RAG metadata to add
   */
  async enrichConversationMemoryWithRAG(
    memoryId: UUID,
    ragMetadata: {
      retrievedFragments: Array<{
        fragmentId: UUID;
        documentTitle: string;
        similarityScore?: number;
        contentPreview: string;
      }>;
      queryText: string;
      totalFragments: number;
      retrievalTimestamp: number;
    }
  ): Promise<void> {
    try {
      // Get the existing memory
      const existingMemory = await this.runtime.getMemoryById(memoryId);
      if (!existingMemory) {
        logger.warn(`Cannot enrich memory ${memoryId} - memory not found`);
        return;
      }

      // Add RAG metadata to the memory
      const updatedMetadata = {
        ...existingMemory.metadata,
        knowledgeUsed: true, // Simple flag for UI to detect RAG usage
        ragUsage: {
          retrievedFragments: ragMetadata.retrievedFragments,
          queryText: ragMetadata.queryText,
          totalFragments: ragMetadata.totalFragments,
          retrievalTimestamp: ragMetadata.retrievalTimestamp,
          usedInResponse: true,
        },
        timestamp: existingMemory.metadata?.timestamp || Date.now(),
        type: existingMemory.metadata?.type || 'message',
      };

      // Update the memory
      await this.runtime.updateMemory({
        id: memoryId,
        metadata: updatedMetadata,
      });

      logger.debug(
        `Enriched conversation memory ${memoryId} with RAG data: ${ragMetadata.totalFragments} fragments`
      );
    } catch (error: any) {
      logger.warn(
        `Failed to enrich conversation memory ${memoryId} with RAG data: ${error.message}`
      );
    }
  }

  /**
   * Set the current response memory ID for RAG tracking
   * This is called by the knowledge provider to track which response memory to enrich
   */
  private pendingRAGEnrichment: Array<{
    ragMetadata: any;
    timestamp: number;
  }> = [];

  /**
   * Store RAG metadata for the next conversation memory that gets created
   * @param ragMetadata The RAG metadata to associate with the next memory
   */
  setPendingRAGMetadata(ragMetadata: any): void {
    // Clean up old pending enrichments (older than 30 seconds)
    const now = Date.now();
    this.pendingRAGEnrichment = this.pendingRAGEnrichment.filter(
      (entry) => now - entry.timestamp < 30000
    );

    // Add new pending enrichment
    this.pendingRAGEnrichment.push({
      ragMetadata,
      timestamp: now,
    });

    logger.debug(`Stored pending RAG metadata for next conversation memory`);
  }

  /**
   * Try to enrich recent conversation memories with pending RAG metadata
   * This is called periodically to catch memories that were created after RAG retrieval
   */
  async enrichRecentMemoriesWithPendingRAG(): Promise<void> {
    if (this.pendingRAGEnrichment.length === 0) {
      return;
    }

    try {
      // Get recent conversation memories (last 10 seconds)
      const recentMemories = await this.runtime.getMemories({
        tableName: 'messages',
        count: 10,
      });

      const now = Date.now();
      const recentConversationMemories = recentMemories
        .filter(
          (memory) =>
            memory.metadata?.type === 'message' &&
            now - (memory.createdAt || 0) < 10000 && // Created in last 10 seconds
            !(memory.metadata as any)?.ragUsage // Doesn't already have RAG data
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Most recent first

      // Match pending RAG metadata with recent memories
      for (const pendingEntry of this.pendingRAGEnrichment) {
        // Find a memory created after this RAG metadata was generated
        const matchingMemory = recentConversationMemories.find(
          (memory) => (memory.createdAt || 0) > pendingEntry.timestamp
        );

        if (matchingMemory && matchingMemory.id) {
          await this.enrichConversationMemoryWithRAG(matchingMemory.id, pendingEntry.ragMetadata);

          // Remove this pending enrichment
          const index = this.pendingRAGEnrichment.indexOf(pendingEntry);
          if (index > -1) {
            this.pendingRAGEnrichment.splice(index, 1);
          }
        }
      }
    } catch (error: any) {
      logger.warn(`Error enriching recent memories with RAG data: ${error.message}`);
    }
  }

  async processCharacterKnowledge(items: string[]): Promise<void> {
    // Wait briefly to allow services to initialize fully
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logger.info(
      `KnowledgeService: Processing ${items.length} character knowledge items for agent ${this.runtime.agentId}`
    );

    const processingPromises = items.map(async (item) => {
      await this.knowledgeProcessingSemaphore.acquire();
      try {
        // Generate content-based ID for character knowledge
        const knowledgeId = generateContentBasedId(item, {
          maxChars: 2000, // Use first 2KB of content
          includeFilename: 'character-knowledge', // A constant identifier for character knowledge
        }) as UUID;

        if (await this.checkExistingKnowledge(knowledgeId)) {
          logger.debug(
            `KnowledgeService: Character knowledge item with ID ${knowledgeId} already exists. Skipping.`
          );
          return;
        }

        logger.debug(
          `KnowledgeService: Processing character knowledge for ${this.runtime.character?.name} - ${item.slice(0, 100)}`
        );

        let metadata: MemoryMetadata = {
          type: MemoryType.DOCUMENT, // Character knowledge often represents a doc/fact.
          timestamp: Date.now(),
          source: 'character', // Indicate the source
        };

        const pathMatch = item.match(/^Path: (.+?)(?:\n|\r\n)/);
        if (pathMatch) {
          const filePath = pathMatch[1].trim();
          const extension = filePath.split('.').pop() || '';
          const filename = filePath.split('/').pop() || '';
          const title = filename.replace(`.${extension}`, '');
          metadata = {
            ...metadata,
            path: filePath,
            filename: filename,
            fileExt: extension,
            title: title,
            fileType: `text/${extension || 'plain'}`, // Assume text if not specified
            fileSize: item.length,
          };
        }

        // Using _internalAddKnowledge for character knowledge
        await this._internalAddKnowledge(
          {
            id: knowledgeId, // Use the content-based ID
            content: {
              text: item,
            },
            metadata,
          },
          undefined,
          {
            // Scope to the agent itself for character knowledge
            roomId: this.runtime.agentId,
            entityId: this.runtime.agentId,
            worldId: this.runtime.agentId,
          }
        );
      } catch (error) {
        await this.handleProcessingError(error, 'processing character knowledge');
      } finally {
        this.knowledgeProcessingSemaphore.release();
      }
    });

    await Promise.all(processingPromises);
    logger.info(
      `KnowledgeService: Finished processing character knowledge for agent ${this.runtime.agentId}.`
    );
  }

  async _internalAddKnowledge(
    item: KnowledgeItem, // item.id here is expected to be the ID of the "document"
    options = {
      targetTokens: 1500, // TODO: Make these configurable, perhaps from plugin config
      overlap: 200,
      modelContextSize: 4096,
    },
    scope = {
      // Default scope for internal additions (like character knowledge)
      roomId: this.runtime.agentId,
      entityId: this.runtime.agentId,
      worldId: this.runtime.agentId,
    }
  ): Promise<void> {
    const finalScope = {
      roomId: scope?.roomId ?? this.runtime.agentId,
      worldId: scope?.worldId ?? this.runtime.agentId,
      entityId: scope?.entityId ?? this.runtime.agentId,
    };

    logger.debug(`KnowledgeService: _internalAddKnowledge called for item ID ${item.id}`);

    // For _internalAddKnowledge, we assume item.content.text is always present
    // and it's not a binary file needing Knowledge plugin's special handling for extraction.
    // This path is for already-textual content like character knowledge or direct text additions.

    const documentMemory: Memory = {
      id: item.id, // This ID should be the unique ID for the document being added.
      agentId: this.runtime.agentId,
      roomId: finalScope.roomId,
      worldId: finalScope.worldId,
      entityId: finalScope.entityId,
      content: item.content,
      metadata: {
        ...(item.metadata || {}), // Spread existing metadata
        type: MemoryType.DOCUMENT, // Ensure it's marked as a document
        documentId: item.id, // Ensure metadata.documentId is set to the item's ID
        timestamp: item.metadata?.timestamp || Date.now(),
      },
      createdAt: Date.now(),
    };

    const existingDocument = await this.runtime.getMemoryById(item.id);
    if (existingDocument) {
      logger.debug(
        `KnowledgeService: Document ${item.id} already exists in _internalAddKnowledge, updating...`
      );
      await this.runtime.updateMemory({
        ...documentMemory,
        id: item.id, // Ensure ID is passed for update
      });
    } else {
      await this.runtime.createMemory(documentMemory, 'documents');
    }

    const fragments = await this.splitAndCreateFragments(
      item, // item.id is the documentId
      options.targetTokens,
      options.overlap,
      finalScope
    );

    let fragmentsProcessed = 0;
    for (const fragment of fragments) {
      try {
        await this.processDocumentFragment(fragment); // fragment already has metadata.documentId from splitAndCreateFragments
        fragmentsProcessed++;
      } catch (error) {
        logger.error(
          { error },
          `KnowledgeService: Error processing fragment ${fragment.id} for document ${item.id}`
        );
      }
    }
    logger.debug(
      `KnowledgeService: Processed ${fragmentsProcessed}/${fragments.length} fragments for document ${item.id}.`
    );
  }

  private async processDocumentFragment(fragment: Memory): Promise<void> {
    try {
      // Add embedding to the fragment
      // Runtime's addEmbeddingToMemory will use runtime.useModel(ModelType.TEXT_EMBEDDING, ...)
      await this.runtime.addEmbeddingToMemory(fragment);

      // Store the fragment in the knowledge table
      await this.runtime.createMemory(fragment, 'knowledge');
    } catch (error) {
      logger.error({ error }, `KnowledgeService: Error processing fragment ${fragment.id}`);
      throw error;
    }
  }

  private async splitAndCreateFragments(
    document: KnowledgeItem, // document.id is the ID of the parent document
    targetTokens: number,
    overlap: number,
    scope: { roomId: UUID; worldId: UUID; entityId: UUID }
  ): Promise<Memory[]> {
    if (!document.content.text) {
      return [];
    }

    const text = document.content.text;
    // TODO: Consider using DEFAULT_CHUNK_TOKEN_SIZE and DEFAULT_CHUNK_OVERLAP_TOKENS from ctx-embeddings
    // For now, using passed in values or defaults from _internalAddKnowledge.
    const chunks = await splitChunks(text, targetTokens, overlap);

    return chunks.map((chunk, index) => {
      // Create a unique ID for the fragment based on document ID, index, and timestamp
      const fragmentIdContent = `${document.id}-fragment-${index}-${Date.now()}`;
      const fragmentId = createUniqueUuid(
        this.runtime.agentId + fragmentIdContent,
        fragmentIdContent
      );

      return {
        id: fragmentId,
        entityId: scope.entityId,
        agentId: this.runtime.agentId,
        roomId: scope.roomId,
        worldId: scope.worldId,
        content: {
          text: chunk,
        },
        metadata: {
          ...(document.metadata || {}), // Spread metadata from parent document
          type: MemoryType.FRAGMENT,
          documentId: document.id, // Link fragment to parent document
          position: index,
          timestamp: Date.now(), // Fragment's own creation timestamp
          // Ensure we don't overwrite essential fragment metadata with document's
          // For example, source might be different or more specific for the fragment.
          // Here, we primarily inherit and then set fragment-specifics.
        },
        createdAt: Date.now(),
      };
    });
  }

  // ADDED METHODS START
  /**
   * Retrieves memories, typically documents, for the agent.
   * Corresponds to GET /plugins/knowledge/documents
   */
  async getMemories(params: {
    tableName: string; // Should be 'documents' or 'knowledge' for this service
    roomId?: UUID;
    count?: number;
    end?: number; // timestamp for "before"
  }): Promise<Memory[]> {
    return this.runtime.getMemories({
      ...params, // includes tableName, roomId, count, end
      agentId: this.runtime.agentId,
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

  /**
   * Check semantic similarity with existing knowledge
   * @param content The content to check
   * @param filename The filename being processed
   * @returns Similarity check result
   */
  private async checkSemanticSimilarity(
    content: string, 
    filename?: string
  ): Promise<{
    isDuplicate: boolean;
    similarity: number;
    existingId?: string;
    action?: 'merged' | 'skipped' | 'flagged';
    fragmentCount?: number;
    mergedMetadata?: any;
  }> {
    try {
      // For now, use a simple approach - check if similar content exists
      // In production, this would use pgvector similarity search
      
      logger.debug(`Checking semantic similarity for ${filename}...`);
      
      // Get recent document memories to check against
      const recentMemories = await this.runtime.getMemories({
        tableName: 'documents',
        count: 100, // Check last 100 entries
      });
      
      logger.debug(`Found ${recentMemories.length} existing documents to compare against`);

      // Simple text similarity check (Jaccard similarity on words)
      const contentWords = new Set(content.toLowerCase().split(/\s+/).slice(0, 500));
      let maxSimilarity = 0;
      let mostSimilarId = null;

      for (const memory of recentMemories) {
        if (memory.metadata?.type === MemoryType.FRAGMENT) {
          const memoryText = memory.content?.text || '';
          const memoryWords = new Set(memoryText.toLowerCase().split(/\s+/).slice(0, 500));
          
          // Calculate Jaccard similarity
          const intersection = new Set([...contentWords].filter(x => memoryWords.has(x)));
          const union = new Set([...contentWords, ...memoryWords]);
          const similarity = intersection.size / union.size;

          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            mostSimilarId = memory.id;
            
            // Log high similarity matches
            if (similarity > 0.8) {
              logger.info(`High similarity detected: ${(similarity * 100).toFixed(1)}% between "${filename}" and document ${memory.id}`);
            }
          }
        }
      }

      // Determine action based on similarity
      if (maxSimilarity > 0.95) {
        return {
          isDuplicate: true,
          similarity: maxSimilarity,
          existingId: mostSimilarId,
          action: 'skipped',
        };
      } else if (maxSimilarity > 0.85) {
        // Merge metadata for high similarity
        return {
          isDuplicate: true,
          similarity: maxSimilarity,
          existingId: mostSimilarId,
          action: 'merged',
          mergedMetadata: {
            additionalSource: filename,
            mergedAt: new Date().toISOString(),
          }
        };
      } else if (maxSimilarity > 0.75) {
        // Flag for review for borderline cases
        return {
          isDuplicate: true,
          similarity: maxSimilarity,
          existingId: mostSimilarId,
          action: 'flagged',
        };
      }

      // Not a duplicate
      return {
        isDuplicate: false,
        similarity: maxSimilarity,
      };

    } catch (error) {
      logger.error(`Error in semantic similarity check: ${error}`);
      // On error, return not duplicate to allow processing
      return {
        isDuplicate: false,
        similarity: 0,
      };
    }
  }
  // ADDED METHODS END
}
