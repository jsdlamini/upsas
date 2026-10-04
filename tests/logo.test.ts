import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { saveInstitution, logoUrl } from '../src/lib/institution';
import { resetInstitutionForTests } from '../src/lib/data/store';

beforeEach(resetInstitutionForTests);

test('logoUrl points at the URL for a url logo and null for a missing file logo', async () => {
  await saveInstitution({ name: 'A', department: 'B', logo: { kind: 'url', url: 'https://example.com/logo.png' } });
  assert.equal(await logoUrl(), 'https://example.com/logo.png');
  await saveInstitution({ name: 'A', department: 'B', logo: { kind: 'file', fileId: 'missing' } });
  assert.equal(await logoUrl(), null); // file does not exist on disk
  await saveInstitution({ name: 'A', department: 'B', logo: null });
  assert.equal(await logoUrl(), null);
});
