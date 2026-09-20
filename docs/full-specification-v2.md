# Agent Prompt v2 — Undergraduate Research Project Supervision & Assessment System (UPSAS)

**Supersedes v1.** All v1 requirements stand unless explicitly amended here. This version is reconciled against the Department of Computer Science's actual instruments: the *Research Project Guidelines and Assessment (2022, revised)*, the *Topic and Supervision Agreement Form (2025)*, and the two live presentation assessment forms for the 2024/2025 session.

You are building a production-grade web system for managing undergraduate research project supervision and assessment. Read this specification in full before writing code. Where this document states a business rule, implement it exactly. Where it is silent on implementation detail, use your judgement and document the decision.

---

## 0. Institutional context

| Item | Value |
|---|---|
| Institution | University of Eswatini, Kwaluseni |
| Faculty | Science and Engineering |
| Department | Computer Science |
| Courses in scope | CSC 400, CSC 402, CSC 499 |
| Programmes | BSc, BSc Information Technology, BSc Computer Science Education, BSc Library and Information Science |
| Project mode | Individual **or group** (pairs are the observed norm) |
| Final mark | CA 40% + Final Documentation 60% |

Nothing above may be hardcoded. Every value is seed data in a first-run setup wizard, because the system must be deployable to another department without code changes. The department name, programme list, course codes, weights, rubrics and thresholds are all configuration.

---

## 1. Objective

A single system of record for the entire research project cycle: topic publication and agreement, supervisor allocation, supervision consultations, deliverable submission, ethical clearance tracking, presentation grading by departmental panel, final documentation marking and moderation, and computation of the final mark.

The assessment engine is the core. Marks carry academic and potentially legal weight, so **traceability, auditability and correctness of computation take priority over every other concern, including convenience.**

### Target stack

Next.js (App Router, TypeScript), PostgreSQL, Docker (multi-stage Dockerfile + docker-compose). Server-side authorisation enforced at the data-access layer, never only in the UI. Test-driven: the assessment engine and lifecycle state machine are developed test-first with full branch coverage before any UI work begins.

---

## 2. Roles

| Role | Capabilities |
|---|---|
| **Student** | Self-register, browse/rank topics, sign the topic agreement, book consultations, upload deliverables, attest attendance, track ethical clearance, view own released marks and feedback |
| **Supervisor (Mentor)** | Self-register, publish topics, accept allocations, publish availability, confirm and grade consultations, nominate students for presentations, mark final documentation, advance lifecycle |
| **Departmental Assessor** | Grade presentations for any student in the cohort (see §6 — *all departmental members grade both presentations*); no supervision rights over students not their own |
| **Second Assessor / Moderator** | Moderate final documentation marks and resolve presentation discrepancies for assigned students |
| **Project Coordinator** | Configure the academic cycle, run/override allocation, compile presentation schedules from supervisor nominations, manage moderation, publish results, generate departmental reports |
| **External Examiner** | Read-only, time-boxed access to a designated cohort's deliverables, rubrics and marks |
| **System Administrator** | Institution configuration, user management, role assignment, audit access. **No ability to alter a published mark.** |

A user may hold several roles concurrently (a lecturer is simultaneously Supervisor, Departmental Assessor and often Second Assessor). Model roles as a many-to-many assignment scoped to an academic cycle, not as a single enum field on the user.

Registration is self-service but role-gated: student accounts verified against student-number format (observed pattern `2022xxxxx` — treat as a configurable regex, never a hardcoded one) plus institutional email domain; staff accounts require Coordinator or Administrator approval before activation.

---

## 3. Assessment model

### 3.1 Two policy models, one engine

The department's 2022 guidelines and the incoming policy this system is being built to support **differ**. The engine must express both. Neither is hardcoded; both are seeded as selectable, versioned policy profiles.

**Profile A — "Consultation-Weighted" (new; system default)**

```
Final mark   = CA 40% + Final Documentation 60%
Within the final mark:
  Consultation component  = 20 points   (50% of CA)
  Presentation component  = 20 points   (50% of CA)
      Presentation 1 = 10 points
      Presentation 2 = 10 points
Minimum consultations = 4 per semester (more is rewarded — see §3.3)
```

**Profile B — "Legacy 2022" (must be reproducible)**

