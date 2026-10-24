# Academic cycle administration — design

## Intent

Let an institution's administrator define and manage academic cycles (e.g.
"2025/2026") instead of the hard-coded `CYCLE = '2025/2026'` in
`src/lib/data/store.ts`. The initial cycle is captured during institution
signup; afterwards an admin edits cycles from Settings and the app resolves
the current cycle per tenant/request.

## Goals / non-goals / anti-goals

- Goal: signup creates the institution's first current cycle; that label is
  used for the admin's COORDINATOR role grant and the "Cycle …" display.
- Goal: an admin (ADMINISTRATOR / COORDINATOR) can create and edit cycles and
  mark one current from Settings; non-admins neither see nor can reach the
  controls, and the server rejects them.
- Goal: the app reads the current cycle instead of `'2025/2026'` in the key
  visible paths (login/register display, role resolution, cycle-scoped reads).
- Goal: behaviour stays correct when no cycle is configured (fall back to the
  legacy constant).
- Non-goal: migrating every demo fixture / report generator off the constant.
  Only the key visible paths named in the brief are switched; the in-memory
  demo store keeps the constant as its fallback.
- Anti-goal: a cycle whose label changes out from under role grants. Labels
  are immutable once created (dates and `isCurrent` are editable).

## Constraints

- `RoleAssignment.cycleId`, `AssessmentPeriod.cycleId` and the computed-mark
  `cycleId` are plain strings; the codebase has used the label `'2025/2026'`
  as that string everywhere. The `AcademicCycle.id` therefore keeps the same
  semantics: **id == label** (explicitly set on create; the schema's
  `@default(uuid())` is never used). This keeps the role-grant comparison and
  every `cycleId` query string identical to today.
- `AcademicCycle.startsOn` / `endsOn` are `NOT NULL`, so every cycle needs
  both dates. Signup/Settings offer optional date inputs; when omitted we
  derive them from a `YYYY/YYYY` label (1 Aug first-year → 31 Jul second-year).
- No schema change and no migration are needed.

## Approaches considered

1. **id == label, label immutable** (chosen). Minimal diff, matches the
   existing `'2025/2026'`-as-`cycleId` data, and satisfies "use that label for
   the COORDINATOR grant" literally. Cost: label edits are disallowed.
2. **UUID id + separate label** with a mapping helper everywhere. Cleaner in
   theory but touches every `cycleId` query, every grant, and the seeded demo
   data, and breaks the existing `'2025/2026'` rows unless migrated. Rejected:
   far larger blast radius for no user-visible gain.
3. **Per-request cycle context threaded through every page.** Rejected as
   over-engineering; the current-cycle lookup per tenant is one cheap indexed
   query with a constant fallback.

## How (decided)

- New `src/lib/cycles.ts` owns all cycle reads/writes:
  - `currentCycleId(tenantId)` → current cycle's id/label, else `CYCLE`.
  - `currentCycleLabel(tenantId)` → current cycle's label, else `CYCLE`.
  - `listCycles(tenantId)`, `createCycle`, `updateCycle`, `setCurrentCycle`,
    `cyclesFor(tenantId)` plus `canManageCycles(principal)`.
- `createTenant` gains `cycleLabel` + optional dates; it creates the
  `AcademicCycle` (id = label, `isCurrent: true`) inside the existing
  transaction and grants COORDINATOR with `cycleId = label`.
- `src/app/signup/page.tsx` collects the initial cycle label and optional
  dates.
- `src/app/(app)/settings/page.tsx` gains an admin-only "Academic cycles"
  section with create/edit/set-current actions (server-side gate via
  `canManageCycles`).
- `src/lib/auth/current.ts`, `src/app/login/page.tsx`, `src/app/register/page.tsx`
  and `src/app/(app)/cohort/page.tsx` resolve the current cycle per tenant.
  `src/lib/data/store.ts` deadline accessors default to the resolved current
  cycle when no cycleId is supplied. Mark/report pages pass
  `principal.cycleId`.

## Left to the builder

Exact markup/copy of the Settings section and signup fields; test names and
assertions are pinned in the plan.
