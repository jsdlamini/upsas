# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Auth is hybrid: in-memory `src/lib/data/store.ts` (source of truth for current password hashes) plus Prisma identity (`src/lib/auth/prisma-auth.ts`). `seedPrismaDomain()` creates `User` rows WITHOUT a `PasswordCredential`, so the login path (`src/app/login/page.tsx`) must backfill a missing/empty credential from `passwordHashFor()` before verifying, or a freshly registered account fails with `INVALID_CREDENTIALS`.
- Self-serve institution admins from `createTenant` (`src/lib/tenant-provisioning.ts`) exist only in Postgres, never in the in-memory `allPeople()`. Session reconstruction must fall back to Prisma grants via `findUserPrismaById` (see `src/lib/auth/principal.ts` → `principalForSessionRecord`), or a signed-in admin bounces straight back to `/login` with no error.
- Academic cycles: `src/lib/cycles.ts` owns cycle reads/writes. A cycle's `AcademicCycle.id` IS its label (e.g. `'2025/2026'`), labels are immutable after create (dates and `isCurrent` are editable), and the unconfigured fallback is the `CYCLE` constant in `src/lib/data/store.ts`. Cycle-scoped `cycleId` strings in `RoleAssignment`, `AssessmentPeriod` and computed marks all use this id.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
