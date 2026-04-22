# Code Review: claude-mem Security
**Date**: 2026-04-22
**Ready for Production**: Yes
**Critical Issues**: 0 (resolved)

## Scope
- HTTP worker service and route handlers
- SQL query construction paths
- Process execution paths
- UI rendering/XSS surfaces
- Dependency audit readiness

## Remediation Status (Updated 2026-04-21)
- Resolved: SQL LIMIT interpolation paths now use normalized integers with bound query parameters.
- Resolved: Mutating `/api/*` routes now enforce token authentication for non-local requests when the worker host is non-loopback.
- Resolved: Lockfile policy and CI audit pipeline added (`package-lock.json`, audit npm scripts, GitHub workflow).
- Resolved: Removed `np` release-tool dependency chain and migrated release scripts to native npm commands; `npm audit` now reports 0 vulnerabilities.

## Priority 1 (Must Fix) ⛔

### 1) SQL Injection Risk Through Unsanitized LIMIT Interpolation
**Severity**: High

**Evidence**
- `src/services/sqlite/SessionStore.ts:1453`
- `src/services/sqlite/SessionStore.ts:2196`
- `src/services/sqlite/SessionStore.ts:2228`

These methods interpolate `limit` directly into SQL:

```ts
const limitClause = limit ? `LIMIT ${limit}` : '';
```

**User-controlled data flow**
- `src/services/worker/http/routes/DataRoutes.ts:142` reads `limit` from request body without numeric validation for `/api/observations/batch`.
- `src/services/worker/http/routes/SearchRoutes.ts:53` passes `req.query` directly into search logic.
- `src/services/worker/SearchManager.ts:286` and `src/services/worker/SearchManager.ts:289` forward `options.limit` to `SessionStore` methods.

**Impact**
- SQL statement manipulation risk and query integrity loss.
- At minimum, attacker-controlled malformed SQL can trigger repeated errors/DoS.
- Depending on SQL parser behavior, broader SQL injection impact is possible.

**Fix**
- Strictly coerce `limit` to bounded integers at all route boundaries.
- Do not interpolate numeric clauses from raw input. Use parameterized clauses where possible.
- If parameterizing LIMIT is not supported in a query path, compute a trusted integer first and inject only that trusted value.

---

### 2) Sensitive API Operations Are Unauthenticated If Host Is Exposed
**Severity**: High (configuration-dependent)

**Evidence**
- Worker host is configurable and can be set to non-loopback values, including `0.0.0.0`:
  - `src/shared/SettingsDefaultsManager.ts:89`
  - `src/services/worker/http/routes/SettingsRoutes.ts:286`
- Worker listens on configured host:
  - `src/services/worker-service.ts:320`
  - `src/services/worker-service.ts:325`
- Sensitive mutating endpoints are exposed without authentication, for example:
  - `src/services/worker/http/routes/DataRoutes.ts:65` (`/api/import`)
  - `src/services/worker/http/routes/DataRoutes.ts:62` (`/api/pending-queue/all`)
  - `src/services/worker/http/routes/SettingsRoutes.ts:29` (`POST /api/settings`)
  - `src/services/worker/http/routes/SettingsRoutes.ts:38` (`POST /api/branch/switch`)

**Impact**
- If deployed with non-loopback bind, remote actors can read/modify memory data and trigger operational actions.
- Current security model relies primarily on loopback deployment and CORS checks, not identity/authentication.

**Fix**
- Add API authentication for all mutating routes (at minimum), preferably all routes.
- Require an explicit secure token header, validated server-side.
- Fail closed when `CLAUDE_MEM_WORKER_HOST` is non-loopback unless auth is enabled.
- Add startup warning and health flag when running insecurely.

## Priority 2 (Should Fix) ⚠️

### 3) Dependency Vulnerability Scanning Is Blocked by Missing Lockfile
**Severity**: Medium

**Evidence**
- `npm audit --json` fails with `ENOLOCK` due missing lockfile.

**Impact**
- No deterministic dependency graph for reliable CVE scanning.
- Reduced supply-chain auditability and reproducibility.

**Fix**
- Commit and maintain a lockfile policy (`package-lock.json` or Bun lock strategy).
- Run CVE scans in CI on every PR.

## Positive Controls Observed ✅
- Admin endpoints are gated to localhost:
  - `src/services/server/Server.ts:237`
  - `src/services/server/Server.ts:262`
  - `src/services/server/Server.ts:289`
  - `src/services/server/Middleware.ts` (`requireLocalhost`)
- Terminal HTML rendering is sanitized before `dangerouslySetInnerHTML`:
  - `src/ui/viewer/components/TerminalPreview.tsx:31`
  - `src/ui/viewer/components/TerminalPreview.tsx:136`
- Process execution in branch management uses argument arrays and branch name validation:
  - `src/services/worker/BranchManager.ts`

## Recommended Next Actions
1. Add targeted regression tests for SQL `LIMIT` normalization and mutating-route auth enforcement.
2. Keep release and dependency workflows on native npm tooling to avoid reintroducing vulnerable transitive release dependencies.
3. Continue running CI audit checks on every PR and weekly schedule.