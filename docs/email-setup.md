# Email setup

The system sends email for password resets, registration confirmations, and
meeting notices. You are **not** tied to any one provider — pick whichever of
the three below suits your institution.

The provider is chosen from **Settings → Institution → Email** (or during the
first-run setup wizard), and the **Send test email** button verifies it.

## Options

### 1. Resend (hosted API)

Resend is a hosted email API — no SMTP server to run.

1. Create a free account at <https://resend.com>.
2. Create an API key under **API Keys**.
3. Add and **verify your sending domain** under **Domains** (e.g.
   `your-institution.edu`). Resend only lets you send *from* a verified domain.
4. Put the key in the server environment:

   ```
   RESEND_API_KEY=re_xxxxxxxx
   ```

5. In the app, set the provider to **Resend**, the **From name** (e.g.
   "Research Chain") and **From email** (e.g. `no-reply@your-institution.edu`).

### 2. SMTP (any provider, including self-hosted)

Use any SMTP server: your own Postfix/Exim, a campus relay, or a hosted
mailbox (Gmail/Outlook/Office 365).

In the app, set the provider to **SMTP** and fill in:

| Field | What to put |
|---|---|
| Host | the SMTP server, e.g. `smtp.gmail.com` or `mail.your-institution.edu` |
| Port | `587` (STARTTLS — the default) or `465` (implicit TLS) |
| Secure | on for `465`, off for `587` |
| User | the login for the mailbox |
| Password | the mailbox password or **app password** (see below) |

**Gmail / Google Workspace** — turn on 2-step verification, then create an
**App Password** (Google Account → Security → App passwords) and use that
instead of your real password.

**Microsoft 365 / Outlook** — use SMTP auth with the mailbox credentials or an
app password if your tenant requires it.

**Self-hosted (Postfix)** — a minimal relay that accepts authenticated mail on
587. Keep TLS on and use a dedicated, low-privilege account.

> The SMTP password is stored in the app's database so a non-technical
> coordinator can set it up themselves. Use a dedicated mailbox, not a personal
> account.

### 3. None (no email)

For a fully offline or demo install, choose **None**. Emails are written to the
server console (`[email:stub] …`) and nothing leaves the machine.

## Verifying

1. Open **Settings → Institution → Email**.
2. Click **Send test email**.
3. Enter an address you can check and submit.

The result is one of:

- **sent** — the provider accepted the message (check the inbox, and spam).
- **failed** — the provider rejected it (bad credentials, wrong host/port, or
  the domain is not verified). The server log shows the provider's reason.
- **stubbed** — the provider is **None**, so nothing was sent.

## Troubleshooting

- **Resend "domain not verified"** — add the DNS records Resend asks for and
  wait for them to propagate.
- **SMTP "authentication failed"** — check the user/password (use an app
  password for Gmail/Microsoft) and the host/port/secure settings.
- **Emails land in spam** — verify SPF/DKIM for the sending domain (Resend
  gives you the records; for self-hosted SMTP, set up SPF/DKIM on your relay).
