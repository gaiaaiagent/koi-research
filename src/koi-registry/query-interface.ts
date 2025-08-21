/**
 * KOI Query Interface for Natural Language Questions
 * 
 * Enables the KOI node to answer questions about what content
 * is in each agent's RAG system using natural language.
 */

import { logger } from '@elizaos/core';
import { KoiRegistry } from './index';
import { ContentItem, ContentSource } from './types';

interface QueryResult {
  question: string;
  answer: string | any;
  confidence: number;
  sources?: string[];
  timestamp: Date;
}

interface AgentContentSummary {
  agentName: string;
  totalDocuments: number;
  totalFragments: number;
  contentBreakdown: {
    bySource: Record<string, number>;
    byType: Record<string, number>;
    byRelevance: Record<string, number>;
  };
  topContent: Array<{
    title: string;
    source: string;
    relevance: string;
    fragmentCount: number;
  }>;
  lastUpdated: Date;
}

export class KoiQueryInterface {
  private registry: KoiRegistry;
  private queryCache: Map<string, QueryResult> = new Map();
  private cacheTimeout = 3600000; // 1 hour cache
  
  constructor(registry: KoiRegistry) {
    this.registry = registry;
  }

  /**
   * Answer a natural language question about RAG content
   */
  async answerQuestion(question: string): Promise<QueryResult> {
    const normalizedQuestion = question.toLowerCase().trim();
    
    // Check cache
    const cached = this.getCachedResult(normalizedQuestion);
    if (cached) {
      logger.debug(`Returning cached answer for: ${question}`);
      return cached;
    }
    
    logger.info(`Processing question: ${question}`);
    
    // Route to appropriate handler based on question pattern
    let result: QueryResult;
    
    if (this.isAgentContentQuestion(normalizedQuestion)) {
      result = await this.handleAgentContentQuestion(normalizedQuestion);
    } else if (this.isSourceQuestion(normalizedQuestion)) {
      result = await this.handleSourceQuestion(normalizedQuestion);
    } else if (this.isStatisticsQuestion(normalizedQuestion)) {
      result = await this.handleStatisticsQuestion(normalizedQuestion);
    } else if (this.isComparisonQuestion(normalizedQuestion)) {
      result = await this.handleComparisonQuestion(normalizedQuestion);
    } else if (this.isSearchQuestion(normalizedQuestion)) {
      result = await this.handleSearchQuestion(normalizedQuestion);
    } else {
      result = await this.handleGeneralQuestion(normalizedQuestion);
    }
    
    // Cache the result
    this.cacheResult(normalizedQuestion, result);
    
    return result;
  }

  /**
   * Check if question is about a specific agent's content
   */
  private isAgentContentQuestion(question: string): boolean {
    const agentPatterns = [
      'regenai',
      'facilitator',
      'voice of nature',
      'voiceofnature',
      'governor',
      'narrative',
      'agent\'s rag',
      'agent rag'
    ];
    
    return agentPatterns.some(pattern => question.includes(pattern));
  }

  /**
   * Handle questions about specific agent's RAG content
   */
  private async handleAgentContentQuestion(question: string): Promise<QueryResult> {
    // Extract agent name from question
    const agentName = this.extractAgentName(question);
    
    if (!agentName) {
      return {
        question,
        answer: 'Could not identify which agent you are asking about.',
        confidence: 0.3,
        timestamp: new Date()
      };
    }
    
    const summary = await this.getAgentContentSummary(agentName);
    
    // Format the answer based on what's being asked
    let answer: string | any;
    
    if (question.includes('how many') || question.includes('count')) {
      answer = `${summary.agentName} has processed ${summary.totalDocuments} documents containing ${summary.totalFragments} fragments.`;
    } else if (question.includes('what type') || question.includes('kinds')) {
      answer = {
        agent: summary.agentName,
        contentTypes: summary.contentBreakdown.byType,
        sources: summary.contentBreakdown.bySource
      };
    } else if (question.includes('top') || question.includes('main') || question.includes('important')) {
      answer = {
        agent: summary.agentName,
        topContent: summary.topContent
      };
    } else {
      // General question - return full summary
      answer = summary;
    }
    
    return {
      question,
      answer,
      confidence: 0.95,
      sources: [`koi:agent/${agentName}`],
      timestamp: new Date()
    };
  }

  /**
   * Extract agent name from question
   */
  private extractAgentName(question: string): string | null {
    const agentMappings: Record<string, string> = {
      'regenai': 'regenai',
      'regen ai': 'regenai',
      'facilitator': 'facilitator',
      'voice of nature': 'voiceofnature',
      'voiceofnature': 'voiceofnature',
      'governor': 'governor',
      'narrative': 'narrative',
      'narrator': 'narrative'
    };
    
    for (const [pattern, agentId] of Object.entries(agentMappings)) {
      if (question.includes(pattern)) {
        return agentId;
      }
    }
    
    return null;
  }

