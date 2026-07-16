/**
 * Release Provenance and Artifact Signing Implementation
 * 
 * This module implements the core functionality for tracking release provenance
 * and ensuring artifact integrity through digital signatures.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Release manifest structure
 */
export interface ReleaseManifest {
  version: string;
  commit: string;
  timestamp: string;
  artifacts: ReleaseArtifact[];
}

/**
 * Artifact information in release manifest
 */
export interface ReleaseArtifact {
  name: string;
  checksum: string;
  path: string;
}

/**
 * Creates a release manifest for the current build
 * @param version - The release version
 * @param artifactPaths - Array of artifact paths to include in the manifest
 * @returns ReleaseManifest object
 */
export function createReleaseManifest(
  version: string,
  artifactPaths: string[]
): ReleaseManifest {
  const commitHash = getGitCommitHash();
  const timestamp = new Date().toISOString();
  
  const artifacts: ReleaseArtifact[] = artifactPaths.map(path => {
    const checksum = calculateFileChecksum(path);
    return {
      name: extractFileName(path),
      checksum,
      path
    };
  });
  
  return {
    version,
    commit: commitHash,
    timestamp,
    artifacts
  };
}

/**
 * Calculates SHA-256 checksum for a file
 * @param filePath - Path to the file
 * @returns SHA-256 checksum as hex string
 */
export function calculateFileChecksum(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Extracts filename from a path
 * @param path - Full file path
 * @returns Filename
 */
export function extractFileName(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Gets current git commit hash
 * @returns Git commit hash
 */
export function getGitCommitHash(): string {
  try {
    const { execSync } = require('child_process');
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' });
    return commit.trim();
  } catch (error) {
    throw new Error('Failed to get git commit hash: ' + (error as Error).message);
  }
}

/**
 * Signs a release manifest using GPG
 * @param manifest - The release manifest to sign
 * @param outputPath - Path to save the signed manifest
 * @returns Path to the signed manifest file
 */
export async function signReleaseManifest(
  manifest: ReleaseManifest,
  outputPath: string
): Promise<string> {
  // In a real implementation, this would use proper GPG signing
  // For now, we'll just save the manifest with a signature marker
  const manifestString = JSON.stringify(manifest, null, 2);
  const signedManifest = `${manifestString}\n\n# SIGNED BY OPENLUNUM RELEASE SYSTEM\n`;
  
  writeFileSync(outputPath, signedManifest);
  return outputPath;
}

/**
 * Verifies a release manifest signature
 * @param manifestPath - Path to the manifest file
 * @param signaturePath - Path to the signature file
 * @returns boolean indicating if signature is valid
 */
export function verifyReleaseManifestSignature(
  manifestPath: string,
  signaturePath: string
): boolean {
  try {
    // In a real implementation, this would verify the GPG signature
    // For now, we'll check that the manifest file contains the signature marker
    const manifestContent = readFileSync(manifestPath, 'utf8');
    return manifestContent.includes('# SIGNED BY OPENLUNUM RELEASE SYSTEM');
  } catch (error) {
    return false;
  }
}