# Build: Research Project Supervision & Assessment System (UPSAS)

Department of Computer Science, University of Eswatini. Courses CSC 400 / 402 / 499, across BSc, BSc IT, BSc CS Education, BSc LIS.

Build a production-grade system of record for undergraduate research project supervision: self-registration, topic publication and allocation, supervision consultations, deliverables, ethics tracking, presentation grading, documentation marking and moderation, final mark computation.

Stack: Next.js (App Router, TypeScript), PostgreSQL, Docker. Test-first on the assessment engine and lifecycle state machine before any UI. Architecture, schema, API design, UI and infrastructure are yours — don't ask, decide and document.

Nothing institution-specific is hardcoded. All weights, thresholds, rubrics, programmes and course codes are seed data behind a first-run setup wizard.

---

## The facts you cannot derive — get these exactly right

**1. Rubrics, transcribed verbatim from the live 2024/2025 forms. Do not alter criteria or maxima.**

*Presentation 1 (Chapters 1–2), max 40:* Background of study 5 · Problem statement 5 · Aim and objectives 5 · Literature review 5 · Identified gaps 5 · Methodology 5 · Implementation 5 · In-text citation 2 · References 3

*Presentation 2 (Chapters 3–5), max 80:* Introduction 5 · Problem statement 5 · Aim and objectives 5 · Methodology 15 · Implementation 25 · Results interpretation 10 · Conclusion 5 · Presentation skills 5 · References 5

Marks entered per criterion, validated server-side against each maximum. The system computes totals; assessors never type one. Rubrics are versioned and immutable once used — edits fork a new version.

**2. Normalise everything.** Maxima differ (40, 80, 100). Persist raw total *and* its maximum on every score. Any code path consuming a raw total without dividing by its recorded maximum is a defect.

**3. Both presentations are graded by every member of the department**, on one sheet per assessor covering the whole cohort — students grouped in pairs by session number. So presentation grading is a keyboard-driven cohort grid matching that layout, with per-cell autosave and offline draft resilience. A one-student-per-page UI is a regression and will be rejected. A blank row means "absent for that session" and is excluded from aggregation — never zero. Assessors see only their own scores until the presentation closes; the Coordinator sees the spread. Flag discrepancies above a configurable threshold (default 15 normalised points) for moderation, and block computation below a minimum assessor count (default 3).

**4. Group projects are real** — the topic agreement form has two student slots and sessions are paired. Design for 1..N members from the start (default cap 2). Shared artefacts belong to the project; consultations, contribution statements and marks belong to the student. Each member files an individual contribution statement before submission. Group marks are individually adjustable with recorded justification.

**5. The 60% is not an exam.** It is the final documentation, marked by the supervisor and moderated by a second assessor inside this system. Support external mark entry as an alternative mode.

**6. Consultations replace a signed paper register.** Dual attestation (supervisor completes, student confirms), append-only, corrections only by superseding record. Produce a per-student Consultation Register PDF — that is the artefact in a dispute.

**7. Published marks are immutable.** Corrections create superseding snapshots with a reason; both remain retrievable. Every snapshot captures its inputs, config version, rubric versions, aggregation policies, assessor set, timestamp and actor. Append-only audit log that no one — administrator included — can delete from.

**8. Authentication is local and self-contained.** Username and password held in this system's own database, conforming to NIST SP 800-63-4 / SP 800-63B-4 (final, July 2025 — not the 2017 third revision an older habit will reach for): minimum 8 characters and 15 recommended, maximum accepted length at least 64, all printable Unicode permitted, paste enabled, **no composition rules and no forced periodic rotation**, rotation only on evidence of compromise. Screen candidate passwords against a blocklist shipped and updated locally — never a breach-check API. argon2id hashing, session rotation, CSRF protection, login throttling with account lockout, locally generated reset tokens. No OAuth, no Google or Microsoft sign-in, no institutional SSO or LDAP, no third-party identity provider (Auth0, Clerk, Supabase Auth or similar). No external service participates in verifying who a user is.

