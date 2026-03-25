# Carrot Parrot Community

Visual **AI workflow** editor built with [Next.js](https://nextjs.org): compose node graphs backed by [fal.ai](https://fal.ai) models, run them asynchronously via webhooks, then **publish**, **remix**, and **like** workflows in a simple community feed.

## Features

- **Studio** — XYFlow-based graph editor; nodes map to fal models (metadata from `/api/models`).
- **Runs** — DAG execution with persisted steps and artifacts; completion handled via `/api/webhooks/fal`.
- **Community** — Publish workflows, public pages at `/w/[slug]`, discovery feed, likes, remix (fork).

## Stack

- Next.js (App Router), React 19, TypeScript, Tailwind CSS  
- Prisma + SQLite (default local DB)  
- Auth.js (NextAuth v5) with credentials registration  
- `@fal-ai/client` for queue/subscribe runs  

## Prerequisites

- Node.js 20+  
- A [fal.ai](https://fal.ai) API key (`FAL_KEY`)  
- For local webhooks, a publicly reachable `NEXT_PUBLIC_APP_URL` (e.g. [ngrok](https://ngrok.com) or similar) so fal can POST back to your machine  

## Setup

```bash
git clone https://github.com/Kakoedlinnoeslovo/carrot_parrot_community.git
cd carrot_parrot_community
npm install
cp .env.example .env
# Edit .env: AUTH_SECRET, FAL_KEY, NEXT_PUBLIC_APP_URL, DATABASE_URL as needed
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register an account, create workflows in **Studio**, and explore **Community**.

## Environment

See [`.env.example`](./.env.example) for all variables. Important:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Prisma connection string (default SQLite file) |
| `AUTH_SECRET` | Session encryption (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL (webhook base) |
| `FAL_KEY` | Server-side fal API key |
| `MAX_*` / `ALLOWED_RUN_EMAILS` | Optional test-phase guardrails |

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

## License

Private / unspecified — set a `LICENSE` file if you open-source the repo.
