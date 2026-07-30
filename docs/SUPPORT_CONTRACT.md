# OpenLunum Support and Compatibility Contract (R1.6)

**Status:** Release Gate 1.6  
**Date:** 2026-07-31  
**Workspace Version:** 0.2.0  
**Schema Line:** Lunum-Sem

This document defines the support and compatibility guarantee for OpenLunum. It specifies version lifecycle states, deprecation processes, compatibility windows, migration obligations, rollback guarantees, breaking change policies, and support boundaries.

## Version Lifecycle States

Each OpenLunum version passes through defined lifecycle states:

### Development (`dev`)
- Internal experimental versions not yet released
- No compatibility guarantees
- API and schema may change without notice
- No support obligation
- Used for development and testing only

### Beta (`beta`)
- Pre-release versions with stabilization in progress
- Limited compatibility guarantees; breaking changes possible with notice
- API may change; schema is stabilizing
- Community feedback welcome; limited support
- Minimum 2-week beta window before promotion to stable

### Stable (`stable`)
- Production-ready versions with full compatibility guarantees
- No breaking changes without major version bump
- Schema is frozen; migrations provided for any changes
- Full support and security updates
- Supported for minimum 12 months from release

### Deprecated (`deprecated`)
- Stable versions no longer receiving new features
- Security updates provided for 6 months after deprecation
- Users advised to migrate to newer versions
- No new compatibility obligations introduced
- Clear migration path provided

### Obsolete (`obsolete`)
- No longer supported
- No security updates
- Users must upgrade to receive support
- Archived for historical reference only

## Schema Version Compatibility

### Frozen Schemas
The following schema versions are frozen and will not change:
- `lunum-sem/0.2`
- `lunum-record/0.2`

Field names and structures in frozen schemas are locked. Any evolution requires new schema versions.

### Active Development Schemas
The following schemas are in development and may evolve:
- `lunum-sem/0.1-draft`
- `lunum-record/0.1-draft`

### Compatibility Window

| Package Version | Schema Versions | Status | Release Date | End of Life |
|---|---|---|---|---|
| 0.1.x | `0.1-draft` schemas | Obsolete | 2026-01-15 | 2026-07-15 |
| 0.2.0+ | `0.1-draft`, `0.2` schemas | Stable | 2026-04-01 | 2027-04-01 |
| 1.0.0+ | `0.2` schemas only | Future | TBD | TBD |

### Overlapping Support

When a new major version is released, the previous version receives support for a 3-month overlap period to allow migration. During overlap:
- Security updates are provided for the older version
- Bug fixes may be backported
- Migration tools and documentation are available

## Deprecation Process

### Timeline
1. **Announcement** — Public notice at least 12 months before deprecation
2. **Stabilization** — Documentation, migration tools, and testing updates
3. **Deprecation Date** — Version enters deprecated state
4. **Security Window** — 6 months of security updates only
5. **Obsolescence** — Support ends; version archived

### Migration Obligations

When upgrading between versions, users must:

1. **Test** — Run full test suite against new version
2. **Migrate** — Use provided migration tools for schema/API changes
3. **Verify** — Validate that semantic output remains equivalent
4. **Deploy** — Update application code if APIs changed

OpenLunum provides:
- Migration guides in `docs/MIGRATION.md`
- Automated migration tools in `packages/core/src/fingerprint-migration.ts`
- Compatibility matrix in `packages/core/src/compatibility-matrix.ts`
- Test fixtures for validation

### Breaking Change Policy

A breaking change is any modification that requires application code updates:
- API signature changes
- Schema field removals
- Semantic behavior changes
- Default behavior changes
- Error handling changes

Breaking changes are only permitted in:
- **Major version bumps** (1.0.0 → 2.0.0)
- **Emergency security patches** (with 30-day deprecation notice)

All breaking changes must:
- Be documented in `CHANGELOG.md`
- Provide migration examples
- Be tested in CI
- Have clear rollback path

## Rollback Guarantees

### Rollback-Safe Operations

OpenLunum guarantees safe rollback to any compatible earlier version for:
- Read-only semantic operations
- Fingerprint verification
- Rendering and realization
- Conformance checking

### Rollback-Unsafe Operations

