# KOI Testing Guide

Complete guide for testing KOI functionality across all components.

## Quick Test Commands

```bash
# Basic connectivity
curl http://localhost:8100/health

# Current statistics
curl http://localhost:8100/stats

# Simple query test
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content is in the knowledge base?"}'

# Run full test suite
cd /opt/projects/plugin-knowledge-gaia
bun tests/test-koi-queries.ts
```

## Test Categories

### 1. Server Health Tests

```bash
# Health endpoint
curl http://localhost:8100/health
# Expected: {"status":"healthy","environment":"production","timestamp":"..."}

# Server responsiveness
time curl -s http://localhost:8100/health
# Expected: Response time < 100ms

# Port accessibility
telnet localhost 8100
# Expected: Connection successful
```

### 2. Statistics Tests

```bash
# Basic stats structure
curl -s http://localhost:8100/stats | jq 'keys'
# Expected: ["agents","content","sources"]

# Content counts
curl -s http://localhost:8100/stats | jq '.content.total'
# Expected: Number > 0

# Agent count
curl -s http://localhost:8100/stats | jq '.agents | length'
# Expected: Number > 0 (should be 5+ for RegenAI setup)
```

### 3. Query Functionality Tests

```bash
# Simple knowledge query
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content is available?"}'
# Expected: Valid response with answer field

# Agent-specific query
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content does RegenAI have?"}'
# Expected: Agent-specific content breakdown

# Source-specific query  
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content is from Notion?"}'
# Expected: Source-specific content information
```

### 4. Integration Tests

```bash
# Agent mapping endpoint
curl -s http://localhost:8100/agents | jq 'keys | length'
# Expected: Number of active agents (5+ for RegenAI)

# Manifest availability
curl -s http://localhost:8100/manifest | head -20
# Expected: Valid JSON-LD structure

# Query manifest
curl -s http://localhost:8100/query-manifest | jq '.version'
# Expected: Version information
```

### 5. Web Dashboard Tests

Visit https://regen.gaiaai.xyz/koi/ and verify:

- ✅ **Page loads** without errors
- ✅ **Content Statistics** card shows data
- ✅ **Agent Status** card shows agents with proper names (not UUIDs)
- ✅ **Content Sources** card shows multiple source types
- ✅ **Tooltips work** when hovering over statistics
- ✅ **Query interface** accepts and processes questions
- ✅ **Refresh button** updates statistics
- ✅ **No duplicate agents** in the status display

### 6. Real-time Integration Tests

Test that Knowledge Service integration is working:

```bash
# Check agent logs for KOI messages
tail -f /opt/projects/GAIA-direct/logs/all-agents-koi-test.log | grep -i koi

# Check KOI server logs for activity
tail -f /opt/projects/plugin-knowledge-gaia/koi-server.log | grep -E "INFO|ERROR"

# Verify database connectivity from agents
docker exec gaia-postgres-1 psql -U postgres -d eliza -c "SELECT COUNT(*) FROM memories WHERE type = 'documents';"
```

## Performance Tests

### 1. Query Response Time
```bash
# Test query performance
time curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What content is available?"}'
# Expected: Response time < 2 seconds
```

### 2. Bulk Sync Performance
```bash
# Monitor bulk sync operation
cd /opt/projects/plugin-knowledge-gaia
time bun scripts/generate-koi-real-data.ts
# Expected: Completes without errors, reasonable time for data size
```

### 3. Concurrent Access
```bash
# Test multiple simultaneous queries
for i in {1..5}; do
  curl -X POST http://localhost:8100/query \
    -H "Content-Type: application/json" \
    -d '{"question": "What content is available?"}' &
done
wait
# Expected: All queries complete successfully
```

## Error Handling Tests

### 1. Invalid Queries
```bash
# Empty query
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: Error response with 400 status

# Malformed JSON
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question":'
# Expected: JSON parsing error

# Very long query
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"$(printf 'A%.0s' {1..10000})\"}"
# Expected: Handles gracefully (success or reasonable error)
```

### 2. Network Issues
```bash
# Simulate database connectivity issues (requires admin access)
# Stop postgres temporarily
docker stop gaia-postgres-1

# Test query during outage
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"question": "test"}'
# Expected: Appropriate error response

# Restart postgres
docker start gaia-postgres-1
```

## Automated Test Suite

Run the comprehensive test suite:

```bash
cd /opt/projects/plugin-knowledge-gaia
bun tests/test-koi-queries.ts
```

This tests:
- ✅ Health endpoint
- ✅ Statistics endpoint  
- ✅ Various query types
- ✅ Error handling
- ✅ Response formats
- ✅ Agent mapping
- ✅ Performance thresholds

## Test Data Validation

### 1. Content Statistics Validation
```bash
# Check that statistics make sense
curl -s http://localhost:8100/stats | jq '{
  total: .content.total,
  processed: .content.processed,
  pending: .content.pending,
  ratio: (.content.processed / .content.total)
}'
```

### 2. Agent Data Consistency
```bash
# Verify agent data is consistent
curl -s http://localhost:8100/agents | jq 'to_entries | map({id: .key, name: .value.name})'
curl -s http://localhost:8100/stats | jq '.agents | keys'
```

### 3. Source Data Verification
```bash
# Check source diversity
curl -s http://localhost:8100/stats | jq '.sources.byType'
# Expected: Multiple source types (notion, medium, twitter, etc.)
```

## Troubleshooting Tests

If tests fail, check:

1. **Service Status**
   ```bash
   ps aux | grep -E "koi-query-server|packages/cli/dist" | grep -v grep
   ```

2. **Database Connection**
   ```bash
   docker exec gaia-postgres-1 psql -U postgres -d eliza -c "SELECT 1;"
   ```

3. **Log Files**
   ```bash
   tail -50 /opt/projects/plugin-knowledge-gaia/koi-server.log
   tail -50 /opt/projects/GAIA-direct/logs/all-agents-koi-test.log
   ```

4. **Network Connectivity**
   ```bash
   nc -zv localhost 8100
   nc -zv localhost 3000
   nc -zv localhost 5433
   ```

## Regression Testing

Before deploying changes:

1. ✅ Run full test suite
2. ✅ Verify web dashboard functionality
3. ✅ Check bulk sync operations
4. ✅ Test query response quality
5. ✅ Validate performance metrics
6. ✅ Confirm integration with agents

## Test Environment Setup

For setting up a test environment:

```bash
# Copy configuration
cp .env.example .env.test

# Use test database
export POSTGRES_URL="postgresql://postgres:postgres@localhost:5433/eliza_test"

# Run tests against test environment
bun tests/test-koi-queries.ts --env=test
```