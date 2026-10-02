# Institution Profile — Design

**Date:** 2026-10-02
**Status:** Approved for planning
**Scope:** Phase 1 of "make the system self-configurable for any institution"

## 1. Intent

The application must not be hardcoded to one university. Any institution
(coordinator or IT personnel) must be able to download the open-source code,
run a first-time setup wizard, and have the system branded and configured for
their institution without editing source code.

This phase extracts the **identity and visual branding** into a
database-persisted profile. Academic configuration (academic cycle, courses,
programmes, student-number format, deadlines) is explicitly **out of scope**
and deferred to a later phase.

### Success criteria

- No UNESWA / "University of Eswatini" literal appears anywhere as a default.
- A fresh install blocks all pages until the setup wizard is completed once.
- After setup, every user-facing surface (auth pages, rail, emails, iCal,
  PDF, page title) shows the configured identity.
- A coordinator/admin can edit the profile later from a settings page.
- Email transport is provider-selectable (Resend, SMTP, or none), with a
  written setup guide and a test-email action to verify it.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Profile storage | Singleton in the existing `working-state` snapshot (Approach A) |
| Field scope | Text identity **and** visual identity (accent colour + logo) |
| First-run behaviour | Force the setup wizard until configured |
| Logo | Both: uploaded file (default) or pasted URL |
| Defaults | Neutral placeholders only — **no** UNESWA values anywhere |
| Email | Provider-selectable: Resend, SMTP (any provider / self-hosted), or none; guide + test-email |

## 3. Data model

A single optional record under the `institution` key of the `working-state`
snapshot (`StoreState.payload`). Absent key = not configured.

```ts
interface InstitutionProfile {
  name: string;            // institution name, e.g. "University of Eswatini"
  location: string;        // optional campus/town
  department: string;      // school / faculty / department
  productName: string;     // the product's own name, e.g. "Research Chain"
  monogram: string;        // 2-4 letters for the mark, e.g. "RC"
  accentColor: string;     // hex, e.g. "#2E5AC8"
  logo: { kind: "url"; url: string } | { kind: "file"; fileId: string } | null;
  configuredAt: string;    // ISO timestamp of first save
}
```

### Neutral defaults

`DEFAULT_INSTITUTION` in the config module is:

