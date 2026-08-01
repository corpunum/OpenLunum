/**
 * User Correction and Fallback Telemetry (R16.4)
 *
 * Infrastructure for recording, analysing and surfacing telemetry
 * about user corrections (manual overrides of system output) and
 * fallback activations, enabling continuous improvement of the
 * preservation pipeline.
 */

export type CorrectionType =
  | 'semantic-override'
  | 'literal-restore'
  | 'role-correction'
  | 'negation-fix'
  | 'modality-fix'
  | 'domain-override'
  | 'false-positive-dismiss';

export type FallbackTrigger =
  | 'low-confidence'
  | 'gate-failure'
  | 'timeout'
  | 'model-error'
  | 'schema-mismatch';

export interface CorrectionEvent {
  id: string;
  timestamp: string;
  correctionType: CorrectionType;
  component: string;
  originalOutput: string;
  correctedOutput: string;
  userId: string;
  sessionId: string;
  confidence: number;
  gateName: string;
}

export interface FallbackEvent {
  id: string;
  timestamp: string;
  trigger: FallbackTrigger;
  component: string;
  fallbackAction: string;
  originalError: string;
  recoverySuccessful: boolean;
  latencyMs: number;
  sessionId: string;
}

export interface TelemetryWindow {
  startTime: string;
  endTime: string;
  corrections: readonly CorrectionEvent[];
  fallbacks: readonly FallbackEvent[];
}

export interface CorrectionMetrics {
  totalCorrections: number;
  byType: Record<string, number>;
  byComponent: Record<string, number>;
  byGate: Record<string, number>;
  averageConfidenceAtCorrection: number;
  correctionRate: number;
}

export interface FallbackMetrics {
  totalFallbacks: number;
  byTrigger: Record<string, number>;
  byComponent: Record<string, number>;
  recoveryRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

export interface TelemetryReport {
  window: TelemetryWindow;
  corrections: CorrectionMetrics;
  fallbacks: FallbackMetrics;
  hotspots: readonly TelemetryHotspot[];
  recommendations: readonly string[];
}

export interface TelemetryHotspot {
  component: string;
  eventCount: number;
  dominantType: string;
  urgency: 'high' | 'medium' | 'low';
}

export function computeCorrectionMetrics(
  corrections: readonly CorrectionEvent[],
  totalOperations: number,
): CorrectionMetrics {
  const byType: Record<string, number> = {};
  const byComponent: Record<string, number> = {};
  const byGate: Record<string, number> = {};
  let confidenceSum = 0;

  for (const c of corrections) {
    byType[c.correctionType] = (byType[c.correctionType] ?? 0) + 1;
    byComponent[c.component] = (byComponent[c.component] ?? 0) + 1;
    if (c.gateName) {
      byGate[c.gateName] = (byGate[c.gateName] ?? 0) + 1;
    }
    confidenceSum += c.confidence;
  }

  return {
    totalCorrections: corrections.length,
    byType,
    byComponent,
    byGate,
    averageConfidenceAtCorrection: corrections.length > 0 ? confidenceSum / corrections.length : 0,
    correctionRate: totalOperations > 0 ? corrections.length / totalOperations : 0,
  };
}

export function computeFallbackMetrics(fallbacks: readonly FallbackEvent[]): FallbackMetrics {
  const byTrigger: Record<string, number> = {};
  const byComponent: Record<string, number> = {};
  let recoveredCount = 0;
  let latencySum = 0;
  const latencies: number[] = [];

  for (const f of fallbacks) {
    byTrigger[f.trigger] = (byTrigger[f.trigger] ?? 0) + 1;
    byComponent[f.component] = (byComponent[f.component] ?? 0) + 1;
    if (f.recoverySuccessful) recoveredCount++;
    latencySum += f.latencyMs;
    latencies.push(f.latencyMs);
  }

  latencies.sort((a, b) => a - b);
  const p95Index = Math.ceil(latencies.length * 0.95) - 1;

  return {
    totalFallbacks: fallbacks.length,
    byTrigger,
    byComponent,
    recoveryRate: fallbacks.length > 0 ? recoveredCount / fallbacks.length : 0,
    averageLatencyMs: fallbacks.length > 0 ? latencySum / fallbacks.length : 0,
    p95LatencyMs: latencies.length > 0 ? latencies[Math.max(0, p95Index)]! : 0,
  };
}

export function identifyHotspots(
  corrections: readonly CorrectionEvent[],
  fallbacks: readonly FallbackEvent[],
  threshold: number = 3,
): TelemetryHotspot[] {
  const componentCounts: Record<string, { total: number; types: Record<string, number> }> = {};

  for (const c of corrections) {
    if (!componentCounts[c.component]) {
      componentCounts[c.component] = { total: 0, types: {} };
    }
    componentCounts[c.component]!.total++;
    const t = c.correctionType;
    componentCounts[c.component]!.types[t] = (componentCounts[c.component]!.types[t] ?? 0) + 1;
  }

  for (const f of fallbacks) {
    if (!componentCounts[f.component]) {
      componentCounts[f.component] = { total: 0, types: {} };
    }
    componentCounts[f.component]!.total++;
    const t = f.trigger;
    componentCounts[f.component]!.types[t] = (componentCounts[f.component]!.types[t] ?? 0) + 1;
  }

  const hotspots: TelemetryHotspot[] = [];

  for (const [component, data] of Object.entries(componentCounts)) {
    if (data.total >= threshold) {
      const dominantType = Object.entries(data.types)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

      let urgency: 'high' | 'medium' | 'low';
      if (data.total >= threshold * 3) urgency = 'high';
      else if (data.total >= threshold * 2) urgency = 'medium';
      else urgency = 'low';

      hotspots.push({ component, eventCount: data.total, dominantType, urgency });
    }
  }

  return hotspots.sort((a, b) => b.eventCount - a.eventCount);
}

export function generateTelemetryReport(
  window: TelemetryWindow,
  totalOperations: number,
): TelemetryReport {
  const correctionMetrics = computeCorrectionMetrics(window.corrections, totalOperations);
  const fallbackMetrics = computeFallbackMetrics(window.fallbacks);
  const hotspots = identifyHotspots(window.corrections, window.fallbacks);

  const recommendations: string[] = [];

  if (correctionMetrics.correctionRate > 0.1) {
    recommendations.push('Correction rate exceeds 10% — investigate most-corrected components');
  }

  if (correctionMetrics.averageConfidenceAtCorrection > 0.8) {
    recommendations.push('Users correcting high-confidence outputs — possible systematic bias in scoring');
  }

  if (fallbackMetrics.recoveryRate < 0.9 && fallbackMetrics.totalFallbacks > 0) {
    recommendations.push('Fallback recovery rate below 90% — review unrecoverable failure paths');
  }

  if (fallbackMetrics.p95LatencyMs > 5000) {
    recommendations.push('Fallback P95 latency exceeds 5s — consider faster fallback strategies');
  }

  for (const hotspot of hotspots.filter(h => h.urgency === 'high')) {
    recommendations.push(`High-urgency hotspot: ${hotspot.component} (${hotspot.eventCount} events, dominant: ${hotspot.dominantType})`);
  }

  return {
    window,
    corrections: correctionMetrics,
    fallbacks: fallbackMetrics,
    hotspots,
    recommendations,
  };
}
