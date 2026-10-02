# Institution Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the hardcoded institution identity into a persisted, in-app-editable profile with a forced first-run setup wizard.

**Architecture:** A singleton `InstitutionProfile` record in the existing `working-state` snapshot, read through a thin `src/lib/institution.ts` module. All branding reads the module; the accent colour is injected as a CSS variable on `<html>`; the logo is a file on the uploads volume (or a URL) served by one route. The root layout redirects to `/setup` until the profile is saved.

**Tech Stack:** Next.js 15 (App Router, server components/actions), TypeScript, Node's built-in test runner (`tsx --test`), the existing in-memory store + `working-state` Postgres snapshot.

**Spec:** `docs/superpowers/specs/2026-10-02-institution-profile-design.md`

## Global Constraints

- No UNESWA / "University of Eswatini" literal anywhere as a default; neutral placeholders only.
- Persist through the existing `schedulePersist()` / `working-state` snapshot; no new Prisma table.
- Test runner is `tsx --test tests/*.test.ts` (run with `npm test`); keep all 140 existing tests green.
- Logo file lives under `process.env.UPLOADS_DIR ?? '/var/lib/upsas/uploads'`, subdir `logo/`.
- Server actions and server components only; no client-side framework beyond the existing theme toggle.

## Review Focus

1. Blank `name` or `department` → `saveInstitution` returns `{ ok:false, error }` and stores nothing.
2. `accentColor` not matching `^#[0-9a-fA-F]{6}$` → rejected by `saveInstitution`.
3. `logo.url` not parseable as http(s) → rejected (or treated as absent).
4. `logo.kind === 'file'` but the file is missing on disk → `logoUrl()` returns null and the monogram renders.
5. The force-setup guard must not redirect `/setup`, `/api/*`, or static asset paths.

---

### Task 1: Institution record and config module

**Files:**
- Modify: `src/lib/data/store.ts` (add type, tables field, persistence, accessors)
- Create: `src/lib/institution.ts`
- Test: `tests/institution.test.ts`

**Interfaces:**
- Produces (from `src/lib/data/store.ts`):
  ```ts
  export interface InstitutionProfile {
    name: string;
    location: string;
    department: string;
    productName: string;
    monogram: string;
    accentColor: string;
    logo: { kind: 'url'; url: string } | { kind: 'file'; fileId: string } | null;
    configuredAt: string | null;
  }
  export function getStoredInstitution(): InstitutionProfile | null;
  export function setStoredInstitution(v: InstitutionProfile): void; // calls schedulePersist()
  export function resetInstitutionForTests(): void;               // sets the record back to null (test isolation)
  ```
- Produces (from `src/lib/institution.ts`):
  ```ts
  export const DEFAULT_INSTITUTION: InstitutionProfile; // neutral: name '', department '', productName 'Research Chain', accentColor '#2E5AC8', logo null
  export function getInstitution(): InstitutionProfile;    // stored ?? DEFAULT_INSTITUTION
  export function isConfigured(): boolean;                // getStoredInstitution() !== null
  export function saveInstitution(patch: Partial<InstitutionProfile>): { ok: true } | { ok: false; error: string };
  export function institutionName(): string;
  export function departmentLine(): string;               // "department — name" (omit either side if empty)
  export function monogramText(): string;                 // monogram, else first two letters of name uppercased, else ''
  export function logoUrl(): string | null;               // url kind → url; file kind → `/api/institution/logo`; else null
  ```

- [ ] **Step 1: Write the failing test**

In `tests/institution.test.ts` (import from `../src/lib/institution`, and `beforeEach` from `node:test`):

```ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getInstitution, isConfigured, saveInstitution, monogramText } from '../src/lib/institution';
import { getStoredInstitution, resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('getInstitution returns neutral defaults when unset', () => {
  assert.equal(getInstitution().name, '');
  assert.equal(getInstitution().productName, 'Research Chain');
  assert.equal(getInstitution().accentColor, '#2E5AC8');
  assert.equal(isConfigured(), false);
});

test('saveInstitution validates and persists', () => {
  assert.deepEqual(saveInstitution({ name: '', department: 'CS' }), { ok: false, error: 'Name and department are required.' });
  const ok = saveInstitution({ name: 'Acme University', department: 'School of Computing', accentColor: '#123ABC' });
  assert.equal(ok.ok, true);
  assert.equal(isConfigured(), true);
  assert.equal(getInstitution().name, 'Acme University');
  assert.ok(getStoredInstitution()!.configuredAt);
});

test('saveInstitution rejects a bad accent colour and a bad logo URL', () => {
  assert.equal(saveInstitution({ name: 'X', department: 'Y', accentColor: 'red' }).ok, false);
  assert.equal(saveInstitution({ name: 'X', department: 'Y', logo: { kind: 'url', url: 'not-a-url' } }).ok, false);
});

test('monogramText falls back to initials of name', () => {
  saveInstitution({ name: 'University of Example', department: 'CS', monogram: '' });
  assert.equal(monogramText(), 'UN');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (module `../src/lib/institution` not found).

- [ ] **Step 3: Add `InstitutionProfile` type, `tables.institution`, persistence, and accessors in `src/lib/data/store.ts`**

- Add `institution: InstitutionProfile | null` to the `Tables` interface and `null` in the `tables` initializer (alongside `roleOverrides`/`profileOverrides`).
- Include `institution: tables.institution` in `collectState()`.
- In `hydrateFromPersistence()`, after the other `Object.assign` blocks, add:
  `tables.institution = (state.institution && typeof state.institution === 'object') ? state.institution as InstitutionProfile : null;`
- Export `getStoredInstitution` and `setStoredInstitution` (the setter calls `schedulePersist()`).

- [ ] **Step 4: Implement `src/lib/institution.ts`**

`DEFAULT_INSTITUTION` uses only the neutral values from Global Constraints. `saveInstitution` merges the patch over the current stored (or default) record, sets `configuredAt` to `new Date().toISOString()` when it was null, validates (name/department non-empty; accent `^#[0-9a-fA-F]{6}$`; logo URL starts with `http://` or `https://`), writes via `setStoredInstitution`, and returns `{ ok:true }` or `{ ok:false, error }`. `departmentLine()` joins `department` and `name` with `' — '` (omitting empty parts). `monogramText()` returns `monogram.trim()` if non-empty, else the first two letters of `name` (letters only, uppercased), else `''`. `logoUrl()` returns the URL for a `url` logo, `/api/institution/logo` for a `file` logo, else null.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS, and the existing 140 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/store.ts src/lib/institution.ts tests/institution.test.ts
git commit -m "feat(institution): persisted institution profile and config module"
```

---

### Task 2: Route branding through the config module

**Files:**
- Modify: `src/app/layout.tsx` (metadata → dynamic), `src/app/(app)/layout.tsx`, `src/app/login/page.tsx`, `src/app/recover/page.tsx`, `src/app/register/page.tsx`, `src/lib/notifications.ts`, `src/lib/ical.ts`, `src/lib/auth/totp.ts`, `src/lib/meetings/email.ts`, `src/lib/agreement.ts`, `src/lib/data/store.ts` (email subjects/bodies), `src/lib/assessment/config.ts` (comment only)
- Test: `tests/branding.test.ts`

**Interfaces:**
- Consumes: `getInstitution()`, `institutionName()`, `departmentLine()`, `monogramText()`, `productName` via `getInstitution()`.
- Produces: no new exported functions — pages now render configured values.

- [ ] **Step 1: Write the failing test**

In `tests/branding.test.ts` (import `getInstitution`, `saveInstitution` from `../src/lib/institution`, and `buildIcal` from `../src/lib/ical`, `departmentLine` from `../src/lib/institution`):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstitution, saveInstitution, departmentLine } from '../src/lib/institution';
import { buildIcal } from '../src/lib/ical';

test('iCal and department line reflect the configured institution, not a literal', () => {
  saveInstitution({ name: 'Acme University', department: 'School of Computing', productName: 'Acme Chain' });
  const ical = buildIcal([{ uid: '1', startIso: '2026-10-03T10:00:00Z', endIso: '2026-10-03T10:30:00Z', summary: 'x' }]);
  assert.ok(!ical.includes('UNESWA'));
  assert.ok(ical.includes('Acme Chain'));
  assert.equal(departmentLine(), 'School of Computing — Acme University');
  assert.equal(getInstitution().productName, 'Acme Chain');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (iCal still contains the hardcoded `UNESWA Research Chain` PRODID/name).

- [ ] **Step 3: Replace hardcoded literals**

In each file from the Files list, replace the institution-specific literals with the module lookups. Concretely:

- `src/app/(app)/layout.tsx` rail: mark text → `institutionName()`, logo text → `monogramText()`, sub text → `departmentLine()` split appropriately (department on one line, "Research project supervision" on the next).
- `src/app/login/page.tsx`, `src/app/recover/page.tsx`, `src/app/register/page.tsx`: the `.inst` (name + location), `.unit` (department), and `.logo` (monogram) → module lookups.
- `src/lib/ical.ts`: `PRODID:-//${productName}//Consultations//EN` and default name `${productName} consultations`.
- `src/lib/auth/totp.ts`: issuer label → `productName`.
- `src/lib/notifications.ts`: fallback sender → `${productName} <no-reply@…>` (drop the UNESWA/onboarding literal; use the configured product name only).
- `src/lib/meetings/email.ts` and `src/lib/agreement.ts`: headers/branding → `departmentLine()` / `institutionName()`.
- `src/lib/data/store.ts`: reset/registration email subjects and bodies → `productName` and the configured site URL (already `NEXT_PUBLIC_SITE_URL`).

