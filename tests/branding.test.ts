import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { getInstitution, saveInstitution, departmentLine } from '../src/lib/institution';
import { buildIcal } from '../src/lib/ical';
import { resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('iCal and department line reflect the configured institution, not a literal', async () => {
  await saveInstitution({ name: 'Acme University', department: 'School of Computing', productName: 'Acme Chain' });
  const ical = await buildIcal([{ uid: '1', startIso: '2026-10-03T10:00:00Z', endIso: '2026-10-03T10:30:00Z', summary: 'x' }]);
  assert.ok(!ical.includes('UNESWA'));
  assert.ok(ical.includes('Acme Chain'));
  assert.equal(await departmentLine(), 'School of Computing — Acme University');
  assert.equal((await getInstitution()).productName, 'Acme Chain');
});
