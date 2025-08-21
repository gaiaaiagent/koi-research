# KOI Quick Start Guide

Get KOI running and querying your knowledge base in 5 minutes.

## Prerequisites

- RegenAI agents running (port 3000)
- PostgreSQL database (port 5433)
- Bun runtime installed

## 1. Check Current Status

```bash
# Are agents running?
ps aux | grep -E "bun.*packages/cli/dist/index.js start" | grep -v grep

# Is KOI server running?
ps aux | grep -E "bun.*koi-query-server" | grep -v grep
```

## 2. Start KOI Server (if not running)

```bash
cd /opt/projects/plugin-knowledge-gaia
nohup bun scripts/koi-query-server.ts > koi-server.log 2>&1 &
```

## 3. Verify Everything is Working

```bash
# Health check
curl http://localhost:8100/health

# Quick stats
curl http://localhost:8100/stats

# Test query
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content is in the knowledge base?"}'
```

## 4. Use the Web Dashboard

Visit: **https://regen.gaiaai.xyz/koi/**

- View content statistics with tooltips
- See agent processing status
- Try the query interface
- Monitor real-time updates

## 5. Sync Existing Data (Optional)

If you want to populate KOI with existing knowledge:

```bash
# Bulk sync existing documents (takes a few minutes)
cd /opt/projects/plugin-knowledge-gaia
bun scripts/generate-koi-real-data.ts
```

This will sync 27,580+ existing documents and dramatically improve source statistics.

## 6. Test Queries

Try these example queries in the web interface:

- "What content does RegenAI have?"
- "How many documents are processed?"
- "Show me content about carbon credits"
- "Which agent has the most content?"

## Common Commands

```bash
# Restart KOI server
pkill -f "koi-query-server"
cd /opt/projects/plugin-knowledge-gaia && nohup bun scripts/koi-query-server.ts > koi-server.log 2>&1 &

# View logs
tail -f /opt/projects/plugin-knowledge-gaia/koi-server.log

# Check agent logs
tail -f /opt/projects/GAIA-direct/logs/all-agents-koi-test.log

# Run tests
cd /opt/projects/plugin-knowledge-gaia
bun scripts/test-koi-queries.ts
```

## Next Steps

- **[Architecture Overview](./ARCHITECTURE.md)** - Understand how KOI works
- **[API Reference](./API-REFERENCE.md)** - Build custom integrations
- **[Testing Guide](./TESTING.md)** - Comprehensive testing
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Fix common issues

## Need Help?

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Review server logs: `tail -f koi-server.log`
3. Test basic connectivity: `curl http://localhost:8100/health`