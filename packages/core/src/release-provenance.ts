/**
 * Release provenance and artifact signing functionality
 * 
 * This module provides functions for tracking release artifacts and
 * creating signed manifests that can be used to verify the integrity
 * and origin of released packages.
 */

import { createHash, createSign, createVerify } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Release manifest structure for tracking release artifacts
 */
export interface ReleaseManifest {
  /** The version of the release */
  version: string;
  
  /** The commit hash that this release is based on */
  commit: string;
  
  /** The timestamp of the release */
  timestamp: string;
  
  /** Hash of the release artifact */
  artifactHash: string;
  
  /** List of files included in this release */
  files: string[];
  
  /** Signature of the manifest (if signed) */
  signature?: string;
  
  /** Public key used to verify the signature */
  publicKey?: string;
}

/**
 * Create a release manifest for the current release
 * 
 * @param version - The release version
 * @param commit - The git commit hash
 * @param files - List of files included in this release
 * @returns A release manifest
 */
export function createReleaseManifest(
  version: string,
  commit: string,
  files: string[]
): ReleaseManifest {
  // Create a hash of all the files
  const fileHash = createHash('sha256');
  files.forEach(file => {
    try {
      const content = readFileSync(file, 'utf-8');
      fileHash.update(content);
    } catch (err) {
      // If we can't read a file, skip it, but this should be handled more robustly in production
      console.warn(`Could not read file ${file} for release manifest:`, err);
    }
  });
  
  const artifactHash = fileHash.digest('hex');
  
  return {
    version,
    commit,
    timestamp: new Date().toISOString(),
    artifactHash,
    files
  };
}

/**
 * Sign a release manifest with a private key
 * 
 * @param manifest - The release manifest to sign
 * @param privateKey - The private key to sign with
 * @returns A signed manifest with signature
 */
export function signReleaseManifest(
  manifest: ReleaseManifest,
  privateKey: string
): ReleaseManifest {
  // Create a JSON representation of the manifest without signature
  const manifestWithoutSignature = {
    version: manifest.version,
    commit: manifest.commit,
    timestamp: manifest.timestamp,
    artifactHash: manifest.artifactHash,
    files: manifest.files
  };
  
  const manifestJson = JSON.stringify(manifestWithoutSignature, null, 2);
  
  // Create signature
  const sign = createSign('RSA-SHA256');
  sign.update(manifestJson);
  const signature = sign.sign(privateKey, 'hex');
  
  // Return the manifest with signature
  return {
    ...manifest,
    signature,
    publicKey: extractPublicKey(privateKey)
  };
}

/**
 * Verify a signed release manifest
 * 
 * @param manifest - The signed release manifest to verify
 * @param publicKey - The public key to verify with
 * @returns True if the signature is valid, false otherwise
 */
export function verifyReleaseManifest(
  manifest: ReleaseManifest,
  publicKey: string
): boolean {
  if (!manifest.signature || !manifest.publicKey) {
    return false;
  }
  
  // Verify the signature matches the public key
  const manifestWithoutSignature = {
    version: manifest.version,
    commit: manifest.commit,
    timestamp: manifest.timestamp,
    artifactHash: manifest.artifactHash,
    files: manifest.files
  };
  
  const manifestJson = JSON.stringify(manifestWithoutSignature, null, 2);
  
  const verify = createVerify('RSA-SHA256');
  verify.update(manifestJson);
  
  try {
    return verify.verify(publicKey, manifest.signature, 'hex');
  } catch (err) {
    return false;
  }
}

/**
 * Extract public key from private key (simplified for this implementation)
 * 
 * @param privateKey - The private key
 * @returns The public key
 */
function extractPublicKey(privateKey: string): string {
  // In a real implementation, this would extract the public key from the private key
  // For now, we'll return a placeholder - in practice this should be implemented properly
  return 'placeholder-public-key';
}

/**
 * Get the current git commit hash
 * 
 * @returns The current git commit hash
 */
export function getCurrentCommit(): string {
  try {
    // This is a simplified approach - in practice, you'd use git commands or environment variables
    // For now, we'll return a placeholder, but in a real scenario, this should get the actual commit
    const commit = process.env.GITHUB_SHA || process.env.COMMIT_HASH || 'unknown';
    return commit;
  } catch (err) {
    return 'unknown';
  }
}

/**
 * Get the current package version
 * 
 * @returns The current package version
 */
export function getCurrentVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch (err) {
    return '0.0.0';
  }
}