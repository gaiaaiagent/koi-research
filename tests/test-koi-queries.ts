#!/usr/bin/env bun

/**
 * Test KOI Query System
 */

import { logger } from '@elizaos/core';

const KOI_SERVER = process.env.KOI_SERVER || 'http://localhost:8100';

const testQueries = [
  "What content is in the RegenAI agent's RAG system?",
  "What content is in the Facilitator agent's RAG system?",
  "How many documents have been processed in total?",
  "What are the main content sources?",
  "Which agent has processed the most content?",
  "Find content about carbon credits",
  "What types of content are in the system?",
  "Show me statistics for all agents",
  "What content is from Notion?",
  "How many Twitter posts are indexed?"
];

async function runTests() {
  logger.info('Testing KOI Query System...\n');
  
  // Test health check
  try {
    const health = await fetch(`${KOI_SERVER}/health`);
    const healthData = await health.json();
    logger.info('✅ Health Check:', healthData);
  } catch (error) {
    logger.error('❌ Health check failed - is the server running?');
    logger.info('Start the server with: bun run /opt/projects/plugin-knowledge-gaia/scripts/koi-query-server.ts');
    return;
  }
  
  // Get statistics first
  try {
    logger.info('\n📊 Current Statistics:');
    const stats = await fetch(`${KOI_SERVER}/stats`);
    const statsData = await stats.json();
    logger.info(`  - Total Sources: ${statsData.sources.total}`);
    logger.info(`  - Total Content: ${statsData.content.total}`);
    logger.info(`  - Processed: ${statsData.content.processed}`);
    logger.info(`  - Agents: ${Object.keys(statsData.agents).length}`);
  } catch (error) {
    logger.error('Failed to get statistics:', error.message);
  }
  
  // Test each query
  logger.info('\n🧪 Testing Queries:\n');
  
  for (const query of testQueries) {
    try {
      logger.info(`📝 Query: "${query}"`);
      
      const response = await fetch(`${KOI_SERVER}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      });
      
      const result = await response.json();
      
      if (result.error) {
        logger.error(`❌ Error: ${result.error}`);
      } else if (result.answer) {
        const answer = typeof result.answer === 'string' 
          ? result.answer 
          : JSON.stringify(result.answer, null, 2);
        
        logger.info(`✅ Answer: ${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}`);
        logger.info(`   Confidence: ${result.confidence}`);
      } else {
        logger.error('❌ No answer received');
      }
      
      logger.info(''); // Empty line between queries
    } catch (error) {
      logger.error(`❌ Query failed: ${error.message}`);
    }
  }
  
  // Get suggested questions
  try {
    logger.info('\n💡 Suggested Questions:');
    const suggestions = await fetch(`${KOI_SERVER}/suggestions`);
    const suggestionsData = await suggestions.json();
    suggestionsData.suggestions.forEach((q, i) => {
      logger.info(`  ${i + 1}. ${q}`);
    });
  } catch (error) {
    logger.error('Failed to get suggestions:', error.message);
  }
  
  logger.info('\n✅ Test suite complete!');
}

runTests().catch(error => {
  logger.error('Test suite failed:', error);
  process.exit(1);
});