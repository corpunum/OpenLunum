/**
 * In-process capabilities for the grounding trust boundary.
 *
 * This module is intentionally not exported from the package entry point.
 * Capabilities do not survive serialization; persisted evidence must be
 * re-authenticated by the provider cascade on replay.
 */
export const authenticatedProviderResults = new WeakSet<object>();
export const authenticatedGroundingResolutions = new WeakSet<object>();
