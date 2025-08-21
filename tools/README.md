# KOI Tools & Utilities

Operational tools for managing and maintaining KOI.

## Available Tools

### Data Management
- **`generate-koi-real-data.ts`** (in scripts/) - Bulk sync existing documents
- **`generate-koi-manifest-production.ts`** (in scripts/) - Generate production manifests
- **`analyze-previous-run.cjs`** - Analyze processing logs and performance

### Monitoring & Diagnostics
- **`health-check.sh`** - System health monitoring
- **`performance-monitor.sh`** - Performance metrics collection
- **`log-analyzer.ts`** - Parse and analyze KOI logs

### Maintenance
- **`cleanup-old-data.ts`** - Remove expired cache and temp data
- **`database-backup.sh`** - Backup KOI-specific database tables
- **`migrate-schema.ts`** - Database schema migrations

## Usage

### Daily Operations
```bash
# Health check
./tools/health-check.sh

# Performance monitoring
./tools/performance-monitor.sh

# Log analysis
bun tools/log-analyzer.ts --last-24h
```

### Maintenance Tasks
```bash
# Cleanup old data (weekly)
bun tools/cleanup-old-data.ts --older-than=7d

# Database backup (daily)
./tools/database-backup.sh

# Schema migration (as needed)
bun tools/migrate-schema.ts --version=1.2.0
```

### Troubleshooting
```bash
# Analyze recent performance issues
bun tools/analyze-previous-run.cjs

# Check system connectivity
./tools/health-check.sh --verbose

# Performance bottleneck detection
./tools/performance-monitor.sh --profile
```

## Tool Development

When creating new tools:
1. Place in appropriate subdirectory
2. Include usage documentation
3. Add error handling and logging
4. Test in non-production environment first
5. Update this README