  /**
   * Get comprehensive summary for an agent
   */
  private async getAgentContentSummary(agentId: string): Promise<AgentContentSummary> {
    const allContent = await this.registry.content.getAllContent();
    const sources = await this.registry.sources.getAllSources();
    
    const summary: AgentContentSummary = {
      agentName: this.formatAgentName(agentId),
      totalDocuments: 0,
      totalFragments: 0,
      contentBreakdown: {
        bySource: {},
        byType: {},
        byRelevance: {}
      },
      topContent: [],
      lastUpdated: new Date()
    };
    
    const processedContent: Array<{
      item: ContentItem;
      fragmentCount: number;
      source: ContentSource | null;
    }> = [];
    
    for (const item of allContent) {
      const status = await this.registry.processing.getContentStatus(item.rid);
      const agentStatus = status[agentId];
      
      if (agentStatus && agentStatus.status === 'processed') {
        summary.totalDocuments++;
        summary.totalFragments += agentStatus.fragmentCount || 0;
        
        // Get source info
        const source = sources.find(s => s.rid === item.sourceRid);
        
        // Track for top content
        processedContent.push({
          item,
          fragmentCount: agentStatus.fragmentCount || 0,
          source
        });
        
        // Count by source type
        if (source) {
          summary.contentBreakdown.bySource[source.type] = 
            (summary.contentBreakdown.bySource[source.type] || 0) + 1;
        }
        
        // Count by content type and relevance (from RID)
        const ridParts = item.rid.split('.');
        if (ridParts.length >= 2) {
          const relevance = ridParts[0];
          const objectType = ridParts[1];
          
          summary.contentBreakdown.byRelevance[relevance] = 
            (summary.contentBreakdown.byRelevance[relevance] || 0) + 1;
          
          summary.contentBreakdown.byType[objectType] = 
            (summary.contentBreakdown.byType[objectType] || 0) + 1;
        }
      }
    }
    
    // Get top 10 content items by fragment count
    processedContent
      .sort((a, b) => b.fragmentCount - a.fragmentCount)
      .slice(0, 10)
      .forEach(({ item, fragmentCount, source }) => {
        const ridParts = item.rid.split('.');
        summary.topContent.push({
          title: item.title || 'Untitled',
          source: source?.name || 'Unknown',
          relevance: ridParts[0] || 'unknown',
          fragmentCount
        });
      });
    
    return summary;
  }

  /**
   * Format agent name for display
   */
  private formatAgentName(agentId: string): string {
    const nameMap: Record<string, string> = {
      'regenai': 'RegenAI',
      'facilitator': 'Facilitator',
      'voiceofnature': 'Voice of Nature',
      'governor': 'Governor',
      'narrative': 'Narrative'
    };
    
    return nameMap[agentId] || agentId;
  }

  /**
   * Check if question is about content sources
   */
  private isSourceQuestion(question: string): boolean {
    return question.includes('source') || 
           question.includes('where') ||
           question.includes('origin') ||
           question.includes('from');
  }

  /**
   * Handle questions about content sources
   */
  private async handleSourceQuestion(question: string): Promise<QueryResult> {
    const sources = await this.registry.sources.getAllSources();
    
    const sourcesSummary = sources.map(source => ({
      name: source.name,
      type: source.type,
      url: source.url,
      rid: source.rid
    }));
    
    let answer: string | any;
    
    if (question.includes('list') || question.includes('all')) {
      answer = sourcesSummary;
    } else if (question.includes('count') || question.includes('how many')) {
      const byType: Record<string, number> = {};
      sources.forEach(s => {
        byType[s.type] = (byType[s.type] || 0) + 1;
      });
      
      answer = {
        total: sources.length,
        byType
      };
    } else {
      answer = `There are ${sources.length} content sources including: ${sources.slice(0, 5).map(s => s.name).join(', ')}...`;
    }
    
    return {
      question,
      answer,
      confidence: 0.9,
      sources: sources.map(s => `koi:source/${s.rid}`),
      timestamp: new Date()
    };
  }

  /**
   * Check if question is about statistics
   */
  private isStatisticsQuestion(question: string): boolean {
    return question.includes('statistic') ||
           question.includes('how many') ||
           question.includes('total') ||
           question.includes('count') ||
           question.includes('number');
  }

  /**
   * Handle statistics questions
   */
  private async handleStatisticsQuestion(question: string): Promise<QueryResult> {
    const stats = await this.registry.getStatistics();
    
    let answer: string | any;
    
    if (question.includes('document')) {
      answer = `Total documents: ${stats.content.total} (Processed: ${stats.content.processed}, Pending: ${stats.content.pending}, Failed: ${stats.content.failed})`;
    } else if (question.includes('agent')) {
      answer = stats.agents;
    } else if (question.includes('source')) {
      answer = `Total sources: ${stats.sources.total} - ${Object.entries(stats.sources.byType).map(([type, count]) => `${type}: ${count}`).join(', ')}`;
    } else {
      answer = stats;
    }
    
    return {
      question,
      answer,
      confidence: 1.0,
      timestamp: new Date()
    };
  }

