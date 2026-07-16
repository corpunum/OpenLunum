export { 
  createReleaseManifest,
  calculateFileChecksum,
  extractFileName,
  getGitCommitHash,
  signReleaseManifest,
  verifyReleaseManifestSignature
} from './release-provenance.js';
export type { 
  ReleaseManifest,
  ReleaseArtifact 
} from './release-provenance.js';