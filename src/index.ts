/**
 * Knowledge Plugin - Main Entry Point
 *
 * This file exports all the necessary functions and types for the Knowledge plugin.
 */

console.log('[KNOWLEDGE-PLUGIN] Loading knowledge plugin index.ts...');

// CRITICAL: Import polyfills BEFORE any other imports to ensure they're available
import './polyfills';

import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { KnowledgeService } from './service';
import { knowledgeProvider } from './provider';
import knowledgeTestSuite from './tests';
import { knowledgeActions } from './actions';
import { knowledgeRoutes } from './routes';

console.log('[KNOWLEDGE-PLUGIN] Creating plugin object...');

/**
 * Knowledge Plugin - Provides Retrieval Augmented Generation capabilities
 */
export const knowledgePlugin: Plugin = {
  name: 'knowledge',
  description:
    'Plugin for Retrieval Augmented Generation, including knowledge management and embedding.',
  services: [KnowledgeService],
  providers: [knowledgeProvider],
  routes: knowledgeRoutes,
  actions: knowledgeActions,
  tests: [knowledgeTestSuite],
};

console.log('[KNOWLEDGE-PLUGIN] Plugin object created:', {
  name: knowledgePlugin.name,
  hasServices: !!knowledgePlugin.services,
  servicesCount: knowledgePlugin.services?.length,
  hasProviders: !!knowledgePlugin.providers,
  providersCount: knowledgePlugin.providers?.length,
});

export default knowledgePlugin;

// Also export as 'plugin' for compatibility
export { knowledgePlugin as plugin };

export * from './types';

console.log('[KNOWLEDGE-PLUGIN] Knowledge plugin exports complete');
