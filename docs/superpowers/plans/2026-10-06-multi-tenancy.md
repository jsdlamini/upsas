# Multi-Tenancy (B1: Technical Isolation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every institution on the shared Postgres database with a `tenantId` on every domain table, resolved from the signed-in account on the single shared hostname.

**Architecture:** One `Tenant` row per institution; `tenantId` denormalised onto every domain table. The tenant is resolved from the authenticated user (email is the global login key) and threaded through an async-local-storage context; every store query filters by it and every write stamps it. `requireTenant()` makes an unscoped query a loud failure.

**Tech Stack:** Next.js App Router (server components), Prisma, PostgreSQL 16, TypeScript, node:test (`tsx --env-file=.env --test --test-concurrency=1 tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-06-multi-tenancy-design.md`

## Global Constraints

- No "UNESWA" / "University of Eswatini" default anywhere (identity, copy, or commit messages).
- Single hostname `research.idealsoftwaresolutions.com`; **no** subdomain or path-prefix tenant logic.
- Email is the sole login key; username/student-number login is removed.
- Tests run serially against dev Postgres (`upsas-dev-db`, localhost:5433) and must stay green (151 today).
- Prisma migrations are applied non-interactively: `prisma migrate diff --from-url "$DBURL" --script` → committed migration → `prisma migrate deploy`.
- Build-time safety: store accessors already guard `if (!process.env.DATABASE_URL) return <default>` so `next build` prerender never touches the DB.
- Runtime non-root `upsas` user (Docker) — never commit secret values.

## Review Focus

1. **Unscoped read** — a store read with no tenant in context must throw (via `requireTenant()`), never return another tenant's rows.
2. **Unscoped write** — a write with no tenant in context must refuse, never stamp `tenantId = null` or `"default"` by accident.
3. **Email wins over remembered tenant** — signing in with an email belonging to tenant B must resolve tenant B, ignoring any stale tenant hint.
4. **Suspended tenant** — a suspended tenant's users must be refused sign-in (and have sessions rejected) without deleting their data.
5. **Per-tenant institution/email config** — `getInstitution()` / email config must read the *request's* tenant, not a fixed singleton; accessing it before a tenant resolves must fail loudly.

---

### Task 1: `Tenant` model + `tenantId` schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_tenant_ids/migration.sql` (via `prisma migrate diff`)

**Interfaces:**
- Produces: `Tenant { id: string; name: string; createdAt: Date; suspendedAt: Date | null }`; every domain table has `tenantId String` (indexed, FK → `Tenant.id`); `User` has `@@unique([tenantId, username])`; `Institution`/`EmailSettings` keyed by `tenantId`.

- [ ] **Step 1: Add `Tenant` + `tenantId` to `prisma/schema.prisma`**

Add `model Tenant { id String @id; name String; createdAt DateTime @default(now()); suspendedAt DateTime? }`. Add `tenantId String` (+ `@index`) to every table in the spec's section 4 list. Add `@@unique([tenantId, username])` on `User` (drop the single `@unique` on `username`). Change `Institution`/`EmailSettings` so the row is keyed by `tenantId` (replacing the singleton `id @default("default")`; the FK references `Tenant.id`).

- [ ] **Step 2: Validate + generate the migration**

Run: `npx prisma validate` then `npx prisma migrate diff --from-url "$DBURL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_tenant_ids/migration.sql` (with `DBURL` from `.env`).
Expected: a diff containing `CREATE TABLE "Tenant"`, `ADD COLUMN "tenantId"`, unique/index changes, and the Institution/EmailSettings key changes.

- [ ] **Step 3: Add the backfill + NOT NULL statements**

Prepend to the generated SQL: `INSERT INTO "Tenant" (id, name) VALUES ('default', 'Research Chain');` and backfill each `tenantId` to `'default'`, then `ALTER TABLE ... ALTER COLUMN "tenantId" SET NOT NULL`. (The generated diff already emits NOT NULL; the backfill must precede it.)

- [ ] **Step 4: Apply + regenerate**

Run: `npx prisma migrate deploy && npx prisma generate`. Expected: migration applies cleanly; `npx prisma validate` still passes.

- [ ] **Step 5: Commit**

`git add prisma && git commit -m "feat(tenant): Tenant model + tenantId on all domain tables"`

### Task 2: Tenant context (`src/lib/tenant.ts`)

**Files:**
- Create: `src/lib/tenant.ts`
- Test: `tests/tenant.test.ts`

**Interfaces:**
- Produces: `getTenantId(): string | null`; `requireTenant(): string` (throws `Error("no tenant context")` when null); `runWithTenant<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T>`; `setTenantContext(tenantId: string | null): void`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tenant.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTenantId, requireTenant, runWithTenant, setTenantContext } from '../src/lib/tenant';

