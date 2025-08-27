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
  
  // Helper functions for enhanced statistics
  async function getEnhancedSourceStats(registry: KoiRegistry) {
    const client = await registry.db.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          ks.type,
          ks.name,
          ks.rid,
          COUNT(kc.rid) as content_count,
          COUNT(CASE WHEN kp.status = 'processed' THEN 1 END) as processed_count,
          COUNT(CASE WHEN kp.status = 'pending' THEN 1 END) as pending_count
        FROM koi_sources ks
        LEFT JOIN koi_content kc ON ks.rid = kc.source_rid
        LEFT JOIN koi_processing kp ON kc.rid = kp.content_rid
        GROUP BY ks.rid, ks.type, ks.name
        ORDER BY content_count DESC
      `);
      
      // Add descriptions to each source
      const sourcesWithDescriptions = result.rows.map(row => ({
        ...row,
        description: generateSourceDescription(row.type, row.name, parseInt(row.content_count))
      }));

      return {
        total: result.rows.length,
        sources: sourcesWithDescriptions,
        byType: result.rows.reduce((acc, row) => {
          acc[row.type] = (acc[row.type] || 0) + parseInt(row.content_count);
          return acc;
        }, {})
      };
    } finally {
      client.release();
    }
  }
  
  async function smartAgentMerging(registry: KoiRegistry, agentMappings: Record<string, any>) {
    const client = await registry.db.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          agent_id,
          status,
          COUNT(*) as count
        FROM koi_processing 
        GROUP BY agent_id, status
        ORDER BY agent_id, status
      `);
      
      // Agent name mapping with UUID resolution
      const agentNameMap = {
        'voice-of-nature': 'VoiceOfNature',
        'voiceofnature': 'VoiceOfNature',
        'facilitator': 'RegenAI Facilitator',
        'regenaifacilitator': 'RegenAI Facilitator',
        'regenai': 'RegenAI',
        'narrative': 'Narrator',
        'narrator': 'Narrator',
        'governor': 'Governor'
      };
      
      // Merge agent statistics by display name
      const mergedAgents = {};
      let totalProcessingOperations = 0;
      
      result.rows.forEach(row => {
        const agentId = row.agent_id;
        let displayName = agentId;
        let isCurrentAgent = false;
        
        // Use enhanced agent mapping  
        if (agentMappings[agentId]) {
          displayName = agentMappings[agentId].displayName || agentMappings[agentId].characterName || agentMappings[agentId].name;
          isCurrentAgent = agentMappings[agentId].status !== 'legacy';
        } else if (agentNameMap[agentId.toLowerCase()]) {
          displayName = agentNameMap[agentId.toLowerCase()];
        } else {
          // Keep UUID but truncate for display
          displayName = agentId.length > 36 ? agentId.substring(0, 8) + '...' : agentId;
        }
        
        if (!mergedAgents[displayName]) {
          mergedAgents[displayName] = {
            processed: 0,
            pending: 0,
            failed: 0,
            isCurrentAgent: isCurrentAgent,
            originalIds: []
          };
        }
        
        const count = parseInt(row.count);
        mergedAgents[displayName][row.status] = (mergedAgents[displayName][row.status] || 0) + count;
        mergedAgents[displayName].originalIds.push(agentId);
        
        totalProcessingOperations += count;
      });
      
      return { mergedAgents, totalProcessingOperations };
    } finally {
      client.release();
    }
  }
  
  async function getTotalMemoryCount(registry: KoiRegistry) {
    const client = await registry.db.pool.connect();
    try {
      const result = await client.query('SELECT COUNT(*) as total FROM memories');
      return parseInt(result.rows[0].total);
    } finally {
      client.release();
    }
  }
  
  // Source categories following Regen Network KOI naming convention
  async function generateContentSourcesView(registry: KoiRegistry) {
    const client = await registry.db.pool.connect();
    try {
      // Get high-level source statistics
      const result = await client.query(`
        SELECT 
          ks.rid,
          ks.type,
          ks.name,
          COUNT(kc.rid) as total_items,
          COUNT(CASE WHEN kp.status = 'processed' THEN 1 END) as processed_count,
          COUNT(CASE WHEN kp.status = 'pending' THEN 1 END) as pending_count,
          COUNT(CASE WHEN kp.status = 'failed' THEN 1 END) as failed_count,
          MAX(kc.created_at) as last_updated
        FROM koi_sources ks
        LEFT JOIN koi_content kc ON ks.rid = kc.source_rid
        LEFT JOIN koi_processing kp ON kc.rid = kp.content_rid
        GROUP BY ks.rid, ks.type, ks.name
        HAVING COUNT(kc.rid) > 0
        ORDER BY total_items DESC
      `);
      
      const sources = result.rows.map(row => ({
        rid: row.rid,
        name: row.name,
        description: generateSourceDescription(row.type, row.name, parseInt(row.total_items)),
        totalItems: parseInt(row.total_items),
        lastUpdated: row.last_updated,
        sourceType: categorizeSourceType(row.type),
        accessLevel: row.type.includes('internal') ? 'internal' : 'public',
        stats: {
          indexed: parseInt(row.total_items),
          processed: parseInt(row.processed_count || 0),
          pending: parseInt(row.pending_count || 0),
          failed: parseInt(row.failed_count || 0),
          processingRate: row.total_items > 0 ? Math.round((parseInt(row.processed_count || 0) / parseInt(row.total_items)) * 100) : 0
        }
      }));
      
      return {
        sources,
        summary: {
          totalSources: sources.length,
          totalItems: sources.reduce((sum, s) => sum + s.totalItems, 0),
          totalProcessed: sources.reduce((sum, s) => sum + s.stats.processed, 0),
          avgProcessingRate: Math.round(sources.reduce((sum, s) => sum + s.stats.processingRate, 0) / sources.length)
        }
      };
    } finally {
      client.release();
    }
  }
  
  function categorizeSourceType(type: string) {
    if (type.includes('twitter') || type.includes('social')) return 'social';
    if (type.includes('github') || type.includes('code')) return 'technical';
    if (type.includes('notion') || type.includes('internal')) return 'internal';
    if (type.includes('website') || type.includes('web')) return 'governance';
    if (type.includes('podcast') || type.includes('audio')) return 'community';
    return 'other';
  }
  
  function generateSourceDescription(type: string, name: string, totalItems: number) {
    // Generate more intuitive descriptions based on content type
    if (type.includes('twitter')) {
      return `1 Twitter account with ${totalItems.toLocaleString()} tweet containers`;
    } else if (type.includes('github')) {
      return `GitHub repositories with ${totalItems} file containers`;
    } else if (type.includes('notion')) {
      return `1 Notion workspace with ${totalItems} database containers`;
    } else if (type.includes('website')) {
      // For websites, estimate number of domains from the containers
      const estimatedDomains = Math.max(1, Math.ceil(totalItems / 3)); // Rough estimate
      return `~${estimatedDomains} website(s) with ${totalItems} page containers`;
    } else if (type.includes('medium')) {
      return `Medium publication with ${totalItems} article containers`;
    } else if (type.includes('discord')) {
      return `Discord server with ${totalItems} message containers`;
    } else if (type.includes('podcast')) {
      return `Podcast feed with ${totalItems} episode containers`;
    } else if (type.includes('rag-service')) {
      return `Document upload service with ${totalItems.toLocaleString()} document containers`;
    } else {
      return `${type} source with ${totalItems} content containers`;
    }
  }
  
  async function getSourceDetails(registry: KoiRegistry, sourceRid: string) {
    const client = await registry.db.pool.connect();
    try {
      // Get source info
      const sourceResult = await client.query(`
        SELECT * FROM koi_sources WHERE rid = $1
      `, [sourceRid]);
      
      if (sourceResult.rows.length === 0) {
        throw new Error(`Source with RID ${sourceRid} not found`);
      }
      
      const source = sourceResult.rows[0];
      
      // Get sample content items with processing info
      const contentResult = await client.query(`
        SELECT 
          kc.rid,
          kc.title,
          kc.created_at,
          kc.metadata,
          COUNT(kp.content_rid) as processing_count,
          COUNT(CASE WHEN kp.status = 'processed' THEN 1 END) as processed_count,
          array_agg(DISTINCT kp.agent_id) FILTER (WHERE kp.agent_id IS NOT NULL) as agent_ids
        FROM koi_content kc
        LEFT JOIN koi_processing kp ON kc.rid = kp.content_rid
        WHERE kc.source_rid = $1
        GROUP BY kc.rid, kc.title, kc.created_at, kc.metadata
        ORDER BY kc.created_at DESC
        LIMIT 20
      `, [sourceRid]);
      
      // Get agent usage statistics for this source
      const agentStatsResult = await client.query(`
        SELECT 
          kp.agent_id,
          COUNT(*) as usage_count,
          COUNT(CASE WHEN kp.status = 'processed' THEN 1 END) as processed_count
        FROM koi_processing kp
        JOIN koi_content kc ON kp.content_rid = kc.rid
        WHERE kc.source_rid = $1
        GROUP BY kp.agent_id
        ORDER BY usage_count DESC
      `, [sourceRid]);
      
      const contentItems = contentResult.rows.map(row => ({
        rid: row.rid,
        title: row.title || 'Untitled',
        contentType: 'content',
        createdAt: row.created_at,
        metadata: row.metadata || {},
        processingCount: parseInt(row.processing_count || 0),
        processedCount: parseInt(row.processed_count || 0),
        agentIds: row.agent_ids || []
      }));
      
      const agentUsage = agentStatsResult.rows.map(row => ({
        agentId: row.agent_id,
        usageCount: parseInt(row.usage_count),
        processedCount: parseInt(row.processed_count),
        displayName: agentMappings[row.agent_id]?.displayName || row.agent_id
      }));
      
      return {
        source: {
          rid: source.rid,
          name: source.name,
          description: `${source.type} content source`,
          type: source.type,
          sourceType: categorizeSourceType(source.type),
          accessLevel: source.type.includes('internal') ? 'internal' : 'public',
          createdAt: source.created_at,
          totalItems: contentItems.length
        },
        contentItems,
        agentUsage,
        subgraph: await generateSourceSubgraph(registry, sourceRid, 2, 15),
        pagination: {
          page: 1,
          pageSize: 20,
          hasMore: contentItems.length === 20
        }
      };
    } finally {
      client.release();
    }
  }
  
  async function getContentDetails(registry: KoiRegistry, sourceRid: string, contentRid: string) {
    const client = await registry.db.pool.connect();
    try {
      // Get the container content info
      const containerResult = await client.query(`
        SELECT * FROM koi_content WHERE rid = $1
      `, [contentRid]);
      
      if (containerResult.rows.length === 0) {
        throw new Error(`Content with RID ${contentRid} not found`);
      }
      
      const container = containerResult.rows[0];
      const metadata = container.metadata || {};
      
      // For website containers, organize by domain
      if (container.source_rid && container.source_rid.includes('website')) {
        return await generateWebsiteBreakdown(registry, container, sourceRid, contentRid);
      }
      
      // For Twitter containers, fetch individual tweets from memories
      if (metadata.contentType === 'twitter' && metadata.tweets) {
        const tweetCount = parseInt(metadata.tweets);
        const limit = Math.min(tweetCount, 50); // Limit for performance
        
        // Query memories table for tweets related to this container
        const tweetsResult = await client.query(`
          SELECT 
            id,
            content
          FROM memories 
          WHERE content::text LIKE '%twitter%' 
             OR content::text LIKE '%@RegenNetwork%'
             OR content::text LIKE '%tweet%'
             OR content::text LIKE '%regennetwork%'
          ORDER BY id DESC
          LIMIT $1
        `, [limit]);
        
        // Generate individual tweet RIDs and structure
        const individualTweets = tweetsResult.rows.map((tweet, index) => {
          // Extract text content from JSONB
          const contentText = typeof tweet.content === 'string' ? tweet.content : JSON.stringify(tweet.content);
          
          // Extract tweet ID from content if possible, otherwise use memory ID
          const tweetIdMatch = contentText.match(/tweet[:\s]+(\d+)/i) || 
                               contentText.match(/status\/(\d+)/i) ||
                               contentText.match(/(\d{10,})/);
          const tweetId = tweetIdMatch ? tweetIdMatch[1] : tweet.id.substring(0, 8);
          
          return {
            rid: `relevant.content.tweet-${tweetId}.v1.0.0`,
            title: extractTweetTitle(contentText),
            contentType: 'tweet',
            createdAt: new Date().toISOString(), // Default timestamp
            agentId: 'system',
            userId: 'unknown',
            roomId: 'twitter-archive',
            memoryId: tweet.id,
            content: contentText.substring(0, 200) + (contentText.length > 200 ? '...' : ''),
            metadata: {
              originalMemoryId: tweet.id,
              containerRid: contentRid,
              sourceRid: sourceRid,
              extractedTweetId: tweetId
            }
          };
        });
        
        return {
          container: {
            rid: container.rid,
            title: container.title,
            sourceRid: sourceRid,
            totalItems: tweetCount,
            metadata: metadata,
            createdAt: container.created_at
          },
          individualItems: individualTweets,
          itemType: 'tweets',
          pagination: {
            page: 1,
            pageSize: limit,
            total: tweetCount,
            hasMore: tweetCount > limit
          },
          summary: {
            containerType: 'Twitter Archive Collection',
            totalTweets: tweetCount,
            sampleSize: individualTweets.length,
            coverage: `${individualTweets.length}/${tweetCount} tweets shown`
          }
        };
      }
      
      // For other content types, return basic container info
      return {
        container: {
          rid: container.rid,
          title: container.title,
          sourceRid: sourceRid,
          metadata: metadata,
          createdAt: container.created_at
        },
        individualItems: [],
        itemType: 'unknown',
        summary: {
          containerType: metadata.contentType || 'content',
          note: 'Individual item drilling not yet implemented for this content type'
        }
      };
      
    } finally {
      client.release();
    }
  }
  
  async function generateWebsiteBreakdown(registry: KoiRegistry, container: any, sourceRid: string, contentRid: string) {
    const client = await registry.db.pool.connect();
    try {
      // Query memories table for website content to extract domains
      const websiteContent = await client.query(`
        SELECT 
          id,
          content
        FROM memories 
        WHERE content::text LIKE '%http%' 
           OR content::text LIKE '%www.%'
           OR content::text LIKE '%regen%'
        ORDER BY id DESC
        LIMIT 50
      `);
      
      // Organize content by domain
      const domainBreakdown = {};
      const individualPages = [];
      
      websiteContent.rows.forEach((item, index) => {
        const contentText = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
        
        // Extract domain from content
        const urlMatch = contentText.match(/https?:\/\/([^\/\s]+)/i) || 
                        contentText.match(/www\.([^\/\s]+)/i);
        let domain = urlMatch ? urlMatch[1].replace(/^www\./, '') : 'unknown-domain';
        
        // Clean up domain
        if (domain.includes('regen')) {
          if (domain.includes('blog')) domain = 'blog.regen.network';
          else if (domain.includes('registry')) domain = 'registry.regen.network';
          else if (domain.includes('app')) domain = 'app.regen.network';
          else domain = 'regen.network';
        }
        
        // Initialize domain if not exists
        if (!domainBreakdown[domain]) {
          domainBreakdown[domain] = {
            domain: domain,
            pageCount: 0,
            pages: []
          };
        }
        
        // Extract page title and URL
        const titleMatch = contentText.match(/title[:\s]+([^\n]+)/i) || 
                          contentText.match(/#\s+([^\n]+)/);
        const title = titleMatch ? titleMatch[1].trim() : `Page ${index + 1}`;
        
        const pageRid = `relevant.content.webpage-${domain.replace(/\./g, '-')}-${index + 1}.v1.0.0`;
        
        domainBreakdown[domain].pageCount++;
        domainBreakdown[domain].pages.push({
          rid: pageRid,
          title: title.substring(0, 80),
          domain: domain,
          memoryId: item.id,
          content: contentText.substring(0, 200) + (contentText.length > 200 ? '...' : ''),
          metadata: {
            originalMemoryId: item.id,
            containerRid: contentRid,
            sourceRid: sourceRid,
            domain: domain
          }
        });
        
        individualPages.push(domainBreakdown[domain].pages[domainBreakdown[domain].pages.length - 1]);
      });
      
      const domains = Object.values(domainBreakdown);
      const totalPages = individualPages.length;
      
      return {
        container: {
          rid: container.rid,
          title: container.title || 'Website Collection',
          sourceRid: sourceRid,
          totalItems: totalPages,
          metadata: container.metadata || {},
          createdAt: container.created_at
        },
        domainBreakdown: domains,
        individualItems: individualPages,
        itemType: 'webpages',
        pagination: {
          page: 1,
          pageSize: totalPages,
          total: totalPages,
          hasMore: false
        },
        summary: {
          containerType: 'Website Collection',
          totalDomains: domains.length,
          totalPages: totalPages,
          coverage: `${domains.length} domains with ${totalPages} pages`,
          indexingSource: '/home/regenai/project/indexing/ (original source)'
        }
      };
      
    } finally {
      client.release();
    }
  }

  function extractTweetTitle(content: string): string {
    // Extract first line or sentence as title
    const lines = content.split('\n');
    const firstLine = lines[0] || content;
    
    // Clean up and truncate
    let title = firstLine
      .replace(/^(Tweet|twitter|@\w+:?\s*)/i, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .trim();
    
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }
    
    return title || 'Tweet';
  }

  async function generateSourceSubgraph(registry: KoiRegistry, centerRid: string, depth: number = 2, limit: number = 15) {
    const client = await registry.db.pool.connect();
    try {
      const nodes = [];
      const links = [];
      
      // Add the center source node
      const sourceResult = await client.query(`
        SELECT * FROM koi_sources WHERE rid = $1
      `, [centerRid]);
      
      if (sourceResult.rows.length > 0) {
        const source = sourceResult.rows[0];
        nodes.push({
          id: source.rid,
          name: source.name,
          type: 'source',
          group: 1,
          color: '#2196F3',
          size: 20,
          title: `Source: ${source.name}\nType: ${source.type}\nRID: ${source.rid}`,
          metadata: {
            sourceType: categorizeSourceType(source.type),
            description: `${source.type} content source`
          }
        });
      }
      
      // Add content nodes (limited sample)
      const contentResult = await client.query(`
        SELECT 
          kc.rid,
          kc.title,
          kc.created_at,
          COUNT(kp.content_rid) as processing_count
        FROM koi_content kc
        LEFT JOIN koi_processing kp ON kc.rid = kp.content_rid
        WHERE kc.source_rid = $1
        GROUP BY kc.rid, kc.title, kc.created_at
        ORDER BY processing_count DESC, kc.created_at DESC
        LIMIT $2
      `, [centerRid, limit]);
      
      contentResult.rows.forEach(content => {
        nodes.push({
          id: content.rid,
          name: content.title || 'Untitled Content',
          type: 'content',
          group: 2,
          color: '#4CAF50',
          size: 10 + Math.min(parseInt(content.processing_count || 0), 10),
          title: `Content: ${content.title || 'Untitled'}\nType: content\nProcessed: ${content.processing_count} times\nRID: ${content.rid}`,
          metadata: {
            contentType: 'content',
            processingCount: parseInt(content.processing_count || 0),
            createdAt: content.created_at
          }
        });
        
        // Link content to source
        links.push({
          source: centerRid,
          target: content.rid,
          type: 'contains',
          strength: 0.6
        });
      });
      
      // Add agent nodes that have processed this source's content
      const agentResult = await client.query(`
        SELECT 
          kp.agent_id,
          COUNT(DISTINCT kp.content_rid) as content_count,
          COUNT(*) as total_operations
        FROM koi_processing kp
        JOIN koi_content kc ON kp.content_rid = kc.rid
        WHERE kc.source_rid = $1 AND kp.status = 'processed'
        GROUP BY kp.agent_id
        ORDER BY total_operations DESC
        LIMIT 8
      `, [centerRid]);
      
      agentResult.rows.forEach(agent => {
        const agentName = agentMappings[agent.agent_id]?.displayName || agent.agent_id;
        const nodeId = `agent:${agent.agent_id}`;
        
        nodes.push({
          id: nodeId,
          name: agentName,
          type: 'agent',
          group: 3,
          color: '#FF9800',
          size: 8 + Math.min(parseInt(agent.total_operations), 12),
          title: `Agent: ${agentName}\nProcessed: ${agent.content_count} items\nTotal operations: ${agent.total_operations}\nID: ${agent.agent_id}`,
          metadata: {
            agentId: agent.agent_id,
            contentCount: parseInt(agent.content_count),
            totalOperations: parseInt(agent.total_operations)
          }
        });
        
        // Link agents to some content they've processed (sample)
        const sampleContent = contentResult.rows.slice(0, Math.min(3, contentResult.rows.length));
        sampleContent.forEach(content => {
          links.push({
            source: nodeId,
            target: content.rid,
            type: 'processes',
            strength: 0.4
          });
        });
      });
      
      return {
        nodes,
        links,
        metadata: {
          centerRid,
          depth,
          totalNodes: nodes.length,
          totalLinks: links.length,
          nodeTypes: {
            sources: nodes.filter(n => n.type === 'source').length,
            content: nodes.filter(n => n.type === 'content').length,
            agents: nodes.filter(n => n.type === 'agent').length
          },
          generatedAt: new Date().toISOString()
        }
      };
    } finally {
      client.release();
    }
  }
  
  async function generateGraphData(registry: KoiRegistry, agentMappings: Record<string, any>) {
    const client = await registry.db.pool.connect();
    try {
      // Get sources, content samples, and processing data
      const [sourcesResult, contentSamplesResult, processingResult] = await Promise.all([
        client.query('SELECT type, name, rid FROM koi_sources ORDER BY type, name'),
        client.query(`
          SELECT kc.rid, kc.source_rid, kc.title, ks.name as source_name, ks.type as source_type
          FROM koi_content kc 
          JOIN koi_sources ks ON kc.source_rid = ks.rid 
          ORDER BY RANDOM() 
          LIMIT 20
        `),
        client.query(`
          SELECT DISTINCT agent_id, COUNT(*) as processing_count
          FROM koi_processing 
          WHERE status = 'processed'
          GROUP BY agent_id
          ORDER BY processing_count DESC
          LIMIT 10
        `)
      ]);
      
      const nodes = [];
      const links = [];
      
      // Add source nodes
      sourcesResult.rows.forEach(source => {
        nodes.push({
          id: source.rid,
          name: source.name,
          type: 'source',
          group: 1,
          color: '#2196F3', // Blue
          size: 15,
          title: `Source: ${source.name}\nType: ${source.type}\nRID: ${source.rid}`
        });
      });
      
      // Add content sample nodes and links to sources
      contentSamplesResult.rows.forEach(content => {
        const nodeId = content.rid;
        nodes.push({
          id: nodeId,
          name: content.title || 'Untitled Content',
          type: 'content',
          group: 2,
          color: '#4CAF50', // Green
          size: 8,
          title: `Content: ${content.title || 'Untitled'}\nSource: ${content.source_name}\nRID: ${content.rid}`
        });
        
        // Link content to its source
        links.push({
          source: content.source_rid,
          target: nodeId,
          type: 'contains',
          strength: 0.5
        });
      });
      
      // Add agent nodes and links to content
      processingResult.rows.forEach(agent => {
        const agentId = agent.agent_id;
        let agentName = agentId;
        
        // Resolve agent name
        if (agentId.match(/^[0-9a-f-]{36}$/i) && agentMappings[agentId]) {
          agentName = agentMappings[agentId].characterName || agentMappings[agentId].name;
        } else {
          const nameMap = {
            'voice-of-nature': 'VoiceOfNature',
            'regenai': 'RegenAI',
            'facilitator': 'RegenAI Facilitator',
            'narrator': 'Narrator',
            'governor': 'Governor'
          };
          agentName = nameMap[agentId.toLowerCase()] || agentId;
        }
        
        const nodeId = `agent:${agentId}`;
        nodes.push({
          id: nodeId,
          name: agentName,
          type: 'agent',
          group: 3,
          color: '#FF9800', // Orange
          size: 12,
          title: `Agent: ${agentName}\nProcessed: ${agent.processing_count} items\nID: ${agentId}`
        });
        
        // Link agents to content they've processed (sample connections)
        contentSamplesResult.rows.slice(0, Math.min(5, contentSamplesResult.rows.length)).forEach(content => {
          if (Math.random() > 0.7) { // Random connections for demo
            links.push({
              source: nodeId,
              target: content.rid,
              type: 'processes',
              strength: 0.3
            });
          }
        });
      });
      
      return {
        nodes,
        links,
        metadata: {
          totalNodes: nodes.length,
          totalLinks: links.length,
          nodeTypes: {
            sources: nodes.filter(n => n.type === 'source').length,
            content: nodes.filter(n => n.type === 'content').length,
            agents: nodes.filter(n => n.type === 'agent').length
          },
          generatedAt: new Date().toISOString()
        }
      };
      
    } finally {
      client.release();
    }
  }
  
  // Agent mapping cache
  let agentMappings: Record<string, any> = {};
  
  // Function to fetch agent mappings from ElizaOS
  async function fetchAgentMappings() {
    try {
      const response = await fetch('http://localhost:3000/api/agents');
      const data = await response.json();
      
      agentMappings = {};
      if (data.success && data.data?.agents) {
        data.data.agents.forEach(agent => {
          agentMappings[agent.id] = {
            name: agent.name,
            characterName: agent.characterName,
            status: agent.status,
            displayName: agent.characterName || agent.name || agent.id
          };
        });
      }
      
      // Add legacy mappings
      const legacyMappings = {
        'voice-of-nature': { displayName: 'VoiceOfNature', status: 'legacy' },
        'voiceofnature': { displayName: 'VoiceOfNature', status: 'legacy' },
        'regenai': { displayName: 'RegenAI', status: 'legacy' },
        'facilitator': { displayName: 'RegenAI Facilitator', status: 'legacy' },
        'regenaifacilitator': { displayName: 'RegenAI Facilitator', status: 'legacy' },
        'narrator': { displayName: 'Narrator', status: 'legacy' },
        'narrative': { displayName: 'Narrator', status: 'legacy' },
        'governor': { displayName: 'Governor', status: 'legacy' }
      };
      
      Object.entries(legacyMappings).forEach(([id, info]) => {
        if (!agentMappings[id]) {
          agentMappings[id] = info;
        }
      });
      
      logger.info(`Fetched ${Object.keys(agentMappings).length} agent mappings (${data.data?.agents?.length || 0} active + ${Object.keys(legacyMappings).length} legacy)`);
    } catch (error) {
      logger.error('Failed to fetch agent mappings:', error);
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
        
        /* RID Showcase Styles */
        .rid-example {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 12px;
            margin: 8px 0;
        }
        .rid-type {
            font-size: 0.8em;
            color: #6c757d;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .rid-value {
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            color: #495057;
            background: #e9ecef;
            padding: 4px 8px;
            border-radius: 4px;
            margin: 4px 0;
            cursor: pointer;
            word-break: break-all;
        }
        .rid-value:hover {
            background: #dee2e6;
        }
        .rid-description {
            font-size: 0.85em;
            color: #6c757d;
            margin-top: 4px;
        }
        
        /* Clickable source items */
        .stat-item.clickable {
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .stat-item.clickable:hover {
            background-color: rgba(76, 175, 80, 0.15);
        }
        
        /* Enhanced grid layout */
        .stats-grid {
            margin-bottom: 20px;
        }
        
        /* Graph controls */
        .graph-controls {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .graph-legend {
            font-size: 0.9em;
            color: #666;
            margin-left: auto;
        }
        
        /* Demo highlights */
        .demo-highlights {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .highlight-card {
            background: linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%);
            border: 1px solid #c8e6c9;
            border-radius: 8px;
            padding: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .highlight-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        }
        .highlight-card h4 {
            margin: 0 0 10px 0;
            color: #2e7d32;
            font-size: 1.1em;
        }
        .highlight-card p {
            margin: 0;
            color: #424242;
            line-height: 1.4;
            font-size: 0.9em;
        }
        
        /* Modal styles for source drill-down */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        .modal-content {
            background-color: #fefefe;
            margin: 2% auto;
            padding: 20px;
            border-radius: 12px;
            width: 90%;
            max-width: 1000px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
        }
        .modal-close {
            position: absolute;
            top: 15px;
            right: 25px;
            color: #aaa;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }
        .modal-close:hover {
            color: #000;
        }
        .source-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 16px;
            margin: 10px 0;
            background: white;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        }
        .source-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .source-type-badge {
            display: inline-block;
            background: #e8f4ea;
            color: #2c5530;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            margin-left: 10px;
        }
        .content-item {
            border: 1px solid #eee;
            border-radius: 6px;
            padding: 12px;
            margin: 8px 0;
            background: #fafafa;
        }
        .content-item h5 {
            margin: 0 0 8px 0;
            color: #2c5530;
        }
        .rid-display {
            font-family: 'Courier New', monospace;
            font-size: 0.8em;
            color: #666;
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
        }
        .subgraph-container {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
            background: #f8f9fa;
        }
        .loading-spinner {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .sources-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌿 ReGen AI KOI Node</h1>
            <p>Production Knowledge Organization Infrastructure • 27K+ Documents • BlockScience Compatible</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px; font-size: 0.9em;">
                <span style="background: rgba(76, 175, 80, 0.1); padding: 5px 10px; border-radius: 15px; color: #2e7d32;">
                    🟢 RID v3 Ready
                </span>
                <span style="background: rgba(33, 150, 243, 0.1); padding: 5px 10px; border-radius: 15px; color: #1565c0;">
                    🔗 Federation Ready
                </span>
                <span style="background: rgba(255, 152, 0, 0.1); padding: 5px 10px; border-radius: 15px; color: #e65100;">
                    📊 Production Scale
                </span>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="card">
                <h3>📊 Document Tracking</h3>
                <div class="info-note">
                    💡 <strong>KOI Coverage:</strong> KOI tracks a subset of ElizaOS documents for knowledge organization. Each tracked document can be processed by multiple agents.
                </div>
                <div id="contentStats">Loading...</div>
            </div>
            <div class="card">
                <h3>🤖 Agent Status</h3>
                <div class="info-note">
                    🔄 <strong>Agent Deduplication:</strong> Legacy and current agents are merged by name for accurate statistics.
                </div>
                <div id="agentStats">Loading...</div>
            </div>
            <div class="card">
                <h3>📚 Content Sources</h3>
                <div class="info-note">
                    📈 <strong>KOI Source Tracking:</strong> Shows how many documents KOI is currently tracking from each configured source. Click to explore individual content items.
                </div>
                <div id="sourceStats">Loading...</div>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="card">
                <h3>🗂️ Hierarchical Content Sources</h3>
                <div class="info-note">
                    🎯 <strong>Source Explorer:</strong> High-level content sources with drill-down capability. Each source shows sample content and RID hierarchy.
                </div>
                <div id="contentSourcesHierarchy">Loading...</div>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="card">
                <h3>🏷️ RID System Showcase</h3>
                <div class="info-note">
                    🎯 <strong>Reference Identifiers (RIDs):</strong> BlockScience KOI standard for knowledge organization. Format: relevance.type.subject.version
                </div>
                <div id="ridShowcase">Loading...</div>
            </div>
            <div class="card">
                <h3>📈 System Metrics</h3>
                <div class="info-note">
                    📊 <strong>Production Readiness:</strong> Real-time metrics demonstrating operational maturity for KOI federation.
                </div>
                <div id="systemMetrics">Loading...</div>
            </div>
        </div>
        
        <div class="query-section">
            <h3>🕸️ Knowledge Graph Visualization</h3>
            <div class="info-note">
                🌐 <strong>Interactive Graph:</strong> Explore RID relationships - Sources (🟦), Content (🟩), Agents (🟨). Click and drag to explore connections.
            </div>
            <div class="graph-controls">
                <button class="btn" onclick="loadGraph()">Load Graph</button>
                <button class="btn" onclick="resetGraph()">Reset View</button>
                <span class="graph-legend">
                    🟦 Sources • 🟩 Content • 🟨 Agents
                </span>
            </div>
            <div id="knowledge-graph" style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa;">
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
                    Click "Load Graph" to visualize KOI relationships
                </div>
            </div>
        </div>
        
        <div class="query-section">
            <h3>🎯 BlockScience Demo Highlights</h3>
            <div class="demo-highlights">
                <div class="highlight-card">
                    <h4>🏗️ Production Maturity</h4>
                    <p>27,000+ documents actively tracked across multiple agents with real-time processing status and operational monitoring.</p>
                </div>
                <div class="highlight-card">
                    <h4>🏷️ RID Implementation</h4>
                    <p>Already using RID patterns (relevance.type.subject.version) - ready for immediate upgrade to BlockScience v3 specification.</p>
                </div>
                <div class="highlight-card">
                    <h4>🔗 Federation Architecture</h4>
                    <p>Hybrid PostgreSQL + API design supports both local performance and KOI-net protocol integration.</p>
                </div>
                <div class="highlight-card">
                    <h4>🌐 Semantic Vision</h4>
                    <p>Architecture planned for RDF/SPARQL/OWL integration to align with Regen Network's ecological knowledge standards.</p>
                </div>
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
    
    <!-- Source Detail Modal -->
    <div id="sourceModal" class="modal">
        <div class="modal-content">
            <span class="modal-close" onclick="closeSourceModal()">&times;</span>
            <div id="sourceModalContent">
                <div class="loading-spinner">Loading source details...</div>
            </div>
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

        async function loadContentSources() {
            try {
                const response = await fetch('content-sources');
                const data = await response.json();
                updateContentSourcesDisplay(data);
            } catch (error) {
                console.error('Failed to load content sources:', error);
                document.getElementById('contentSourcesHierarchy').innerHTML = 
                    '<div class="error">Failed to load content sources</div>';
            }
        }

        function updateStatsDisplay() {
            // Enhanced Content Stats with clear terminology
            const content = stats.content || {};
            const metadata = stats.metadata || {};
            
            const totalDocuments = content.totalUniqueDocuments || 0;
            const totalMemories = metadata.totalMemoryRecords || 0;
            const agentProcessingJobs = content.totalProcessingOperations || 0;
            const avgAgentsPerDoc = totalDocuments > 0 ? Math.round((agentProcessingJobs / totalDocuments) * 10) / 10 : 0;
            
            const contentHtml = \`
                <div class="stat-item" title="Documents currently tracked and organized by KOI">
                    <span>📄 Documents in KOI:</span><span class="stat-value">\${totalDocuments.toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Total documents in ElizaOS system">
                    <span>💾 Total ElizaOS Docs:</span><span class="stat-value">\${totalMemories.toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Percentage of ElizaOS documents tracked by KOI">
                    <span>📈 KOI Coverage:</span><span class="stat-value">\${metadata.koiCoverage || 0}%</span>
                </div>
                <div class="stat-item" title="Average number of agents that have processed each document">
                    <span>🤖 Avg Agents/Doc:</span><span class="stat-value">\${avgAgentsPerDoc}</span>
                </div>
            \`;
            document.getElementById('contentStats').innerHTML = contentHtml;

            // Enhanced Agent Stats (already merged on server)
            const agents = stats.agents || {};
            
            const agentHtml = Object.entries(agents)
                .filter(([name, data]) => (data.processed || 0) > 0) // Only show agents with processed content
                .sort(([,a], [,b]) => (b.processed || 0) - (a.processed || 0)) // Sort by processed count
                .map(([displayName, data]) => {
                    const processedCount = data.processed || 0;
                    const pendingCount = data.pending || 0;
                    const failedCount = data.failed || 0;
                    const isCurrentAgent = data.isCurrentAgent;
                    const statusIcon = isCurrentAgent ? '🟢' : '⚫';
                    
                    const tooltip = \`Agent: \${displayName}\\nProcessed: \${processedCount.toLocaleString()}\\nPending: \${pendingCount.toLocaleString()}\\nFailed: \${failedCount}\\nStatus: \${isCurrentAgent ? 'Active' : 'Legacy'}\`;
                    
                    return \`<div class="stat-item" title="\${tooltip}">
                        <span>\${statusIcon} \${displayName}:</span>
                        <span class="stat-value">\${processedCount.toLocaleString()} processed\${pendingCount > 0 ? \`, \${pendingCount.toLocaleString()} pending\` : ''}\${failedCount > 0 ? \`, \${failedCount} failed\` : ''}</span>
                    </div>\`;
                }).join('');
            document.getElementById('agentStats').innerHTML = agentHtml || '<div class="stat-item">No agent data</div>';

            // Enhanced Source Stats with clear explanations
            const sources = stats.sources?.sources || [];
            const sourceHtml = sources
                .filter(source => source.content_count > 0)
                .map(source => {
                    const processedPercent = source.content_count > 0 ? Math.round((source.processed_count / source.content_count) * 100) : 0;
                    const count = parseInt(source.content_count);
                    
                    // Add context for major discrepancies
                    let contextNote = '';
                    if (source.type === 'twitter' && count < 100) {
                        contextNote = ' (KOI tracking limited)';
                    } else if (source.type === 'rag-service-main-upload' && count > 10000) {
                        contextNote = ' (bulk uploads)';
                    }
                    
                    const tooltip = \`Source: \${source.name}\\nType: \${source.type}\\nKOI Tracked: \${count.toLocaleString()} documents\\nProcessed: \${source.processed_count} (\${processedPercent}%)\\nRID: \${source.rid}\\n\\nNote: This shows only documents currently tracked by KOI, not all available content from this source.\`;
                    
                    // Use description if available, otherwise fall back to count
                    const displayText = source.description || \`\${count.toLocaleString()} tracked\`;
                    return \`<div class="stat-item clickable" title="\${tooltip}" onclick="showSourceDetails('\${source.rid}')">
                        <span>📁 \${source.type}\${contextNote}:</span>
                        <span class="stat-value">\${displayText}</span>
                    </div>\`;
                }).join('');
            
            // Add explanation for low numbers
            const explanationHtml = \`
                <div class="stat-item" style="background: #fff3cd; border-left: 4px solid #ffc107; font-size: 0.85em; color: #856404; margin-top: 10px;">
                    <span>ℹ️ KOI tracks \${(stats.metadata?.koiCoverage || 0)}% of ElizaOS content. Missing content indicates KOI integration gaps.</span>
                </div>
            \`;
            
            document.getElementById('sourceStats').innerHTML = sourceHtml + explanationHtml || '<div class="stat-item">No source data</div>';
            
            // RID System Showcase
            const ridExamples = [
                {
                    rid: 'core.source.twitter-regennetwork.v1.0.0',
                    description: 'Twitter source for @regennetwork account',
                    type: 'Source RID'
                },
                {
                    rid: 'relevant.content.tweet-1234567890.v1.0.0', 
                    description: 'Individual tweet from the source',
                    type: 'Content RID'
                },
                {
                    rid: 'core.source.rag-service-main-upload.v1.0.0',
                    description: 'Primary document upload source',
                    type: 'Source RID'
                }
            ];
            
            const ridHtml = ridExamples.map(example => 
                \`<div class="rid-example">
                    <div class="rid-type">\${example.type}</div>
                    <div class="rid-value" title="Click to copy">\${example.rid}</div>
                    <div class="rid-description">\${example.description}</div>
                </div>\`
            ).join('');
            
            document.getElementById('ridShowcase').innerHTML = ridHtml;
            
            // System Metrics
            const systemMetadata = stats.metadata || {};
            const systemHtml = \`
                <div class="stat-item" title="Last time statistics were updated">
                    <span>🕐 Last Updated:</span><span class="stat-value">\${new Date(systemMetadata.lastUpdated || Date.now()).toLocaleTimeString()}</span>
                </div>
                <div class="stat-item" title="Total documents in ElizaOS memories table">
                    <span>💾 Total Memories:</span><span class="stat-value">\${(systemMetadata.totalMemoryRecords || 0).toLocaleString()}</span>
                </div>
                <div class="stat-item" title="Percentage of memories tracked by KOI">
                    <span>📊 KOI Coverage:</span><span class="stat-value">\${systemMetadata.koiCoverage || 0}%</span>
                </div>
                <div class="stat-item" title="Total sources registered in KOI">
                    <span>📚 Total Sources:</span><span class="stat-value">\${(stats.sources?.total || 0)}</span>
                </div>
            \`;
            document.getElementById('systemMetrics').innerHTML = systemHtml;
        }
        
        function updateContentSourcesDisplay(data) {
            const container = document.getElementById('contentSourcesHierarchy');
            
            if (!data.sources || data.sources.length === 0) {
                container.innerHTML = '<div class="info-note">No content sources found</div>';
                return;
            }
            
            let html = '<div class="sources-grid">';
            
            data.sources.forEach(source => {
                const processingRate = source.stats.processingRate || 0;
                const statusColor = processingRate > 80 ? '#4CAF50' : processingRate > 50 ? '#FF9800' : '#f44336';
                
                html += \`
                    <div class="source-card" onclick="openSourceModal('\${source.rid}')">
                        <h4>\${source.name}<span class="source-type-badge">\${source.sourceType}</span></h4>
                        <p class="rid-display">\${source.rid}</p>
                        <p>\${source.description}</p>
                        <div style="margin: 10px 0;">
                            <div>📄 <strong>\${source.totalItems.toLocaleString()}</strong> items tracked</div>
                            <div>✅ <strong>\${source.stats.processed}</strong> processed (\${processingRate}%)</div>
                            <div>⏳ <strong>\${source.stats.pending}</strong> pending</div>
                            \${source.stats.failed > 0 ? \`<div>❌ <strong>\${source.stats.failed}</strong> failed</div>\` : ''}
                        </div>
                        <div style="font-size: 0.85em; color: #666;">
                            Last updated: \${new Date(source.lastUpdated).toLocaleDateString()}
                        </div>
                    </div>
                \`;
            });
            
            html += '</div>';
            
            // Add summary
            html += \`
                <div style="margin-top: 20px; padding: 15px; background: #f0f8f0; border-radius: 8px;">
                    <h5>📊 Summary</h5>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 10px;">
                        <div><strong>\${data.summary.totalSources}</strong><br>Sources</div>
                        <div><strong>\${data.summary.totalItems.toLocaleString()}</strong><br>Total Items</div>
                        <div><strong>\${data.summary.totalProcessed.toLocaleString()}</strong><br>Processed</div>
                        <div><strong>\${data.summary.avgProcessingRate}%</strong><br>Avg Rate</div>
                    </div>
                </div>
            \`;
            
            container.innerHTML = html;
        }
        
        async function openSourceModal(sourceRid) {
            const modal = document.getElementById('sourceModal');
            const content = document.getElementById('sourceModalContent');
            
            // Show modal with loading state
            modal.style.display = 'block';
            content.innerHTML = '<div class="loading-spinner">Loading source details...</div>';
            
            try {
                const response = await fetch(\`content-sources/\${sourceRid}\`);
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load source details');
                }
                
                displaySourceDetails(data);
            } catch (error) {
                content.innerHTML = \`<div class="error">Error loading source details: \${error.message}</div>\`;
            }
        }
        
        function displaySourceDetails(data) {
            const content = document.getElementById('sourceModalContent');
            const source = data.source;
            
            let html = \`
                <h2>\${source.name}</h2>
                <p class="rid-display" style="margin: 10px 0;">\${source.rid}</p>
                <p>\${source.description}</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                    <div>
                        <h4>📊 Statistics</h4>
                        <div>Total Items: <strong>\${source.totalItems}</strong></div>
                        <div>Source Type: <strong>\${source.sourceType}</strong></div>
                        <div>Access Level: <strong>\${source.accessLevel}</strong></div>
                    </div>
                    <div>
                        <h4>🤖 Agent Usage</h4>
                        \${data.agentUsage.slice(0, 3).map(agent => 
                            \`<div>\${agent.displayName}: <strong>\${agent.processedCount}</strong> processed</div>\`
                        ).join('')}
                    </div>
                </div>
                
                <h4>📄 Sample Content Items</h4>
                <div style="max-height: 300px; overflow-y: auto;">
            \`;
            
            data.contentItems.forEach(item => {
                // Check if this is a container that can be drilled into
                const isContainer = item.metadata && (
                    (item.metadata.contentType === 'twitter' && item.metadata.tweets) ||
                    (item.metadata.size && item.metadata.size > 1)
                );
                
                const drillButton = isContainer ? 
                    \`<button class="btn" style="margin-top: 8px; font-size: 0.8em;" onclick="drillIntoContent('\${source.rid}', '\${item.rid}')">
                        View Individual Items (\${item.metadata.tweets || item.metadata.size || 'unknown'})
                    </button>\` : '';
                
                html += \`
                    <div class="content-item">
                        <h5>\${item.title}</h5>
                        <p class="rid-display">\${item.rid}</p>
                        <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                            Type: \${item.contentType} • 
                            Processed: \${item.processedCount}/\${item.processingCount} times • 
                            Created: \${new Date(item.createdAt).toLocaleDateString()}
                            \${item.metadata.tweets ? \`<br>Contains: \${item.metadata.tweets} tweets\` : ''}
                        </div>
                        \${drillButton}
                    </div>
                \`;
            });
            
            html += '</div>';
            
            // Add subgraph visualization if available
            if (data.subgraph && data.subgraph.nodes.length > 0) {
                html += \`
                    <h4 style="margin-top: 20px;">🕸️ Knowledge Subgraph</h4>
                    <div class="subgraph-container">
                        <button class="btn" onclick="loadSourceSubgraph('\${source.rid}')">Load Interactive Graph</button>
                        <div>
                            <strong>Nodes:</strong> \${data.subgraph.metadata.totalNodes} 
                            (Sources: \${data.subgraph.metadata.nodeTypes.sources}, 
                            Content: \${data.subgraph.metadata.nodeTypes.content}, 
                            Agents: \${data.subgraph.metadata.nodeTypes.agents})
                        </div>
                    </div>
                \`;
            }
            
            content.innerHTML = html;
        }
        
        function closeSourceModal() {
            document.getElementById('sourceModal').style.display = 'none';
        }
        
        async function loadSourceSubgraph(sourceRid) {
            try {
                const response = await fetch(\`graph?center=\${sourceRid}&depth=2&limit=15\`);
                const graphData = await response.json();
                
                if (!response.ok) {
                    throw new Error(graphData.error || 'Failed to load subgraph');
                }
                
                // Close modal and load graph in main view
                closeSourceModal();
                renderGraph(graphData);
                
                // Scroll to graph section
                document.getElementById('knowledge-graph').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('Failed to load source subgraph:', error);
                alert('Failed to load subgraph: ' + error.message);
            }
        }
        
        async function drillIntoContent(sourceRid, contentRid) {
            const content = document.getElementById('sourceModalContent');
            
            // Show loading state
            content.innerHTML = '<div class="loading-spinner">Loading individual content items...</div>';
            
            try {
                const response = await fetch(\`content-sources/\${sourceRid}/content/\${contentRid}\`);
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load content details');
                }
                
                displayContentDetails(data);
            } catch (error) {
                content.innerHTML = \`<div class="error">Error loading content details: \${error.message}</div>\`;
            }
        }
        
        function displayContentDetails(data) {
            const content = document.getElementById('sourceModalContent');
            const container = data.container;
            const items = data.individualItems || [];
            
            let html = \`
                <div style="margin-bottom: 15px;">
                    <button class="btn" onclick="openSourceModal('\${container.sourceRid}')" style="background: #666;">← Back to Source</button>
                </div>
                
                <h2>📦 \${container.title}</h2>
                <p class="rid-display" style="margin: 10px 0;">\${container.rid}</p>
                
                <div style="background: #f0f8f0; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <h4>\${data.summary.containerType}</h4>
                    <div style="margin-top: 10px;">
                        <strong>Total Items:</strong> \${data.summary.totalTweets || data.summary.totalPages || container.totalItems || 'unknown'}<br>
                        \${data.summary.totalDomains ? \`<strong>Domains:</strong> \${data.summary.totalDomains}<br>\` : ''}
                        <strong>Sample Size:</strong> \${items.length}<br>
                        <strong>Coverage:</strong> \${data.summary.coverage || 'N/A'}
                        \${data.summary.indexingSource ? \`<br><small>\${data.summary.indexingSource}</small>\` : ''}
                    </div>
                </div>
            \`;
            
            // Special handling for website domain breakdown
            if (data.domainBreakdown && data.domainBreakdown.length > 0) {
                html += \`
                    <h4>🌐 Domains Breakdown</h4>
                    <div style="margin: 15px 0;">
                \`;
                
                data.domainBreakdown.forEach(domain => {
                    html += \`
                        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 8px 0; background: #f8f9fa;">
                            <h5 style="margin: 0 0 8px 0; color: #2c5530;">🌐 \${domain.domain}</h5>
                            <div style="font-size: 0.9em; color: #666;">
                                <strong>\${domain.pageCount}</strong> pages indexed
                            </div>
                        </div>
                    \`;
                });
                
                html += \`</div><h4>📄 Individual Pages (RID Level)</h4>\`;
            } else {
                html += \`<h4>\${data.itemType === 'tweets' ? '🐦' : '📄'} Individual \${data.itemType || 'Items'} (RID Level)</h4>\`;
            }
            
            html += '<div style="max-height: 400px; overflow-y: auto; margin-top: 15px;">';
            
            if (items.length === 0) {
                html += \`
                    <div class="info-note">
                        \${data.summary.note || 'No individual items found or drilling not yet implemented for this content type.'}
                    </div>
                \`;
            } else {
                items.forEach((item, index) => {
                    html += \`
                        <div class="content-item" style="margin: 10px 0;">
                            <div style="display: flex; justify-content: space-between; align-items: start;">
                                <div style="flex: 1;">
                                    <h6 style="margin: 0 0 5px 0; color: #2c5530;">\${item.title}</h6>
                                    <p class="rid-display" style="margin: 5px 0;">\${item.rid}</p>
                                    <div style="font-size: 0.85em; color: #666; margin: 8px 0;">
                                        Memory ID: \${item.memoryId}<br>
                                        Agent: \${item.agentId || 'N/A'} • 
                                        Created: \${new Date(item.createdAt).toLocaleDateString()}
                                    </div>
                                    <div style="font-size: 0.9em; background: #f8f9fa; padding: 8px; border-radius: 4px; margin-top: 8px;">
                                        \${item.content}
                                    </div>
                                </div>
                                <div style="font-size: 0.8em; color: #999; margin-left: 10px;">
                                    #\${index + 1}
                                </div>
                            </div>
                        </div>
                    \`;
                });
                
                if (data.pagination && data.pagination.hasMore) {
                    html += \`
                        <div style="text-align: center; margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 8px;">
                            <strong>Showing \${items.length} of \${data.pagination.total} total items</strong><br>
                            <small>Performance limited to first 50 items for demo purposes</small>
                        </div>
                    \`;
                }
            }
            
            html += '</div>';
            
            content.innerHTML = html;
        }

        function showSourceDetails(sourceRid) {
            // Legacy function - now redirects to modal
            openSourceModal(sourceRid);
        }
        
        // Graph visualization
        let graphInstance = null;
        
        async function loadGraph() {
            try {
                const response = await fetch('graph');
                const graphData = await response.json();
                
                if (!response.ok) {
                    throw new Error(graphData.error || 'Failed to load graph');
                }
                
                renderGraph(graphData);
            } catch (error) {
                console.error('Failed to load graph:', error);
                document.getElementById('knowledge-graph').innerHTML = 
                    \`<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #e74c3c;">
                        Error loading graph: \${error.message}
                    </div>\`;
            }
        }
        
        function renderGraph(data) {
            const container = document.getElementById('knowledge-graph');
            container.innerHTML = ''; // Clear existing content
            
            const width = container.offsetWidth;
            const height = 400;
            
            // Create SVG
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', width);
            svg.setAttribute('height', height);
            svg.style.background = '#f8f9fa';
            container.appendChild(svg);
            
            // Simple force simulation using basic positioning
            const nodes = data.nodes.map(d => ({
                ...d,
                x: Math.random() * width,
                y: Math.random() * height,
                vx: 0,
                vy: 0
            }));
            
            const links = data.links;
            
            // Draw links
            links.forEach(link => {
                const sourceNode = nodes.find(n => n.id === link.source);
                const targetNode = nodes.find(n => n.id === link.target);
                
                if (sourceNode && targetNode) {
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', sourceNode.x);
                    line.setAttribute('y1', sourceNode.y);
                    line.setAttribute('x2', targetNode.x);
                    line.setAttribute('y2', targetNode.y);
                    line.setAttribute('stroke', '#999');
                    line.setAttribute('stroke-width', '1');
                    line.setAttribute('opacity', '0.6');
                    svg.appendChild(line);
                }
            });
            
            // Draw nodes
            nodes.forEach(node => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', node.x);
                circle.setAttribute('cy', node.y);
                circle.setAttribute('r', node.size || 8);
                circle.setAttribute('fill', node.color);
                circle.setAttribute('stroke', '#fff');
                circle.setAttribute('stroke-width', '2');
                circle.style.cursor = 'pointer';
                
                // Add hover effect
                circle.addEventListener('mouseenter', () => {
                    circle.setAttribute('r', (node.size || 8) * 1.3);
                    showTooltip(node.title || node.name, event);
                });
                
                circle.addEventListener('mouseleave', () => {
                    circle.setAttribute('r', node.size || 8);
                    hideTooltip();
                });
                
                circle.addEventListener('click', () => {
                    alert(\`Node Details:\\n\${node.title || node.name}\\n\\nType: \${node.type}\\nRID: \${node.id}\`);
                });
                
                svg.appendChild(circle);
                
                // Add labels
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', node.x);
                text.setAttribute('y', node.y + (node.size || 8) + 15);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', '10');
                text.setAttribute('fill', '#333');
                text.textContent = node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name;
                svg.appendChild(text);
            });
            
            // Add graph metadata
            const graphMetadata = document.createElement('div');
            graphMetadata.style.cssText = 'position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 4px; font-size: 12px;';
            graphMetadata.innerHTML = \`
                <strong>Graph Info:</strong><br>
                Nodes: \${data.metadata.totalNodes}<br>
                Links: \${data.metadata.totalLinks}<br>
                Sources: \${data.metadata.nodeTypes.sources}<br>
                Content: \${data.metadata.nodeTypes.content}<br>
                Agents: \${data.metadata.nodeTypes.agents}
            \`;
            container.style.position = 'relative';
            container.appendChild(graphMetadata);
            
            console.log('Graph rendered:', data.metadata);
        }
        
        function resetGraph() {
            const container = document.getElementById('knowledge-graph');
            container.innerHTML = \`
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
                    Click "Load Graph" to visualize KOI relationships
                </div>
            \`;
        }
        
        function showTooltip(text, event) {
            let tooltip = document.getElementById('graph-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'graph-tooltip';
                tooltip.style.cssText = 'position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 1000; max-width: 200px;';
                document.body.appendChild(tooltip);
            }
            tooltip.textContent = text;
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
            tooltip.style.display = 'block';
        }
        
        function hideTooltip() {
            const tooltip = document.getElementById('graph-tooltip');
            if (tooltip) {
                tooltip.style.display = 'none';
            }
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
            await loadContentSources();
        }
        
        initializeDashboard();
        
        // Auto-refresh agent mapping, stats, and content sources every 30 seconds
        setInterval(async () => {
            await loadAgentMap();
            await loadStats();
            await loadContentSources();
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
                status: agent.status,
                displayName: agent.characterName || agent.name || agent.id
              };
            });
          }
          
          // Add legacy mappings for old agent IDs
          const legacyMappings = {
            'voice-of-nature': { displayName: 'VoiceOfNature', status: 'legacy' },
            'voiceofnature': { displayName: 'VoiceOfNature', status: 'legacy' },
            'regenai': { displayName: 'RegenAI', status: 'legacy' },
            'facilitator': { displayName: 'RegenAI Facilitator', status: 'legacy' },
            'regenaifacilitator': { displayName: 'RegenAI Facilitator', status: 'legacy' },
            'narrator': { displayName: 'Narrator', status: 'legacy' },
            'narrative': { displayName: 'Narrator', status: 'legacy' },
            'governor': { displayName: 'Governor', status: 'legacy' }
          };
          
          Object.entries(legacyMappings).forEach(([id, info]) => {
            if (!agentMap[id]) {
              agentMap[id] = info;
            }
          });
          
          return new Response(JSON.stringify(agentMap), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          logger.error('Failed to fetch agent info:', error);
          return new Response(JSON.stringify({}, {
            headers: { ...headers, 'Content-Type': 'application/json' }
          }));
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
      
      // Content sources endpoint - hierarchical source view
      if (url.pathname === '/content-sources') {
        const sourcesData = await generateContentSourcesView(registry);
        return new Response(JSON.stringify(sourcesData), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      // Individual source drill-down endpoint
      if (url.pathname.startsWith('/content-sources/')) {
        const pathParts = url.pathname.split('/');
        const sourceRid = pathParts[2];
        
        // Check if this is a nested content drill-down
        if (pathParts.length > 4 && pathParts[3] === 'content') {
          const contentRid = pathParts[4];
          const contentDetails = await getContentDetails(registry, sourceRid, contentRid);
          return new Response(JSON.stringify(contentDetails), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } else {
          // Standard source details
          const sourceDetails = await getSourceDetails(registry, sourceRid);
          return new Response(JSON.stringify(sourceDetails), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }

      // Enhanced statistics with proper calculations
      if (url.pathname === '/stats') {
        // Refresh agent mappings to ensure we have current data
        await fetchAgentMappings();
        
        const rawStats = await registry.getStatistics();
        
        // Get enhanced source statistics
        const enhancedSourceStats = await getEnhancedSourceStats(registry);
        
        // Smart agent deduplication and merging
        const { mergedAgents, totalProcessingOperations } = await smartAgentMerging(registry, agentMappings);
        
        // Calculate corrected content statistics
        const correctedContentStats = {
          ...rawStats.content,
          totalProcessingOperations, // Total operations across all agents
          totalUniqueDocuments: rawStats.content.total, // Unique documents
          processingEfficiency: Math.round((totalProcessingOperations / rawStats.content.total) * 100) / 100
        };
        
        const enhancedStats = {
          sources: enhancedSourceStats,
          content: correctedContentStats,
          agents: mergedAgents,
          metadata: {
            lastUpdated: new Date().toISOString(),
            totalKoiRecords: rawStats.content.total,
            totalMemoryRecords: await getTotalMemoryCount(registry),
            koiCoverage: Math.round((rawStats.content.total / await getTotalMemoryCount(registry)) * 100)
          }
        };
        
        return new Response(JSON.stringify(enhancedStats), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      // Graph data endpoint with optional centered subgraph support
      if (url.pathname === '/graph') {
        try {
          const centerRid = url.searchParams.get('center');
          const depth = parseInt(url.searchParams.get('depth') || '2');
          const limit = parseInt(url.searchParams.get('limit') || '20');
          
          let graphData;
          if (centerRid) {
            // Return centered subgraph
            graphData = await generateSourceSubgraph(registry, centerRid, depth, limit);
          } else {
            // Return overview graph
            graphData = await generateGraphData(registry, agentMappings);
          }
          
          return new Response(JSON.stringify(graphData), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          logger.error('Graph generation error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to generate graph data',
            details: error.message
          }), {
            status: 500,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
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