  /**
   * Check if question is comparing agents
   */
  private isComparisonQuestion(question: string): boolean {
    return question.includes('compar') ||
           question.includes('difference') ||
           question.includes('which agent') ||
           question.includes('most') ||
           question.includes('least');
  }

  /**
   * Handle comparison questions
   */
  private async handleComparisonQuestion(question: string): Promise<QueryResult> {
    const stats = await this.registry.getStatistics();
    
    const agentComparison = Object.entries(stats.agents).map(([agentId, agentStats]) => ({
      agent: this.formatAgentName(agentId),
      processed: agentStats.processed,
      pending: agentStats.pending,
      failed: agentStats.failed,
      totalFragments: agentStats.totalFragments || 0,
      avgProcessingTime: agentStats.avgProcessingTime
    }));
    
    // Sort by processed count
    agentComparison.sort((a, b) => b.processed - a.processed);
    
    let answer: any;
    
    if (question.includes('most')) {
      answer = {
        question: 'Which agent has processed the most content?',
        answer: agentComparison[0]
      };
    } else if (question.includes('least')) {
      answer = {
        question: 'Which agent has processed the least content?',
        answer: agentComparison[agentComparison.length - 1]
      };
    } else {
      answer = {
        question: 'Agent comparison',
        agents: agentComparison
      };
    }
    
    return {
      question,
      answer,
      confidence: 0.9,
      timestamp: new Date()
    };
  }

  /**
   * Check if question is a search query
   */
  private isSearchQuestion(question: string): boolean {
    return question.includes('find') ||
           question.includes('search') ||
           question.includes('look for') ||
           question.includes('about');
  }

  /**
   * Handle search questions
   */
  private async handleSearchQuestion(question: string): Promise<QueryResult> {
    // Extract search terms
    const searchTerms = question
      .replace(/find|search|look for|about|content|documents?|that|which|with/gi, '')
      .trim()
      .toLowerCase();
    
    const allContent = await this.registry.content.getAllContent();
    
    // Search in titles and metadata
    const matches = allContent.filter(item => {
      const title = (item.title || '').toLowerCase();
      const metadata = JSON.stringify(item.metadata || {}).toLowerCase();
      
      return title.includes(searchTerms) || metadata.includes(searchTerms);
    });
    
    const results = matches.slice(0, 10).map(item => ({
      rid: item.rid,
      title: item.title,
      url: item.url,
      source: item.sourceRid
    }));
    
    const answer = matches.length > 0
      ? {
          found: matches.length,
          query: searchTerms,
          results
        }
      : `No content found matching "${searchTerms}"`;
    
    return {
      question,
      answer,
      confidence: matches.length > 0 ? 0.8 : 0.5,
      sources: matches.slice(0, 10).map(m => `koi:content/${m.rid}`),
      timestamp: new Date()
    };
  }

  /**
   * Handle general questions
   */
  private async handleGeneralQuestion(question: string): Promise<QueryResult> {
    const stats = await this.registry.getStatistics();
    
    const generalAnswer = {
      overview: `The KOI Registry tracks ${stats.content.total} content items from ${stats.sources.total} sources.`,
      processing: {
        processed: stats.content.processed,
        pending: stats.content.pending,
        failed: stats.content.failed
      },
      agents: Object.keys(stats.agents).map(id => this.formatAgentName(id)),
      suggestion: 'Try asking about specific agents (e.g., "What content is in RegenAI\'s RAG?") or sources.'
    };
    
    return {
      question,
      answer: generalAnswer,
      confidence: 0.7,
      timestamp: new Date()
    };
  }

  /**
   * Get cached result if available and not expired
   */
  private getCachedResult(question: string): QueryResult | null {
    const cached = this.queryCache.get(question);
    
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      if (age < this.cacheTimeout) {
        return cached;
      }
      // Remove expired cache entry
      this.queryCache.delete(question);
    }
    
    return null;
  }

  /**
   * Cache a query result
   */
  private cacheResult(question: string, result: QueryResult): void {
    this.queryCache.set(question, result);
    
    // Limit cache size
    if (this.queryCache.size > 100) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }
  }

  /**
   * Clear the query cache
   */
  clearCache(): void {
    this.queryCache.clear();
    logger.info('Query cache cleared');
  }

  /**
   * Get suggested questions
   */
  getSuggestedQuestions(): string[] {
    return [
      'What content is in the RegenAI agent\'s RAG system?',
      'What content is in the Facilitator agent\'s RAG system?',
      'How many documents have been processed in total?',
      'What are the main content sources?',
      'Which agent has processed the most content?',
      'What types of content are in the system?',
      'Find content about carbon credits',
      'Compare the content between agents',
      'What is the processing status across all agents?',
      'Show me statistics for all agents'
    ];
  }
}