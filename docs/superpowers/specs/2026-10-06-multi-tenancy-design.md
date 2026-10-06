# Multi-Tenancy — Design (Sub-project B)

**Date:** 2026-10-06
**Status:** Approved for planning
**Scope:** Sub-project B of the multi-tenancy programme — one shared Postgres
database, one shared hostname, every record isolated by `tenantId`, with the
tenant resolved from the signed-in account.

## 1. Intent

The Research Chain supervision/assessment system is currently a single-tenant
deployment at `https://research.idealsoftwaresolutions.com/`. We want to host
several institutions on that one address, each with its own branding, staff,
students, topics, projects, marks and settings, fully isolated from the others.

Because no new domain is being purchased yet, **tenants do not get their own
subdomain**. The tenant is resolved from the authenticated account, not from
the URL. Cloudflare's Universal SSL already covers the single hostname, so no
wildcard certificate is needed.

### Success criteria

- Two institutions can run side by side on `research.idealsoftwaresolutions.com`
  with no cross-tenant data leakage.
- Every store query is tenant-scoped; an unscoped query is a loud failure, not
  a silent leak.
- Login resolves the tenant from the account (email is the global key).
- The existing single-tenant data becomes tenant #1 with no loss.
- The existing test suite stays green, seeded against tenant #1, plus new
  cross-tenant isolation tests.

## 2. Locked decisions

| Question | Decision |
|---|---|
| Tenant addressing | **Single hostname** — no subdomains, no path prefix |
| Tenant resolution | **From the authenticated account** (session carries `tenantId`) |
| Login key | **Email only** (globally unique); username/student-number login is dropped |
| Data isolation | **Shared schema + `tenantId`** on every domain table |
| Institution / email config | **Per-tenant** (no longer `id "default"` singletons) |
| Provisioning | **Self-serve signup + host console** (option C, from the earlier brainstorm) |
| SSO | **Out of scope** (sub-project C) |
| Existing instance | Becomes **tenant #1**, backfilled |

## 3. Scope and non-scope

**In scope (B1 + B2):** the `Tenant` model; `tenantId` on every domain table;
per-tenant `Institution` and `EmailSettings`; email-based login resolving the
tenant; session/`currentPrincipal()` carrying `tenantId`; tenant-scoped store
queries with a `requireTenant()` guard; the migration + backfill to tenant #1;
self-serve signup; the host console.

**Out of scope:** SSO (sub-project C); per-tenant subdomains/URLs; billing and
paid plans; cross-tenant data sharing; per-tenant rate limits beyond the
existing global ones.

## 4. Data model

### New `Tenant` model

```prisma
model Tenant {
  id          String   @id          // slug, e.g. "acme"
  name        String
  createdAt   DateTime @default(now())
  suspendedAt DateTime?
}
```

### `tenantId` on every domain table

The following tables gain a `tenantId String` (FK to `Tenant.id`, indexed), and
their unique constraints become per-tenant where they were globally unique:

`Institution`, `AcademicCycle`, `AssessmentPeriod`, `Programme`, `Course`,
`User`, `StudentProfile`, `StaffProfile`, `Topic`, `TopicPreference`, `Project`,
`ProjectMember`, `StateTransition`, `Agreement`, `AgreementSignature`,
`AvailabilitySlot`, `Consultation`, `Attestation`, `ActionItem`, `Deliverable`,
`EthicsApplication`, `Rubric`, `RubricVersion`, `RubricCriterion`,
`PresentationSession`, `PresentationNomination`, `AssessorSheet`,
`CriterionScore`, `Moderation`, `DocumentationMark`, `AssessmentConfig`,
`MarkSnapshot`, `AuditEvent`, `Notification`, `Publication`, `MeetingRequest`,
`Enrolment`, `Extension`, `ResetTicket`, `EmailSettings`.

The credential/session tables (`PasswordCredential`, `TotpCredential`,
`AuthSession`, `RoleAssignment`) are owned by `User` and inherit the tenant
through that FK; they do not get their own `tenantId`.

### Identity columns

