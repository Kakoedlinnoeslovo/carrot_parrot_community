import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-24">
      <p className="text-sm font-medium uppercase tracking-widest text-orange-400/90">
        fal.ai workflow studio
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
        Build creative pipelines on a canvas. Share and remix with the community.
      </h1>
      <p className="text-lg leading-relaxed text-zinc-400">
        Connect curated fal models in a node graph—like n8n, but focused on your style. No
        subscriptions in this test build; guardrails protect your API spend.
      </p>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/register"
          className="rounded-lg bg-orange-500 px-5 py-2.5 font-medium text-white hover:bg-orange-400"
        >
          Get started
        </Link>
        <Link
          href="/community"
          className="rounded-lg border border-zinc-600 px-5 py-2.5 font-medium text-zinc-200 hover:border-zinc-500"
        >
          Explore community
        </Link>
      </div>
    </main>
  );
}
