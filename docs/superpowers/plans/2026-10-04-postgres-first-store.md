# Postgres-First Store Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the in-memory working store onto Prisma tables with no behaviour change, retiring the `StoreState` snapshot.

**Architecture:** Replace the in-memory `tables` in `src/lib/data/store.ts` with async Prisma queries against the existing (and six new) schema models. Store function signatures keep their semantics but become async; every caller and test awaits. The seed and a one-off migration move data into Prisma, then `StoreState` is removed.

**Tech Stack:** Next.js 15, TypeScript, Prisma + Postgres, `tsx --test` (node:test).

**Spec:** `docs/superpowers/specs/2026-10-04-postgres-first-store-design.md`

## Global Constraints

- No user-visible behaviour change; the 154 existing tests are the contract.
- Store function signatures keep their names and semantics; they become `async`.
- No `tenantId` yet (that is sub-project B).
- A Postgres database is now required to run the tests (a test DB URL via env).
- `DISABLE_DEMO=1` still gates demo staff/student seeding.

## Review Focus

1. A store function that stays synchronous after migration → callers silently get a Promise. Grep for store imports before finishing.
2. Cross-record writes (a mark + its sheet, a project + its members) must be one transaction, not two awaits that can half-succeed.
3. The test database must be reset between tests, or one test's data leaks into another's assertions.
4. The one-off migration must be idempotent and must not run twice against production.
5. `ensureHydrated()`/`persistNow` references left behind after retirement → the app hydrates nothing and serves empty.

---

### Task 1: Add the six missing Prisma models and a migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_postgres_first_store/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces (Prisma models): `Publication`, `MeetingRequest`, `Enrolment`, `Extension`, `ResetTicket`, `EmailSettings` — each with the fields implied by the spec's mapping table and a `@@map` name.

- [ ] **Step 1:** Add the six models to `prisma/schema.prisma` (mirroring the field shapes used in `store.ts` today).
- [ ] **Step 2:** Run `npx prisma migrate dev --name postgres_first_store` and confirm it creates a migration SQL.
- [ ] **Step 3:** Run `npx prisma generate` and `npx tsc --noEmit` — clean.
- [ ] **Step 4:** Commit: `feat(db): add Publication, MeetingRequest, Enrolment, Extension, ResetTicket, EmailSettings`.

---

### Task 2: Auth and identity slice → Prisma

**Files:**
- Modify: `src/lib/data/store.ts` (password, role/profile override, institution, email, people accessors)
- Test: `tests/institution.test.ts`, `tests/email.test.ts`, `tests/registration.test.ts`

**Interfaces:**
- Consumes: `prisma` client.
- Produces: the existing accessors (`getStoredInstitution`, `setStoredInstitution`, `getStoredEmailSettings`, `setStoredEmailSettings`, `allPeople`, `findPerson`, `findPersonByIdentifier`, `passwordHashFor`, `setPersonRoles`, `updatePersonProfile`) now async Prisma reads/writes with unchanged semantics.

- [ ] **Step 1:** Convert `institution`/`email` accessors to Prisma (`Institution`, `EmailSettings`) and make them async.
- [ ] **Step 2:** Convert `allPeople`/`findPerson`/`findPersonByIdentifier` to read `StaffProfile` + `StudentProfile` + `User` (async).
- [ ] **Step 3:** Convert `setPersonRoles`/`updatePersonProfile` to write `RoleAssignment`/profile columns (async).
- [ ] **Step 4:** Update the three test files to `await`; run `npm test` — the institution/email/registration tests pass.
- [ ] **Step 5:** Commit: `refactor(store): auth and identity slice on Prisma`.

---

### Task 3: Topics and projects slice → Prisma

**Files:**
- Modify: `src/lib/data/store.ts`
- Test: `tests/branding.test.ts` (and topic-related tests)

**Interfaces:**
- Produces: `allTopics`, `topicsBySupervisor`, `findTopic`, `proposeTopic`, `acceptProposal`, `setPreferences`, `preferencesOf`, `runAllocation`, `findProject`, `projectOf`, `unallocatedStudents`, `allocatedStudents` — async, unchanged semantics.

- [ ] **Step 1:** Convert topic + preference functions to Prisma (`Topic`, `TopicPreference`).
- [ ] **Step 2:** Convert project functions to Prisma (`Project`, `ProjectMember`) including `runAllocation`'s project creation as one transaction.
- [ ] **Step 3:** Update callers/tests to `await`; run `npm test`.
- [ ] **Step 4:** Commit: `refactor(store): topics and projects slice on Prisma`.

---

### Task 4: Grading and marks slice → Prisma

