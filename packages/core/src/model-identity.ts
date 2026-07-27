import { createHash } from 'node:crypto';

export interface ModelIdentity {
  family: string;
  name: string;
  version?: string;
  quantization?: string;
  weightHash?: ModelWeightHash;
  ggufMetadata?: GgufMetadataIdentity;
  tokenizerHash?: string;
}

export interface ModelWeightHash {
  algorithm: 'sha256';
  hash: string;
  scope: 'full-file' | 'tensor-data';
}

export interface GgufMetadataIdentity {
  generalName?: string;
  generalArchitecture?: string;
  generalFileType?: number;
  generalQuantizationVersion?: number;
  tokenizerModel?: string;
  contextLength?: number;
}

export interface ModelIdentityVerdict {
  identified: boolean;
  method: 'weight-hash' | 'gguf-metadata' | 'name-only' | 'unknown';
  identity: ModelIdentity;
  warnings: string[];
}

export function hashBuffer(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function verifyModelIdentity(identity: ModelIdentity): ModelIdentityVerdict {
  const warnings: string[] = [];

  if (identity.weightHash?.hash) {
    if (!/^[a-f0-9]{64}$/u.test(identity.weightHash.hash)) {
      warnings.push('weight hash is not a valid 64-character lowercase hex SHA-256');
      return { identified: false, method: 'weight-hash', identity, warnings };
    }
    return { identified: true, method: 'weight-hash', identity, warnings };
  }

  if (identity.ggufMetadata) {
    const meta = identity.ggufMetadata;
    if (meta.generalName && meta.generalArchitecture) {
      if (!meta.generalFileType) {
        warnings.push('GGUF metadata present but missing general.file_type — quantization not verified');
      }
      return { identified: true, method: 'gguf-metadata', identity, warnings };
    }
    warnings.push('GGUF metadata incomplete — need at least general.name and general.architecture');
  }

  if (identity.name && identity.family) {
    warnings.push('identified by name/family only — no cryptographic or structural identity; results may not be reproducible across different weight files');
    return { identified: true, method: 'name-only', identity, warnings };
  }

  warnings.push('insufficient identity information');
  return { identified: false, method: 'unknown', identity, warnings };
}

export function formatIdentityLabel(identity: ModelIdentity): string {
  const parts = [identity.family, identity.name];
  if (identity.version) parts.push(identity.version);
  if (identity.quantization) parts.push(identity.quantization);
  return parts.filter(Boolean).join('/');
}

export function identitiesMatch(a: ModelIdentity, b: ModelIdentity): boolean {
  if (a.weightHash?.hash && b.weightHash?.hash) {
    return a.weightHash.hash === b.weightHash.hash;
  }
  if (a.ggufMetadata && b.ggufMetadata) {
    const ma = a.ggufMetadata;
    const mb = b.ggufMetadata;
    return (
      ma.generalName === mb.generalName &&
      ma.generalArchitecture === mb.generalArchitecture &&
      ma.generalFileType === mb.generalFileType
    );
  }
  return (
    a.family === b.family &&
    a.name === b.name &&
    a.version === b.version &&
    a.quantization === b.quantization
  );
}