- `User.email` stays **globally unique** — it is the login key.
- `User.username` changes from global-unique to **unique within a tenant**
  (`@@unique([tenantId, username])`). Student numbers are already per-tenant in
  practice and stay so.
- The host administrator (the platform operator) is a `User` with a
  platform-level `HOST` role and no tenant; the host console is gated by it.

### `Institution` and `EmailSettings` become per-tenant

Both drop the singleton `id "default"` and are keyed by `tenantId`. The
`getInstitution()` / email-config accessors take the tenant from the request
context instead of reading a fixed row.

## 5. Identity and tenant resolution

- **Login** takes an **email + password**. Email is globally unique, so it alone
  identifies both the user and their tenant. The username/student-number login
  paths are removed (they are ambiguous across tenants); password reset
  likewise keys off email.
- **`currentPrincipal()`** gains a `tenantId`. It is the single source of truth
  for "which tenant is this request in".
- **No middleware tenant logic** — the host header is ignored for auth. This is
  the safer shape: a tenant can never be spoofed via the URL.

## 6. Store-layer scoping

- A `tenantContext` (async local storage) is set at the request boundary from
  `currentPrincipal().tenantId`.
- Every store accessor and mutation filters by the context tenant:
  `where: { tenantId: ctx.tenantId }` on reads and `data: { tenantId:
  ctx.tenantId }` on writes.
- `requireTenant()` throws if no tenant is in context, so a forgotten scope is
  a loud 500/refusal, never a cross-tenant read.
- Write paths always stamp `tenantId` from the context (never from client
  input), so a user cannot write into another tenant.

## 7. Provisioning (B2)

- **Self-serve signup** (`/signup`): institution name + slug + admin name +
  email + password. One transaction creates `Tenant`, `Institution`,
  `EmailSettings`, the admin `User` (with `COORDINATOR`/`ADMINISTRATOR` roles
  scoped to the new tenant) and a `PasswordCredential`.
- **Host console** (`/admin`, `HOST` role only): list tenants (with member
  counts), create a tenant on behalf of an institution, suspend/reactivate a
  tenant (suspension blocks sign-in but never deletes data).
- The slug is validated (lowercase, `[a-z0-9-]`, no reserved names) and is
  currently used only as the tenant key — no DNS/subdomain is derived from it.

## 8. Migration and backfill

One migration, applied non-interactively as before:

1. Create `Tenant`; insert tenant #1 (the existing institution).
2. Add nullable `tenantId` to each domain table.
3. Backfill every existing row with tenant #1's id.
4. Make `tenantId` NOT NULL; add FK + indexes.
5. Convert `Institution` / `EmailSettings` to per-tenant (add `tenantId`, drop
   the singleton default, re-point the single row at tenant #1).
6. Replace `User.username`'s global unique constraint with `(tenantId,
   username)`.

Because the working data was recently reduced to the live accounts (3 users,
one topic), the backfill is small and simple.

## 9. Testing

- The existing 151 tests stay the behavioural contract; the test seed creates
  tenant #1 and every fixture is stamped with it.
- New tests:
  - **Isolation** — a principal in tenant A cannot read or write tenant B's
    topics, projects, marks, consultations or settings.
  - **Login resolution** — an email resolves the correct tenant; an unknown
    email is rejected without disclosing whether the tenant exists.
  - **Provisioning** — signup creates a fully-formed tenant in one transaction;
    host suspension blocks sign-in.
  - **Guard** — an unscoped store call throws.

## 10. Risks

- **Ripple breadth** — every store accessor gains a tenant filter; the
  mechanical scope is the main regression surface (same shape as the
  Postgres-first migration).
- **Missed scope on a read** — the `requireTenant()` guard and the isolation
  tests are the backstop against this.
- **Login-key migration** — users who only know their username/student number
  must be steered to their email (shown in-app and recoverable by email).

## 11. Decomposition

- **B1 — technical isolation:** sections 4, 5, 6, 8, 9. Tenants are created
  manually (seed or host script); no public signup yet. Ships the risky
  schema/auth core first.
- **B2 — self-serve onboarding:** section 7 (signup + host console) on top of
  B1.
