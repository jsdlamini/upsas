import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { getInstitution, isConfigured, saveInstitution, monogramText } from '../src/lib/institution';
import { getStoredInstitution, resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('getInstitution returns neutral defaults when unset', async () => {
  assert.equal((await getInstitution()).name, '');
  assert.equal((await getInstitution()).productName, 'Research Chain');
  assert.equal((await getInstitution()).accentColor, '#2E5AC8');
  assert.equal(await isConfigured(), false);
});

test('saveInstitution validates and persists', async () => {
  assert.deepEqual(await saveInstitution({ name: '', department: 'CS' }), {
    ok: false,
    error: 'Name and department are required.',
  });
  const ok = await saveInstitution({ name: 'Acme University', department: 'School of Computing', accentColor: '#123ABC' });
  assert.equal(ok.ok, true);
  assert.equal(await isConfigured(), true);
  assert.equal((await getInstitution()).name, 'Acme University');
  assert.ok((await getStoredInstitution('default'))!.configuredAt);
});

test('saveInstitution rejects a bad accent colour and a bad logo URL', async () => {
  assert.equal((await saveInstitution({ name: 'X', department: 'Y', accentColor: 'red' })).ok, false);
  assert.equal((await saveInstitution({ name: 'X', department: 'Y', logo: { kind: 'url', url: 'not-a-url' } })).ok, false);
});

test('monogramText falls back to initials of name', async () => {
  await saveInstitution({ name: 'University of Example', department: 'CS', monogram: '' });
  assert.equal(await monogramText(), 'UN');
});