```
Final mark   = CA 40% + Final Documentation 60%
Within CA:
  Presentation 1 = 30% of CA  (12 points)
  Presentation 2 = 70% of CA  (28 points)
  Consultations  = 0 points — attendance is a *gate*, not a mark
Minimum consultations = 10 per project, evidenced by signed register
```

Implement the ability for a consultation requirement to act as an **eligibility gate** rather than a weighted component. Under Profile B, failing to meet the consultation minimum blocks presentation nomination and final submission but contributes no marks. Under Profile A it does both: it is weighted *and* gated (gating configurable).

**Invariant to enforce at the config layer:** CA sub-component weights must sum exactly to `CA_weight`, and `CA_weight + Documentation_weight` must equal 100. Reject any configuration that breaks this, with a clear error naming the offending field.

**Interpretation note carried from v1:** in Profile A, "20% from consultation" means 20 percentage points of the final mark — half the 40% CA — not 20% of the CA.

### 3.2 Score normalisation — mandatory

The real rubrics do **not** share a common maximum: Presentation 1 is out of **40**, Presentation 2 is out of **80**, final documentation is out of **100**. Never compare or average raw rubric totals.

```
normalised_percentage = (raw_total / rubric_max) × 100
weighted_points       = normalised_percentage / 100 × component_weight
```

Every stored score persists **both** the raw total and the rubric maximum in force at the time, so historical marks remain reconstructible if a rubric is later revised. Any code path that uses a raw total without dividing by its recorded maximum is a defect.

### 3.3 Consultation scoring

Only appointments in `COMPLETED` status with dual attestation (§7) and a recorded grade count toward the minimum. `NO_SHOW` and `CANCELLED` are recorded on the student record and excluded from the average.

Aggregation is a pluggable policy, default `MEAN_WITH_COMPLIANCE_FACTOR`:

```
raw        = mean(scores of all graded consultations in the period)
compliance = min(1, graded_count / required_count)
engagement = min(engagement_cap, engagement_step × max(0, graded_count − required_count))
period_score = min(100, raw × compliance + engagement)

Defaults: engagement_step = 2.0, engagement_cap = 5.0
```

A student at 2 of 4 required consultations is scaled to half their average; a student at 6 earns a capped bonus. Alternative policies behind the same interface: `MEAN_ALL`, `BEST_N`, `MEAN_NO_BONUS`, `GATE_ONLY` (Profile B).

Where a project spans two semesters, the consultation component is the mean of the semester scores unless configured otherwise.

### 3.4 Presentation scoring — departmental panel

Both presentations are graded by **all members of the department**, not by the supervisor alone. This is the single biggest departure from a conventional supervisor-graded model and it drives the UI design (§6).

- Default aggregation across assessors: arithmetic mean of normalised percentages.
- Configurable alternatives: trimmed mean (discard highest and lowest — appropriate for large panels), median, or supervisor-excluded mean (to remove supervisor bias on their own supervisees).
- Assessors who submit no score for a student are excluded from that student's mean, not counted as zero. **A missing score must never silently depress a mark.**
- Configurable minimum assessor count (default 3) before a presentation mark is computable; below it, the presentation is flagged `INSUFFICIENT_ASSESSORS` and surfaces in the Coordinator's queue.
- If any two assessors' normalised percentages differ by more than a configurable threshold (default 15), flag `MODERATION_REQUIRED`, exclude from computation, and route to the Coordinator. Resolution records the moderator's identity and a written rationale.

### 3.5 Final documentation (the 60%)

The 60% is **not** an externally supplied exam mark. Per the guidelines it is the final report, marked by the supervisor and moderated by a second assessor in the department. Support both:

- `INTERNALLY_MARKED` (default): supervisor marks against the documentation rubric → second assessor moderates → discrepancy above threshold routes to Coordinator → agreed mark recorded with both marker identities and the reconciliation note.
- `EXTERNAL_ENTRY`: a single mark captured by the Coordinator or imported, for departments that run a written examination instead.

The documentation rubric (Chapters 1–5, out of 100) is not in the supplied materials — the guidelines reference a supervisor marking guide that was not attached. Seed it from the chapter structure in §D of the guidelines (Introduction, Literature Review, Methodology, Implementation & Results, Conclusion & Recommendations, References & Formatting), mark it clearly as **PROVISIONAL**, and surface a banner in the admin UI until a Coordinator confirms it.

