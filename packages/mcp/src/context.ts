/**
 * Context manager for MCP Lunum server
 * 
 * Provides storage and retrieval of semantic context items with filtering and search capabilities.
 */

import type { LunumRecord, Risk } from '@corpunum/lunum';
import type { LunumContextItem, ContextQueryOptions, ContextStats } from './types.js';

export class LunumContextManager {
  private items: Map<string, LunumContextItem>;
  private maxItems: number;

  constructor(options: { maxItems?: number } = {}) {
    this.items = new Map();
    this.maxItems = options.maxItems ?? 1000;
  }

  /**
   * Add a semantic record to context
   */
  add(record: LunumRecord, options: { source?: string; metadata?: Record<string, unknown> } = {}): string {
    const id = record.fingerprint || crypto.randomUUID();
    
    if (this.items.size >= this.maxItems) {
      // Remove oldest item
      const oldestId = Array.from(this.items.keys())[0];
      if (oldestId) {
        this.items.delete(oldestId);
      }
    }

    this.items.set(id, {
      id,
      record,
      timestamp: Date.now(),
      source: options.source,
      metadata: options.metadata
    });

    return id;
  }

  /**
   * Get a context item by ID
   */
  get(id: string): LunumContextItem | undefined {
    return this.items.get(id);
  }

  /**
   * Query context items with filters
   */
  query(options: ContextQueryOptions = {}): LunumContextItem[] {
    let results = Array.from(this.items.values());

    // Apply risk filter
    if (options.riskFilter && options.riskFilter !== 'all') {
      results = results.filter(item => item.record.policy.risk === options.riskFilter);
    }

    // Apply search query
    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      results = results.filter(item => 
        item.record.source.text.toLowerCase().includes(query) ||
        item.record.sem.clauses.some(clause => 
          clause.predicate.toLowerCase().includes(query)
        )
      );
    }

    // Apply limit
    const limit = options.maxResults ?? results.length;
    return results.slice(0, limit);
  }

  /**
   * Get context statistics
   */
  getStats(): ContextStats {
    const items = Array.from(this.items.values());
    
    const riskDistribution: Record<string, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
    const categoryDistribution: Record<string, number> = {};

    for (const item of items) {
      riskDistribution[item.record.policy.risk] = (riskDistribution[item.record.policy.risk] || 0) + 1;
      
      const category = item.record.policy.category || 'unknown';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    }

    return {
      totalItems: items.length,
      riskDistribution: riskDistribution as Record<Risk, number>,
      categoryDistribution
    };
  }

  /**
   * Clear all context items
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Get all context items
   */
  getAll(): LunumContextItem[] {
    return Array.from(this.items.values());
  }
}