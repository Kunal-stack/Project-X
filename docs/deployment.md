# Cloudflare Deployment

This project is prepared for Cloudflare Pages + Pages Functions + D1.

## What gets deployed

- Static browser assets from `dist/`
- Pages Functions from `functions/`
- Function imports from `lib/` and `data/` are bundled by Wrangler
- D1 migrations from `migrations/`

Do not deploy the project root as static assets. Use `npm run deploy`, which builds a clean `dist/` first and lets Wrangler read `pages_build_output_dir` from `wrangler.jsonc`.

## One-time setup

1. Confirm Wrangler auth:

```bash
npx wrangler whoami --env-file .dev.vars
```

The token in `.dev.vars` must be broader than the Workers AI-only token used
for local model calls. For this deployment flow, the token needs access to:

- Cloudflare Pages: Edit
- D1: Edit
- Workers AI: Edit
- User Details: Read, optional but avoids Wrangler identity warnings

2. Create the Pages project:

```bash
npm run pages:create
```

This creates the public Pages project name:

```text
kunal-digital-twin.pages.dev
```

3. Create the remote D1 database:

```bash
npm run db:create:remote
```

Copy the `database_id` value from Wrangler's output and replace the placeholder in `wrangler.jsonc`:

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

4. Apply remote D1 migrations:

```bash
npm run db:migrate:remote
```

5. Import the curated memory dataset into remote D1:

```bash
npm run ingest:openai-response:remote
npm run ingest:apply:remote
```

This reads local `openAIResponse.txt` and writes only to Cloudflare D1. The file
is ignored by git and should not be committed.

6. Set production secrets for Workers AI REST:

```bash
npm run secret:account
npm run secret:token
```

Use the same values currently stored locally in `.dev.vars`:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

`CLOUDFLARE_AI_MODEL` is configured in `wrangler.jsonc` because it is not secret.

## Deploy

```bash
npm run deploy
```

For a preview branch deployment:

```bash
npm run deploy:preview
```

## Verify after deploy

Open:

```text
https://kunal-digital-twin.pages.dev/api/chat
```

Expected shape:

```json
{
  "ok": true,
  "d1BindingAvailable": true,
  "aiRestConfigured": true
}
```

Then test the UI:

```text
https://kunal-digital-twin.pages.dev
```

After a message, the API response should include:

```json
{
  "retrievalMode": "workers-ai",
  "aiEnabled": true,
  "memoryStore": "d1"
}
```

## Notes

- Do not commit `.dev.vars`.
- `npm run dev` remains the normal local flow.
- `npm run dev:ai` may still fail on this machine because Laravel Valet intercepts `*.dev`; the REST path is the local workaround.
- Remote D1 data is separate from local D1 data. Run remote migrations before deploying.
- Remote memory import scripts require the real D1 `database_id` in `wrangler.jsonc`.
- When your ChatGPT export arrives, import locally first, curate memories, then decide whether to promote selected memory rows to remote D1.
