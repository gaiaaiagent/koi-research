#!/usr/bin/env bun

/**
 * KOI Query Server - Production
 * Serves queries about RAG content from real agent data
 */

import { serve } from 'bun';
import { logger } from '@elizaos/core';
import { KoiRegistry, KoiQueryInterface } from '../src/koi-registry';
import * as fs from 'fs/promises';

const PORT = process.env.KOI_PORT || 8100;

async function startServer() {
  logger.info('Starting KOI Query Server (PRODUCTION)...');
  
  // Initialize registry
  const databaseUrl = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5433/eliza';
  const registry = new KoiRegistry(databaseUrl);
  await registry.initialize();
  
  // Initialize query interface
  const queryInterface = new KoiQueryInterface(registry);
  
  // Agent mapping cache
  let agentMappings: Record<string, any> = {};
  
  // Function to fetch agent mappings from KOI node
  async function fetchAgentMappings() {
    try {
      const response = await fetch('http://localhost:8001/regen/agents');
      const data = await response.json();
      agentMappings = data.agents || {};
      logger.info(`Fetched ${Object.keys(agentMappings).length} agent mappings from KOI node`);
    } catch (error) {
      logger.error('Failed to fetch agent mappings from KOI node:', error);
    }
  }
  
  // Fetch agent mappings on startup
  await fetchAgentMappings();
  
  // Function to map UUID to agent info
  function mapAgentUuidToInfo(uuid: string) {
    // Find agent by GAIA UUID
    for (const [rid, agentInfo] of Object.entries(agentMappings)) {
      if (agentInfo.gaia_uuid === uuid) {
        return {
          rid,
          name: agentInfo.agent_name,
          slug: agentInfo.slug,
          uuid
        };
      }
    }
    return { rid: uuid, name: uuid, slug: uuid, uuid }; // fallback
  }
  
  // Check for manifest files
  const manifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-manifest.jsonld';
  const queryManifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-query-manifest.json';
  const productionManifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-manifest-production.jsonld';
  const productionQueryManifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-query-manifest-production.json';
  const realManifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-manifest-real.jsonld';
  const realQueryManifestPath = '/opt/projects/plugin-knowledge-gaia/manifests/koi-query-manifest-real.json';
  
  // Use the most recent manifest available
  let activeManifestPath = manifestPath;
  let activeQueryManifestPath = queryManifestPath;
  
  try {
    await fs.access(realManifestPath);
    activeManifestPath = realManifestPath;
    activeQueryManifestPath = realQueryManifestPath;
    logger.info('Using REAL data manifest');
  } catch {
    try {
      await fs.access(productionManifestPath);
      activeManifestPath = productionManifestPath;
      activeQueryManifestPath = productionQueryManifestPath;
      logger.info('Using PRODUCTION manifest');
    } catch {
      logger.info('Using default manifest');
    }
  }
  
  const server = serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      
      // CORS headers for browser access
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
      }
      
      // Web Interface - serve HTML dashboard
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOI Node Dashboard - RegenAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px;
        }
        .header {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .header h1 { 
            color: #2c5530; 
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p { 
            color: #666; 
            font-size: 1.1em;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .card h3 { 
            color: #2c5530; 
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .stat-item {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .stat-value { 
            font-weight: bold; 
            color: #4CAF50;
        }
        .query-section {
            background: rgba(255,255,255,0.95);
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .query-form {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
        }
        #queryInput {
            flex: 1;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
        }
        #queryInput:focus {
            outline: none;
            border-color: #4CAF50;
        }
        .btn {
            padding: 15px 30px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            transition: background 0.3s;
        }
        .btn:hover { background: #45a049; }
        .btn:disabled { 
            background: #ccc; 
            cursor: not-allowed; 
        }
        #queryResult {
            background: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            min-height: 100px;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            display: none;
        }
        .loading { 
            color: #666; 
            font-style: italic; 
        }
        .error { 
            color: #e74c3c; 
        }
        .success { 
            color: #27ae60; 
        }
        .refresh-btn {
            background: #2196F3;
            margin-left: 10px;
        }
        .refresh-btn:hover { background: #1976D2; }
        
        /* Tooltip styles */
        .stat-item {
            position: relative;
            cursor: help;
        }
        .stat-item:hover {
            background-color: rgba(76, 175, 80, 0.1);
            border-radius: 4px;
        }
        
        /* Info note styling */
        .info-note {
            background: #e8f4fd;
            border-left: 4px solid #2196F3;
            padding: 10px;
            margin: 15px 0;
            font-size: 0.9em;
            color: #1565C0;
            border-radius: 0 4px 4px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌿 KOI Node Dashboard</h1>
            <p>Knowledge Organization Infrastructure for RegenAI</p>
        </div>
        
        <div class="stats-grid">
            <div class="card">
                <h3>📊 Content Statistics</h3>
                <div class="info-note">
                    💡 <strong>Why "Processed" > "Documents"?</strong> Each document can be processed by multiple agents, so total processing operations exceed unique document count. Hover over items for details.
                </div>
                <div id="contentStats">Loading...</div>
            </div>
            <div class="card">
                <h3>🤖 Agent Status</h3>
                <div id="agentStats">Loading...</div>
            </div>
            <div class="card">
                <h3>📚 Content Sources</h3>
                <div id="sourceStats">Loading...</div>
            </div>
        </div>
        
        <div class="query-section">
            <h3>🔍 Query Interface</h3>
            <div class="query-form">
                <input type="text" id="queryInput" placeholder="Ask about RegenAI content... (e.g., 'What is regenerative agriculture?')" />
                <button class="btn" onclick="submitQuery()">Query</button>
                <button class="btn refresh-btn" onclick="loadStats()">Refresh Stats</button>
            </div>
            <div id="queryResult"></div>
        </div>
    </div>

    <script>
        let stats = {};
        let agentMap = {};

        async function loadAgentMap() {
            try {
                const response = await fetch('agents');
                agentMap = await response.json();
            } catch (error) {
                console.error('Failed to load agent mapping:', error);
                agentMap = {}; // Fallback to empty map
            }
        }

        async function loadStats() {
            try {
                const response = await fetch('stats');
                stats = await response.json();
                updateStatsDisplay();
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }

        function updateStatsDisplay() {
            // Content Stats with tooltips and corrected logic
            const content = stats.content || {};
            const totalUnique = content.total || 0;
            const totalProcessed = content.processed || 0;
            const totalPending = content.pending || 0;
            const totalFailed = content.failed || 0;
            
            const contentHtml = \`
                <div class="stat-item" title="Total unique documents in the knowledge base">
                    <span>📄 Documents:</span><span class="stat-value">\${totalUnique.toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Total processing operations completed across all agents (one document can be processed by multiple agents)">
                    <span>✅ Total Processed:</span><span class="stat-value">\${totalProcessed.toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Documents queued for processing by agents">
                    <span>⏳ Pending:</span><span class="stat-value">\${totalPending.toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Documents that failed to process">
                    <span>❌ Failed:</span><span class="stat-value">\${totalFailed.toLocaleString()}</span>
                </div>
            \`;
            document.getElementById('contentStats').innerHTML = contentHtml;

            // Agent Stats with deduplication and merging
            const agents = stats.agents || {};
            
            function getAgentDisplayName(id) {
                // Check if it's a UUID and we have mapping info
                if (agentMap[id]) {
                    const agent = agentMap[id];
                    return agent.characterName || agent.name;
                }
                
                // Handle legacy name mappings for older data
                const legacyNameMap = {
                    'regenai': 'RegenAI',
                    'voiceofnature': 'VoiceOfNature',
                    'voice-of-nature': 'VoiceOfNature',
                    'governor': 'Governor',
                    'facilitator': 'RegenAI Facilitator',
                    'narrative': 'Narrator'
                };
                
                return legacyNameMap[id] || id;
            }
            
            // Merge agent data by display name to avoid duplicates
            const mergedAgents = {};
            Object.entries(agents).forEach(([id, data]) => {
                const displayName = getAgentDisplayName(id);
                const isCurrentAgent = agentMap[id] !== undefined; // UUID-based = current agent
                
                if (!mergedAgents[displayName]) {
                    mergedAgents[displayName] = {
                        processed: 0,
                        pending: 0,
                        status: 'unknown',
                        isCurrentAgent: false
                    };
                }
                
                // Add the counts
                mergedAgents[displayName].processed += data.processed || 0;
                mergedAgents[displayName].pending += data.pending || 0;
                
                // Prefer current agent status over legacy
                if (isCurrentAgent) {
                    mergedAgents[displayName].status = agentMap[id].status;
                    mergedAgents[displayName].isCurrentAgent = true;
                }
            });
            
            const agentHtml = Object.entries(mergedAgents)
                .filter(([name, data]) => data.processed > 0) // Only show agents with processed content
                .sort(([,a], [,b]) => (b.processed || 0) - (a.processed || 0)) // Sort by processed count
                .map(([displayName, data]) => {
                    const processedCount = data.processed || 0;
                    const pendingCount = data.pending || 0;
                    const status = data.status;
                    const statusIcon = status === 'active' ? '🟢' : status === 'inactive' ? '🔴' : '⚫';
                    
                    return \`<div class="stat-item" title="Agent processing statistics: \${displayName} has processed \${processedCount.toLocaleString()} documents\${pendingCount > 0 ? \` with \${pendingCount.toLocaleString()} still pending\` : ''}">
                        <span>\${statusIcon} \${displayName}:</span>
                        <span class="stat-value">\${processedCount.toLocaleString()} processed\${pendingCount > 0 ? \`, \${pendingCount.toLocaleString()} pending\` : ''}</span>
                    </div>\`;
                }).join('');
            document.getElementById('agentStats').innerHTML = agentHtml || '<div class="stat-item">No agent data</div>';

            // Source Stats with tooltips
            const sources = stats.sources?.byType || {};
            const sourceHtml = Object.entries(sources).map(([type, count]) => 
                \`<div class="stat-item" title="Number of content items from \${type} sources">
                    <span>\${type}:</span><span class="stat-value">\${count}</span>
                </div>\`
            ).join('');
            document.getElementById('sourceStats').innerHTML = sourceHtml || '<div class="stat-item">No source data</div>';
        }

        async function submitQuery() {
            const input = document.getElementById('queryInput');
            const result = document.getElementById('queryResult');
            const query = input.value.trim();
            
            if (!query) {
                alert('Please enter a question');
                return;
            }

            result.style.display = 'block';
            result.className = 'loading';
            result.textContent = 'Searching knowledge base...';

            try {
                const response = await fetch('query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: query })
                });

                const data = await response.json();
                
                if (response.ok) {
                    result.className = 'success';
                    result.textContent = JSON.stringify(data, null, 2);
                } else {
                    result.className = 'error';
                    result.textContent = 'Error: ' + (data.error || 'Unknown error');
                }
            } catch (error) {
                result.className = 'error';
                result.textContent = 'Network error: ' + error.message;
            }
        }

        // Handle Enter key in input
        document.getElementById('queryInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitQuery();
            }
        });

        // Load agent mapping and stats on page load
        async function initializeDashboard() {
            await loadAgentMap();
            await loadStats();
        }
        
        initializeDashboard();
        
        // Auto-refresh both agent mapping and stats every 30 seconds
        setInterval(async () => {
            await loadAgentMap();
            await loadStats();
        }, 30000);
    </script>
</body>
</html>`;
        return new Response(html, {
          headers: { ...headers, 'Content-Type': 'text/html' }
        });
      }

      // Health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          environment: 'production',
          timestamp: new Date().toISOString(),
          manifest: activeManifestPath
        }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      // Agent mapping endpoint - fetch current agent info from ElizaOS
      if (url.pathname === '/agents') {
        try {
          const agentsResponse = await fetch('http://localhost:3000/api/agents');
          const agentsData = await agentsResponse.json();
          
          const agentMap = {};
          if (agentsData.success && agentsData.data?.agents) {
            agentsData.data.agents.forEach(agent => {
              agentMap[agent.id] = {
                name: agent.name,
                characterName: agent.characterName,
                status: agent.status
              };
            });
          }
          
          return new Response(JSON.stringify(agentMap), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          logger.error('Failed to fetch agent info:', error);
          return new Response(JSON.stringify({ error: 'Failed to fetch agent info' }), {
            status: 500,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }

      // Query endpoint
      if (url.pathname === '/query' && req.method === 'POST') {
        try {
          const body = await req.json();
          const question = body.question || body.query;
          
          if (!question) {
            return new Response(JSON.stringify({
              error: 'Missing question/query parameter'
            }), {
              status: 400,
              headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          
          logger.info(`Processing query: ${question}`);
          const result = await queryInterface.answerQuestion(question);
          
          return new Response(JSON.stringify(result), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          logger.error('Query error:', error);
          return new Response(JSON.stringify({
            error: 'Query processing failed',
            details: error.message
          }), {
            status: 500,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Get manifest
      if (url.pathname === '/manifest') {
        try {
          const manifest = await fs.readFile(activeManifestPath, 'utf-8');
          return new Response(manifest, {
            headers: { ...headers, 'Content-Type': 'application/ld+json' }
          });
        } catch (error) {
          return new Response('Manifest not found. Run generate-koi-manifest.ts first', { 
            status: 404,
            headers 
          });
        }
      }
      
      // Get query manifest
      if (url.pathname === '/query-manifest') {
        try {
          const manifest = await fs.readFile(activeQueryManifestPath, 'utf-8');
          return new Response(manifest, {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response('Query manifest not found', { 
            status: 404,
            headers 
          });
        }
      }
      
      // Statistics
      if (url.pathname === '/stats') {
        const rawStats = await registry.getStatistics();
        
        // Transform agent statistics using proper mappings
        const transformedAgents: Record<string, any> = {};
        
        for (const [agentUuid, agentData] of Object.entries(rawStats.agents || {})) {
          const agentInfo = mapAgentUuidToInfo(agentUuid);
          
          // Skip phantom entries (identifiers that don't match real UUIDs and have suspicious patterns)
          if (agentInfo.uuid === agentUuid && (
            agentUuid.includes('-') && agentUuid.length < 30 || // Short dash-separated strings
            (agentData.pending && agentData.pending > 10000 && agentData.processed === 0) // Unrealistic pending counts
          )) {
            logger.warn(`Skipping phantom agent entry: ${agentUuid} with ${agentData.pending} pending, ${agentData.processed} processed`);
            continue;
          }
          
          // Use the agent name as the key for the UI display
          const displayKey = agentInfo.name.toLowerCase().replace(/\s+/g, '');
          
          transformedAgents[displayKey] = {
            ...agentData,
            rid: agentInfo.rid,
            name: agentInfo.name,
            uuid: agentInfo.uuid,
            slug: agentInfo.slug
          };
        }
        
        const transformedStats = {
          ...rawStats,
          agents: transformedAgents
        };
        
        return new Response(JSON.stringify(transformedStats), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      // Suggested questions
      if (url.pathname === '/suggestions') {
        return new Response(JSON.stringify({
          suggestions: queryInterface.getSuggestedQuestions()
        }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      // Default response - API documentation
      return new Response(JSON.stringify({
        name: 'KOI Query Server',
        version: '1.0.0',
        environment: 'production',
        activeManifest: activeManifestPath.split('/').pop(),
        endpoints: [
          {
            method: 'POST',
            path: '/query',
            description: 'Ask a question about RAG content',
            body: { question: 'string' }
          },
          {
            method: 'GET',
            path: '/manifest',
            description: 'Get JSON-LD knowledge graph manifest'
          },
          {
            method: 'GET',
            path: '/query-manifest',
            description: 'Get query-optimized manifest'
          },
          {
            method: 'GET',
            path: '/stats',
            description: 'Get current statistics'
          },
          {
            method: 'GET',
            path: '/suggestions',
            description: 'Get suggested questions'
          },
          {
            method: 'GET',
            path: '/health',
            description: 'Health check endpoint'
          }
        ],
        examples: {
          query: {
            request: {
              question: "What content is in RegenAI's RAG system?"
            },
            response: {
              question: "What content is in RegenAI's RAG system?",
              answer: "...",
              confidence: 0.95,
              timestamp: "2024-01-20T10:00:00Z"
            }
          }
        }
      }, null, 2), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  });
  
  logger.info(`🌿 KOI Query Server running on http://localhost:${PORT}`);
  logger.info(`📊 Using manifest: ${activeManifestPath}`);
  logger.info(`\nTry these endpoints:`);
  logger.info(`  - POST http://localhost:${PORT}/query`);
  logger.info(`  - GET  http://localhost:${PORT}/stats`);
  logger.info(`  - GET  http://localhost:${PORT}/suggestions`);
  logger.info(`\nExample query:`);
  logger.info(`  curl -X POST http://localhost:${PORT}/query -H "Content-Type: application/json" -d '{"question":"What content is in RegenAI RAG?"}'`);
}

startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});