- [ ] **Step 4: Make the root-layout metadata dynamic**

In `src/app/layout.tsx`, replace the static `export const metadata` with:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const inst = getInstitution();
  return {
    title: { default: inst.productName, template: `%s · ${inst.productName}` },
    applicationName: inst.productName,
    description: `${inst.productName} — research project supervision, ${inst.department || 'a department'}`,
    robots: { index: false, follow: false },
  };
}
```

(Keep the existing `viewport` export.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS, plus `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(institution): route branding strings through the config module"
```

---

### Task 3: Accent colour injection and logo

**Files:**
- Modify: `src/app/layout.tsx` (inject `--accent`), `src/app/(app)/layout.tsx` (logo/monogram in rail), `src/app/login/page.tsx` (auth brand logo)
- Create: `src/lib/logo-storage.ts`, `src/app/api/institution/logo/route.ts`
- Test: `tests/logo.test.ts`

**Interfaces:**
- Consumes: `getInstitution()`, `logoUrl()`.
- Produces:
  ```ts
  // src/lib/logo-storage.ts
  export function saveLogoFile(bytes: Uint8Array, contentType: string): string; // returns fileId, writes under <UPLOADS_DIR>/logo/
  export function readLogoFile(fileId: string): { bytes: Buffer; contentType: string } | null;
  ```

- [ ] **Step 1: Write the failing test**

In `tests/logo.test.ts`:

```ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveInstitution, logoUrl } from '../src/lib/institution';
import { resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('logoUrl points at the logo route for a file logo and the URL for a url logo', () => {
  saveInstitution({ name: 'A', department: 'B', logo: { kind: 'url', url: 'https://example.com/logo.png' } });
  assert.equal(logoUrl(), 'https://example.com/logo.png');
  saveInstitution({ name: 'A', department: 'B', logo: { kind: 'file', fileId: 'missing' } });
  assert.equal(logoUrl(), null); // file does not exist on disk
  saveInstitution({ name: 'A', department: 'B', logo: null });
  assert.equal(logoUrl(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (`logoUrl` not yet returning the route/URL correctly — it returns null for file kind before this task).

- [ ] **Step 3: Implement `src/lib/logo-storage.ts`**

`saveLogoFile` writes the bytes to `${process.env.UPLOADS_DIR ?? '/var/lib/upsas/uploads'}/logo/${fileId}` (a short random id), creating the directory if needed, and returns the id. `readLogoFile` reads and returns `{ bytes, contentType }` or null on any error. Use `node:fs/promises` and `node:crypto`.

- [ ] **Step 4: Refine `logoUrl()` in `src/lib/institution.ts`**

For a `file` logo, `logoUrl()` now calls `readLogoFile(fileId)`; if the file exists it returns `/api/institution/logo`, otherwise null (so callers fall back to the monogram). Import `readLogoFile` from `./logo-storage`.

- [ ] **Step 5: Implement `src/app/api/institution/logo/route.ts`**

A `GET` handler (no auth) that reads `getInstitution().logo`; if `kind === 'file'`, `readLogoFile(fileId)` and return `new Response(bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } })`; else `Response.json({ error: 'Not found' }, { status: 404 })`.

- [ ] **Step 6: Inject `--accent` and render the logo**

In `src/app/layout.tsx`, set `style={{ '--accent': inst.accentColor } as React.CSSProperties}` on the `<html>` element (computed from `getInstitution()`). In the rail (`(app)/layout.tsx`) and the auth brand (`login`, `recover`, `register`), render an `<img>` when `logoUrl()` is non-null, else the monogram text.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS and typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(institution): accent colour injection and logo file/URL support"
```

---

### Task 4: Setup wizard, force-setup guard, and settings page

**Files:**
- Modify: `src/app/layout.tsx` (guard redirect)
- Create: `src/app/setup/page.tsx`, `src/app/(app)/settings/page.tsx`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Consumes: `isConfigured()`, `saveInstitution()`, `getInstitution()`, `saveLogoFile()`.
- Produces: the `/setup` and `/settings` pages; no new library exports.

- [ ] **Step 1: Write the failing test**

In `tests/setup.test.ts` (import `beforeEach` from `node:test`, and `resetInstitutionForTests`):

```ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isConfigured, saveInstitution, getInstitution } from '../src/lib/institution';
import { resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('a save transitions the app to configured with a timestamp', () => {
  assert.equal(isConfigured(), false);
  assert.equal(saveInstitution({ name: 'A', department: 'B' }).ok, true);
  assert.equal(isConfigured(), true);
  assert.ok(getInstitution().configuredAt);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL until `resetInstitutionForTests` exists and the guard/save flow is wired (the test itself depends only on Task 1's module, which already passes it — this task's new behaviour is the `/setup` page and the root-layout guard, exercised in the smoke check rather than a unit test).

- [ ] **Step 3: Create `src/app/setup/page.tsx`**

A server component reading `getInstitution()` as the form defaults, with a server action `save(formData)` that builds the patch (name, location, department, productName, monogram, accentColor, and a logo: an uploaded `File` via `saveLogoFile`, or a pasted URL), calls `saveInstitution`, and `redirect('/')`. On any `{ ok:false, error }`, redirect back to `/setup?e=<error>`. Render the neutral fields (name, location, department, product name, monogram, accent colour picker, logo file input + URL input).

- [ ] **Step 4: Add the force-setup guard in `src/app/layout.tsx`**

After `await ensureHydrated()`, compute `configured = isConfigured()` and `pathname` from `headers().get('x-pathname')` (the middleware already sets it). If `!configured` and the pathname is not `/setup` and does not start with `/api/`, `redirect('/setup')`. (This runs for page routes only; `/api/*` route handlers do not use the root layout.)

- [ ] **Step 5: Create `src/app/(app)/settings/page.tsx`**

A coordinator/admin-only page (gate with `can(principal, 'config.edit')`) reusing the same form fields and `save` action as `/setup`, saving in place and showing a success notice. Add a `/settings` nav link in `(app)/layout.tsx` inside the existing `config.edit` block (label "Institution").

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS and typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(institution): first-run setup wizard, force guard, and settings page"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all tests green (140 existing + new).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `grep -rniE 'university of eswatini|uneswa' src/` returns only the spec/comment references that the spec explicitly allows (none as defaults).
- [ ] Manual smoke: a fresh install redirects to `/setup`; after save, the rail/login/emails show the configured identity.
