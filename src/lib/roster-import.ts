import { randomBytes } from 'node:crypto';
import {
  registerStudent, requestStaffAccount, requestResetCode, STUDENT_NUMBER_PATTERN,
} from './data/store';
import type { RoleCode } from './rbac/policy';

/**
 * Bulk onboarding from a CSV. Two formats, detected by the header row:
 *   students: studentNumber,surname,otherNames,email,programme,courseCode
 *   staff:    username,surname,otherNames,email,roles   (roles separated by ; or |)
 */

export interface RosterResult {
  added: number;
  skipped: Array<{ row: number; reason: string }>;
}

/** Minimal RFC-4180-style parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export async function importRoster(text: string): Promise<RosterResult> {
  const rows = parseCsv(text);
  if (rows.length === 0) return { added: 0, skipped: [] };

  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  const isStudents = headers.includes('studentnumber');
  const isStaff = headers.includes('username');

  if (!isStudents && !isStaff) {
    return { added: 0, skipped: [{ row: 1, reason: 'Header must include "studentNumber" (students) or "username" (staff).' }] };
  }

  const get = (r: string[], name: string) => (r[headers.indexOf(name)] ?? '').trim();
  const skipped: Array<{ row: number; reason: string }> = [];
  let added = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]!;
    const rowNo = i + 1;
    if (isStudents) {
      const studentNumber = get(r, 'studentnumber');
      if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) {
        skipped.push({ row: rowNo, reason: 'Student number must be nine digits.' });
        continue;
      }
      const email = get(r, 'email').toLowerCase();
      // A temporary password the student never learns; the reset-code email
      // below lets them set their own.
      const res = await registerStudent({
        studentNumber,
        surname: get(r, 'surname'),
        otherNames: get(r, 'othernames'),
        programme: get(r, 'programme'),
        courseCode: get(r, 'coursecode'),
        email,
        password: randomBytes(12).toString('hex'),
      });
      if (!res.ok) { skipped.push({ row: rowNo, reason: res.error }); continue; }
      if (email) await requestResetCode(studentNumber);
      added += 1;
    } else {
      const roles = get(r, 'roles').split(/[;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean) as RoleCode[];
      const res = await requestStaffAccount({
        username: get(r, 'username'),
        surname: get(r, 'surname'),
        otherNames: get(r, 'othernames'),
        email: get(r, 'email'),
        requestedRoles: roles.length > 0 ? roles : ['SUPERVISOR'],
        justification: 'Imported via roster CSV.',
      });
      if (!res.ok) skipped.push({ row: rowNo, reason: res.error });
      else added += 1;
    }
  }

  return { added, skipped };
}
