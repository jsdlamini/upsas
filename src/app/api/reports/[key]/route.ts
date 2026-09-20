import { currentPrincipal } from '@/lib/auth/current';
import { requireDefinition, buildMarkSchedule, buildConsultationRegister, buildManifest,
         type ScheduleRow, type RegisterRow } from '@/lib/reports';
import { computeFinalMark, PROFILE_A } from '@/lib/assessment';
import {
  allocatedStudents, superviseesOf, projectOf, findPerson, docMarkOf, consultationsOf,
  toConsultationRecords, toAssessorEntries,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) return new Response('Not signed in', { status: 401 });

  const { key } = await params;
  let definition;
  try { definition = requireDefinition(key); }
  catch { return new Response('Unknown report', { status: 404 }); }

  if (!definition.roles.some((r) => (principal.roles as readonly string[]).includes(r))) {
    return new Response(`Your roles do not permit "${definition.title}".`, { status: 403 });
  }

  // Scope is enforced here, not in the UI: a supervisor gets their own students.
  const isCoordinator = principal.roles.includes('COORDINATOR');
  const students = isCoordinator ? allocatedStudents() : superviseesOf(principal.userId);
  const now = new Date();
  let content: string;
  let filename: string;
  let includesUnpublished = false;

  if (key === 'mark-schedule') {
    const rows: ScheduleRow[] = students.map((s) => {
      const project = projectOf(s.id)!;
      const doc = docMarkOf(s.id);
      const snapshot = computeFinalMark({
        studentId: s.id, cycleId: '2025/2026',
        consultations: toConsultationRecords(s.id),
        presentations: [
          { componentKey: 'p1', entries: toAssessorEntries(s.id, 'p1') },
          { componentKey: 'p2', entries: toAssessorEntries(s.id, 'p2') },
        ],
        ...(doc ? { documentation: {
          rawTotal: doc.rawTotal, rubricMax: doc.rubricMax, rubricVersionId: 'rv-doc-1',
          markedBy: doc.markedBy, ...(doc.agreedRawTotal !== null ? { agreedRawTotal: doc.agreedRawTotal } : {}),
        } } : {}),
        computedBy: principal.userId, now,
      }, PROFILE_A);
      if (snapshot.blocked) includesUnpublished = true;
      return {
        studentNumber: s.studentNumber, surname: s.surname, otherNames: s.otherNames,
        programme: s.programme, courseCode: s.courseCode,
        supervisor: findPerson(project.supervisorId)?.fullName ?? '',
        projectTitle: project.title, groupSize: project.memberIds.length,
        snapshot, published: !snapshot.blocked,
      };
    });
    content = buildMarkSchedule(rows);
    filename = 'mark-schedule-2025-2026.csv';
  } else if (key === 'consultation-register') {
    const rows: RegisterRow[] = students.flatMap((s) => {
      const project = projectOf(s.id)!;
      return consultationsOf(s.id).map<RegisterRow>((c) => ({
        studentNumber: s.studentNumber, studentName: `${s.surname}, ${s.otherNames}`,
        supervisor: findPerson(project.supervisorId)?.fullName ?? '',
        periodCode: c.periodId, heldAt: c.heldAt, mode: 'IN_PERSON', status: c.status,
        agenda: c.agenda, deliverableReviewed: '',
        supervisorAttestedAt: c.supervisorAttested ? c.heldAt : null,
        studentAttestedAt: c.studentAttested ? c.heldAt : null,
        rawTotal: c.rawTotal, rubricMax: c.rawTotal === null ? null : c.rubricMax,
        counted: c.status === 'COMPLETED' && c.supervisorAttested && c.studentAttested && c.rawTotal !== null,
        actionItems: 0,
      }));
    });
    content = buildConsultationRegister(rows);
    filename = 'consultation-register.csv';
  } else {
    return new Response(`"${definition.title}" has no generator yet.`, { status: 501 });
  }

  let manifest;
  try {
    manifest = buildManifest({
      reportKey: key, generatedBy: principal.userId, generatedAt: now.toISOString(),
      cycleId: '2025/2026',
      scopeDescription: isCoordinator ? 'Whole cycle' : 'Own supervisees',
      rowCount: content.trim().split('\r\n').length - 1,
      configIds: [PROFILE_A.id], snapshotIds: students.map((s) => `snap-${s.studentNumber}`),
      includesUnpublished,
    }, filename, 'CSV', content);
  } catch (err) {
    // A report that may not carry provisional marks refuses rather than leaking one.
    return new Response(String(err instanceof Error ? err.message : err), { status: 409 });
  }

  console.log('[audit] report.exported', key, principal.userId, manifest.sha256);

  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Report-Sha256': manifest.sha256,
      'X-Report-Rows': String(manifest.rowCount),
      // HTTP headers are ByteStrings: the watermark prose contains an em dash and
      // would throw. The flag travels as an ASCII token; the wording lives in the
      // manifest, which is where a human reads it anyway.
      ...(manifest.watermark ? { 'X-Report-Provisional': 'true' } : {}),
    },
  });
}
