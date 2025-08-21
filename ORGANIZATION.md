# KOI Project Organization

This document describes the organized directory structure for KOI files.

## Directory Structure

```
/opt/projects/plugin-knowledge-gaia/
├── docs/              # Documentation hub
│   ├── README.md          # Main documentation entry point
│   ├── QUICK-START.md     # 5-minute setup guide
│   ├── ARCHITECTURE.md    # System design overview
│   └── TESTING.md         # Comprehensive testing guide
│
├── scripts/           # Operational scripts
│   ├── koi-query-server.ts           # Main KOI server
│   ├── generate-koi-real-data.ts     # Bulk sync from database
│   ├── generate-koi-manifest.ts      # Generate test manifests
│   └── test-koi-queries.ts           # Query testing suite
│
├── src/              # Source code
│   ├── koi-registry/     # Registry system implementation
│   └── frontend/         # Web interface components
│
├── logs/             # Log files
│   ├── README.md             # Log management guide
│   ├── koi-server.log        # Current server logs
│   ├── koi-server-real.log   # Production server logs
│   └── koi-generation-*.log  # Bulk processing logs
│
├── manifests/        # Generated manifests
│   ├── README.md                     # Manifest documentation
│   ├── koi-manifest.jsonld          # Test manifest
│   ├── koi-manifest-real.jsonld     # Production manifest (37MB+)
│   ├── koi-query-manifest.json      # Test query config
│   └── koi-query-manifest-real.json # Production query config (5MB+)
│
├── reports/          # Analysis reports
│   ├── README.md                      # Report documentation
│   ├── koi-registry-report.md        # Test registry analysis
│   └── koi-registry-report-real.md   # Production registry analysis
│
├── tools/            # Utilities and maintenance
│   └── README.md         # Tool documentation
│
├── tests/            # Test suites
│   ├── README.md             # Testing documentation
│   └── test-koi-queries.ts  # Integration tests
│
└── examples/         # Usage examples
    └── README.md         # Example documentation
```

## Benefits of This Organization

### ✅ **Clear Separation**
- Operational files (logs, manifests, reports) separated from source code
- Documentation organized in dedicated docs/ directory
- Tools and utilities grouped together

### ✅ **No Root Clutter**
- All KOI-generated files moved to appropriate subdirectories
- Root directory only contains essential project files
- Easier to navigate and understand project structure

### ✅ **Better Maintenance**
- Each directory has its own README explaining purpose
- File types grouped logically
- Easier to find specific types of files

### ✅ **Scale-Friendly**
- Structure supports growth as KOI functionality expands
- Clear patterns for where new files should go
- Separation makes backup/cleanup easier

## File Size Considerations

Some directories contain large files:

- **manifests/**: Production manifests can be 37MB+ with full data
- **logs/**: Generation logs can be several MB
- **reports/**: Generally small (< 1MB)

## Script Updates

All scripts have been updated to use the new directory structure:

- Manifest generation → `manifests/`
- Report generation → `reports/`  
- Log output → `logs/`
- Documentation → `docs/`

## Migration Completed

- ✅ Moved all KOI files from root to organized directories
- ✅ Updated all script paths to use new locations
- ✅ Created README files for each directory
- ✅ Updated main documentation to reflect new structure
- ✅ Verified root directory is clean

This organization follows standard practices for larger projects and makes KOI easier to maintain and extend.