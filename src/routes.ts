import type { IAgentRuntime, Route, UUID, Memory, KnowledgeItem } from '@elizaos/core';
import { MemoryType, createUniqueUuid, logger } from '@elizaos/core';
import { KnowledgeService } from './service';
import fs from 'node:fs'; // For file operations in upload
import path from 'node:path'; // For path operations

// Helper to send success response
function sendSuccess(res: any, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, data }));
}

// Helper to send error response
function sendError(res: any, status: number, code: string, message: string, details?: string) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: { code, message, details } }));
}

// Helper to clean up a single file
const cleanupFile = (filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.error(`Error cleaning up file ${filePath}:`, error);
    }
  }
};

// Helper to clean up multiple files
const cleanupFiles = (files: Express.Multer.File[]) => {
  if (files) {
    files.forEach((file) => cleanupFile(file.path));
  }
};

async function uploadKnowledgeHandler(req: any, res: any, runtime: IAgentRuntime) {
  const service = runtime.getService<KnowledgeService>(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, 'SERVICE_NOT_FOUND', 'KnowledgeService not found');
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return sendError(res, 400, 'NO_FILES', 'No files uploaded');
  }

  try {
    const processingPromises = files.map(async (file, index) => {
      let knowledgeId: UUID;
      const originalFilename = file.originalname;
      const worldId = (req.body.worldId as UUID) || runtime.agentId;
      const filePath = file.path;

      knowledgeId =
        (req.body?.documentIds && req.body.documentIds[index]) ||
        req.body?.documentId ||
        (createUniqueUuid(runtime, `knowledge-${originalFilename}-${Date.now()}`) as UUID);

      try {
        const fileBuffer = await fs.promises.readFile(filePath);
        const fileExt = file.originalname.split('.').pop()?.toLowerCase() || '';
        const filename = file.originalname;
        const title = filename.replace(`.${fileExt}`, '');
        const base64Content = fileBuffer.toString('base64');

        const knowledgeItem: KnowledgeItem = {
          id: knowledgeId,
          content: {
            text: base64Content,
          },
          metadata: {
            type: MemoryType.DOCUMENT,
            timestamp: Date.now(),
            source: 'upload',
            filename: filename,
            fileExt: fileExt,
            title: title,
            path: originalFilename,
            fileType: file.mimetype,
            fileSize: file.size,
          } as import('@elizaos/core').CustomMetadata,
        };

        // Construct AddKnowledgeOptions directly using available variables
        const addKnowledgeOpts: import('./types.ts').AddKnowledgeOptions = {
          clientDocumentId: knowledgeId, // This is knowledgeItem.id
          contentType: file.mimetype, // Directly from multer file object
          originalFilename: originalFilename, // Directly from multer file object
          content: base64Content, // The base64 string of the file
          worldId,
          roomId: runtime.agentId, // Or a more specific room ID if available
          entityId: runtime.agentId,
        };

        await service.addKnowledge(addKnowledgeOpts);

        cleanupFile(filePath);
        return {
          id: knowledgeId,
          filename: originalFilename,
          type: file.mimetype,
          size: file.size,
          uploadedAt: Date.now(),
          status: 'success',
        };
      } catch (fileError: any) {
        logger.error(
          `[KNOWLEDGE UPLOAD HANDLER] Error processing file ${file.originalname}: ${fileError}`
        );
        cleanupFile(filePath);
        return {
          id: knowledgeId,
          filename: originalFilename,
          status: 'error_processing',
          error: fileError.message,
        };
      }
    });

    const results = await Promise.all(processingPromises);
    sendSuccess(res, results);
  } catch (error: any) {
    logger.error('[KNOWLEDGE UPLOAD HANDLER] Error uploading knowledge:', error);
    cleanupFiles(files);
    sendError(res, 500, 'UPLOAD_ERROR', 'Failed to upload knowledge', error.message);
  }
}

async function getKnowledgeDocumentsHandler(req: any, res: any, runtime: IAgentRuntime) {
  const service = runtime.getService<KnowledgeService>(KnowledgeService.serviceType);
  if (!service) {
    return sendError(
      res,
      500,
      'SERVICE_NOT_FOUND',
      'KnowledgeService not found for getKnowledgeDocumentsHandler'
    );
  }

  try {
    const limit = req.query.limit ? Number.parseInt(req.query.limit as string, 10) : 20;
    const before = req.query.before ? Number.parseInt(req.query.before as string, 10) : Date.now();
    const includeEmbedding = req.query.includeEmbedding === 'true';

    const memories = await service.getMemories({
      tableName: 'documents',
      count: limit,
      end: before,
    });

    const cleanMemories = includeEmbedding
      ? memories
      : memories.map((memory: Memory) => ({
          ...memory,
          embedding: undefined,
        }));
    sendSuccess(res, { memories: cleanMemories });
  } catch (error: any) {
    logger.error('[KNOWLEDGE GET HANDLER] Error retrieving documents:', error);
    sendError(res, 500, 'RETRIEVAL_ERROR', 'Failed to retrieve documents', error.message);
  }
}