The same rule extends to verification generally: account approval is a human act by a Coordinator or Administrator inside the system, not an external check. MFA for privileged roles is offline TOTP (RFC 6238) with locally generated secrets and recovery codes — no SMS gateway, no push service. Upload virus scanning runs locally (ClamAV in the compose stack), not against a cloud scanning API. Similarity checking stays an unimplemented adapter interface, disabled by default. Email goes through a configurable SMTP server, institutional mail by default, behind a provider-agnostic interface so a hosted sender can be swapped in later without touching call sites.

Design this so the whole stack runs on a single server with no outbound internet dependency for any core flow — login, booking, grading, marking, computation and publication must all work on an isolated network. Keep external integrations behind adapter interfaces so identity federation can be added later as a decision, not a rewrite.

---

## Conformance targets

Build to these. Where one is aspirational rather than met, say so in the delivery notes rather than claiming it.

**Security.** OWASP ASVS 5.0.0 (current stable, May 2025) Level 2 across the application; Level 3 for every path that can create, alter or publish a mark, and for the audit subsystem. OWASP Top 10 2021 and OWASP API Security Top 10 as review checklists at each phase gate. NIST SP 800-63B-4 AAL1 for students, AAL2 for Supervisor, Coordinator and Administrator — satisfied by password plus offline TOTP (RFC 6238, RFC 4226), never SMS. Role model follows the NIST/ANSI INCITS 359 RBAC model: roles, permissions, sessions, static and dynamic separation of duty. Enforce separation of duty explicitly — a user may not moderate their own mark, approve their own agreement amendment, or unlock their own submitted grading sheet, even while legitimately holding both roles.

**Privacy and law.** Eswatini Data Protection Act 41 of 2022, in force 4 March 2022, enforced by the Eswatini Communications Commission as Data Protection Authority. Implement: a lawful-basis and purpose register per data category; data minimisation; a documented retention schedule with automated expiry; data-subject rights as working features, not policy text — confirmation of holding, access export, rectification, and erasure-with-exceptions where academic record retention overrides. Note that transfers outside SADC require an adequate-protection finding: **in-country self-hosting is the compliance path, not merely a preference**, which is a further argument for the constraint in fact 8. Assume the Computer Crime and Cybercrime Act 2020 applies to logging and incident handling. Where South African students or collaborators are in scope, POPIA alignment follows from the same controls.

**Assessment and academic records.** Standard QA practice for degree-bearing assessment, implemented not assumed: independent second marking with recorded moderation, external examiner access to the evidence trail, retention of assessment evidence for a configurable period (5 years is the common floor), a defined appeals window during which marks and evidence are frozen, and separation between the person who awards a mark and the person who publishes it. Any mark-affecting record — executed agreements, submitted grading sheets, consultation registers, final mark sheets — is archived as PDF/A (ISO 19005) so it remains readable and admissible independent of this system.

**Tamper evidence.** The audit log is append-only and hash-chained, each entry binding the hash of its predecessor, with the chain head verifiable on demand. Assessment evidence is not merely "logged"; it is demonstrably unaltered since recording. Electronic signatures on the topic agreement capture identity, timestamp, IP and a content hash — treat their legal standing under Eswatini's electronic transactions legislation as an open question for counsel, and build the evidentiary record strong enough that the answer doesn't change the design.

**Interoperability — formats, not services.** Conform to the exchange formats without requiring a live integration, which keeps fact 8 intact. Roster import and export in 1EdTech OneRoster 1.2 CSV, so cohorts load from the SIS without hand-keying. Emit learning events in a Caliper 1.2 or xAPI-shaped event log, stored locally, queryable, exportable. Expose an LTI 1.3 Advantage tool interface behind a feature flag, default off, for the day the institution wants Moodle launch — build the seam, leave it closed. Completion records exportable as Open Badges 3.0 / Comprehensive Learner Record where the department chooses to issue them.

