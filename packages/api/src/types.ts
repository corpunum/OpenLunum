import type { LunumRecord, LunumSem, LunumSidecar } from '@corpunum/lunum';

// ── API Configuration ──────────────────────────────────────────────

export interface ApiServerOptions {
  /** Server host (default: '0.0.0.0') */
  host?: string;
  /** Server port (default: 3000) */
  port?: number;
  /** API prefix path (default: '/api/v1') */
  prefix?: string;
  /** Enable request logging (default: false) */
  logging?: boolean;
  /** Enable CORS (default: true) */
  cors?: boolean;
}

// ── Request / Response Types ───────────────────────────────────────

export interface ParseRequest {
  /** Natural language text to parse */
  text: string;
  /** Source language code (e.g., 'en', 'el', 'es', 'id') */
  language: string;
  /** Role context */
  role?: string;
  /** Category hint */
  category?: string;
  /** Risk level */
  risk?: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

export interface ParseResponse {
  /** Parsed Lunum record */
  record: LunumRecord;
  /** Processing metadata */
  meta: {
    language: string;
    tokens: number;
    timestamp: string;
  };
}

export interface RealizeRequest {
  /** Lunum semantics to realize */
  sem: LunumSem;
  /** Target language for realization */
  language: string;
  /** Profile preference */
  profile?: string;
}

export interface RealizeResponse {
  /** Realized natural language text */
  text: string;
  /** Lunum sidecar with metadata */
  sidecar: LunumSidecar;
  /** Processing metadata */
  meta: {
    language: string;
    tokens: number;
    timestamp: string;
  };
}

export interface RenderRequest {
  /** Lunum semantics to render */
  sem: LunumSem;
  /** Render profile (e.g., 'generic-en-pivot/0.1', 'safe', 'short', 'tight') */
  profile: string;
}

export interface RenderResponse {
  /** Rendered output */
  output: string;
  /** Render profile used */
  profile: string;
  /** Token count (if available) */
  tokens: number | null;
}

export interface RetrieveRequest {
  /** Query text */
  query: string;
  /** Maximum number of results */
  maxResults?: number;
  /** Similarity threshold (0-1) */
  threshold?: number;
  /** Language to search within */
  language?: string;
  /** Whether to use near-semantic matching */
  nearSemantic?: boolean;
}

export interface RetrieveResponse {
  /** Retrieved records */
  results: Array<{
    id: string;
    score: number;
    record: LunumRecord;
  }>;
  /** Search metadata */
  meta: {
    query: string;
    totalMatches: number;
    mode: 'exact' | 'near-semantic';
    timestamp: string;
  };
}

export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

/** Result of a single dependency health check. */
export interface DependencyCheck {
  /** Dependency identifier (e.g. 'core', 'datastore', 'model') */
  name: string;
  /** Dependency status */
  status: HealthStatus;
  /** Human-readable detail */
  detail: string;
  /** Latency in milliseconds, if measured */
  latencyMs?: number;
}

export interface HealthResponse {
  /** Aggregate health status */
  status: HealthStatus;
  /** Server version */
  version: string;
  /** Uptime in seconds since server start */
  uptime: number;
  /** Lunum core version */
  lunumVersion: string;
  /** Registered routes count */
  routes: number;
  /** Individual dependency checks */
  dependencies: DependencyCheck[];
}

/** Overall readiness state. */
export type ReadinessState = 'ready' | 'not-ready';

/** Per-component readiness information. */
export interface ReadyDetail {
  /** Component name (e.g. 'model', 'schema', 'auth') */
  component: string;
  /** Whether this component is ready */
  ready: boolean;
  /** Human-readable detail about the component state */
  detail: string;
}

export interface ReadyResponse {
  /** Overall readiness state */
  state: ReadinessState;
  /** Server version */
  version: string;
  /** Timestamp of this check */
  timestamp: string;
  /** Individual component readiness */
  components: ReadyDetail[];
}

export interface ErrorResponse {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Unique request identifier for tracing */
  requestId: string;
  /** Optional details */
  details?: Record<string, unknown>;
}

export interface RoutesResponse {
  /** API version */
  version: string;
  /** Available endpoints */
  routes: Array<{
    method: string;
    path: string;
    description: string;
  }>;
}
