import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import {
  findProject, findPerson, findStudent, signaturesFor,
} from '@/lib/data/store';
import { buildAgreementPdf, type AgreementSigner } from '@/lib/agreement';

export const dynamic = 'force-dynamic';

/** The executed (or in-progress) Topic & Supervision Agreement as a PDF. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const { projectId } = await params;
  const project = findProject(projectId);
  if (!project) return Response.json({ error: 'No such project.' }, { status: 404 });

  const supervisor = findPerson(project.supervisorId);
  const students = project.memberIds
    .map((id) => findStudent(id))
    .filter(Boolean)
    .map((s) => `${s!.surname}, ${s!.otherNames} (${s!.studentNumber})`);

  const programme = project.memberIds.map((id) => findStudent(id)?.programme).filter(Boolean)[0];
  const courseCode = project.memberIds.map((id) => findStudent(id)?.courseCode).filter(Boolean)[0];

  const signers: AgreementSigner[] = [
    ...project.memberIds.map((id) => {
      const s = findStudent(id);
      return { name: s ? `${s.surname}, ${s.otherNames}` : id, role: 'Student' as const };
    }),
    { name: supervisor?.fullName ?? project.supervisorId, role: 'Supervisor' as const },
  ];

  for (const sig of signaturesFor(projectId)) {
    const slot = signers.find((s) => s.role === sig.role && s.name === sig.name);
    if (slot) slot.signedAt = sig.signedAt;
  }

  const bytes = await buildAgreementPdf({
    topicTitle: project.title,
    supervisorName: supervisor?.fullName ?? project.supervisorId,
    students,
    programme,
    courseCode,
    cycleLabel: '2025/2026',
    signers,
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="agreement-${projectId}.pdf"`,
    },
  });
}
