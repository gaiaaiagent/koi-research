# Knowledge Plugin for ElizaOS

This plugin provides Retrieval Augmented Generation (Knowledge) capabilities for ElizaOS agents, allowing them to load, index, and query knowledge from various sources.

## Quick Setup

> **⚠️ Note**: `TEXT_PROVIDER` and `TEXT_MODEL` configuration are temporarily disabled. The plugin currently uses `runtime.useModel(TEXT_LARGE)` for text generation. Full provider configuration support will be added soon.

### Basic Setup (With plugin-openai)

If you already have plugin-openai configured, you don't need any additional environment variables! The Knowledge plugin will automatically use your OpenAI configuration.

1. Make sure you have plugin-openai configured with:

   ```env
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   ```

2. Add the Knowledge plugin to your agent's configuration
3. That's it! The plugin will work without any additional variables

### Enabling Contextual Knowledge

If you want enhanced Knowledge capabilities with contextual embeddings, add:

> **Note**: The TEXT_PROVIDER and TEXT_MODEL settings below are temporarily disabled. The plugin will use `runtime.useModel(TEXT_LARGE)` for now.

```env
# Enable contextual Knowledge
CTX_KNOWLEDGE_ENABLED=true

# Required text generation settings (TEMPORARILY DISABLED)
TEXT_PROVIDER=openrouter  # Choose your provider: openai, anthropic, openrouter, or google
TEXT_MODEL=anthropic/claude-3.5-sonnet  # Model for your chosen provider

# Provider-specific API key (based on TEXT_PROVIDER)
OPENROUTER_API_KEY=your-openrouter-api-key
# OR ANTHROPIC_API_KEY=your-anthropic-api-key
# OR GOOGLE_API_KEY=your-google-api-key
# OR use existing OPENAI_API_KEY
```

### Custom Embedding Configuration (Without plugin-openai)

If you're not using plugin-openai or want to use different embedding settings:

```env
# Required embedding settings
EMBEDDING_PROVIDER=openai  # or google
TEXT_EMBEDDING_MODEL=text-embedding-3-small

# Provider-specific API key
OPENAI_API_KEY=your-openai-api-key  # if using openai
# OR GOOGLE_API_KEY=your-google-api-key  # if using google

# Optional: Custom embedding dimension
EMBEDDING_DIMENSION=1536
```

## Advanced Configuration

### Recommended Configurations for Contextual Knowledge

For optimal performance with contextual Knowledge, we recommend these provider combinations:

**Option 1: OpenRouter with Claude/Gemini (Best for cost efficiency)**

```env
# If using with plugin-openai, only need these additions:
CTX_KNOWLEDGE_ENABLED=true
TEXT_PROVIDER=openrouter
TEXT_MODEL=anthropic/claude-3.5-sonnet  # or google/gemini-2.5-flash-preview
OPENROUTER_API_KEY=your-openrouter-api-key
```

**Option 2: OpenAI for Everything**

```env
# If using with plugin-openai, only need these additions:
CTX_KNOWLEDGE_ENABLED=true
TEXT_PROVIDER=openai
TEXT_MODEL=gpt-4o
```

**Option 3: Google AI for Everything**

```env
EMBEDDING_PROVIDER=google
TEXT_EMBEDDING_MODEL=text-embedding-004
TEXT_PROVIDER=google
TEXT_MODEL=gemini-1.5-pro-latest
GOOGLE_API_KEY=your-google-api-key
CTX_KNOWLEDGE_ENABLED=true
```

### Advanced Rate Limiting Options

```env
# Rate limiting (optional)
MAX_CONCURRENT_REQUESTS=30  # Default: 30
REQUESTS_PER_MINUTE=60      # Default: 60
TOKENS_PER_MINUTE=150000    # Default: 150000
```

### Custom API Endpoints

```env
# Only needed if using custom API endpoints
OPENAI_BASE_URL=https://your-openai-proxy.com/v1
ANTHROPIC_BASE_URL=https://your-anthropic-proxy.com
OPENROUTER_BASE_URL=https://your-openrouter-proxy.com/api/v1
GOOGLE_BASE_URL=https://your-google-proxy.com
```

