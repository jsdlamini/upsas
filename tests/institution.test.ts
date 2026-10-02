import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { getInstitution, isConfigured, saveInstitution, monogramText } from '../src/lib/institution';
import { getStoredInstitution, resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('getInstitution returns neutral defaults when unset', () => {
  assert.equal(getInstitution().name, '');
  assert.equal(getInstitution().productName, 'Research Chain');
  assert.equal(getInstitution().accentColor, '#2E5AC8');
  assert.equal(isConfigured(), false);
});

test('saveInstitution validates and persists', () => {
  assert.deepEqual(saveInstitution({ name: '', department: 'CS' }), {
    ok: false,
    error: 'Name and department are required.',
  });
  const ok = saveInstitution({ name: 'Acme University', department: 'School of Computing', accentColor: '#123ABC' });
  assert.equal(ok.ok, true);
  assert.equal(isConfigured(), true);
  assert.equal(getInstitution().name, 'Acme University');
  assert.ok(getStoredInstitution()!.configuredAt);
});

test('saveInstitution rejects a bad accent colour and a bad logo URL', () => {
  assert.equal(saveInstitution({ name: 'X', department: 'Y', accentColor: 'red' }).ok, false);
  assert.equal(saveInstitution({ name: 'X', department: 'Y', logo: { kind: 'url', url: 'not-a-url' } }).ok, false);
});

test('monogramText falls back to initials of name', () => {
  saveInstitution({ name: 'University of Example', department: 'CS', monogram: '' });
  assert.equal(monogramText(), 'UN');
});