- `name`: `""`
- `location`: `""`
- `department`: `""`
- `productName`: `"Research Chain"`
- `monogram`: `""` (UI falls back to the institution's own initials)
- `accentColor`: `"#2E5AC8"` (neutral brand blue)
- `logo`: `null`

No field carries any institution-specific value.

## 4. Config module — `src/lib/institution.ts`

```ts
getInstitution(): InstitutionProfile   // stored record, else neutral defaults
isConfigured(): boolean                // true only when a record has been saved
saveInstitution(patch: Partial<InstitutionProfile>): { ok: true } | { ok: false; error: string }
// convenience accessors
institutionName(): string
departmentLine(): string               // "Department of Computer Science — University of Eswatini"
monogramText(): string                 // monogram, else initials of name
logoUrl(): string | null
```

`saveInstitution` writes through the existing `schedulePersist()` path so the
record survives restarts like every other working-state value.

### Validation

- `name` and `department` must be non-empty.
- `accentColor` must match `^#[0-9a-fA-F]{6}$`.
- A `logo.url` must parse as `http(s)` and be reasonably short (≤ 2048 chars).
- On any invalid state, `getInstitution()` falls back to the neutral defaults
  rather than throwing, so a bad record can never take the app down.

## 5. Branding routing

Replace every hardcoded identity literal with a config lookup. Files and the
strings they currently carry:

| File | Current literal(s) |
|---|---|
| `src/app/layout.tsx` | page title `UPSAS — UNESWA Research Chain`; description mentions "Department of Computer Science, University of Eswatini"; `applicationName` |
| `src/app/(app)/layout.tsx` | rail mark `University of Eswatini`, `RC` logo, `Computer Science / Research project supervision` |
| `src/app/login/page.tsx` | `University of Eswatini, Kwaluseni`, `Department of Computer Science`, `RC` |
| `src/app/recover/page.tsx` | same identity block |
| `src/app/register/page.tsx` | same identity block |
| `src/lib/notifications.ts` | fallback sender `UNESWA Research Chain <onboarding@…>` |
| `src/lib/ical.ts` | `PRODID:-//UNESWA Research Chain//…`, default name |
| `src/lib/auth/totp.ts` | issuer label `UNESWA Research Chain` |
| `src/lib/meetings/email.ts` | email branding |
| `src/lib/agreement.ts` | PDF header `Department of Computer Science — University of Eswatini` |
| `src/lib/data/store.ts` | reset/registration email subjects and bodies ("UNESWA Research Chain", "Research Chain") |
| `src/lib/assessment/config.ts` | comment referencing the official UNESWA scheme (reword) |

All replacements use `getInstitution()` and the accessors. Nothing keeps a
hardcoded institution literal as a fallback.

## 6. Visual identity

### Colours

- The profile's `accentColor` is injected as the `--accent` CSS variable on the
  `<html>` element (inline style), overriding the stylesheet default.
- `--accent-dim` is derived via `color-mix(in srgb, var(--accent) 9%, var(--surface))`
  in CSS, so only one value needs to be stored.
- The per-section hues (topics/book/grading/…) remain fixed for this phase.
- Dark mode continues to derive from the existing tokens.

### Logo

- **File**: uploaded via the setup/settings form, stored on the existing
  `uploads` volume under a `logo/` directory, served by a small `GET` route
  (no authentication required, since the logo shows on the login and setup pages).
- **URL**: stored directly and rendered as an `<img src>`.
- **Neither**: the monogram mark renders (text, in the configured letters).
- The logo replaces the monogram in the rail brand and the auth brand block.

## 7. Email provider

Institutions are **not** forced to use Resend. Email transport is chosen at
setup and switchable later.

### Data model

A separate `email` record in the `working-state` snapshot:

```ts
interface EmailSettings {
  provider: 'resend' | 'smtp' | 'none';
  fromName: string;   // e.g. "Research Chain"
  fromEmail: string;  // e.g. "no-reply@institution.edu"
  smtpHost: string;
  smtpPort: number;   // 587 (STARTTLS) or 465 (TLS)
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}
```

- Default provider is `none` (emails log to the server console) until the
  wizard records a choice — a fresh install sends no mail until configured.
- **Secrets note**: the SMTP password is stored in the snapshot so a
  non-technical coordinator can self-serve; the Resend API key stays an
  environment variable (`RESEND_API_KEY`). The guide recommends a dedicated,
  low-privilege SMTP account.

### Provider abstraction

`sendEmail` in `src/lib/notifications.ts` dispatches to the configured
provider:

- `resend` — the existing `fetch` to `https://api.resend.com/emails` using
  `RESEND_API_KEY`.
- `smtp` — a `nodemailer` transport with `host/port/secure/user/pass`; `from`
  = `fromName <fromEmail>`.
- `none` — logs `[email:stub]` and returns `stubbed`.

A new `src/lib/email-config.ts` exposes `getEmailSettings()`,
`saveEmailSettings(patch)`, and `testEmail(to): Promise<SendOutcome>` (a
one-off message through the configured provider, reporting the result).

### Setup guide and verification

- The `/setup` wizard and `/settings` page gain an **Email** section: provider
  (Resend / SMTP / None), from name/email, SMTP host/port/secure/user/pass,
  and a **"Send test email"** button that calls `testEmail()` and shows the
  outcome.
- A `docs/email-setup.md` guide covers, per provider: Resend (create the API
  key, verify the sending domain), SMTP via Gmail/Outlook app passwords, and
  self-hosted Postfix — plus how to run the test email and what `sent /
  failed / stubbed` mean.

## 8. Setup wizard and settings page

### `/setup`

- Reachable only when `!isConfigured()`; redirects away once configured.
- One form: name, location, department, product name, monogram, accent colour
  (colour input), logo (file upload and URL field), and an **Email** section
  (provider, from name/email, SMTP fields, test-email button).
- On save: `saveInstitution(...)` then redirect to `/`.

### Force setup

The root layout checks `isConfigured()`. When false and the current path is
not `/setup`, redirect to `/setup`. This runs for auth pages and app pages
alike, because the root layout hydrates the snapshot for both.

### `/settings`

- Coordinator/admin only (gated by an existing permission such as
  `config.edit`).
- Reuses the same form component as `/setup`; saves in place.

### Existing deployment

The current UNESWA deployment already has a `working-state` snapshot without an
`institution` key, so it will be treated as **not configured** and the setup
wizard will run once. No UNESWA values are seeded automatically.

## 9. Error handling

- Malformed/invalid record → `getInstitution()` returns neutral defaults.
- Logo file missing on disk → `logoUrl()` returns null → monogram renders.
- Save failures surface a visible error on the form; the record is not left
  half-written.

## 10. Testing

- Unit: `getInstitution` returns defaults when unset; `isConfigured` flips
  after save; validation rejects bad colour/URL.
- Email: `sendEmail` dispatches to the configured provider; `testEmail` reports
  the provider outcome; SMTP settings validation rejects a missing host.
- Branding: a render test asserts a page shows the configured `name`, not a
  literal "University of Eswatini".
- Colour injection: the `<html>` style carries the configured accent.
- Logo route: serves the uploaded bytes; 404 when absent.
- Full suite stays green (currently 140 tests).

## 11. Out of scope (Phase 2+)

- Academic cycle, courses, programmes, student-number pattern, deadlines.
- Per-section colour theming beyond the primary accent.
- Multi-tenant (shared) operation — each institution runs its own instance.
- LICENSE / README / packaging polish.

## 12. Risks

- **Root-layout redirect must not lock out `/setup` or static assets** — the
  guard whitelists `/setup` and `/api/*` and asset paths.
- **Hydration ordering** — the guard only evaluates after `ensureHydrated()`
  resolves, so the "configured" state reflects the persisted record, not the
  seed.
- **Colour contrast** — an arbitrary accent could break contrast; acceptable
  for this phase, noted for a future contrast warning.
