import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { getEmailSettings, saveEmailSettings } from '../src/lib/email-config';
import { resetEmailForTests } from '../src/lib/data/store';

beforeEach(() => {
  resetEmailForTests();
  delete process.env.RESEND_API_KEY;
});

test('default provider is none until configured', () => {
  assert.equal(getEmailSettings().provider, 'none');
});

test('a pre-existing Resend key keeps Resend as the default', () => {
  process.env.RESEND_API_KEY = 're_test';
  assert.equal(getEmailSettings().provider, 'resend');
});

test('smtp requires a host; resend requires nothing extra', () => {
  assert.equal(saveEmailSettings({ provider: 'smtp', smtpHost: '' }).ok, false);
  assert.equal(saveEmailSettings({ provider: 'resend', fromName: 'A', fromEmail: 'a@b.c' }).ok, true);
  assert.equal(getEmailSettings().provider, 'resend');
});
