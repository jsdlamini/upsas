import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_EMAIL_SETTINGS, getEmailSettings, saveEmailSettings } from '../src/lib/email-config';
import { resetEmailForTests, setStoredEmailSettings } from '../src/lib/data/store';

beforeEach(async () => {
  await resetEmailForTests();
  delete process.env.RESEND_API_KEY;
});

test('default provider is none until configured', async () => {
  assert.equal((await getEmailSettings()).provider, 'none');
});

test('a pre-existing Resend key keeps Resend as the default', async () => {
  process.env.RESEND_API_KEY = 're_test';
  assert.equal((await getEmailSettings()).provider, 'resend');
});

test('a stored none row still falls back to Resend when a key is present', async () => {
  await setStoredEmailSettings('default', { ...DEFAULT_EMAIL_SETTINGS, provider: 'none' });
  process.env.RESEND_API_KEY = 're_test';
  assert.equal((await getEmailSettings()).provider, 'resend');
});

test('a stored none row stays none without a key (air-gapped)', async () => {
  await setStoredEmailSettings('default', { ...DEFAULT_EMAIL_SETTINGS, provider: 'none' });
  assert.equal((await getEmailSettings()).provider, 'none');
});

test('smtp requires a host; resend requires nothing extra', async () => {
  assert.equal((await saveEmailSettings({ provider: 'smtp', smtpHost: '' })).ok, false);
  assert.equal((await saveEmailSettings({ provider: 'resend', fromName: 'A', fromEmail: 'a@b.c' })).ok, true);
  assert.equal((await getEmailSettings()).provider, 'resend');
});
