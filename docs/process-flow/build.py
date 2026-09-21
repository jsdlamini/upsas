"""
Builds docs/process-flow/upsas-process-flow.pdf.

    python3 docs/process-flow/build.py [output.pdf]

Everything in the document — prose, tables, every diagram — comes from this
file, so the handbook is regenerated rather than maintained. The diagrams use
the application's own section hues, so a reader who has seen the screens
recognises the colour of the part they are reading about.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from diagram import (  # noqa: E402
    Diagram, ARCHIVE, AZURE, HARBOUR, INDIGO, INK, MOSS, MUTED, OCHRE, PLUM,
    RUST, TEAL, tint,
)

FIGURES: list[str] = []


def figure(svg: str, caption: str) -> str:
    FIGURES.append(caption)
    number = len(FIGURES)
    return (
        f'<figure class="fig">{svg}'
        f'<figcaption><b>Figure {number}.</b> {caption}</figcaption></figure>'
    )


# ═══════════════════════════════════════════════════════════ 1. system map

def fig_system_map() -> str:
    d = Diagram(960, 430)
    d.caption(0, 16, "PEOPLE", MUTED, 11.5, 700)
    actors = [
        ("Student", "books, ranks, attests, reads own result", HARBOUR),
        ("Supervisor", "publishes topics, grades consultations, marks", MOSS),
        ("Assessor", "marks a session list", AZURE),
        ("Moderator", "resolves a disputed panel", PLUM),
        ("Coordinator", "allocates, schedules, releases, configures", ARCHIVE),
        ("External examiner", "reads an assigned cohort", MUTED),
    ]
    x = 0
    for name, role, hue in actors:
        d.box(x, 28, 150, 62, name, role, hue)
        x += 162

    d.caption(0, 136, "WHAT THEY WORK ON", MUTED, 11.5, 700)
    modules = [
        ("Topics", "pool, proposals,\nranking", INDIGO, 0),
        ("Consultations", "slots, register,\ndual attestation", MOSS, 162),
        ("Presentations", "session lists,\nmarking sheets", AZURE, 324),
        ("Documentation", "supervisor mark,\nmoderation", PLUM, 486),
        ("Results", "snapshot, release,\nmark sheet", ARCHIVE, 648),
        ("Reports", "catalogue, CSV,\nmanifest", MUTED, 810),
    ]
    for name, sub, hue, mx in modules:
        d.box(mx, 148, 150, 74, name, sub, hue)
        d.arrow((mx + 75, 90), (mx + 75, 148), hue=tint(hue, 0.5))

    d.caption(0, 262, "WHAT HOLDS IT TOGETHER", MUTED, 11.5, 700)
    core = [
        ("Assessment engine", "normalisation, panel aggregation, weighting,\nprofiles A and B", AZURE, 0, 300),
        ("Assessment forms", "versioned rubrics; a used form forks\nrather than being rewritten", OCHRE, 320, 300),
        ("Access control", "deny by default, cycle-scoped grants,\nseparation of duty", RUST, 640, 320),
    ]
    for name, sub, hue, cx, cw in core:
        d.box(cx, 274, cw, 76, name, sub, hue)

    d.box(0, 366, 960, 50, "Audit chain and the working store",
          "every decision recorded; snapshots are stored, never recomputed", INK)
    for cx in (160, 480, 800):
        d.arrow((cx, 350), (cx, 366), hue="#B8C2CF")
    return figure(d.svg(), "The parts of the system, and who touches which of them.")


# ═════════════════════════════════════════════════════ 2. separation of duty

def fig_separation() -> str:
    d = Diagram(960, 290)
    d.caption(0, 16, "ONE LECTURER, SEVERAL HATS", MUTED, 11.5, 700)
    d.box(0, 30, 200, 70, "Dr Mahlalela", "supervises, assesses,\nmoderates and coordinates", INK)

    rows = [
        ("Supervises Nomcebo", MOSS, 30, "allowed"),
        ("Assesses Nomcebo in P2", AZURE, 110, "allowed"),
        ("Moderates her own P2 mark", RUST, 190, "refused"),
    ]
    for label, hue, y, verdict in rows:
        d.box(250, y, 300, 58, label, None, hue)
        d.arrow((200, 65), (250, y + 29), hue=tint(hue, 0.55), elbow="hv")
        if verdict == "allowed":
            d.pill(660, y + 29, "allowed", MOSS)
        else:
            d.pill(660, y + 29, "refused by policy", RUST)
        d.arrow((550, y + 29), (612, y + 29), hue=tint(hue, 0.55))

    d.note(760, 176, 200,
           "Holding several roles unions their permissions and nothing more. "
           "Separation of duty is then checked per action, against the person "
           "who produced the mark.", RUST)
    return figure(d.svg(),
                  "Roles accumulate; authority over your own work does not. "
                  "The same check governs unlocking a sheet and releasing a result.")


# ══════════════════════════════════════════════════════════ 3. the cycle

def fig_cycle() -> str:
    d = Diagram(980, 560)
    lanes = [("Student", HARBOUR, 34), ("Supervisor", MOSS, 156),
             ("Assessor / panel", AZURE, 278), ("Coordinator", ARCHIVE, 400)]
    for label, hue, y in lanes:
        d.lane(y, 106, label, hue)

    d.caption(190, 20, "SEMESTER 1", MUTED, 11, 700)
    d.caption(520, 20, "SEMESTER 2", MUTED, 11, 700)
    d.caption(830, 20, "END OF CYCLE", MUTED, 11, 700)

    ranks = d.box(160, 52, 140, 72, "Rank three topics", "or propose one", HARBOUR)
    book = d.box(350, 52, 140, 72, "Book sessions", "24 hours' notice,\none a day", HARBOUR)
    attest = d.box(540, 52, 140, 72, "Attest sessions", "a session counts\nonly when both do", HARBOUR)
    result = d.box(820, 52, 140, 72, "Read the result", "once released", HARBOUR)

    publish = d.box(160, 174, 140, 72, "Publish topics", "and accept\nproposals", MOSS)
    supervise = d.box(350, 174, 140, 72, "Hold and grade\nconsultations", None, MOSS)
    nominate = d.box(540, 174, 140, 72, "Nominate for\npresentation", "and mark the\ndocumentation", MOSS)

    p1 = d.box(350, 296, 140, 72, "Presentation 1", "out of 40", AZURE)
    p2 = d.box(540, 296, 140, 72, "Presentation 2", "out of 80", AZURE)
    sign = d.box(720, 296, 120, 72, "Submit sheet", "signs and locks\nevery row", AZURE)

    allocate = d.box(160, 418, 140, 72, "Allocate topics", "not yet automated", ARCHIVE)
    schedule = d.box(350, 418, 140, 72, "Schedule sessions", "and the panel", ARCHIVE)
    moderate = d.box(540, 418, 140, 72, "Moderate", "where the spread\nexceeds 15 points", ARCHIVE)
    release = d.box(820, 418, 140, 72, "Release results", "never your own mark", ARCHIVE)

    grey = "#9AA7B6"
    d.arrow(ranks, allocate, hue=grey, elbow="hvh", via=322, label="preferences")
    d.arrow(allocate, publish, hue=grey, label="agreement")
    d.arrow(book, supervise, hue=grey)
    d.arrow(supervise, attest, hue=grey, elbow="hvh", via=512)
    d.arrow(schedule, p1, hue=grey)
    d.arrow(p1, p2, hue=grey)
    d.arrow(p2, sign, hue=grey)
    d.arrow(nominate, p2, hue=grey)
    d.arrow(sign, moderate, hue=grey, elbow="vh")
    d.arrow(moderate, release, hue=grey)
    d.arrow(release, result, hue=grey)

    d.caption(0, 538, "Consultations run the whole year. Everything else happens once.", MUTED, 11)
    return figure(d.svg(), "One cycle, by who is acting. The horizontal axis is time, roughly.")


# ═══════════════════════════════════════════════════════ 4. getting in

def fig_account() -> str:
    d = Diagram(980, 500)
    d.caption(0, 16, "GETTING AN ACCOUNT", MUTED, 11.5, 700)
    reg = d.box(0, 32, 190, 66, "Register", "student number or\nstaff username", HARBOUR)
    pending = d.box(240, 32, 190, 66, "Awaiting approval", "staff only", OCHRE)
    approve = d.box(480, 32, 200, 66, "Coordinator approves", "and assigns roles", ARCHIVE)
    active = d.box(730, 32, 190, 66, "Active account", "roles are cycle-scoped", MOSS)
    grey = "#9AA7B6"
    d.arrow(reg, pending, hue=grey)
    d.arrow(pending, approve, hue=grey)
    d.arrow(approve, active, hue=grey)
    d.caption(0, 120, "A student account is active at once. Only staff wait for approval.", MUTED, 10.8)

    d.caption(0, 168, "SIGNING IN — THE ORDER IS THE POINT", MUTED, 11.5, 700)
    steps = [
        ("Locked out?", "checked before the password,\nso a lock is not a password oracle", RUST, 0),
        ("Password correct?", "unknown user and wrong password\nreturn the same answer", AZURE, 245),
        ("Account status", "checked only after the password,\nso nothing leaks to a stranger", ARCHIVE, 490),
        ("Second factor", "required of coordinators\nand administrators", PLUM, 735),
    ]
    previous = None
    for title, sub, hue, x in steps:
        node = d.box(x, 184, 215, 82, title, sub, hue)
        if previous:
            d.arrow(previous, node, hue=grey)
        previous = node
    done = d.pill(847, 302, "signed in", MOSS)
    d.arrow(previous, done, hue=MOSS)

    d.caption(0, 366, "WHEN SOMEONE CANNOT GET IN", MUTED, 11.5, 700)
    ask = d.box(0, 386, 160, 76, "Person asks the\ncoordinator", None, HARBOUR)
    verify = d.gate(255, 424, 150, 86, "Satisfied who they are?", RUST)
    issue = d.box(370, 386, 170, 76, "Issue a code", "nine characters,\nshown once", ARCHIVE)
    redeem = d.box(590, 386, 170, 76, "They set their\nown password", "at /recover", MOSS)
    out = d.box(810, 386, 170, 76, "All sessions end", "a reset assumes\ntheft", RUST)
    d.arrow(ask, verify, hue=grey)
    d.arrow(verify, issue, hue=MOSS, label="yes")
    d.arrow(issue, redeem, hue=grey)
    d.arrow(redeem, out, hue=grey)
    d.caption(178, 486, "no — nothing is issued. This step is a procedure, not code.", RUST, 10.8)
    return figure(d.svg(),
                  "Account lifecycle and recovery. The coordinator never learns the password; "
                  "the code expires in thirty minutes and works once.")


# ═══════════════════════════════════════════════════════ 5. topics

def fig_topics() -> str:
    d = Diagram(980, 380)
    grey = "#9AA7B6"
    d.caption(0, 16, "SUPERVISOR", MOSS, 11.5, 700)
    pub = d.box(0, 30, 190, 78, "Publish topics", "singly or pasted\nas a list", MOSS)
    accept = d.box(560, 30, 190, 78, "Accept a proposal", "or decline it", MOSS)
    cap = d.gate(390, 69, 150, 84, "At capacity?", OCHRE)

    d.caption(0, 156, "STUDENT", HARBOUR, 11.5, 700)
    pool = d.box(0, 170, 190, 78, "Browse the pool", "filter by supervisor\nand tag", HARBOUR)
    rank = d.box(240, 170, 190, 78, "Rank three", "duplicates refused", HARBOUR)
    propose = d.box(480, 170, 190, 78, "Propose your own", "to a named supervisor", HARBOUR)

    alloc = d.box(790, 96, 190, 86, "Allocation", "a coordinator still\ndoes this by hand", RUST)

    d.arrow(pub, pool, hue=grey)
    d.arrow(propose, cap, hue=grey, elbow="vh")
    d.arrow(cap, accept, hue=MOSS, label="no")
    d.arrow(accept, alloc, hue=grey)
    d.arrow(rank, alloc, hue=grey, elbow="hvh", via=730)
    d.caption(316, 150, "yes — refused, with a reason", RUST, 10.8)

    d.note(0, 286, 760,
           "Ranking is not allocation, and the screen says so in as many words. Until the "
           "allocation run exists, a student's preferences are evidence for a decision that a "
           "person still makes.", RUST)
    return figure(d.svg(), "From a topic pool to an allocated project.")


# ═══════════════════════════════════════════════════ 6. consultations

def fig_consultations() -> str:
    d = Diagram(980, 450)
    grey = "#9AA7B6"
    row = [
        ("Supervisor opens\na slot", None, MOSS),
        ("Student books it", "own supervisor only", HARBOUR),
        ("Session held", None, INK),
        ("Supervisor grades\nand attests", "out of 100", MOSS),
        ("Student attests", "their own, nobody\nelse's", HARBOUR),
    ]
    previous = None
    for i, (title, sub, hue) in enumerate(row):
        node = d.box(i * 200, 34, 170, 76, title, sub, hue)
        if previous:
            d.arrow(previous, node, hue=grey)
        previous = node

    d.caption(0, 156, "BOOKING RULES, ENFORCED BY THE SERVER", MUTED, 11.5, 700)
    x = 0
    for rule in ("24 hours' notice", "one session a day", "your own supervisor",
                 "a taken slot is refused, never double-booked"):
        w = len(rule) * 6.6 + 30
        d.pill(x + w / 2, 188, rule, TEAL)
        x += w + 16

    counted = d.gate(150, 290, 230, 88, "Both attested?", OCHRE)
    yes = d.box(420, 254, 190, 66, "Counts toward the\nminimum", None, MOSS)
    no = d.box(420, 338, 190, 66, "Shown, but does\nnot count", "a no-show is visible", RUST)
    comp = d.box(700, 254, 280, 66, "Consultation component",
                 "graded average, scaled where the\nminimum per period is unmet", AZURE)
    d.arrow(counted, yes, hue=MOSS, label="yes")
    d.arrow(counted, no, hue=RUST, label="no", label_side="below")
    d.arrow(yes, comp, hue=grey)
    d.note(700, 340, 280,
           "Four graded sessions per semester under Profile A. Under Profile B the same "
           "sessions act purely as a gate and carry no marks.", MOSS)
    return figure(d.svg(),
                  "A consultation is a claim by two people. One attestation is a note; "
                  "two make a record.")


# ═════════════════════════════════════════════════ 7. presentation marking

def fig_marking() -> str:
    d = Diagram(980, 530)
    grey = "#9AA7B6"
    row = [
        ("Coordinator schedules", "sessions and panel", ARCHIVE, 0, 185),
        ("Assessor opens\ntheir session list", "one sheet, whole cohort", AZURE, 210, 185),
        ("Enter marks", "totals are computed,\nnever typed", AZURE, 420, 175),
        ("Save", "re-checks authority\nper student", AZURE, 620, 160),
        ("Submit", "signs and locks", PLUM, 810, 170),
    ]
    previous = None
    for title, sub, hue, x, w in row:
        node = d.box(x, 34, w, 76, title, sub, hue)
        if previous:
            d.arrow(previous, node, hue=grey)
        previous = node

    d.caption(0, 156, "WHAT THE SERVER REFUSES ON SAVE", MUTED, 11.5, 700)
    for i, label in enumerate(("A student not on your list",
                               "A mark above the criterion maximum",
                               "Any change to a submitted sheet")):
        d.box(i * 330, 172, 310, 48, label, None, RUST)

    d.caption(0, 262, "WHAT HAPPENS TO A BLANK ROW", MUTED, 11.5, 700)
    blank = d.box(0, 280, 220, 80, "Row left blank", "the assessor was absent\nfor that session", INK)
    wrong = d.box(300, 280, 230, 80, "Not scored zero", "a zero would destroy\nthe student's mark", RUST)
    right = d.box(300, 386, 230, 80, "Excluded from the mean",
                  "and shown as excluded\non the breakdown", MOSS)
    d.arrow(blank, wrong, hue=RUST, label="never")
    d.arrow(blank, right, hue=MOSS, label="instead", elbow="vh", label_side="below")

    d.caption(620, 262, "THE PANEL", MUTED, 11.5, 700)
    panel = d.gate(800, 316, 300, 84, "Assessor spread over 15 points?", OCHRE)
    mod = d.box(620, 400, 170, 66, "Moderation", "a sentence, by name", PLUM)
    mean = d.box(820, 400, 160, 66, "Panel mean", "each score against\nits own maximum", MOSS)
    d.arrow(panel, mod, hue=PLUM, label="yes", elbow="vh")
    d.arrow(panel, mean, hue=MOSS, label="no", elbow="vh", label_side="below")
    return figure(d.svg(),
                  "Marking a presentation. The three refusals and the blank-row rule are the "
                  "parts that protect a mark.")


# ══════════════════════════════════════════════════ 8. computing the mark

def fig_compute() -> str:
    d = Diagram(960, 480)
    d.caption(0, 16, "INPUTS", MUTED, 11.5, 700)
    inputs = [
        ("Consultations", "graded sessions,\nper period", MOSS, 0),
        ("Presentation 1", "raw total out of its\nform's maximum", AZURE, 200),
        ("Presentation 2", "raw total out of its\nform's maximum", AZURE, 400),
        ("Documentation", "supervisor mark,\nmoderated if disputed", PLUM, 600),
    ]
    for name, sub, hue, x in inputs:
        d.box(x, 30, 180, 74, name, sub, hue)

    norm = d.box(0, 148, 780, 58, "Normalise: every raw total becomes a percentage against the maximum in force when it was awarded",
                 None, INK, solid=True)
    for x in (90, 290, 490, 690):
        d.arrow((x, 104), (x, 148), hue="#9AA7B6")

    d.note(800, 140, 160, "29 out of 40 and 58 out of 80 are the same performance. "
                          "Averaging raw totals is a defect with a test against it.", AZURE)

    weight = d.box(0, 240, 780, 58, "Weight each component by the policy profile in force", None, ARCHIVE)
    d.arrow((390, 206), (390, 240), hue="#9AA7B6")

    d.caption(0, 328, "TWO PROFILES, ONE ENGINE", MUTED, 11.5, 700)
    d.box(0, 352, 370, 74, "Profile A — 2022 guidelines", "consultations weighted;\nsame inputs give 67.1", ARCHIVE)
    d.box(410, 352, 370, 74, "Profile B — incoming policy", "consultations as a gate;\nsame inputs give 69.4", ARCHIVE)
    d.arrow((190, 298), (185, 352), hue="#9AA7B6")
    d.arrow((590, 298), (595, 352), hue="#9AA7B6")
    d.note(800, 344, 160, "Neither is hardcoded and the system does not pick a winner. "
                          "Which profile applies is a departmental decision.", OCHRE)
    return figure(d.svg(),
                  "The mark pipeline. Normalisation happens once, in one function, and "
                  "everything downstream consumes percentages.")


# ══════════════════════════════════════════════════════ 9. release

def fig_release() -> str:
    d = Diagram(980, 400)
    grey = "#9AA7B6"
    snap = d.box(0, 60, 180, 80, "Snapshot computed", "inputs, policy and\nform versions frozen", AZURE)
    blocked = d.gate(330, 100, 210, 88, "Any blocking flag?", OCHRE)
    sod = d.gate(690, 100, 250, 88, "Did you produce this mark?", RUST)
    hold = d.box(230, 250, 210, 74, "Cannot be released",
                 "moderation, missing documentation,\nconsultation gate unmet", RUST)
    refuse = d.box(500, 250, 230, 74, "Refused", "someone who did not mark it\nreleases it", RUST)
    rel = d.box(790, 250, 190, 74, "Released", "the student sees it\nfrom here", MOSS)

    d.arrow(snap, blocked, hue=grey)
    d.arrow(blocked, hold, hue=RUST, label="yes")
    d.arrow(blocked, sod, hue=MOSS, label="no")
    d.arrow(sod, refuse, hue=RUST, label="yes")
    d.arrow(sod, rel, hue=MOSS, label="no")

    d.note(0, 250, 190,
           "A released mark is never edited. A correction supersedes it, carrying its own "
           "reason and leaving the earlier figure legible.", ARCHIVE)
    d.caption(0, 384, "Reports read the stored snapshot. Nothing recomputes a published mark.",
              MUTED, 11)
    return figure(d.svg(), "Releasing a result. Both gates have to be passed, in this order.")


# ═════════════════════════════════════════ 10. changing the assessment form

def fig_form_change() -> str:
    d = Diagram(980, 470)
    grey = "#9AA7B6"
    edit = d.box(0, 44, 180, 80, "Coordinator edits\nthe form", "headings, marks,\norder, add, retire", OCHRE)
    valid = d.gate(330, 84, 200, 88, "Valid, and a reason given?", RUST)
    used = d.gate(710, 84, 250, 88, "Has anything been marked on it?", OCHRE)
    inplace = d.box(620, 240, 170, 76, "Edited in place", "still a draft\ninstrument", MOSS)
    fork = d.box(810, 240, 170, 76, "New version", "v1 stays with\nsigned sheets", PLUM)
    review = d.box(330, 240, 230, 76, "Nothing is saved",
                   "the form comes back with\nyour own wording in it", RUST)
    impact = d.box(330, 356, 650, 76, "Impact review, before anything is written",
                   "which marks are blanked and whose they are, which students would end up "
                   "assessed on two different forms", ARCHIVE)

    d.arrow(edit, valid, hue=grey)
    d.arrow(valid, review, hue=RUST, label="no")
    d.arrow(valid, used, hue=MOSS, label="yes")
    d.arrow(used, inplace, hue=MOSS, label="no")
    d.arrow(used, fork, hue=PLUM, label="yes")
    d.arrow(inplace, impact, hue=grey)
    d.arrow(fork, impact, hue=grey)

    d.note(0, 160, 290,
           "A criterion id is permanent: renaming a column keeps every mark already keyed to "
           "it, and a retired id is never reissued. The sheet maximum is the sum of its "
           "columns, computed on save and nowhere typed.", AZURE)
    return figure(d.svg(),
                  "Editing the columns of a marking sheet. The fork is what keeps an old mark "
                  "meaningful.")


# ══════════════════════════════════════════════ 11. enrolment state machine

def fig_enrolment() -> str:
    d = Diagram(980, 440)
    active = d.box(390, 20, 200, 68, "Active", "sits every component\nthis cycle", MOSS)
    deferred = d.box(0, 140, 220, 72, "Deferred", "not assessed; records\nkept and resumed", OCHRE)
    withdrawn = d.box(0, 250, 220, 72, "Withdrawn", "not scheduled, marked\nor published", RUST)
    supp = d.box(760, 140, 220, 72, "Supplementary", "re-sits referred\ncomponents only", AZURE)
    carry = d.box(760, 250, 220, 72, "Carrying credit", "repeats the project with\ncomponents already passed", INDIGO)

    d.arrow(active, deferred, hue=OCHRE, label="deferral recorded")
    d.arrow(deferred, withdrawn, hue=RUST, label="withdraws")
    d.arrow(active, supp, hue=AZURE, label="referred")
    d.arrow(supp, carry, hue=INDIGO, label="repeats")
    d.caption(110, 340, "returns to active in a later cycle", OCHRE, 10.8, 600, anchor="middle")

    d.note(270, 150, 440,
           "Carried credit travels as a percentage, never a raw total: last year's form may "
           "have had a different maximum. It is recorded with the cycle and the board decision "
           "that granted it, stands in for the panel, and is never re-marked.", INDIGO)

    d.caption(270, 268, "Effect on the rest of the system", INK, 12, 700)
    d.caption(270, 290, "• A deferred or withdrawn student leaves every session list.", MUTED, 11)
    d.caption(270, 310, "• Their snapshot says so, not a shelf of pending marks.", MUTED, 11)
    d.caption(270, 330, "• A released result is corrected by supersession,", MUTED, 11)
    d.caption(282, 348, "not by a status change.", MUTED, 11)
    d.caption(0, 420, "Nothing here deletes anybody. Every record a student generated is kept.", MUTED, 11)
    return figure(d.svg(), "The five enrolment states and the moves between them.")


# ═══════════════════════════════════════════════════════ 12. deadlines

def fig_deadlines() -> str:
    d = Diagram(960, 320)
    d.caption(0, 18, "ONE DEADLINE, TWO STUDENTS", MUTED, 11.5, 700)

    d.parts.append('<line x1="40" y1="120" x2="920" y2="120" stroke="#D7DEE7" stroke-width="2"/>')
    for x, label in ((190, "cohort date"), (300, "grace ends"), (640, "their date")):
        d.parts.append(f'<line x1="{x}" y1="104" x2="{x}" y2="136" stroke="#9AA7B6" stroke-width="1.5"/>')
        d.caption(x, 152, label, MUTED, 10.5, 600, anchor="middle")

    d.parts.append('<rect x="190" y="110" width="110" height="20" rx="4" fill="#F3EBD8" stroke="#8A5A12"/>')
    d.caption(245, 124, "grace", OCHRE, 10.5, 700, anchor="middle")

    d.box(40, 36, 300, 56, "Every student", "works to the cohort date", HARBOUR)
    d.box(500, 36, 300, 56, "One student with an extension", "works to theirs", TEAL)
    d.arrow((190, 92), (190, 104), hue=HARBOUR)
    d.arrow((640, 92), (640, 104), hue=TEAL)

    d.caption(0, 196, "RULES", MUTED, 11.5, 700)
    rules = [
        ("An extension only moves a date later", "to bring one forward, change it for everyone", TEAL),
        ("Grace is not a second deadline", "it absorbs the slow connection; students are not shown it", OCHRE),
        ("The grounds stay with the coordinator", "a supervisor sees that a date differs, not why", RUST),
    ]
    x = 0
    for title, sub, hue in rules:
        d.box(x, 212, 306, 76, title, sub, hue)
        x += 327
    return figure(d.svg(),
                  "Deadlines, grace and extensions. An accommodation is visible as a date and "
                  "private as a reason.")


# ═══════════════════════════════════════════════ 13. reports and provenance

def fig_reports() -> str:
    d = Diagram(980, 360)
    grey = "#9AA7B6"
    snap = d.box(0, 60, 190, 80, "Stored snapshot", "the number the student\nsaw, not a fresh sum", AZURE)
    scope = d.gate(345, 100, 210, 88, "In scope for your role?", RUST)
    gen = d.box(540, 60, 190, 80, "Generator", "deterministic, so the\nbytes are reproducible", ARCHIVE)
    csv = d.box(800, 20, 180, 66, "CSV", "pure data, no\ncomment lines", ARCHIVE)
    man = d.box(800, 110, 180, 74, "Manifest", "who, what scope, which\nsnapshots, SHA-256", MOSS)

    d.arrow(snap, scope, hue=grey)
    d.arrow(scope, gen, hue=MOSS, label="yes")
    d.arrow(gen, csv, hue=grey, elbow="hvh", via=766)
    d.arrow(gen, man, hue=grey, elbow="hvh", via=766)
    stop = d.box(250, 206, 190, 46, "The extraction does not happen", None, RUST)
    d.arrow(scope, stop, hue=RUST, label="no")

    d.note(0, 270, 460,
           "A student sees their own mark sheet, a supervisor their own supervisees, an "
           "external examiner an assigned cohort. Scope is part of the report's definition, "
           "not a filter applied afterwards.", ARCHIVE)
    d.note(500, 214, 480,
           "Provenance travels beside the file rather than inside it, because a schedule gets "
           "imported elsewhere and a comment line would break the import. A report that may "
           "not carry provisional marks refuses to be built rather than emitting one.", MOSS)
    return figure(d.svg(), "Producing a report. The snapshot is read, never recomputed.")


# ═══════════════════════════════════════════════════════════ the document

STYLE = """
@page {
  size: A4; margin: 19mm 16mm 17mm 16mm;
  @bottom-left { content: "UPSAS — Research Project Supervision and Assessment System";
                 font-family: "DejaVu Sans"; font-size: 8pt; color: #7D8896; }
  @bottom-right { content: counter(page); font-family: "DejaVu Sans";
                  font-size: 8.5pt; color: #7D8896; }
}
@page :first { margin: 0; @bottom-left { content: ""; } @bottom-right { content: ""; } }

body { font-family: "Bitstream Charter", "Charter", serif; font-size: 10.2pt;
       line-height: 1.52; color: #17202C; }
h1, h2, h3 { font-family: "Bitstream Charter", serif; color: #0F1B2D; }
h1 { font-size: 19pt; margin: 0 0 4mm; line-height: 1.2; }
h2 { font-size: 13.5pt; margin: 9mm 0 2mm; padding-bottom: 1.6mm;
     border-bottom: 1.6pt solid #2E5AC8; break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.6mm; }
.lede { color: #45505F; font-size: 10.6pt; }
a { color: #2E5AC8; }

.cover { background: linear-gradient(160deg, #0B1420 0%, #12263D 62%, #14304A 100%);
         color: #E8EDF4; height: 297mm; padding: 34mm 26mm 20mm; }
.cover .rule { width: 62mm; height: 3.4pt; border-radius: 2pt;
               background: linear-gradient(90deg, #16628C, #5B43BF 30%, #0E7480 60%, #9B3D76); }
.cover h1 { color: #FFFFFF; font-size: 30pt; margin: 12mm 0 5mm; line-height: 1.12; }
.cover .sub { color: #A9BACE; font-size: 12.5pt; max-width: 118mm; line-height: 1.5; }
.cover .meta { margin-top: 58mm; color: #8296AC; font-size: 9.6pt;
               font-family: "DejaVu Sans"; line-height: 1.8; }
.cover .inst { font-family: "DejaVu Sans"; font-size: 10pt; color: #FFFFFF;
               letter-spacing: 0.4pt; }
.cover .unit { font-family: "DejaVu Sans"; font-size: 9.4pt; color: #8296AC; margin-top: 1.5mm; }

.fig { margin: 4mm 0 6mm; break-inside: avoid; }
.fig svg { width: 100%; height: auto; }
figcaption { font-family: "DejaVu Sans"; font-size: 8.6pt; color: #5A6679;
             margin-top: 2mm; line-height: 1.45; }
figcaption b { color: #2E5AC8; }

table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm;
        font-family: "DejaVu Sans"; font-size: 8.8pt; break-inside: avoid; }
th { text-align: left; background: #EEF2F7; color: #2C3A4C; font-weight: 700;
     padding: 2mm 2.4mm; border-bottom: 1.4pt solid #A9BACE; }
td { padding: 2mm 2.4mm; border-bottom: 0.6pt solid #E3E9F0; vertical-align: top; }
tr:nth-child(even) td { background: #FAFBFD; }
code { font-family: "DejaVu Sans Mono"; font-size: 8.6pt; color: #24405E; }

.callout { border: 0.8pt solid #D7DEE7; border-left: 3pt solid #2E5AC8;
           border-radius: 2mm; padding: 3mm 4mm; margin: 3mm 0 5mm;
           background: #F7F9FC; break-inside: avoid; }
.callout.warn { border-left-color: #8A5A12; background: #FCF8F0; }
.callout.stop { border-left-color: #B23B35; background: #FCF2F1; }
.callout b { font-family: "DejaVu Sans"; font-size: 9.2pt; }
.callout p { font-size: 9.6pt; margin: 1.5mm 0 0; }

.toc { font-family: "DejaVu Sans"; font-size: 9.6pt; }
.toc li { margin-bottom: 1.8mm; }
.toc b { color: #0F1B2D; }
.toc span { color: #5A6679; }
.break { break-before: page; }
"""


def contents() -> str:
    items = [
        ("The system at a glance", "what it is for, and who touches which part"),
        ("Who does what", "roles, permissions, and why one person holding several is the hard case"),
        ("A cycle end to end", "the whole year on one page"),
        ("Getting an account, and getting back in", "registration, the order of the sign-in gates, recovery"),
        ("Topics to allocation", "publication, proposals, ranking, and the step still done by hand"),
        ("Consultations", "booking rules, dual attestation, and what a session is worth"),
        ("Marking a presentation", "the session list, what the server refuses, and the blank row"),
        ("How a mark is computed", "normalisation, weighting, and the two policy profiles"),
        ("Moderation and release", "the two gates, and why a released mark is never edited"),
        ("Changing an assessment form", "when an edit forks, and what happens to marks already entered"),
        ("Students off the ordinary path", "deferral, withdrawal, supplementary sittings, carried credit"),
        ("Deadlines, grace and extensions", "one date for the cohort, another for one student"),
        ("Reports and provenance", "scope, snapshots, and the manifest beside the file"),
        ("What the system refuses", "every rule that produces a refusal, in one table"),
        ("Not yet automated", "an honest account of what a person still does"),
    ]
    rows = "".join(
        f"<li><b>{i + 1}. {title}</b><br><span>{sub}</span></li>"
        for i, (title, sub) in enumerate(items)
    )
    return f'<h1>Contents</h1><ol class="toc">{rows}</ol>'


def refusals_table() -> str:
    rows = [
        ("Sign-in", "The lockout is checked before the password",
         "A locked account must not answer whether a password was right"),
        ("Sign-in", "Unknown username and wrong password give the same answer",
         "Otherwise anyone can enumerate staff and students"),
        ("Marking", "Posting a student who is not on your session list",
         "Authority is re-checked per student on save, not once at page render"),
        ("Marking", "A mark above the criterion maximum",
         "The criterion is named in the refusal so it can be fixed"),
        ("Marking", "Any change to a submitted sheet",
         "Submitting is the signature; only a coordinator reopens it"),
        ("Consultations", "Attesting somebody else's session",
         "A student attests their own attendance and nobody else's"),
        ("Booking", "Less than 24 hours' notice, two in a day, another supervisor",
         "A slot already taken is refused rather than double-booked"),
        ("Moderation", "A one-word rationale",
         "Moderating requires a sentence, recorded against your name"),
        ("Release", "Releasing a mark you produced",
         "Separation of duty, applied per action rather than per role"),
        ("Release", "Releasing a blocked mark",
         "A blocking flag has to be resolved, not overridden"),
        ("Assessment forms", "An edit with no reason, or fewer than two columns",
         "The reason is kept with the version and shown to anyone auditing a mark"),
        ("Enrolment", "Changing the status of a student with a released result",
         "That is a correction by supersession, not a dropdown"),
        ("Extensions", "An extension that moves a deadline earlier",
         "To bring a date forward, change the deadline for everyone"),
        ("Reports", "A mark sheet containing an unpublished figure",
         "The manifest refuses to build rather than emit a provisional mark"),
    ]
    body = "".join(
        f"<tr><td>{area}</td><td><b>{rule}</b></td><td>{why}</td></tr>"
        for area, rule, why in rows
    )
    return (
        "<table><thead><tr><th style='width:16%'>Where</th>"
        "<th style='width:40%'>What is refused</th><th>Why</th></tr></thead>"
        f"<tbody>{body}</tbody></table>"
    )


def roles_table() -> str:
    rows = [
        ("Student", "Rank topics, propose one, book sessions, attest their own, read their own result"),
        ("Supervisor", "Publish topics, accept proposals, open slots, grade and attest consultations, "
                       "nominate for presentation, mark documentation, assess their supervisees"),
        ("Assessor", "Mark the students on their scheduled session list, and nobody else"),
        ("Moderator", "Resolve a panel whose spread exceeds the threshold, with a written rationale"),
        ("Coordinator", "Allocate, schedule, reopen a sheet, moderate, release results, maintain the "
                        "assessment forms, the cohort register and the deadline schedule, approve staff accounts"),
        ("External examiner", "Read an assigned cohort. The grant carries an expiry and closes itself"),
        ("Administrator", "Accounts and system configuration. The only role that may be granted outside a cycle"),
    ]
    body = "".join(f"<tr><td><b>{role}</b></td><td>{does}</td></tr>" for role, does in rows)
    return ("<table><thead><tr><th style='width:22%'>Role</th><th>What it may do</th></tr></thead>"
            f"<tbody>{body}</tbody></table>")


def gaps_table() -> str:
    rows = [
        ("Allocation", "Students rank and propose, supervisors accept. Nothing turns preferences "
                       "into projects", "A coordinator allocates by hand"),
        ("Audit chain", "The chain is implemented and tested; the application writes to a console "
                        "sink rather than to it", "Decisions are recorded in the working store only"),
        ("Deliverable upload", "Virus scanning is in the stack with nothing yet to scan",
         "Files are exchanged by email"),
        ("Second factor", "Enforcement and enrolment exist; the verification endpoint does not",
         "Privileged roles are challenged but cannot yet complete the challenge"),
        ("Documentation marking", "Specified, and the rubric is a placeholder awaiting the "
                                  "departmental marking guide", "Marked on paper"),
        ("Presentation nomination", "Nomination and scheduling are specified but not built",
         "Session lists are prepared by the coordinator"),
        ("Reports", "Two of fourteen generators are implemented; XLSX and PDF/A are open",
         "The rest are produced by hand"),
        ("Ethics clearance", "Recorded on a project and displayed; it gates nothing",
         "Enforced by the supervisor"),
        ("Examination board", "Release is a coordinator action; there is no ratification step",
         "Ratification happens outside the system"),
    ]
    body = "".join(
        f"<tr><td><b>{area}</b></td><td>{state}</td><td>{today}</td></tr>"
        for area, state, today in rows
    )
    return ("<table><thead><tr><th style='width:18%'>Area</th><th style='width:48%'>Where it stands</th>"
            "<th>What happens meanwhile</th></tr></thead>"
            f"<tbody>{body}</tbody></table>")


def build_html() -> str:
    parts: list[str] = []
    add = parts.append

    add(f"<style>{STYLE}</style>")

    # ------------------------------------------------------------- cover
    add("""
    <div class="cover">
      <div class="rule"></div>
      <p class="inst" style="margin-top:8mm">UNIVERSITY OF ESWATINI</p>
      <p class="unit">Department of Computer Science · CSC 400 / 402 / 499</p>
      <h1>How the supervision and<br>assessment system works</h1>
      <p class="sub">A process handbook for supervisors, assessors, moderators and the
      project coordinator. Every flow in this document is the flow the software actually
      enforces, including the places where it refuses.</p>
      <div class="meta">
        UPSAS — Research Project Supervision and Assessment System<br>
        Process flows, decision points and responsibilities<br>
        Generated from <span style="font-family:'DejaVu Sans Mono'">docs/process-flow/build.py</span>
      </div>
    </div>
    """)

    # ---------------------------------------------------------- contents
    add('<div class="break">')
    add(contents())
    add("</div>")

    # ------------------------------------------------------------- 1
    add('<div class="break">')
    add("<h1>1. The system at a glance</h1>")
    add('<p class="lede">The system carries one undergraduate research project from a topic '
        'on a supervisor\'s list to a released mark on a student\'s record, and keeps enough '
        'of the reasoning to defend that mark a year later.</p>')
    add("<p>Three things make it more than a spreadsheet. Marks are normalised against the "
        "form they were awarded under, so a score out of 40 and a score out of 80 can be "
        "compared without anyone doing arithmetic in their head. Authority is checked per "
        "action rather than per person, which matters in a department where the same "
        "lecturer supervises, assesses and moderates. And a computed mark is stored as a "
        "snapshot, so the number a student sees and the number on a schedule cannot drift "
        "apart.</p>")
    add(fig_system_map())
    add("<p>The rest of this document walks each flow in turn. Diamonds mark the points "
        "where the system refuses something; those are the parts worth reading closely, "
        "because they are where a process is protected rather than merely recorded.</p>")
    add("</div>")

    # ------------------------------------------------------------- 2
    add('<div class="break">')
    add("<h1>2. Who does what</h1>")
    add('<p class="lede">Roles are granted for a cycle and resolved on every request, so a '
        'grant withdrawn this morning is gone from the next page load rather than the next '
        'sign-in.</p>')
    add(roles_table())
    add("<p>The hard case is not a person with one role. It is a lecturer holding four at "
        "once, which is ordinary in a department this size. Holding several roles unions "
        "their permissions and nothing more; separation of duty is then applied per action, "
        "against the person who actually produced the mark in question.</p>")
    add(fig_separation())
    add('<div class="callout"><b>Why this is not just a role check</b>'
        '<p>A rule that said "moderators may moderate" would let the lecturer who marked a '
        'presentation moderate their own mark, because they genuinely are a moderator. The '
        'check has to ask who produced the mark, not who is asking.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 3
    add('<div class="break">')
    add("<h1>3. A cycle end to end</h1>")
    add('<p class="lede">Consultations run all year. Everything else happens once, in this '
        'order.</p>')
    add(fig_cycle())
    add("<p>Two features of the shape are worth naming. Students may work individually or in "
        "pairs, and the system treats a pair as one project with two members: the proposal, "
        "artefact and documentation belong to the project, while consultations, contribution "
        "statements and marks belong to the student. Members of a pair can be, and often are, "
        "scored differently.</p>")
    add("<p>Second, a session number is not a team. The paper form groups two students per "
        "slot, which can mean one joint project or two unrelated students sharing a time. The "
        "grading sheet bands each session and says which it is, because an assessor needs to "
        "know whether they are watching one presentation or two before they start marking.</p>")
    add("</div>")

    # ------------------------------------------------------------- 4
    add('<div class="break">')
    add("<h1>4. Getting an account, and getting back in</h1>")
    add('<p class="lede">Authentication is local to the department by policy. There is no '
        'external identity provider, which makes the order of the sign-in checks and the '
        'recovery procedure part of the design rather than an implementation detail.</p>')
    add(fig_account())
    add("<p>The ordering is deliberate at every step. The lockout is tested before the "
        "password, so a locked account cannot be used to test passwords. Account status is "
        "tested only after the password verifies, so someone without the password learns "
        "nothing about whether an account exists or what state it is in. An unknown username "
        "and a wrong password produce the same answer.</p>")
    add('<div class="callout warn"><b>The part that is a procedure, not software</b>'
        '<p>Issuing a reset code assumes the coordinator has satisfied themselves that the '
        'person asking is who they say. The system can make the code short-lived, single-use '
        'and invisible to the coordinator afterwards. It cannot recognise a voice.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 5
    add('<div class="break">')
    add("<h1>5. Topics to allocation</h1>")
    add('<p class="lede">Supervisors publish what they are willing to supervise; students '
        'express preferences; a coordinator decides.</p>')
    add(fig_topics())
    add("<p>Ranking three topics is not the same as being allocated one, and the screen says "
        "so in as many words, because a student who believes ranking is choosing will not "
        "chase a supervisor. A student may also propose their own topic to a named "
        "supervisor, who cannot accept it while at capacity.</p>")
    add('<div class="callout stop"><b>Still done by hand</b>'
        '<p>No screen yet turns preferences into projects. The allocation run is the largest '
        'unbuilt piece of the process, and the fairness criteria it would encode — capacity, '
        'rank satisfaction, keeping pairs together — are a departmental decision before they '
        'are a technical one.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 6
    add('<div class="break">')
    add("<h1>6. Consultations</h1>")
    add('<p class="lede">A consultation is a claim that two people met. One attestation is a '
        'note; two make a record that counts.</p>')
    add(fig_consultations())
    add("<p>Consultations are always individual, even on a joint project. One member of a "
        "pair can meet the minimum while the other is scaled down for missing it, and the "
        "supervisor dashboard shows exactly that.</p>")
    add("<p>Whether consultations carry marks or act purely as a gate is the main difference "
        "between the two policy profiles, which is why the consultation rubric is still "
        "marked provisional: current practice records attendance only, so the instrument "
        "does not yet exist.</p>")
    add("</div>")

    # ------------------------------------------------------------- 7
    add('<div class="break">')
    add("<h1>7. Marking a presentation</h1>")
    add('<p class="lede">One sheet per assessor covering the whole cohort, mirroring the '
        'paper form: session numbers in the gutter, criteria with their maxima in the header, '
        'and totals the assessor never types.</p>')
    add(fig_marking())
    add("<p>The blank row is the rule most worth understanding. An assessor who leaves a "
        "student's row empty was absent for that session. Recording that as zero would "
        "destroy the student's mark while looking like a legitimate score, so the row is "
        "excluded from the panel mean instead and shown as excluded on the breakdown.</p>")
    add('<div class="callout"><b>Submitting is the signature</b>'
        '<p>A saved sheet can still be changed. A submitted sheet is locked against its '
        'assessor\'s name and the time, and only a coordinator can reopen it — and not if '
        'they produced the mark themselves.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 8
    add('<div class="break">')
    add("<h1>8. How a mark is computed</h1>")
    add('<p class="lede">Every score persists both its raw total and the maximum in force '
        'when it was awarded. Nothing downstream may use a raw total without dividing by its '
        'recorded maximum.</p>')
    add(fig_compute())
    add("<p>That rule is the reason the system can survive a change of assessment form, a "
        "student carrying credit from a previous cycle, and two profiles disagreeing about "
        "how the continuous assessment mark is composed. Each of those changes a maximum "
        "somewhere; none of them changes what a percentage means.</p>")
    add('<div class="callout warn"><b>An open departmental decision</b>'
        '<p>The 2022 guidelines and the incoming policy compose the continuous assessment '
        'mark differently. Both are expressed as configuration and the same inputs produce '
        '67.1 under one and 69.4 under the other. The system deliberately does not pick.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 9
    add('<div class="break">')
    add("<h1>9. Moderation and release</h1>")
    add('<p class="lede">A mark becomes visible to a student at exactly one moment, and two '
        'gates stand in front of it.</p>')
    add(fig_release())
    add("<p>A spread between assessors beyond the configured threshold does not average "
        "itself away. It blocks, and a moderator resolves it with a written rationale of at "
        "least a sentence, recorded against their name. A one-word rationale is refused.</p>")
    add("<p>After release, the mark is not edited. A correction supersedes it, carrying its "
        "own reason, and the earlier figure stays legible. This is the difference between a "
        "system that can defend a mark and one that can only display the current value.</p>")
    add("</div>")

    # ------------------------------------------------------------- 10
    add('<div class="break">')
    add("<h1>10. Changing an assessment form</h1>")
    add('<p class="lede">The columns of a marking sheet are the department\'s instrument, not '
        'presentation, and they change between cycles. The coordinator changes them without a '
        'code change — but never underneath a mark already awarded.</p>')
    add(fig_form_change())
    add("<p>Four rules make this safe rather than merely flexible. A form nothing has been "
        "marked on is still a draft and is edited in place. The moment a mark exists, an edit "
        "publishes a new version and signed sheets stay attached to the version they were "
        "signed under. A column's identifier is permanent, so renaming a heading keeps every "
        "mark already recorded against it, and a retired identifier is never reissued. The "
        "sheet maximum is the sum of its columns, computed on save.</p>")
    add('<div class="callout stop"><b>Lowering a column below an awarded mark</b>'
        '<p>Truncating a 12 to fit a new maximum of 10 would replace an assessor\'s judgement '
        'with an invented one. The mark is blanked instead — excluded from the panel, not '
        'scored zero — and the assessor is asked for it again.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 11
    add('<div class="break">')
    add("<h1>11. Students off the ordinary path</h1>")
    add('<p class="lede">Real cohorts contain deferrals, withdrawals, supplementary sittings '
        'and students repeating the project while carrying a component they have already '
        'passed. Each needs an answer to two questions: are they assessed this cycle, and '
        'what is already credited.</p>')
    add(fig_enrolment())
    add("<p>Nothing here deletes anybody. A withdrawn student keeps every record they "
        "generated; they simply stop being scheduled, marked and published. A status other "
        "than active requires a date it took effect — rarely the date it is recorded — and a "
        "note explaining it.</p>")
    add("</div>")

    # ------------------------------------------------------------- 12
    add('<div class="break">')
    add("<h1>12. Deadlines, grace and extensions</h1>")
    add('<p class="lede">Until dates live in the system, lateness is decided by whoever read '
        'the handbook last.</p>')
    add(fig_deadlines())
    add("<p>Grace exists for the student submitting at 23:59 on a connection that drops. It "
        "is not published, because a published grace period is simply a later deadline with "
        "an apology attached.</p>")
    add('<div class="callout"><b>Accommodations</b>'
        '<p>A supervisor supervising against a different date needs the date. They do not '
        'need to know it moved because of a bereavement or a disability assessment. The '
        'grounds are visible only to whoever approved them.</p></div>')
    add("</div>")

    # ------------------------------------------------------------- 13
    add('<div class="break">')
    add("<h1>13. Reports and provenance</h1>")
    add('<p class="lede">Reports read stored snapshots and never recompute. A mark schedule '
        'and the mark a student sees come from the same number, so they cannot disagree.</p>')
    add(fig_reports())
    add("<p>Every extraction moves personal data out of the system, which under the Eswatini "
        "Data Protection Act 41 of 2022 is something a controller should be able to account "
        "for. That is why scope is part of a report's definition rather than a filter applied "
        "afterwards, and why the manifest records who pulled what, over which scope, from "
        "which snapshots, with a hash of the exact bytes issued.</p>")
    add("</div>")

    # ------------------------------------------------------------- 14
    add('<div class="break">')
    add("<h1>14. What the system refuses</h1>")
    add('<p class="lede">Every refusal in one place. A refusal is a policy decision made '
        'visible; if one of these is wrong for the department, it is a line of configuration '
        'or a conversation, not a workaround.</p>')
    add(refusals_table())
    add("</div>")

    # ------------------------------------------------------------- 15
    add('<div class="break">')
    add("<h1>15. Not yet automated</h1>")
    add('<p class="lede">A process handbook that describes only the built parts is a '
        'marketing document. This is what a person still does, and what happens in the '
        'meantime.</p>')
    add(gaps_table())
    add('<div class="callout stop"><b>The one to fix first</b>'
        '<p>The audit chain is complete and tested, and the application does not yet write '
        'to it. Until it does, the accountability argument in section 13 describes the '
        'design rather than the running system.</p></div>')
    add("<p>None of the above affects the correctness of a mark that the system does "
        "produce. They affect how much of the process it carries, which is a different "
        "question and a more honest one to be asked about.</p>")
    add("</div>")

    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        "<title>UPSAS — process flows</title></head><body>"
        + "".join(parts)
        + "</body></html>"
    )


def main() -> None:
    from weasyprint import HTML

    out = Path(sys.argv[1] if len(sys.argv) > 1 else
               Path(__file__).with_name("upsas-process-flow.pdf"))
    html = build_html()
    Path(__file__).with_name("upsas-process-flow.html").write_text(html, encoding="utf-8")
    HTML(string=html, base_url=str(Path(__file__).parent)).write_pdf(out)
    print(f"wrote {out} ({out.stat().st_size // 1024} kB, {len(FIGURES)} figures)")


if __name__ == "__main__":
    main()
