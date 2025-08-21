# KOI Manifests

Generated manifests and metadata files for KOI content.

## Manifest Types

### Knowledge Manifests
- **`koi-manifest.jsonld`** - Test/development manifest
- **`koi-manifest-real.jsonld`** - Production manifest (37MB+ with full data)

### Query Manifests
- **`koi-query-manifest.json`** - Test query configuration
- **`koi-query-manifest-real.json`** - Production query configuration (5MB+ with full data)

## Usage

### Viewing Manifests
```bash
# View manifest structure
jq '.@context' manifests/koi-manifest.jsonld

# Count content items
jq '.contentItems | length' manifests/koi-query-manifest-real.json

# Check manifest version
jq '.version' manifests/koi-query-manifest.json
```

### Generating New Manifests
```bash
# Generate test manifest
bun scripts/generate-koi-manifest-production.ts --test

# Generate full production manifest
bun scripts/generate-koi-manifest-production.ts --production
```

## File Sizes

- Test manifests: ~40KB (sample data)
- Production manifests: 37MB+ (full knowledge base)
- Query manifests: 5MB+ (full agent configurations)

## Format

Manifests follow JSON-LD specification for structured data interchange.