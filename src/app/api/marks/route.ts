import { NextResponse, type NextRequest } from 'next/server';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { normalisePercentage } from '@/lib/assessment';
import {
  RUBRICS, sessionsFor, findStudent, setMark, sheetOf, rawTotalOf,
  ensureHydrated, persistNow, persistenceHealth,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

interface MarkBody {
  component?: unknown;
  studentId?: unknown;
  criterionId?: unknown;
  value?: unknown;
}

/**
 * Save one mark, the moment the assessor leaves the field.
 *
 * The response says whether the mark is *durable*, not merely accepted: it is
 * only true once Postgres has it, so an assessor is never told a mark is safe
 * when it lives only in the memory of a machine that can vanish. When it is
 * not durable, the page keeps the mark in the browser and sends it again.
 */
export async function POST(request: NextRequest) {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ ok: false, error: 'Signed out. Sign in again.' }, { status: 401 });

  await ensureHydrated();
  const health = persistenceHealth().health;
  if (health === 'unreachable' || health === 'loading') {
    // Accepting a mark now would put it into a store that has not loaded the
    // real state. Refuse; the browser holds it and retries.
    return NextResponse.json(
      { ok: false, retry: true, error: 'The database cannot be reached. Your mark is kept in this browser and will be sent again.' },
      { status: 503 },
    );
  }

  let body: MarkBody;
  try { body = (await request.json()) as MarkBody; } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const component = body.component === 'p1' ? 'p1' : body.component === 'p2' ? 'p2' : null;
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const criterionId = typeof body.criterionId === 'string' ? body.criterionId : '';
  const raw = body.value;
  if (!component || !studentId || !criterionId) {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  let value: number | null;
  if (raw === null || raw === '') value = null;
  else if (typeof raw === 'number' && Number.isFinite(raw)) value = raw;
  else if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) value = Number(raw);
  else return NextResponse.json({ ok: false, error: 'A mark must be a number.' }, { status: 400 });

  // The same authority check as the sheet's Save button, per student, on write.
  const assigned = sessionsFor(component).flatMap((s) => s.studentIds);
  const decision = can(principal, 'presentation.grade', { memberId: studentId, assignedMemberIds: assigned });
  if (!decision.allow) return NextResponse.json({ ok: false, error: decision.reason }, { status: 403 });

  const result = setMark(principal.userId, studentId, component, criterionId, value);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });

  const outcome = await persistNow();
  const rubric = RUBRICS[component];
  const total = rawTotalOf(sheetOf(principal.userId, studentId, component));
  const criterion = rubric.criteria.find((c) => c.id === criterionId);
  const student = findStudent(studentId);

  return NextResponse.json({
    ok: true,
    durable: outcome === 'saved',
    // 'disabled' is a configuration problem, not a blip: say so rather than retry forever.
    persistence: outcome,
    label: `${student?.surname ?? studentId}, ${criterion?.label ?? criterionId}`,
    value,
    max: criterion?.max ?? null,
    total,
    normalised: total === null ? null : Number(normalisePercentage(total, rubric.max).toFixed(1)),
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