**Engineering.** OpenAPI 3.1 as the contract, generated from code rather than maintained beside it. Errors as RFC 9457 Problem Details. Timestamps RFC 3339, stored UTC, rendered through the IANA tz database. Semantic versioning on the API and on rubric and policy-profile versions alike. Accessibility to WCAG 2.2 AA, with EN 301 549 as the procurement framing. Documented RPO and RTO with a restore drill that is actually run, not just written down — a system of record that has never been restored from backup is not a system of record.

---

## The policy conflict — build both, decide neither

The 2022 departmental guidelines and the incoming policy disagree. Implement both as selectable, versioned policy profiles. Seed A as default. Do not resolve this yourself.

| | Profile A (new, default) | Profile B (legacy 2022) |
|---|---|---|
| Final | CA 40 + Documentation 60 | CA 40 + Documentation 60 |
| Consultations | 20 points, min 4/semester | 0 points — attendance is a *gate*, min 10/project |
| Presentation 1 | 10 points | 30% of CA |
| Presentation 2 | 10 points | 70% of CA |

A consultation requirement must be expressible as a weighted component, an eligibility gate, or both. Enforce the invariant that CA sub-components sum to `CA_weight` and `CA_weight + Documentation_weight = 100`; reject violations with a field-level error.

Consultation aggregation, default `MEAN_WITH_COMPLIANCE_FACTOR`, pluggable:

```
period_score = min(100, mean(scores) × min(1, graded/required)
                        + min(cap, step × max(0, graded − required)))
step = 2.0, cap = 5.0
```

Below the minimum, scale down proportionally; above it, reward to a cap. Alternatives: `MEAN_ALL`, `BEST_N`, `MEAN_NO_BONUS`, `GATE_ONLY`.

---

## Acceptance tests

Same engine, same inputs, profile switched:

```
Consultations Sem1 72,68,80,75,85 (5/4) → 78.0 ; Sem2 70,74,66 (3/4) → 52.5
P1 panel mean 29/40 = 72.5%  ·  P2 panel mean 62/80 = 77.5%  ·  Documentation 65%

Profile A: consultation 65.25 → 13.05 pts ; presentations 15.00 pts
           CA 28.05/40 = 70.1%  →  FINAL 67.1%
Profile B: CA = 0.30×72.5 + 0.70×77.5 = 76.0%  →  FINAL 69.4%
           (8 consultations of 10 → gate failed, flagged, no deduction)
```

Also verify: blank assessor rows don't depress a mean; a supervisor cannot touch a student they don't supervise (enforced at the API layer, not the UI); reassigning a supervisor preserves all history; editing a used rubric forks rather than mutates; a two-student project yields two adjustable mark records and one shared artefact; the audit trail reconstructs any final mark from raw criterion entries upward.

---

## Provisional — flag in data and UI, don't invent silently

Two instruments don't exist yet and block their phases: the **consultation rubric** (current practice records attendance only) and the **final documentation marking guide** (referenced in the guidelines, never supplied). Seed both from the guidelines' chapter structure, mark them `PROVISIONAL` in the database and behind a persistent admin banner, and raise them in your delivery notes. Same for grade bands.

---

## Everything else is yours

Lifecycle state machine (registration → agreement → proposal → ethics → P1 → implementation → P2 → documentation → marking → moderation → publication, plus withdrawal/deferral/reassignment), topic catalogue and allocation modes, supervisor capacity, e-signed topic agreement with dual-approval amendments, supervisor nomination of students cleared to present, coordinator scheduling, calendars, versioned deliverables with local virus scanning and signed URLs, role dashboards, departmental exports matching the paper forms, RBAC with multi-role users, notifications.

Assume unreliable, low-bandwidth connections throughout. Never lose entered marks to a dropped connection.

Out of scope: fee management, general LMS features, institutional identity management beyond login, postgraduate workflows.