### Knowledge Document Path

By default, the plugin looks for knowledge documents in a `docs` folder in your project root. You can customize this location using the `KNOWLEDGE_PATH` environment variable:

```env
# Custom path to your knowledge documents
KNOWLEDGE_PATH=/path/to/your/documents

# Examples:
# KNOWLEDGE_PATH=./my-docs           # Relative path from project root
# KNOWLEDGE_PATH=/home/user/docs     # Absolute path
# KNOWLEDGE_PATH=../shared/knowledge # Relative path to parent directory
```

**How it works:**
- If `KNOWLEDGE_PATH` is set, the plugin will use that directory for loading knowledge documents
- If `KNOWLEDGE_PATH` is not set, the plugin defaults to `./docs` (a `docs` folder in your project root)
- Both relative and absolute paths are supported
- If the specified path doesn't exist, the plugin will log a warning but continue to function

**Supported document formats:**
- PDF files (`.pdf`)
- Text files (`.txt`, `.md`)
- And other formats supported by the document processor

### Token Limits

```env
# Advanced token handling (optional)
MAX_INPUT_TOKENS=4000   # Default: 4000
MAX_OUTPUT_TOKENS=4096  # Default: 4096
```

## Architecture

The plugin is built with a modular, clean architecture that follows SOLID principles:

```
packages/plugin-knowledge/
├── src/
│   ├── index.ts           # Main entry point and plugin definition
│   ├── service.ts         # Knowledge service implementation
│   ├── types.ts           # Type definitions
│   ├── llm.ts             # LLM interactions (text generation, embeddings)
│   ├── config.ts          # Configuration validation
│   ├── ctx-embeddings.ts  # Contextual embedding generation
│   ├── document-processor.ts # Shared document processing utilities
│   └── utils.ts           # Utility functions
├── README.md              # This file
└── package.json           # Package definition
```

### Database-Specific Processing Paths

The Knowledge plugin adapts to the database technology being used:

1. **PostgreSQL Mode**: Uses worker threads to offload document processing from the main thread
2. **PGLite Mode**: Uses synchronous processing in the main thread due to PGLite's single-threaded nature

This allows the plugin to work optimally with both databases while maintaining the same functionality.

### Processing Flow

The document processing flow follows these steps regardless of database type:

1. Extract text from the document based on content type
2. Store the main document in the database
3. Split the document into chunks
4. Generate embeddings for each chunk (with optional context enrichment)
5. Store the chunks with embeddings in the database

## Component Overview

- **KnowledgeService**: Core service that manages document processing and storage
- **Document Processor**: Provides shared document processing utilities for both processing paths

## Features

- Document upload and processing (PDF, text, and other formats)
- Contextual chunking and embedding generation
- Robust error handling and recovery
- Rate limiting to respect provider limitations
- Support for multiple LLM providers

## API Routes

The Knowledge plugin provides a comprehensive REST API for managing knowledge documents. All routes are prefixed with `/api/agents/{agentId}/plugins/knowledge`.

### Knowledge Panel UI

#### GET `/display`
Access the web-based knowledge management interface.

- **URL**: `/api/agents/{agentId}/plugins/knowledge/display`
- **Method**: GET
- **Public**: Yes
- **Description**: Serves the HTML frontend for managing knowledge documents
- **Response**: HTML page with embedded configuration

### Document Management

#### POST `/documents` - Upload Knowledge
Upload files or URLs to create knowledge documents.

**File Upload:**
```bash
curl -X POST \
  "/api/agents/{agentId}/plugins/knowledge/documents" \
  -H "Content-Type: multipart/form-data" \
  -F "files=@document.pdf" \
  -F "documentId=optional-custom-id" \
  -F "worldId=optional-world-id"
```

**URL Upload:**
```bash
curl -X POST \
  "/api/agents/{agentId}/plugins/knowledge/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrls": ["https://example.com/document.pdf"],
    "worldId": "optional-world-id"
  }'
```