### 3.6 Final mark computation

```
CA_score   = (sum of CA component points) / CA_weight × 100
final_mark = CA_weight/100 × CA_score + Documentation_weight/100 × Documentation_score
```

Store the result as an immutable **mark snapshot** capturing every input value, the policy profile and config version, every rubric version used, the aggregation policy identifiers, the assessor set, the computation timestamp and the computing user. Recomputation is permitted only while results are unpublished. After publication, a change creates a superseding snapshot with a mandatory reason; the prior snapshot remains retrievable. Never mutate a mark in place.

Carry full precision internally; round only at presentation, half-up to one decimal place, configurable.

### 3.7 Worked examples — implement both as test fixtures

**Fixture A — Profile A (Consultation-Weighted)**

```
Consultations Sem 1: 72, 68, 80, 75, 85  → 5 graded / 4 required
  raw 76.0 × compliance 1.0 + engagement 2.0        = 78.0
Consultations Sem 2: 70, 74, 66          → 3 graded / 4 required
  raw 70.0 × compliance 0.75 + engagement 0         = 52.5
  Consultation component = mean(78.0, 52.5) = 65.25 → ×0.20 = 13.05 points

Presentation 1: panel mean raw 29 / 40 = 72.5%      → ×0.10 =  7.25 points
Presentation 2: panel mean raw 62 / 80 = 77.5%      → ×0.10 =  7.75 points
  Presentation component                                     = 15.00 points

CA points = 28.05 / 40 → CA_score = 70.1%
Final documentation = 65%                                    = 39.00 points
FINAL MARK = 67.05 → 67.1%
```

**Fixture B — Profile B (Legacy 2022), identical inputs**

```
CA_score = 0.30 × 72.5 + 0.70 × 77.5 = 76.0%
Consultations: 8 recorded, 10 required → GATE FAILED → flag, do not deduct
FINAL MARK = 0.40 × 76.0 + 0.60 × 65.0 = 69.4%  (flagged: consultation minimum unmet)
```

Both fixtures must pass against the same engine with only the policy profile changed. This is the primary acceptance test for §3.

### 3.8 Grade bands and progression rules

Configurable; seed `A ≥ 80, B 70–79, C 60–69, D 50–59, F < 50` and mark as **PROVISIONAL** pending confirmation of the official UNESWA scheme.

Configurable rules, all default off: documentation subminimum, CA subminimum, consultation-minimum eligibility, mandatory attendance at both presentations. A breach **flags** the result for Coordinator decision rather than auto-failing the student.

---

## 4. Assessment rubrics — transcribed from the live departmental forms

Rubrics are first-class versioned entities. A version becomes immutable once used to grade anything; edits fork a new version. Every score references the exact version used. Structure: `Rubric → Criterion (max marks) → PerformanceLevel (band, descriptor)`.

### 4.1 Presentation 1 — Chapters 1 & 2 (Proposal), maximum 40

| # | Criterion | Max |
|---|---|---|
| 1 | Background of study | 5 |
| 2 | Problem statement | 5 |
| 3 | Aim and objectives | 5 |
| 4 | Literature review | 5 |
| 5 | Identified gaps | 5 |
| 6 | Methodology | 5 |
| 7 | Implementation | 5 |
| 8 | In-text citation | 2 |
| 9 | References | 3 |
| | **Total** | **40** |

### 4.2 Presentation 2 — Chapters 3, 4 & 5 (Final), maximum 80

| # | Criterion | Max |
|---|---|---|
| 1 | Introduction | 5 |
| 2 | Problem statement | 5 |
| 3 | Aim and objectives | 5 |
| 4 | Methodology | 15 |
| 5 | Implementation | 25 |
| 6 | Results interpretation | 10 |
| 7 | Conclusion | 5 |
| 8 | Presentation skills | 5 |
| 9 | References | 5 |
| | **Total** | **80** |

These criteria and maxima are transcribed verbatim from the 2024/2025 forms and **must not be altered** by the agent. Marks are entered per criterion as integers within `0..max`, validated server-side. The system computes the total; the assessor never types a total.

