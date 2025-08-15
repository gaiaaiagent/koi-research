#!/bin/bash
# Build only the plugin part, not the UI

echo "Building plugin-knowledge without UI components..."

# Clean previous build
rm -rf dist

# Build only with tsup (no vite)
bun run tsup

echo "Plugin build complete!"