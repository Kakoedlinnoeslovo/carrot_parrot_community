import { HeroGraphDemo } from "@/components/hero-graph-demo";
import { TrackedLink } from "@/components/tracked-link";

const highlights = [
  {
    title: "Visual graph",
    body: "Drag steps onto a canvas and connect outputs to inputs—like wiring a diagram, not writing glue code.",
  },
  {
    title: "Ready-made model steps",
    body: "Each node calls a real AI model on fal.ai with typed inputs, so you connect the right kind of data each time.",
  },
  {
    title: "Share and remix",
    body: "Publish a link, let others like your workflow, or remix it into their own copy in one click.",
  },
] as const;

const steps = [
  { n: "1", title: "Create an account", body: "Sign up free—your fal.ai API key stays on the server when you run workflows." },
  { n: "2", title: "Open Studio", body: "Add input nodes, model nodes, and a preview—then draw lines between ports." },
  { n: "3", title: "Run and publish", body: "Execute the graph with your key, tweak results, then share to the community if you want." },
] as const;

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-zinc-950"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(251,146,60,0.22),transparent_55%),radial-gradient(ellipse_65%_45%_at_100%_30%,rgba(167,139,250,0.12),transparent_50%),radial-gradient(ellipse_50%_40%_at_0%_80%,rgba(251,191,36,0.08),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]"
        aria-hidden
      />

      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-16">
          <div className="home-fade-up flex max-w-xl flex-col gap-8 lg:max-w-none">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
              Visual AI workflows
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl sm:leading-[1.08]">
              Chain AI models on a canvas—then share your pipeline with the community.
            </h1>
            <div className="space-y-4 text-lg leading-relaxed text-zinc-400">
              <p>
                <strong className="font-medium text-zinc-200">fal.ai</strong> is a hosted service that runs AI models in
                the cloud (images, video, and more). You sign up there, get an{" "}
                <strong className="font-medium text-zinc-300">API key</strong>, and call models without provisioning
                GPUs.
              </p>
              <p>
                <strong className="font-medium text-zinc-200">Carrot Parrot</strong> is the visual editor on top: connect
                nodes, wire outputs to inputs, and run the whole pipeline. Your key is used{" "}
                <strong className="font-medium text-zinc-300">on the server</strong>—not in the browser—with guardrails to
                help protect your usage.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <TrackedLink
                href="/register"
                eventLabel="hero_get_started"
                className="rounded-lg bg-orange-500 px-5 py-2.5 font-medium text-white shadow-[0_12px_32px_-8px_rgba(234,88,12,0.55)] transition-[background-color,box-shadow,transform] duration-300 ease-out hover:bg-orange-400 hover:shadow-[0_16px_40px_-8px_rgba(234,88,12,0.6)] motion-safe:hover:-translate-y-0.5"
              >
                Get started
              </TrackedLink>
              <TrackedLink
                href="/community"
                eventLabel="hero_explore_community"
                className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 font-medium text-zinc-100 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md transition-[background-color,border-color,transform] duration-300 ease-out hover:border-white/25 hover:bg-white/10 motion-safe:hover:-translate-y-0.5"
              >
                Explore community
              </TrackedLink>
            </div>

            <TrackedLink
              href="https://fal.ai"
              eventLabel="hero_learn_fal_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-orange-400/90 underline-offset-4 transition-colors duration-300 hover:text-orange-300 hover:underline"
            >
              Learn more about fal.ai
              <span aria-hidden>↗</span>
            </TrackedLink>

            <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {highlights.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_20px_56px_-28px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-[border-color,transform] duration-300 ease-out hover:border-white/15 motion-safe:hover:-translate-y-0.5"
                >
                  <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-fade-up-delay relative lg:justify-self-end">
            <HeroGraphDemo />
          </div>
        </div>

        <section
          aria-labelledby="how-it-works-heading"
          className="mt-24 rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-10"
        >
          <h2 id="how-it-works-heading" className="text-lg font-semibold text-zinc-100">
            What you&apos;ll do here
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-xl border border-white/5 bg-zinc-950/40 p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20 font-mono text-sm font-semibold text-orange-300">
                  {s.n}
                </span>
                <p className="mt-4 font-medium text-zinc-100">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