The paper forms carry no performance-level descriptors — assessors apply professional judgement per criterion. Add an **optional, per-criterion descriptor set** (Excellent / Good / Satisfactory / Marginal / Unsatisfactory, with editable band descriptors) that is **off by default**. Enabling it is a departmental decision, not the agent's. When off, the grading UI shows criterion, maximum and a numeric entry field only — matching the paper form the assessors already know.

### 4.3 Consultation rubric (per appointment) — PROVISIONAL

No consultation rubric exists in the supplied materials; the current practice is a signed attendance register with no mark. This rubric is required only under Profile A and must be confirmed by the department before use.

| # | Criterion | Max |
|---|---|---|
| 1 | Preparation and readiness of the agreed deliverable | 30 |
| 2 | Progress since the previous consultation | 30 |
| 3 | Understanding, initiative and ability to defend the work | 20 |
| 4 | Professionalism: punctuality, communication, record-keeping | 20 |
| | **Total** | **100** |

Supervisors use this weekly, so it must be fast: inline on the appointment record, keyboard-navigable, with one-click carry-forward of action items from the previous session.

---

## 5. Project lifecycle

Data-driven state machine. Transitions are role-gated, validated against entry conditions, and every transition writes an audit entry (actor, timestamp, from-state, to-state, note).

```
REGISTERED
  → TOPIC_SELECTED            (student selects/ranks, or supervisor invites, or student proposes own)
  → AGREEMENT_SIGNED          (§8 — topic agreement executed by student(s) + supervisor)
  → PROPOSAL_DEVELOPMENT      (consultations begin; Chapters 1–2 drafted)
  → ETHICS_SUBMITTED ⇄ ETHICS_NOT_REQUIRED
  → ETHICS_APPROVED
  → P1_NOMINATED              (supervisor nominates; coordinator schedules)
  → P1_PRESENTED              (panel grading complete)
  → IMPLEMENTATION            (Chapters 3–5)
  → P2_NOMINATED
  → P2_PRESENTED
  → DOCUMENTATION_SUBMITTED
  → SUPERVISOR_MARKED
  → MODERATED
  → GRADED                    (final mark computed)
  → PUBLISHED                 (released to student)
  → ARCHIVED
```

`ETHICS_*` states are skippable via `ETHICS_NOT_REQUIRED`, recorded with the supervisor's justification, since the guidelines note that not all projects require clearance. Where clearance *is* required, the approval letter is a mandatory deliverable before `IMPLEMENTATION` — configurable as a hard block or a warning.

Exception states reachable from most points: `WITHDRAWN`, `DEFERRED`, `SUPERVISOR_REASSIGNED`, `ON_HOLD`. Reassignment preserves all prior consultations, grades and deliverables; never orphan or delete them.

Coordinators may configure which transitions require approval and may add departmental states without code changes.

---

## 6. Presentation scheduling and cohort grading

This section is new in v2 and reflects how the department actually works. Build it to match, not to an idealised model.

### 6.1 Nomination and scheduling

Per the guidelines, the supervisor submits to the coordinators a list of their students cleared to present. Implement:

1. Supervisor reviews their supervisees and nominates those ready for P1 or P2, with a per-student readiness note. Non-nomination requires a reason.
2. Configurable pre-conditions on nomination (consultation minimum met, required deliverables uploaded, ethics resolved) — surfaced as warnings or hard blocks per configuration.
3. Coordinator compiles nominations into a **presentation schedule**: sessions, date, venue, and an ordered student list. The live forms group students by session serial number with two students per session; support arbitrary group size per session, defaulting to 2.
4. Publication of the schedule notifies students, supervisors and all departmental assessors, and generates the assessor-facing grading sheets.

### 6.2 Cohort grid grading

The paper form is a **single sheet per assessor covering the entire cohort** — one row per student, one column per criterion, signed once at the bottom. Assessors grade dozens of students in one sitting. A one-student-per-page UI would be a regression and will be rejected.

Build a **grid grading view**:

