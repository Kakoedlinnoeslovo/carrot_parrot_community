# Carrot Parrot Community

Visual **AI workflow** editor built with [Next.js](https://nextjs.org): compose node graphs backed by [fal.ai](https://fal.ai) models, run them asynchronously via webhooks, then **publish**, **remix**, and **like** workflows in a simple community feed.

## Screenshots

### Studio — multi-step workflow and run status

Build chains of inputs, fal model nodes, and a response node. The sidebar shows run progress, current model (for example `fal-ai/kling-video/v3/pro/image-to-video`), and ETA while steps execute.

![Studio workflow with image-to-video pipeline and running status](docs/screenshots/studio-workflow-running.png)

### Model search

Search models by keyword; results list the fal endpoint path and display name so you can paste the model into a node.

![Model search showing Kling Video endpoints](docs/screenshots/model-search-kling.png)

### Wiring image + prompt to a model

Connect an **IMAGE** node and **TEXT** node to a **FAL** node; map handles to the model’s inputs (here `fal-ai/nano-banana-2/edit` with `in` and `prompt`).

![Image and text inputs connected to a fal model node](docs/screenshots/workflow-nano-banana-edit.png)

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