**Request Parameters:**
- `files`: File(s) to upload (multipart)
- `fileUrl` or `fileUrls`: URL(s) to fetch content from (JSON)
- `documentId` or `documentIds`: Optional custom document IDs
- `worldId`: Optional world ID for scoping

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "document-uuid",
      "filename": "document.pdf",
      "status": "success",
      "fragmentCount": 15,
      "createdAt": 1703123456789
    }
  ]
}
```

**Supported File Types:**
- **Documents**: PDF, DOC, DOCX
- **Text**: TXT, MD, HTML, JSON, XML, YAML
- **Code**: JS, TS, PY, JAVA, C, CPP, CS, PHP, RB, GO, RS, and more
- **Config**: INI, CFG, CONF, ENV
- **Data**: CSV, TSV, LOG

#### GET `/documents` - List Documents
Retrieve all knowledge documents.

```bash
curl "/api/agents/{agentId}/plugins/knowledge/documents?limit=20&before=1703123456789&includeEmbedding=false"
```

**Query Parameters:**
- `limit`: Number of documents to return (default: 20)
- `before`: Timestamp for pagination (default: current time)
- `includeEmbedding`: Include embedding data (default: false)
- `fileUrls`: Filter by specific URLs (comma-separated)

**Response:**
```json
{
  "success": true,
  "data": {
    "memories": [
      {
        "id": "document-uuid",
        "content": { "text": "..." },
        "metadata": {
          "type": "document",
          "title": "Document Title",
          "filename": "document.pdf",
          "fileType": "application/pdf",
          "fileSize": 1024,
          "timestamp": 1703123456789,
          "source": "upload"
        },
        "createdAt": 1703123456789
      }
    ],
    "urlFiltered": false,
    "totalFound": 1,
    "totalRequested": 0
  }
}
```

#### GET `/documents/:knowledgeId` - Get Specific Document
Retrieve a specific knowledge document by ID.

```bash
curl "/api/agents/{agentId}/plugins/knowledge/documents/{documentId}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "document-uuid",
      "content": { "text": "..." },
      "metadata": { "..." },
      "createdAt": 1703123456789
    }
  }
}
```

#### DELETE `/documents/:knowledgeId` - Delete Document
Delete a knowledge document and all its fragments.

```bash
curl -X DELETE "/api/agents/{agentId}/plugins/knowledge/documents/{documentId}"
```

**Response:**
```json
{
  "success": true,
  "data": null
}
```

### Knowledge Fragments

#### GET `/knowledges` - List Knowledge Chunks
Retrieve knowledge fragments/chunks for detailed analysis or graph view.

```bash
curl "/api/agents/{agentId}/plugins/knowledge/knowledges?limit=100&documentId=optional-filter"
```

**Query Parameters:**
- `limit`: Number of chunks to return (default: 100)
- `before`: Timestamp for pagination (default: current time)
- `documentId`: Filter chunks by parent document ID

**Response:**
```json
{
  "success": true,
  "data": {
    "chunks": [
      {
        "id": "fragment-uuid",
        "content": { "text": "chunk content..." },
        "metadata": {
          "type": "fragment",
          "documentId": "parent-document-uuid",
          "position": 0,
          "timestamp": 1703123456789
        },
        "embedding": [0.1, 0.2, ...], // If included
        "createdAt": 1703123456789
      }
    ]
  }
}
```

## Usage

### Programmatic Usage

```typescript
import { KnowledgeService } from '@elizaos/plugin-knowledge';

// Add knowledge to an agent
const result = await knowledgeService.addKnowledge({
  clientDocumentId: 'unique-id',
  content: documentContent, // Base64 string for binary files or plain text for text files
  contentType: 'application/pdf',
  originalFilename: 'document.pdf',
  worldId: 'world-id',
  roomId: 'optional-room-id', // Optional scoping
  entityId: 'optional-entity-id', // Optional scoping
});

console.log(`Document stored with ID: ${result.storedDocumentMemoryId}`);
console.log(`Created ${result.fragmentCount} searchable fragments`);
```

## License

See the ElizaOS license for details.