- Rows are students (S/No, Student ID, Surname, Name, Programme), grouped by session in schedule order — the same ordering as the paper form.
- Columns are the rubric criteria with their maxima in the header, plus a computed, read-only total.
- Fully keyboard-operable: Tab/Enter advance, arrow keys navigate, entry validated against each criterion maximum on the spot.
- **Autosave per cell** with explicit per-row save state. Assessors work on unreliable connections; drafts persist locally and reconcile on reconnect. Never lose entered marks to a dropped connection.
- Rows are filterable by session and programme, and an assessor may legitimately leave rows blank (absent for that session) — blanks are excluded from aggregation, never treated as zero.
- Submission is an explicit, per-assessor act equivalent to signing the form: it locks that assessor's scores, captures name, timestamp and an attestation, and requires Coordinator unlock to reopen.
- Export any submitted sheet as a PDF that reproduces the departmental form layout, including the assessor name and signature block, for physical filing.

### 6.3 Assessor visibility

An assessor sees their own entered scores only — never the panel mean, never other assessors' marks, until the presentation is closed. This protects against anchoring. The Coordinator sees everything, including the per-assessor spread and discrepancy flags.

---

## 7. Consultations, register and deliverables

### 7.1 Consultation flow

Supervisor publishes availability (recurring weekly plus ad-hoc) → student books an open slot → confirmation → meeting → supervisor records the outcome.

Statuses: `REQUESTED`, `CONFIRMED`, `RESCHEDULED`, `COMPLETED`, `NO_SHOW_STUDENT`, `NO_SHOW_SUPERVISOR`, `CANCELLED`.

A consultation record carries: date/time, mode (in person / online, with meeting link), agenda, attached deliverables, grade (Profile A), supervisor notes, agreed action items with due dates, and the deliverable target for the next session.

### 7.2 The digital register — dual attestation

The guidelines require students to sign a consultation register, or for sufficient evidence of consultation to exist. This is an evidential requirement and the system replaces the paper register, so it must be at least as strong:

- Both parties attest attendance: supervisor marks the session complete; student confirms. Configurable whether student confirmation is required for the session to count.
- Each attestation records identity, timestamp, IP and, for in-person sessions, an optional supervisor-generated short-lived session code entered by the student.
- Attestations are append-only and cannot be edited after the fact — a correction creates a superseding record with a reason.
- Generate a **Consultation Register report** per student and per supervisor, exportable as PDF, reproducing what the paper register evidenced: date, topic discussed, deliverable reviewed, both attestations. This is the artefact produced in a dispute or audit.

Rules: no double-booking; configurable minimum notice for booking and cancellation (default 24h); grading only on `COMPLETED` sessions by the supervisor of record; configurable grading window after the meeting (default 7 days) after which Coordinator unlock is required.

Calendar views per role (month/week/agenda), iCal feed export, optional Google Calendar sync. Store timestamps in UTC; render in the institution's configured timezone.

### 7.3 Deliverables

Uploadable ahead of, or attached during, an appointment. Versioned — new uploads create a new version, never overwrite; full history visible to student, supervisor, moderator and examiner. Configurable allowed types and size limits; virus scanning; content-type verification (never trust the extension); storage outside the web root behind signed, expiring, permission-checked URLs.

Deliverable types are configurable and map to lifecycle stages: proposal, Chapter 1–2 draft, ethics application, ethics approval letter, Chapter 3–5 draft, artefact/source code, presentation slides, final documentation.

**Optional formatting compliance check** on `.docx` final documentation, reporting rather than blocking: font (Times New Roman), size (12pt), line spacing (1.5), presence of the required front matter (cover page, declaration, acknowledgements, list of tables, list of figures, abstract, table of contents), chapter title alignment. Surface results as a checklist to student and supervisor. These parameters are configuration, not constants.

Plagiarism/similarity checking sits behind an adapter interface — build the interface, leave the provider pluggable.

---

## 8. Topics, allocation and the agreement form

- Supervisors publish topics by form entry or bulk upload (CSV/XLSX): title, description, prerequisite skills, expected deliverables, capacity, research area tags, and whether the topic suits an individual or a group.
- **Per-supervisor supervision capacity** is enforced globally across all their topics, not per topic.
- Students browse and filter and submit ranked preferences (default 3, configurable). Students may also propose their own topic, routed to a supervisor for acceptance — the guidelines explicitly permit students to identify their own mentor.
- Allocation modes selectable by the Coordinator: `FIRST_COME_FIRST_SERVED`, `SUPERVISOR_APPROVAL`, `COORDINATOR_MATCHING` (deterministic, auditable preference matching under capacity constraints, surfacing unmatched students for manual placement).
- Coordinator override is always available and always records a reason.

