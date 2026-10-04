import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, importRoster } from '../src/lib/roster-import';
import { findStudentByNumber, findPersonByUsername, resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('parseCsv handles quoted fields, escaped quotes and CRLF', () => {
  const rows = parseCsv('a,b,"c,d","say ""hi""",e\r\nf,g,h,i,j');
  assert.deepEqual(rows[0], ['a', 'b', 'c,d', 'say "hi"', 'e']);
  assert.deepEqual(rows[1], ['f', 'g', 'h', 'i', 'j']);
});

test('importRoster creates students from a CSV', async () => {
  const text = `studentNumber,surname,otherNames,email,programme,courseCode
202500123,Mamba,Zanele,zanele@example.org,BSc IT,CSC 400
202500124,Dlamini,Sipho,sipho@example.org,BSc,CSC 499`;
  const result = await importRoster(text);
  assert.equal(result.added, 2);
  assert.equal(result.skipped.length, 0);
  assert.ok(findStudentByNumber('202500123'));
  assert.ok(findPersonByUsername('202500124'));
});

test('importRoster skips duplicates and invalid rows', async () => {
  const text = `studentNumber,surname,otherNames,email,programme,courseCode
202500200,Mamba,Zanele,z@example.org,BSc IT,CSC 400
202500200,Dup,Again,d@example.org,BSc,CSC 400
12345,Bad,Number,b@example.org,BSc,CSC 400`;
  const result = await importRoster(text);
  assert.equal(result.added, 1);
  assert.equal(result.skipped.length, 2);
  assert.ok(result.skipped.some((s) => s.reason.includes('already')));
  assert.ok(result.skipped.some((s) => s.reason.includes('nine digits')));
});

test('importRoster creates staff as pending approval', async () => {
  const text = `username,surname,otherNames,email,roles
tmokoena,Mokoena,Thabo,t@example.org,SUPERVISOR;ASSESSOR`;
  const result = await importRoster(text);
  assert.equal(result.added, 1);
  assert.ok(findPersonByUsername('tmokoena'));
});
