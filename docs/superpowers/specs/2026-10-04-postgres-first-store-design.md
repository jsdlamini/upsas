# Postgres-First Store Migration — Design (Sub-project A)

**Date:** 2026-10-04
**Status:** Approved for planning
**Scope:** Sub-project A of multi-tenancy — move the in-memory working store to Postgres with no behaviour change and no tenant key yet.

## 1. Intent

The application currently keeps its entire working store in memory
(`src/lib/data/store.ts`), snapshotted to a single Postgres `StoreState` JSON
blob. That is single-process, single-tenant, and cannot be the foundation for
multi-tenancy.

This sub-project moves the working store onto real Prisma tables, one row per
record, with **no user-visible behaviour change**. The existing 154 tests (which
assert store behaviour) remain the contract and must stay green.

### Success criteria

- Every working record lives in a Prisma table; the `working-state` JSON
  snapshot is retired.
- Store accessor and mutation signatures keep their semantics (they may become
  async); pages and tests are updated accordingly.
- The full test suite passes with no changed assertions beyond `await`.
- Production and demo data migrate to the new tables without loss.

## 2. Scope and non-scope

**In scope:** the working store (`store.ts` tables + `STUDENTS`/`PROJECTS`/
`REGISTERED_STAFF`/`RUBRIC_VERSIONS`) → Prisma; the seed → Prisma; async
ripple to callers and tests.

**Out of scope:** tenant keys, subdomain resolution, signup, host admin, SSO
(sub-projects B and C). No schema gets a `tenantId` yet.

## 3. Data model mapping

The Prisma schema already defines most domain models. The migration wires the
in-memory tables to them and adds the few missing models.

| In-memory | Prisma target | Notes |
|---|---|---|
| `tables.consultations` | `Consultation` + `Attestation` | status, scores, attestations |
| `tables.sheets` | `AssessorSheet` + `CriterionScore` | per-criterion marks |
| `tables.docMarks` | `DocumentationMark` | |
| `tables.publications` | **new `Publication`** | final mark, grade, publishedBy |
| `tables.moderations` | `Moderation` | |
| `tables.topics` | `Topic` | |
| `tables.preferences` | `TopicPreference` | |
| `tables.slots` | `AvailabilitySlot` | |
| `tables.meetingRequests` | **new `MeetingRequest`** | |
| `tables.signatures` | `AgreementSignature` | |
| `tables.deliverables` | `Deliverable` + `DeliverableVersion` | |
| `tables.passwords` | `PasswordCredential` | already the auth store |
| `tables.enrolments` | **new `Enrolment`** | status, carried credit |
| `tables.deadlines` | `AssessmentPeriod` | keyed by `code` |
| `tables.extensions` | **new `Extension`** | |
| `tables.resetTickets` | **new `ResetTicket`** | code hash, expiry |
| `tables.meetingNotices` | `Notification` (+ per-user open state) | |
| `tables.contactEmails` | column on `StaffProfile`/`StudentProfile` | |
| `tables.roleOverrides` | `RoleAssignment` | already the role store |
| `tables.profileOverrides` | columns on `User`/profiles | |
| `tables.institution` | `Institution` | already defined |
| `tables.email` | **new `EmailSettings`** (one row) | |
| `STUDENTS` | `StudentProfile` | |
| `PROJECTS` | `Project` + `ProjectMember` | |
| `PEOPLE` / `REGISTERED_STAFF` | `StaffProfile` + `User` (+ `RoleAssignment`) | |
| `RUBRIC_VERSIONS` | `Rubric` + `RubricVersion` + `RubricCriterion` | |

Missing models to add: `Publication`, `MeetingRequest`, `Enrolment`,
`Extension`, `ResetTicket`, `EmailSettings`.

## 4. Store layer design

The store becomes **Postgres-first**: no in-memory `tables`, no
`collectState`/`hydrateFromPersistence`/`schedulePersist`.

- Each existing store function is reimplemented as an **async** Prisma query
  against the mapped tables.
- `ensureHydrated()` is replaced by `ensureMigrated()` (Prisma migrations are
  applied on boot, as they already are in the Docker entrypoint).
- The `StoreState` snapshot and the persistence layer are removed.
- The auth store (`prisma-auth.ts`) and the working store become the same
  database — one source of truth.

### Async ripple

Because Prisma is async, every working-store accessor and mutation becomes
async, and every caller (`src/app/**`, server actions, components) awaits it.
This is the largest mechanical part of the migration.

## 5. Seed and migration

- `prisma/seed.ts` (and the in-code seed in `store.ts`) move to seed the Prisma
  tables directly (demo staff, students, projects, topics, rubrics, deadlines).
- A one-off migration script reads the existing `StoreState.payload` and writes
  each record into its Prisma table, then deletes the snapshot. This runs once
  for production and the demo instance.
- `DISABLE_DEMO=1` still gates whether the demo staff/students are seeded.

## 6. Error handling

- Every write is awaited and its outcome surfaced (a failed write returns an
  error, never a silent no-op) — the current `persistNow` debounce goes away in
  favour of direct awaited writes.
- Unreachable database → the app reports degraded/unreachable (reusing the
  existing persistence-health signalling) rather than serving stale memory.

## 7. Testing

- The 154 existing tests stay as the behavioural contract; they are updated to
  `await` store calls. No assertions change except where a test specifically
  exercised the in-memory reset (which becomes a per-test DB transaction or
  truncate).
- New tests: migration correctness (seed → Prisma round-trip), and
  read-after-write on each mapped table.

## 8. Risks

- **Async ripple breadth** — nearly every server component and action changes;
  this is the bulk of the work and the main regression surface.
- **Test DB lifecycle** — the suite currently runs with no database; it now
  needs a Postgres test database (or SQLite via Prisma) and per-test cleanup.
- **Synchronous assumptions** — any code relying on store access being sync
  (rare) must be found and made async.

## 9. Decomposition within A

- **A1.** Add the six missing Prisma models + migration.
- **A2.** Convert the store to async Prisma (in slices: auth/identity, topics/
  projects, grading/marks, bookings/meetings, deadlines/enrolments).
- **A3.** Migrate the seed + write the one-off data migration.
- **A4.** Update callers + tests; retire `StoreState`.