### 8.1 Topic and Supervision Agreement

Digitise the *CSC400/CSC402/CSC499 Research Topic and Supervision Agreement Form (2025)*. On allocation, the system generates the agreement containing the proposed research topic, the allocated supervisor, and a signature block **per student** — the paper form provides two student slots, confirming group projects; support 1..N students, default maximum 2, configurable.

Execution: each student signs electronically, then the supervisor countersigns, then the Coordinator acknowledges. The lifecycle advances to `AGREEMENT_SIGNED` only when all parties have signed. Store the executed agreement as an immutable PDF reproducing the departmental layout, with signature identities, timestamps and a verification hash.

Per the form's own wording, **any change to the agreement requires approval from both the allocated supervisor and the programme coordinator.** Implement topic or supervisor changes as an amendment workflow with dual approval, producing a new version of the agreement and retaining the original.

---

## 9. Group projects

Confirmed by both the guidelines and the two-student agreement form. Not optional, and it affects the schema — design for it from the start.

- A project may have 1..N student members (default cap 2, configurable).
- Shared artefacts (proposal, documentation, artefact) belong to the project; consultations, contribution statements and marks belong to the **student**.
- Per the guidelines, each member must clearly outline their individual contribution. Implement a **contribution statement** per member, required before `DOCUMENTATION_SUBMITTED`, visible to supervisor, moderator and examiner.
- Marks default to shared for group-assessed components but must be individually adjustable with a mandatory recorded justification. Consultation marks are always individual.
- Presentation grading is per student — the live forms list students individually even where they share a session.
- A member may withdraw without collapsing the project; the remaining members' marks and history are preserved intact.

---

## 10. Dashboards and reporting

- **Student:** project state, next consultation, consultation count against the requirement, deliverable and ethics status, outstanding action items, released marks with criterion-level feedback. Never show unpublished marks.
- **Supervisor:** supervisee list with risk flags (below consultation minimum, no contact in N weeks, overdue action items, stalled lifecycle, ethics pending), grading queue, nomination queue, documentation marking queue.
- **Coordinator:** cohort progress, allocation status and unmatched students, supervision load distribution, presentation schedule and assessor completion rate, moderation queue, missing marks before publication, mark distribution and outlier detection.
- **Exports:** per-student mark sheet (PDF), cohort mark schedule (XLSX/CSV) in departmental submission format, per-assessor presentation form (PDF, matching the paper layout), consultation register (PDF), executed topic agreements (PDF).

---

## 11. Non-functional requirements

- **Auditability:** append-only log for every mark entry, mark change, state transition, attestation, permission change, allocation override and file access — actor, timestamp, IP, before/after values. No user, including the administrator, may delete audit entries.
- **Authorisation:** deny-by-default RBAC enforced server-side. A supervisor sees only their supervisees; a departmental assessor sees only the presentation cohort they are assigned to grade, and only their own scores within it.
- **Data integrity:** database-level constraints and transactional writes for all mark operations. Soft-delete only. No orphaned records.
- **Multi-cycle:** all data scoped to an academic cycle; configuration versioned per cycle so historical marks always recompute against the configuration in force when awarded.
- **Availability and bandwidth:** must work on intermittent, low-bandwidth connections. Optimise payloads, support resumable uploads, and make the grid grading view resilient to connection loss with local draft persistence and explicit save state.
- **Accessibility:** WCAG 2.1 AA.
- **Notifications:** in-app plus email via a provider-agnostic adapter. Triggers: booking/confirmation/reminder, grade released, deliverable due, schedule published, nomination outcome, ethics status change, low-consultation warning, moderation required.
- **Security:** argon2id hashing, session rotation, CSRF protection, authentication rate limiting, account lockout, parameterised queries throughout.
- **Local authentication only:** username and password held in this system's own database. No OAuth, Google/Microsoft sign-in, institutional SSO, LDAP or third-party identity provider — no external service participates in verifying a user. Account approval is a human act by a Coordinator or Administrator. MFA for Coordinator and Administrator is offline TOTP (RFC 6238) with locally generated secrets and recovery codes; no SMS or push gateway. Virus scanning runs locally (ClamAV in the compose stack). Similarity checking remains an unimplemented adapter, disabled by default. Email uses configurable SMTP, institutional mail by default. Every core flow — login, booking, grading, marking, computation, publication — must work on an isolated network with no outbound internet access. Keep integrations behind adapter interfaces so identity federation can be added later as a decision, not a rewrite.
- **Usability vs security:** every usability optimisation touching authentication, mark entry or file access must be individually justified in the design notes as not weakening the security posture.

