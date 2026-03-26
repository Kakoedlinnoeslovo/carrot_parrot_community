import Link from "next/link";

import { HeroGraphDemo } from "@/components/hero-graph-demo";

const highlights = [
  { title: "Visual graph", body: "Wire inputs to outputs like a mini n8n—built for creative stacks." },
  { title: "Curated fal models", body: "Pick endpoints you trust; inputs stay typed to each model." },
  { title: "Share & remix", body: "Publish a slug, fork a remix—community without losing control." },
] as const;

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_85%_60%_at_50%_-10%,rgba(251,146,60,0.18),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_50%,rgba(251,191,36,0.12),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgba(24,24,27,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(24,24,27,0.06)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        aria-hidden
      />

      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-16">
          <div className="flex max-w-xl flex-col gap-8 lg:max-w-none">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
              fal.ai workflow studio
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-[1.08]">
              Build creative pipelines on a canvas. Share and remix with the community.
            </h1>
            <p className="text-lg leading-relaxed text-zinc-600">
              Connect curated fal models in a node graph—like n8n, but focused on your style. No
              subscriptions in this test build; guardrails protect your API spend.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/register"
                className="rounded-lg bg-orange-600 px-5 py-2.5 font-medium text-white shadow-[0_12px_32px_-8px_rgba(234,88,12,0.45)] transition-[background-color,box-shadow] duration-300 ease-out hover:bg-orange-500 hover:shadow-[0_16px_40px_-8px_rgba(234,88,12,0.5)]"
              >
                Get started
              </Link>
              <Link
                href="/community"
                className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 font-medium text-zinc-800 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] transition-[background-color,border-color,box-shadow] duration-300 ease-out hover:border-zinc-400 hover:bg-zinc-50"
              >
                Explore community
              </Link>
            </div>

            <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {highlights.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-zinc-200/90 bg-white/90 px-4 py-3 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-out hover:border-zinc-300 hover:shadow-[0_20px_56px_-24px_rgba(0,0,0,0.14)]"
                >
                  <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative lg:justify-self-end">
            <HeroGraphDemo />
          </div>
        </div>
      </main>
    </div>
  );
}
