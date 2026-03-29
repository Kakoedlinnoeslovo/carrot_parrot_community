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

Connect an **IMAGE** node and **TEXT** node to a **FAL** node; map each wire to the model’s **named** inputs (here `fal-ai/nano-banana-2/edit` with `prompt` plus image fields such as `image_urls`).

![Image and text inputs connected to a fal model node](docs/screenshots/workflow-nano-banana-edit.png)

### VLM / LLM text into the next model’s `prompt`

Models such as [`openrouter/router/vision`](https://fal.ai/models/openrouter/router/vision) return a JSON object with an `output` string (caption), not image URLs. In this studio, each fal node exposes a single **`out`** port typed as **text + media URLs**: connect **`out`** to the next node’s **`prompt`** (or **`image_url`**, **`start_image_url`**, etc.) by attaching to that input’s handle. The runner stores captions in artifacts so **`prompt`** wires get plain text. On fal’s hosted Workflow editor, map the vision model’s string output into **`prompt`** the same way—do not pass the whole JSON object into a string field.

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
- A [fal.ai](https://fal.ai) API key per user (saved after sign-up, encrypted with `AUTH_SECRET`) or an optional operator key `FAL_KEY` for dev / shared billing  
- For local webhooks, a publicly reachable `NEXT_PUBLIC_APP_URL` (e.g. [ngrok](https://ngrok.com) or similar) so fal can POST back to your machine  
- **FFmpeg** — `ffmpeg` and `ffprobe` on the server `PATH` for `media_process` nodes (extract audio/frames, concat, mux, scene helpers). Outputs upload via fal storage; large videos may need long timeouts or a background worker instead of a serverless request.

## Setup

```bash
git clone https://github.com/Kakoedlinnoeslovo/carrot_parrot_community.git
cd carrot_parrot_community
npm install
cp .env.example .env
# Edit .env: AUTH_SECRET (required for encrypting user fal keys), NEXT_PUBLIC_APP_URL, DATABASE_URL. FAL_KEY is optional if every user adds their own key.
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
| `FAL_KEY` | Optional server fal key (fallback if a user has not saved their own) |
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
