import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { findPerson, findStudent, findStudentByNumber, projectOf, deliverablesFor, uploadDeliverable } from '@/lib/data/store';
import { scanWithClamav, sha256Hex } from '@/lib/clamav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const person = findPerson(principal.userId);
  const student = person?.studentId
    ? findStudent(person.studentId)
    : findStudentByNumber(person?.username ?? '');
  if (!student) return jsonError('Not linked to a student record.', 403);

  const project = projectOf(student.id);
  if (!project) return jsonError('No project yet.', 404);

  return Response.json({ deliverables: deliverablesFor(project.id) });
}

export async function POST(request: Request) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const person = findPerson(principal.userId);
  const student = person?.studentId
    ? findStudent(person.studentId)
    : findStudentByNumber(person?.username ?? '');
  if (!student) return jsonError('Not linked to a student record.', 403);

  const project = projectOf(student.id);
  if (!project) return jsonError('No project yet.', 404);

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError('Invalid upload.', 400);

  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  const kind = String(form.get('kind') ?? 'document').trim();
  if (!(file instanceof File)) return jsonError('A file is required.', 400);
  if (!title) return jsonError('A title is required.', 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = sha256Hex(bytes);
  const scanStatus = await scanWithClamav(bytes);
  if (scanStatus === 'INFECTED') {
    return jsonError('The file failed the virus scan and was rejected.', 422);
  }

  const result = uploadDeliverable({
    projectId: project.id,
    kind: kind || 'document',
    title,
    mediaType: file.type || 'application/octet-stream',
    byteSize: bytes.byteLength,
    sha256,
    scanStatus: scanStatus === 'OK' ? 'OK' : 'SKIPPED',
    uploadedById: principal.userId,
  });

  return Response.json(result.ok ? { ok: true, version: result.version } : { error: result.error }, { status: result.ok ? 200 : 400 });
}
