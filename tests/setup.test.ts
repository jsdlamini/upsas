import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { isConfigured, saveInstitution, getInstitution } from '../src/lib/institution';
import { resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('a save transitions the app to configured with a timestamp', async () => {
  assert.equal(await isConfigured(), false);
  assert.equal((await saveInstitution({ name: 'A', department: 'B' })).ok, true);
  assert.equal(await isConfigured(), true);
  assert.ok((await getInstitution()).configuredAt);
});