Cannot safely rollback:
- Data that was created in the newer version
- Schema features not supported in earlier versions
- Model fingerprints if schema changed

### Rollback Process

See `docs/ROLLBACK_PROCESS.md` for the complete rollback procedure:

```
rollbackToSource(record) → verify integrity → restore source
```

Guarantees:
- Semantic fingerprint verification
- Provenance chain validation
- Source text authenticity checking
- Transactional atomicity

## Support Boundaries

### In Scope

OpenLunum provides support for:
- Semantic parsing and canonicalization
- Schema compliance and validation
- Fingerprint migration and verification
- Multilingual semantics (EN, EL, ES, ID)
- Reference renderer implementations
- Error detection and fallback policies
- Rollback procedures
- Migration tools

### Out of Scope

Not provided:
- Production deployment infrastructure
- Data persistence and retrieval (product responsibility)
- Natural language generation beyond reference implementations
- Model fine-tuning or training
- Performance optimization for specific use cases
- Language families beyond EN/EL/ES/ID
- Domain-specific semantic constraints

### Product Boundary

Products using OpenLunum own:
- Context budgets and retrieval strategies
- Safety controls and policy enforcement
- User experience and interaction design
- Persistence and indexing infrastructure
- Performance optimization
- Language expansion
- Domain-specific extensions

## Version Support Matrix

### Current Support Status

```
Version 0.2.x (stable)
  ├─ Package: 0.2.0, 0.2.1, 0.2.2, ...
  ├─ Schemas: 0.1-draft, 0.2
  ├─ Release: 2026-04-01
  ├─ End-of-Life: 2027-04-01
  └─ Status: ✓ Fully supported

Version 0.1.x (obsolete)
  ├─ Package: 0.1.0, 0.1.1, 0.1.2, ...
  ├─ Schemas: 0.1-draft
  ├─ Release: 2026-01-15
  ├─ End-of-Life: 2026-07-15
  └─ Status: ✗ No longer supported

Version 1.0.0 (future)
  ├─ Status: In development
  ├─ Expected: Q2 2027
  └─ Preview: Available in development branches only
```

## Fingerprint Stability

### Stable Fingerprints

These fingerprints will not change:
- Fingerprints for frozen schemas (0.2 and later)
- Fingerprints computed from canonical semantics
- Exact semantic fingerprints

### Migration-Safe Fingerprints

Fingerprints may change when:
- Schema version changes (migration provided)
- Canonicalization algorithm evolves (compatibility layer provided)
- Renderer profiles updated (near-semantic fingerprints may differ)

## Compliance and Evidence

Support claims require accepted evidence:
- No claim of compatibility without test verification
- All migrations tested with reproduction scripts
- All breaking changes documented with examples
- All security issues reported and remediated

See `STATUS.md` for current evidence status and known gaps.

## Request and Report Process

### Report Security Issues
- Email: openlunum-security@example.com (replace with actual)
- Process: See `docs/SECURITY.md`
- Response time: 24 hours to acknowledge

### Request Support
- GitHub Issues: Use `type:support` label
- For pre-1.0, support is best-effort with community participation
- For production use, test thoroughly and report findings

### Report Compatibility Issues
- GitHub Issues: Use `type:compatibility-issue` label
- Include: version, schema, reproduction case, error output
- Response: Prioritized based on severity and user impact

## Future Roadmap

### Planned Enhancements
- Version 1.0.0 (target Q2 2027)
  - Universal language support
  - Production deployment guides
  - Enhanced rollback infrastructure
  - Formal verification proofs

### Known Limitations
- Pre-1.0 release: experimental in production
- Some multilingual evidence not yet accepted (see #253)
- Performance optimization incomplete
- Production deployment guidance still developing

## References

- `STATUS.md` — Current implementation and evidence status
- `docs/ROLLBACK_PROCESS.md` — Detailed rollback procedure
- `docs/COMPATIBILITY.md` — Technical compatibility details
- `packages/core/src/support-contract.ts` — Implementation
- `packages/core/src/compatibility-matrix.ts` — Matrix implementation
- `packages/core/src/fingerprint-migration.ts` — Migration tools

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-31  
**Status:** Final for R1.6 release gate
