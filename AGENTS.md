# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.
- Auth is hybrid: in-memory `src/lib/data/store.ts` (source of truth for current password hashes) plus Prisma identity (`src/lib/auth/prisma-auth.ts`). `seedPrismaDomain()` creates `User` rows WITHOUT a `PasswordCredential`, so the login path (`src/app/login/page.tsx`) must backfill a missing/empty credential from `passwordHashFor()` before verifying, or a freshly registered account fails with `INVALID_CREDENTIALS`.
- Self-serve institution admins from `createTenant` (`src/lib/tenant-provisioning.ts`) exist only in Postgres, never in the in-memory `allPeople()`. Session reconstruction must fall back to Prisma grants via `findUserPrismaById` (see `src/lib/auth/principal.ts` → `principalForSessionRecord`), or a signed-in admin bounces straight back to `/login` with no error.
- Academic cycles: `src/lib/cycles.ts` owns cycle reads/writes. A cycle's `AcademicCycle.id` IS its label (e.g. `'2025/2026'`), labels are immutable after create (dates and `isCurrent` are editable), and the unconfigured fallback is the `CYCLE` constant in `src/lib/data/store.ts`. Cycle-scoped `cycleId` strings in `RoleAssignment`, `AssessmentPeriod` and computed marks all use this id.
- Members who join a self-serve tenant via `/join/<slug>` (`src/lib/join.ts`) are Prisma-only too: `User` + `PasswordCredential` + `RoleAssignment` (+ `StudentProfile` for students) stamped `tenantId = slug`, resolved on sign-in by email through `findUserPrisma`. The in-memory `STUDENTS`/`REGISTERED_STAFF` store remains the default-tenant (`/register`) path only — do not mix the two for the same tenant.
- Email transport defaulting: `createTenant` (`src/lib/tenant-provisioning.ts`) stamps a new institution's `EmailSettings` with `resend` when `RESEND_API_KEY` is set (else `none`) and inherits the `default` tenant's `fromName`/`fromEmail`. `getEmailSettings` (`src/lib/email-config.ts`) resolves a stored `'none'` row back to `resend` when the key is set, so self-served institutions send invites instead of stubbing; air-gapped installs (no key) and explicit SMTP choices are untouched.
- Flash messages: server actions redirect with `?saved=1` / `?e=…` / `?done=…` / `?added=` / `?allocated=`; pages resolve these into transient toasts via `src/lib/flash.ts` `resolveFlashes` (+ `parseErrorList` for the JSON-array `e` on rubrics/cohort) and `src/components/flash-toast.tsx`, which dispatches `showToast` and strips the params. `?toast=` is still handled app-wide by `ToastsInner` in `src/components/toasts.tsx` (`book`/`login`); do not also map `toast` in a page's `FlashToast` or it fires twice. New save/edit/delete actions must redirect to a flash param the page maps.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
