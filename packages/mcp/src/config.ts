import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ContextMode } from '@corpunum/lunum';

export interface LunumConfig {
  compaction: 'on' | 'off' | 'auto';
  multilingual: boolean;
  contextMode: ContextMode;
  maxContextItems: number;
  defaultLanguage: string;
}

const DEFAULTS: LunumConfig = {
  compaction: 'auto',
  multilingual: false,
  contextMode: 'mixed',
  maxContextItems: 1000,
  defaultLanguage: 'en',
};

function loadConfigFile(): Partial<LunumConfig> {
  try {
    const path = join(homedir(), '.config', 'lunum', 'config.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const result: Partial<LunumConfig> = {};
    if (raw.compaction === 'on' || raw.compaction === 'off' || raw.compaction === 'auto') result.compaction = raw.compaction;
    if (typeof raw.multilingual === 'boolean') result.multilingual = raw.multilingual;
    if (['natural', 'lunum', 'mixed', 'shadow_mixed'].includes(raw.contextMode)) result.contextMode = raw.contextMode;
    if (typeof raw.maxContextItems === 'number' && raw.maxContextItems > 0) result.maxContextItems = raw.maxContextItems;
    if (typeof raw.defaultLanguage === 'string') result.defaultLanguage = raw.defaultLanguage;
    return result;
  } catch {
    return {};
  }
}

function loadEnvOverrides(): Partial<LunumConfig> {
  const result: Partial<LunumConfig> = {};
  const c = process.env.LUNUM_COMPACTION;
  if (c === 'on' || c === 'off' || c === 'auto') result.compaction = c;
  if (process.env.LUNUM_MULTILINGUAL === 'on') result.multilingual = true;
  if (process.env.LUNUM_MULTILINGUAL === 'off') result.multilingual = false;
  const m = process.env.LUNUM_CONTEXT_MODE;
  if (m && ['natural', 'lunum', 'mixed', 'shadow_mixed'].includes(m)) result.contextMode = m as ContextMode;
  const n = Number(process.env.LUNUM_MAX_CONTEXT_ITEMS);
  if (n > 0) result.maxContextItems = n;
  return result;
}

export function resolveConfig(callOptions?: Partial<LunumConfig>): LunumConfig {
  return { ...DEFAULTS, ...loadConfigFile(), ...loadEnvOverrides(), ...callOptions };
}
