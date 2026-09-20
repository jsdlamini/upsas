/**
 * Seed data.
 *
 * The two presentation rubrics are transcribed VERBATIM from the departmental
 * PROJECT ASSESSMENT FORM (2024/2025). Criteria and maxima are not to be
 * altered in code — they change by forking a rubric version through the admin UI.
 *
 * The consultation and documentation rubrics are marked PROVISIONAL: no
 * departmental instrument for either was supplied, so these are structural
 * placeholders pending Coordinator approval.
 *
 * Demo people are synthetic. Real student names and numbers appear on the
 * source forms but are not reproduced here — seed data ends up in repositories,
 * fixtures and screenshots, and that is personal data under the Eswatini Data
 * Protection Act 41 of 2022.
 */

export const P1_RUBRIC = {
  code: 'P1',
  name: 'Presentation 1 — Chapters 1 & 2 (Proposal)',
  maxTotal: 40,
  provisional: false,
  criteria: [
    { ordinal: 1, label: 'Background of study', maxMark: 5 },
    { ordinal: 2, label: 'Problem statement', maxMark: 5 },
    { ordinal: 3, label: 'Aim and objectives', maxMark: 5 },
    { ordinal: 4, label: 'Literature review', maxMark: 5 },
    { ordinal: 5, label: 'Identified gaps', maxMark: 5 },
    { ordinal: 6, label: 'Methodology', maxMark: 5 },
    { ordinal: 7, label: 'Implementation', maxMark: 5 },
    { ordinal: 8, label: 'In-text citation', maxMark: 2 },
    { ordinal: 9, label: 'References', maxMark: 3 },
  ],
} as const;

export const P2_RUBRIC = {
  code: 'P2',
  name: 'Presentation 2 — Chapters 3, 4 & 5 (Final)',
  maxTotal: 80,
  provisional: false,
  criteria: [
    { ordinal: 1, label: 'Introduction', maxMark: 5 },
    { ordinal: 2, label: 'Problem statement', maxMark: 5 },
    { ordinal: 3, label: 'Aim and objectives', maxMark: 5 },
    { ordinal: 4, label: 'Methodology', maxMark: 15 },
    { ordinal: 5, label: 'Implementation', maxMark: 25 },
    { ordinal: 6, label: 'Results interpretation', maxMark: 10 },
    { ordinal: 7, label: 'Conclusion', maxMark: 5 },
    { ordinal: 8, label: 'Presentation skills', maxMark: 5 },
    { ordinal: 9, label: 'References', maxMark: 5 },
  ],
} as const;

/** PROVISIONAL — current practice records attendance only, with no rubric. */
export const CONSULTATION_RUBRIC = {
  code: 'CONSULT',
  name: 'Supervision consultation (PROVISIONAL)',
  maxTotal: 100,
  provisional: true,
  criteria: [
    { ordinal: 1, label: 'Preparation and readiness of the agreed deliverable', maxMark: 30 },
    { ordinal: 2, label: 'Progress since the previous consultation', maxMark: 30 },
    { ordinal: 3, label: 'Understanding, initiative and ability to defend the work', maxMark: 20 },
    { ordinal: 4, label: 'Professionalism: punctuality, communication, record-keeping', maxMark: 20 },
  ],
} as const;

/** PROVISIONAL — the supervisor marking guide referenced in §B was not supplied. */
export const DOCUMENTATION_RUBRIC = {
  code: 'DOC',
  name: 'Final documentation, Chapters 1–5 (PROVISIONAL)',
  maxTotal: 100,
  provisional: true,
  criteria: [
    { ordinal: 1, label: 'Chapter 1 — Introduction, problem, aim and objectives', maxMark: 15 },
    { ordinal: 2, label: 'Chapter 2 — Review of related studies', maxMark: 15 },
    { ordinal: 3, label: 'Chapter 3 — Research methodology', maxMark: 20 },
    { ordinal: 4, label: 'Chapter 4 — Implementation and results', maxMark: 25 },
    { ordinal: 5, label: 'Chapter 5 — Limitations, conclusion, recommendations', maxMark: 10 },
    { ordinal: 6, label: 'References and APA 6 citation accuracy', maxMark: 8 },
    { ordinal: 7, label: 'Formatting and presentation per departmental guidelines', maxMark: 7 },
  ],
} as const;

export const PROGRAMMES = [
  { code: 'BSC', name: 'BSc' },
  { code: 'BSC_IT', name: 'BSc Information Technology' },
  { code: 'BSC_CS_EDU', name: 'BSc Computer Science Education' },
  { code: 'BSC_LIS', name: 'BSc Library and Information Science' },
] as const;

export const COURSES = [
  { code: 'CSC400', title: 'Research Project' },
  { code: 'CSC402', title: 'Research Project' },
  { code: 'CSC499', title: 'Research Project' },
] as const;

export const RUBRICS = [P1_RUBRIC, P2_RUBRIC, CONSULTATION_RUBRIC, DOCUMENTATION_RUBRIC];

/** Integrity check: a rubric whose criteria do not sum to its declared max is unusable. */
export function verifyRubrics(): void {
  for (const r of RUBRICS) {
    const sum = r.criteria.reduce((a, c) => a + c.maxMark, 0);
    if (sum !== r.maxTotal) {
      throw new Error(`Rubric ${r.code}: criteria sum to ${sum}, declared max is ${r.maxTotal}`);
    }
  }
}

verifyRubrics();

if (process.argv[1]?.endsWith('seed.ts')) {
  console.log('Rubric integrity verified:');
  for (const r of RUBRICS) {
    console.log(
      `  ${r.code.padEnd(8)} ${String(r.maxTotal).padStart(3)} marks  ` +
      `${r.criteria.length} criteria  ${r.provisional ? '[PROVISIONAL]' : ''}`,
    );
  }
}
