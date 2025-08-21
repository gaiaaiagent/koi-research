# KOI (Knowledge Organization Infrastructure) Documentation

## Overview

KOI provides knowledge tracking and querying capabilities for the RegenAI system, allowing you to understand what content each agent has processed and query their knowledge bases.

## Quick Links

- **[Quick Start Guide](./QUICK-START.md)** - Get KOI running in 5 minutes
- **[Architecture Overview](./ARCHITECTURE.md)** - System design and components
- **[API Reference](./API-REFERENCE.md)** - Complete API documentation
- **[Integration Guide](./INTEGRATION.md)** - KOI + Knowledge Service integration
- **[Testing Guide](./TESTING.md)** - How to test KOI functionality
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## Production Guides

- **[Production Deployment](./KOI-NODE-USAGE.md)** - Running KOI with real data
- **[Bulk Data Sync](./BULK-SYNC.md)** - Syncing existing knowledge bases

## What You Can Do With KOI

✅ **Query agent knowledge**: "What content does RegenAI have about carbon credits?"
✅ **Track processing status**: See which agents have processed which documents
✅ **Generate statistics**: View content source breakdowns and processing metrics
✅ **Real-time dashboard**: Monitor knowledge processing via web UI
✅ **Bulk synchronization**: Sync existing knowledge bases to KOI
✅ **API integration**: Build custom applications using KOI data

## Current Status

- **🟢 KOI Query Server**: Running at https://regen.gaiaai.xyz/koi/
- **🟢 Knowledge Integration**: Active in all RegenAI agents
- **🟢 Bulk Sync**: Processing 27,580+ existing documents
- **🟢 Web Dashboard**: Available with tooltips and explanations

## Getting Started

1. **Quick Start**: Follow the [Quick Start Guide](./QUICK-START.md)
2. **Explore**: Visit https://regen.gaiaai.xyz/koi/ to see the dashboard
3. **Query**: Use the web interface or API to ask questions
4. **Integrate**: Add KOI to your own applications

## Directory Structure

```
/opt/projects/plugin-knowledge-gaia/
├── docs/              # Documentation (this directory)
├── scripts/           # Operational scripts
├── src/              # Source code
├── tools/            # Utilities and maintenance
├── tests/            # Test suites  
├── examples/         # Usage examples
├── logs/             # Log files
├── manifests/        # Generated manifests
└── reports/          # Analysis reports
```

## Support

- Check [Troubleshooting](./TROUBLESHOOTING.md) for common issues
- Review logs: `tail -f logs/koi-server.log`
- Test connectivity: `curl http://localhost:8100/health`