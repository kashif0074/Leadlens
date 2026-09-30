# LeadLens

LeadLens is a Next.js and TypeScript outbound campaign workspace. It guides users from a campaign brief through lead review, inbox connection, email sequence approval, and campaign launch.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Groq API keys

Campaign generation reads Groq keys only on the server. Configure the primary
key as `GROQ_API_KEY` (or `GROQ_API_KEY_1`) and optional backups as
`GROQ_API_KEY_2` and `GROQ_API_KEY_3`. Requests try the keys in order and move
to the next key for rate limits, token limits, authentication failures, or
provider/network errors. Keep all values in `.env` and never expose them to
the browser.

## Gmail sending accounts

Google sign-in is used only to authenticate a LeadLens user. To send a campaign,
the user separately connects a Gmail account from the campaign's Connect inbox
step using Google OAuth. Add this authorized redirect URI to the Google OAuth
client used by the app:

```text
${NEXTAUTH_URL}/api/email-accounts/oauth/callback
```

The sender account is saved against the authenticated LeadLens user and linked
to the campaign. Gmail OAuth access and refresh tokens are encrypted and remain
server-side. The explicit sender consent also grants read-only access so Gmail
History can sync replies to campaign messages while the Inbox is open (the
Inbox refreshes every 30 seconds). Revoked or expired access requires the user
to reconnect; sending never falls back to the Google sign-in address or a global
SMTP mailbox.

Set `ENCRYPTION_KEY` in `.env` to a randomly generated 32-byte hexadecimal key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep this key private and backed up: saved Gmail tokens cannot be decrypted if
the key is lost or rotated. Apply all migrations before starting the app with
`npx prisma migrate deploy`. Existing App Password-based accounts must reconnect
through Google OAuth after the Gmail OAuth migration.

## Sending-domain authentication

LeadLens sends through the connected Gmail account and uses that mailbox for
both `From` and `Reply-To`. For a consumer `@gmail.com` address, Google manages
the sending-domain authentication. For a Google Workspace custom domain, the
domain owner must authorize Google in SPF, enable DKIM signing in the Workspace
admin console and publish Google's DKIM selector, and publish a DMARC record
for the visible From domain. Keep a single SPF record and merge authorized
senders into it. DNS hosting and propagation are outside LeadLens; the app does
not inspect or verify SPF, DKIM, or DMARC records.

Set `NEXTAUTH_URL` to the public HTTPS application URL in production. Campaign
messages include a one-click unsubscribe link, and LeadLens suppresses opted-out
addresses for that user across their campaigns. Do not send unsolicited mail;
collect only contacts you have an appropriate legal basis to contact. The
per-launch and rolling 24-hour caps reduce volume spikes but cannot guarantee
Primary Inbox placement. Gmail SMTP confirms acceptance or immediate rejection;
this app does not receive later bounce notifications from Gmail, so monitor the
mailbox for post-acceptance bounces.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Email worker and Upstash Redis

The BullMQ worker uses the Redis TCP endpoint, not the Upstash REST URL. Set a
fresh token in `.env` after creating or rotating it in the Upstash
console:

```env
REDIS_URL=rediss://default:YOUR_NEW_TOKEN@your-endpoint.upstash.io:6379
```

Use `rediss://` for Upstash TLS connections. Never commit `.env` or expose the
Redis token in source control, logs, screenshots, or chat. `401 Unauthorized`
from the Upstash REST endpoint means the token is invalid, expired, revoked, or
was copied incorrectly; generate a new token rather than changing the TLS
settings.

Start the worker with:

```bash
npm run worker
```
