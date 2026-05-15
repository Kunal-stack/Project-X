# Kunal Digital Twin

A one-page public AI chatbot showcase that answers in a style shaped around Kunal's mindset, memories, and project context.

The app uses a clean chat UI, a calm canvas starfield background, Cloudflare Pages Functions for the API, Workers AI for model responses, and D1 for stored memories. It is transparent that this is an AI demo, not the real Kunal or a private communication channel.

## Stack

- Frontend: HTML, CSS, JavaScript, canvas animation
- Backend: Cloudflare Pages Functions
- AI: Cloudflare Workers AI
- Memory store: Cloudflare D1, with local seed fallback
- Ingestion: local scripts for ChatGPT export JSON, notes, and curated memory candidates

## Local Development

Install dependencies:

```bash
npm install
```

Create `.dev.vars` with:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_workers_ai_token
```

Run local migrations:

```bash
npm run db:migrate:local
```

Start the local app:

```bash
npm run dev
```

Then open:

```text
http://localhost:8788
```

## Checks

```bash
npm run check
npm run build
```

## Deployment

Cloudflare deployment steps are documented in:

```text
docs/deployment.md
```

The deployment target is Cloudflare Pages:

```text
kunal-digital-twin.pages.dev
```

## Ingestion

When the ChatGPT export arrives, follow:

```text
docs/ingestion-workflow.md
```

The ingestion flow imports source conversations, extracts memory candidates, lets you review them, and applies approved memories into D1.

The temporary curated dataset flow is:

```bash
npm run ingest:openai-response
npm run ingest:apply
```

For production D1, after the Cloudflare D1 database exists and migrations are applied:

```bash
npm run ingest:openai-response:remote
npm run ingest:apply:remote
```