async function deleteKnowledgeDocumentHandler(req: any, res: any, runtime: IAgentRuntime) {
  const service = runtime.getService<KnowledgeService>(KnowledgeService.serviceType);
  if (!service) {
    return sendError(
      res,
      500,
      'SERVICE_NOT_FOUND',
      'KnowledgeService not found for deleteKnowledgeDocumentHandler'
    );
  }

  // slice out the part of the url after /documents/
  const knowledgeId = req.path.split('/documents/')[1];

  if (!knowledgeId || knowledgeId.length < 36) {
    return sendError(res, 400, 'INVALID_ID', 'Invalid Knowledge ID format');
  }

  try {
    await service.deleteMemory(knowledgeId);
    sendSuccess(res, null, 204);
  } catch (error: any) {
    logger.error(`[KNOWLEDGE DELETE HANDLER] Error deleting document ${knowledgeId}:`, error);
    sendError(res, 500, 'DELETE_ERROR', 'Failed to delete document', error.message);
  }
}

// Handler for the panel itself - serves the actual HTML frontend
async function knowledgePanelHandler(req: any, res: any, runtime: IAgentRuntime) {
  try {
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    // Serve the main index.html from Vite's build output
    const frontendPath = path.join(currentDir, '../dist/index.html');

    if (fs.existsSync(frontendPath)) {
      const html = await fs.promises.readFile(frontendPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      // Fallback: serve a basic HTML page that loads the JS bundle from the assets folder
      // NOTE: The filenames for JS and CSS will have hashes. This needs to be dynamic
      // or the Vite config adjusted for fixed names if this fallback is critical.
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge</title>
    <link rel="stylesheet" href="./assets/index-BlRATUqY.css">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .loading { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div id="knowledge-root">
            <div class="loading">Loading Knowledge Library...</div>
        </div>
    </div>
    <script type="module" src="./assets/index-7riujMow.js"></script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    }
  } catch (error: any) {
    logger.error('[KNOWLEDGE PANEL] Error serving frontend:', error);
    sendError(res, 500, 'FRONTEND_ERROR', 'Failed to load knowledge panel', error.message);
  }
}

// Generic handler to serve static assets from the dist/assets directory
async function frontendAssetHandler(req: any, res: any, runtime: IAgentRuntime) {
  try {
    logger.debug(
      `[KNOWLEDGE ASSET HANDLER] Called with req.path: ${req.path}, req.originalUrl: ${req.originalUrl}, req.params: ${JSON.stringify(req.params)}`
    );
    const currentDir = path.dirname(new URL(import.meta.url).pathname);

    const assetRequestPath = req.path; // This is the full path, e.g., /api/agents/X/plugins/knowledge/assets/file.js
    const assetsMarker = '/assets/';
    const assetsStartIndex = assetRequestPath.indexOf(assetsMarker);

    let assetName = null;
    if (assetsStartIndex !== -1) {
      assetName = assetRequestPath.substring(assetsStartIndex + assetsMarker.length);
    }

    if (!assetName || assetName.includes('..')) {
      // Basic sanitization
      return sendError(
        res,
        400,
        'BAD_REQUEST',
        `Invalid asset name: '${assetName}' from path ${assetRequestPath}`
      );
    }

    const assetPath = path.join(currentDir, '../dist/assets', assetName);
    logger.debug(`[KNOWLEDGE ASSET HANDLER] Attempting to serve asset: ${assetPath}`);

    if (fs.existsSync(assetPath)) {
      const fileStream = fs.createReadStream(assetPath);
      let contentType = 'application/octet-stream'; // Default
      if (assetPath.endsWith('.js')) {
        contentType = 'application/javascript';
      } else if (assetPath.endsWith('.css')) {
        contentType = 'text/css';
      }
      res.writeHead(200, { 'Content-Type': contentType });
      fileStream.pipe(res);
    } else {
      sendError(res, 404, 'NOT_FOUND', `Asset not found: ${req.url}`);
    }
  } catch (error: any) {
    logger.error(`[KNOWLEDGE ASSET HANDLER] Error serving asset ${req.url}:`, error);
    sendError(res, 500, 'ASSET_ERROR', `Failed to load asset ${req.url}`, error.message);
  }
}

export const knowledgeRoutes: Route[] = [
  {
    type: 'GET',
    name: 'Knowledge',
    path: '/display',
    handler: knowledgePanelHandler,
    public: true,
  },
  {
    type: 'GET',
    path: '/assets/*',
    handler: frontendAssetHandler,
  },
  {
    type: 'POST',
    path: '/upload',
    handler: uploadKnowledgeHandler,
    isMultipart: true,
  },
  {
    type: 'GET',
    path: '/documents',
    handler: getKnowledgeDocumentsHandler,
  },
  {
    type: 'DELETE',
    path: '/documents/*',
    handler: deleteKnowledgeDocumentHandler,
  },
];
