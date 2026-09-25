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