---

## 12. Delivery phases

1. **Foundations** — schema, auth, RBAC (multi-role), audit log, setup wizard, Docker stack.
2. **Assessment engine** — policy profiles, normalisation, scoring policies, rubric engine, computation and snapshotting. Test-first; both §3.7 fixtures green before any UI. *Blocking gate for phase 5.*
3. **Topics, allocation, agreement** — catalogue, preferences, allocation modes, capacity, agreement generation and e-signature.
4. **Consultations** — calendar, booking, dual attestation, register export, deliverables, grading.
5. **Presentations** — nomination, scheduling, cohort grid grading, panel aggregation, moderation.
6. **Documentation and results** — documentation rubric, supervisor marking, moderation, final computation, publication, exports, dashboards.
7. **Hardening** — notifications, accessibility, formatting compliance checker, load and penetration testing, deployment documentation.

---

## 13. Acceptance criteria

- Fixtures A and B in §3.7 both compute exactly as stated, from the same engine, with only the policy profile changed.
- Presentation 1 (max 40) and Presentation 2 (max 80) normalise correctly; no code path consumes a raw total without its recorded maximum.
- A configuration whose CA sub-components do not sum to `CA_weight` is rejected with a field-level error.
- A student with 2 of 4 required consultations is proportionally scaled; one with 6 receives a capped bonus; under Profile B, neither is marked but both are gated.
- An assessor leaving a student's row blank does not depress that student's mean.
- A panel of 2 where the minimum is 3 blocks computation and appears in the Coordinator queue.
- Assessors cannot see the panel mean or other assessors' scores before the presentation closes — verified at the API layer, not just the UI.
- A supervisor cannot view, book against or grade a student they do not supervise — verified at the API layer.
- A published mark cannot be edited; a correction creates a superseding snapshot with a reason, and both remain retrievable.
- Reassigning a supervisor preserves all prior consultations, grades and deliverables.
- Editing a rubric that has been used forks a new version and leaves historical scores untouched.
- A group project of two students produces two independently adjustable mark records, two contribution statements and one shared documentation artefact.
- The consultation register export for any student reconstructs every session with both attestations.
- The full audit trail for any single student's final mark is reconstructable from raw criterion entries to published result.

---

## 14. Open decisions — policy, not engineering

These are conflicts between the department's 2022 guidelines and the incoming model. **They are departmental policy decisions and the agent must not resolve them unilaterally.** Implement both sides as configuration, seed Profile A as default, and surface the conflicts in the setup wizard for the Coordinator to decide.

1. **Consultation count.** Guidelines require 10 per project; the new model requires 4 per semester. Which stands, and is it per semester or per project?
2. **CA composition.** Guidelines allocate 100% of CA to presentations (30/70); the new model splits CA 50/50 between consultations and presentations, with presentations equal at 10 points each. This is a substantive change to a published assessment scheme and needs departmental approval before the system enforces it.
3. **Presentation parity.** Guidelines weight P2 more than twice P1 (70/30), reflecting that P2 covers three chapters and carries an 80-mark rubric against P1's 40. The new model weights them equally. Confirm which is intended.
4. **Consultation rubric.** §4.3 is invented, since current practice records attendance only. The department must approve a rubric before consultation marks can be defended.
5. **Final documentation rubric.** The supervisor marking guide referenced in the guidelines was not supplied. Required before phase 6.
6. **Official grade bands** and any subminimum or progression rules.
7. **Second assessor assignment rule** for documentation moderation — coordinator-assigned, rotational, or by research area.

Do not guess on items 1–5. Proceed with the seeded defaults clearly marked **PROVISIONAL** in both the data and the UI, and raise them in the delivery notes.

---

## 15. Out of scope

Timetabling beyond project consultations and presentation sessions; fee management; general LMS functionality; institution-wide identity management beyond login; postgraduate supervision workflows.
