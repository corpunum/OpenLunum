/**
 * Context manager for MCP Lunum server
 * 
 * Provides storage and retrieval of semantic context items with filtering and search capabilities.
 */

import type { LunumContextItem, ContextQueryOptions, ContextStats, Risk } from './types.js';

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
  add(record: Record<string, unknown>, options: { source?: string; metadata?: Record<string, unknown> } = {}): string {
    const id = (record as { fingerprint?: string }).fingerprint || crypto.randomUUID();
    
    if (this.items.size >= this.maxItems) {
      // Remove oldest item
      const oldestId = Array.from(this.items.keys())[0];
      if (oldestId) {
        this.items.delete(oldestId);
      }
    }

    const item: LunumContextItem = {
      id,
      record,
      timestamp: Date.now(),
      source: options.source !== undefined ? options.source : undefined,
      metadata: options.metadata !== undefined ? options.metadata : undefined
    };
    this.items.set(id, item);

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
      results = results.filter(item => {
        const policy = item.record.policy as { risk?: string };
        return policy?.risk === options.riskFilter;
      });
    }

    // Apply search query
    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      results = results.filter(item => {
        const sourceText = (item.record.source as { text?: string })?.text ?? '';
        const hasMatch = sourceText.toLowerCase().includes(query);
        
        if (!hasMatch) {
          const clauses = (item.record.sem as { clauses?: Array<{ predicate?: string }> })?.clauses ?? [];
          hasMatch || clauses.some((clause: { predicate?: string }) => 
            clause.predicate?.toLowerCase().includes(query) ?? false
          );
        }
        return hasMatch;
      });
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
      const policy = item.record.policy as { risk?: string; category?: string };
      const risk = policy?.risk ?? 'unknown';
      const category = policy?.category ?? 'unknown';
      
      riskDistribution[risk] = (riskDistribution[risk] || 0) + 1;
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