test('requireTenant throws with no context and resolves inside runWithTenant', async () => {
  assert.throws(() => requireTenant(), /no tenant context/);
  setTenantContext('acme');
  assert.equal(requireTenant(), 'acme');
  setTenantContext(null);
  const seen = await runWithTenant('acme', () => requireTenant());
  assert.equal(seen, 'acme');
  assert.equal(getTenantId(), null);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`requireTenant` not defined)

- [ ] **Step 3: Implement `src/lib/tenant.ts`** using `node:async_hooks` `AsyncLocalStorage<string | null>`. `setTenantContext` sets the store (for tests); `runWithTenant` runs `fn` inside `als.run(tenantId, fn)`.

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

### Task 3: `currentPrincipal()` resolves and sets the tenant

**Files:**
- Modify: `src/lib/auth/current.ts`
- Modify: `src/lib/auth/login.ts` (principal type)

**Interfaces:**
- Consumes: `requireTenant`, `runWithTenant`/`setTenantContext` from Task 2; `prisma.user` (already imported).
- Produces: `AuthenticatedPrincipal` gains `tenantId: string`; `currentPrincipal()` loads `user.tenantId` from Prisma and, before returning, sets the tenant context for the request.

- [ ] **Step 1: Extend `AuthenticatedPrincipal` with `tenantId: string`** in `login.ts` (and any `principalFromSession` construction sites) so `tsc` pinpoints every call site.

- [ ] **Step 2: In `currentPrincipal()`, after resolving the person, read `await prisma.user.findUnique({ where: { id: record.userId }, select: { tenantId: true } })`; if missing return null; set the tenant context to `user.tenantId`; return the principal with `tenantId`.

- [ ] **Step 3: Run `npx tsc --noEmit`** — fix the construction sites; expected clean.

- [ ] **Step 4: Run the suite — expect green (no tenant assertion yet, but the context is now set for authed requests).**

- [ ] **Step 5: Commit**

### Task 4: Email-based login resolution

**Files:**
- Modify: `src/lib/data/store.ts` (`findPersonByIdentifier` → email lookup)
- Modify: `src/lib/auth/login.ts` (login + recover accept email)
- Modify: `src/app/login/page.tsx`, `src/app/recover/page.tsx` (label "Email")

**Interfaces:**
- Consumes: `requireTenant` is NOT used here — email is globally unique, so login is tenant-agnostic.
- Produces: `findPersonByEmail(email: string): Person | null` (exact, case-insensitive). Login resolves the user by email; username/student-number branches are removed.

- [ ] **Step 1: Replace `findPersonByIdentifier` with an email-only lookup** (`findPersonByEmail`, case-insensitive) in `store.ts`; update `login.ts` (`authenticate`) and `redeemResetCode`/`requestResetCode` to take email.

- [ ] **Step 2: Update the login/recover forms** to label the field "Email" and drop the username/student-number hint.

- [ ] **Step 3: Add tests** — `tests/registration.test.ts` (or a new `tests/login-email.test.ts`): an email resolves the right account; an unknown email fails with no account-enumeration signal; recover sends to the email.

- [ ] **Step 4: Run the suite — expected green.**

- [ ] **Step 5: Commit**

### Task 5: Scope the store by tenant

**Files:**
- Modify: `src/lib/data/store.ts` (every accessor/mutation)
- Test: `tests/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `requireTenant()` from Task 2.
- Produces: every exported store function filters reads by `where: { tenantId: requireTenant() }` and stamps writes with `data: { tenantId: requireTenant(), ... }`. `seedPrismaDomain()` takes an explicit `tenantId` parameter.

- [ ] **Step 1: Add the isolation test first** — seed two tenants (`default`, `other`), create a topic/project in `default`, then `runWithTenant('other', ...)` and assert `allTopics()`, `findProject()`, `slotsOf()` etc. return empty for `other` and that a `default` row is not visible.

- [ ] **Step 2: Thread `requireTenant()` through the store** — reads add the filter, writes stamp `tenantId` from context (never from client input). This is the largest mechanical step; work function-by-function and keep `tsc` clean after each group (topics/projects → marks/sheets → bookings/meetings → deadlines/enrolments → institution/email).

- [ ] **Step 3: Update `seedPrismaDomain(tenantId: string)`** and its callers (tests' `beforeEach`) to stamp the tenant.

- [ ] **Step 4: Run the suite — expected green, plus the new isolation test passes.**

- [ ] **Step 5: Commit**

### Task 6: Per-tenant institution + email config

**Files:**
- Modify: `src/lib/institution.ts`, `src/lib/email-config.ts`

**Interfaces:**
- Consumes: `requireTenant()`.
- Produces: `getInstitution()` and the email-config accessors read the row whose `tenantId === requireTenant()` (falling back to neutral defaults only when no row exists, not when no tenant exists); `setStoredInstitution`/`setStoredEmailSettings` stamp the tenant.

- [ ] **Step 1: Add a test** — `runWithTenant('default', ...)` reads the seeded default institution; `runWithTenant('other', ...)` gets the neutral default (no cross-tenant read); writing under `other` does not change `default`'s row.

- [ ] **Step 2: Implement** the tenant-scoped accessors.

- [ ] **Step 3: Run the suite — expected green.**

- [ ] **Step 4: Commit**

### Task 7: Suspended-tenant gate + final isolation review

**Files:**
- Modify: `src/lib/auth/current.ts`
- Test: `tests/tenant-isolation.test.ts`

**Interfaces:**
- Produces: `currentPrincipal()` returns null when the user's tenant has `suspendedAt != null`.

- [ ] **Step 1: Add a test** — suspend tenant `other` (set `suspendedAt`), assert `currentPrincipal()` for a user in `other` is null, and that the tenant's data is untouched.

- [ ] **Step 2: Implement** the check in `currentPrincipal()`.

- [ ] **Step 3: Full suite + `npx tsc --noEmit`** — expected all green.

- [ ] **Step 4: Commit**