**Files:**
- Modify: `src/lib/data/store.ts`
- Test: grading/marking tests

**Interfaces:**
- Produces: `sheetsFor`, `makeSheet`-equivalent writes (`AssessorSheet` + `CriterionScore`), `docMarkOf`/`DocumentationMark`, `publications`, `moderations`, `RUBRIC_VERSIONS` accessors — async.

- [ ] **Step 1:** Convert sheet + criterion writes to `AssessorSheet` + `CriterionScore` (one transaction per sheet).
- [ ] **Step 2:** Convert documentation marks, publications, moderations, and rubric versions to their models.
- [ ] **Step 3:** Update callers/tests to `await`; run `npm test`.
- [ ] **Step 4:** Commit: `refactor(store): grading and marks slice on Prisma`.

---

### Task 5: Bookings and meetings slice → Prisma

**Files:**
- Modify: `src/lib/data/store.ts`
- Test: meeting/booking tests

**Interfaces:**
- Produces: `slotsOf`, `bookSlot`, `cancelBooking`, `confirmBooking`, `consultationsOf`, consultation writes, `meetingRequestsFor`, `myMeetingRequests`, `deliverablesFor`, `uploadDeliverable` — async.

- [ ] **Step 1:** Convert availability slots + bookings to `AvailabilitySlot`.
- [ ] **Step 2:** Convert consultations + attestations to `Consultation` + `Attestation`.
- [ ] **Step 3:** Convert meeting requests and deliverables to `MeetingRequest` / `Deliverable` + `DeliverableVersion`.
- [ ] **Step 4:** Update callers/tests to `await`; run `npm test`.
- [ ] **Step 5:** Commit: `refactor(store): bookings and meetings slice on Prisma`.

---

### Task 6: Deadlines, enrolments and recovery slice → Prisma

**Files:**
- Modify: `src/lib/data/store.ts`
- Test: deadline/enrolment/recovery tests

**Interfaces:**
- Produces: `deadlinesFor`, `enrolmentOf`, `grantExtension`, `requestResetCode`, `redeemResetCode`, `issueResetCode`, `contactEmails` accessors — async.

- [ ] **Step 1:** Convert deadlines to `AssessmentPeriod` and extensions to `Extension`.
- [ ] **Step 2:** Convert enrolments to `Enrolment` and contact emails to profile columns.
- [ ] **Step 3:** Convert reset tickets to `ResetTicket` (code hash, expiry) preserving the recovery flow.
- [ ] **Step 4:** Update callers/tests to `await`; run `npm test`.
- [ ] **Step 5:** Commit: `refactor(store): deadlines, enrolments and recovery slice on Prisma`.

---

### Task 7: Seed and one-off data migration

**Files:**
- Modify: `prisma/seed.ts`
- Create: `scripts/migrate-storestate.ts`

**Interfaces:**
- Consumes: the existing `StoreState.payload` shape.
- Produces: `scripts/migrate-storestate.ts` (idempotent) that reads `StoreState` and writes every record into its Prisma table.

- [ ] **Step 1:** Rewrite `prisma/seed.ts` to seed Prisma tables directly (gated by `DISABLE_DEMO`).
- [ ] **Step 2:** Write `scripts/migrate-storestate.ts` to migrate a snapshot into Prisma, idempotently (skip rows whose ids already exist).
- [ ] **Step 3:** Run it against a copy of the production snapshot; verify counts match.
- [ ] **Step 4:** Commit: `feat(db): Prisma seed and StoreState migration script`.

---

### Task 8: Retire StoreState and final caller/test pass

**Files:**
- Modify: remove `StoreState` usage from `src/lib/data/store.ts` and `src/lib/persistence.ts`
- Test: full suite

**Interfaces:**
- Removes: `collectState`, `hydrateFromPersistence`, `schedulePersist`, `loadPersistedState`, `savePersistedState`, and the `StoreState` model.

- [ ] **Step 1:** Delete `src/lib/persistence.ts` and remove `StoreState` from `schema.prisma` (migrate drop).
- [ ] **Step 2:** Remove every remaining `ensureHydrated()` call site; replace with `ensureMigrated()` (Prisma migrations already run at boot).
- [ ] **Step 3:** Grep for `ensureHydrated`, `persistNow`, `StoreState`, `working-state` — none remain in `src/`.
- [ ] **Step 4:** Run `npm test` (all 154 green, awaited) and `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `refactor(store): retire StoreState snapshot`.

---

## Final verification

- [ ] `npm test` — all 154 tests green (updated to `await`).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `grep -rn 'StoreState\|ensureHydrated\|persistNow\|working-state' src/` — empty.
- [ ] Production and demo migrated and healthy after the one-off migration.
