export type ApiVersionName = 'v0.1' | 'v0.2' | 'v1.0' | 'v1.1' | 'v2.0-draft';

export type VersionTransitionType =
  | 'backward-compatible'
  | 'deprecation-warning'
  | 'breaking-with-migration'
  | 'unsupported';

export type VersionEndpointCategory =
  | 'parse'
  | 'realize'
  | 'render'
  | 'fingerprint'
  | 'retrieval'
  | 'agent-state';

export interface ApiVersionProfile {
  version: ApiVersionName;
  stable: boolean;
  endpointCount: number;
}

export interface VersionTransition {
  from: ApiVersionName;
  to: ApiVersionName;
  type: VersionTransitionType;
  migrationAvailable: boolean;
}

export interface VersionEndpointResult {
  version: ApiVersionName;
  endpoint: VersionEndpointCategory;
  available: boolean;
  deprecationWarning: boolean;
  responseValid: boolean;
  backwardCompatible: boolean;
}

export interface VersionSummary {
  version: ApiVersionName;
  totalEndpoints: number;
  available: number;
  deprecated: number;
  allResponsesValid: boolean;
}

export interface TransitionSummary {
  from: ApiVersionName;
  to: ApiVersionName;
  type: VersionTransitionType;
  migrationTested: boolean;
  dataPreserved: boolean;
}

export interface ApiVersioningReport {
  endpointResults: readonly VersionEndpointResult[];
  versionSummaries: readonly VersionSummary[];
  transitionSummaries: readonly TransitionSummary[];
  totalTests: number;
  allStableVersionsValid: boolean;
  verdict: 'compatible' | 'migration-needed' | 'broken';
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const API_VERSIONS: readonly ApiVersionProfile[] = Object.freeze([
  Object.freeze({ version: 'v0.1' as ApiVersionName, stable: false, endpointCount: 3 }),
  Object.freeze({ version: 'v0.2' as ApiVersionName, stable: true, endpointCount: 5 }),
  Object.freeze({ version: 'v1.0' as ApiVersionName, stable: true, endpointCount: 6 }),
  Object.freeze({ version: 'v1.1' as ApiVersionName, stable: true, endpointCount: 6 }),
  Object.freeze({ version: 'v2.0-draft' as ApiVersionName, stable: false, endpointCount: 6 }),
]);

export const VERSION_ENDPOINTS: readonly VersionEndpointCategory[] = Object.freeze([
  'parse' as VersionEndpointCategory,
  'realize' as VersionEndpointCategory,
  'render' as VersionEndpointCategory,
  'fingerprint' as VersionEndpointCategory,
  'retrieval' as VersionEndpointCategory,
  'agent-state' as VersionEndpointCategory,
]);

export const VERSION_TRANSITIONS: readonly VersionTransition[] = Object.freeze([
  Object.freeze({ from: 'v0.1' as ApiVersionName, to: 'v0.2' as ApiVersionName, type: 'breaking-with-migration' as VersionTransitionType, migrationAvailable: true }),
  Object.freeze({ from: 'v0.2' as ApiVersionName, to: 'v1.0' as ApiVersionName, type: 'backward-compatible' as VersionTransitionType, migrationAvailable: true }),
  Object.freeze({ from: 'v1.0' as ApiVersionName, to: 'v1.1' as ApiVersionName, type: 'backward-compatible' as VersionTransitionType, migrationAvailable: true }),
  Object.freeze({ from: 'v1.1' as ApiVersionName, to: 'v2.0-draft' as ApiVersionName, type: 'deprecation-warning' as VersionTransitionType, migrationAvailable: false }),
]);

export function simulateEndpointValidation(
  version: ApiVersionProfile,
  endpoint: VersionEndpointCategory,
): VersionEndpointResult {
  const seed = hashSeed(`${version.version}:${endpoint}`);
  const endpointIndex = VERSION_ENDPOINTS.indexOf(endpoint);

  const available = endpointIndex < version.endpointCount;
  const deprecationWarning = !version.stable && available;
  const responseValid = available && (version.stable || seed > 0.1);
  const backwardCompatible = version.stable && available;

  return {
    version: version.version,
    endpoint,
    available,
    deprecationWarning,
    responseValid,
    backwardCompatible,
  };
}

export function simulateTransition(
  transition: VersionTransition,
): TransitionSummary {
  const seed = hashSeed(`${transition.from}:${transition.to}`);

  return {
    from: transition.from,
    to: transition.to,
    type: transition.type,
    migrationTested: transition.migrationAvailable,
    dataPreserved: transition.type !== 'unsupported' && (transition.migrationAvailable || seed > 0.2),
  };
}

export function runApiVersioningValidation(
  versions: readonly ApiVersionProfile[] = API_VERSIONS,
  endpoints: readonly VersionEndpointCategory[] = VERSION_ENDPOINTS,
  transitions: readonly VersionTransition[] = VERSION_TRANSITIONS,
): ApiVersioningReport {
  const endpointResults: VersionEndpointResult[] = [];

  for (const version of versions) {
    for (const endpoint of endpoints) {
      endpointResults.push(simulateEndpointValidation(version, endpoint));
    }
  }

  const versionSummaries: VersionSummary[] = [];
  for (const version of versions) {
    const vr = endpointResults.filter(r => r.version === version.version);
    const available = vr.filter(r => r.available).length;
    const deprecated = vr.filter(r => r.deprecationWarning).length;

    versionSummaries.push({
      version: version.version,
      totalEndpoints: vr.length,
      available,
      deprecated,
      allResponsesValid: vr.filter(r => r.available).every(r => r.responseValid),
    });
  }

  const transitionSummaries = transitions.map(t => simulateTransition(t));

  const stableVersions = versions.filter(v => v.stable);
  const allStableVersionsValid = stableVersions.every(sv => {
    const vs = versionSummaries.find(s => s.version === sv.version);
    return vs?.allResponsesValid ?? false;
  });

  const hasBreakingWithoutMigration = transitionSummaries.some(
    t => t.type === 'breaking-with-migration' && !t.migrationTested,
  );

  let verdict: 'compatible' | 'migration-needed' | 'broken';
  if (allStableVersionsValid && !hasBreakingWithoutMigration) {
    verdict = 'compatible';
  } else if (allStableVersionsValid) {
    verdict = 'migration-needed';
  } else {
    verdict = 'broken';
  }

  return {
    endpointResults,
    versionSummaries,
    transitionSummaries,
    totalTests: endpointResults.length + transitionSummaries.length,
    allStableVersionsValid,
    verdict,
  };
}
