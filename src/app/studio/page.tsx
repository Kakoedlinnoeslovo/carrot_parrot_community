import Link from "next/link";
import { auth } from "@/auth";
import { NewWorkflowForm } from "@/components/new-workflow-form";
import { prisma } from "@/lib/db";

export default async function StudioIndexPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      visibility: true,
      updatedAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-100">Your workflows</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/studio/create"
            className="rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-950/70"
          >
            Create from video
          </Link>
          <NewWorkflowForm />
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Open the canvas, connect nodes, and run on your fal.ai quota. Change your key anytime under{" "}
        <Link href="/settings/fal-key" className="text-orange-400 underline-offset-4 hover:underline">
          fal key
        </Link>
        .
      </p>

      <ul className="mt-10 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_20px_56px_-28px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        {workflows.length === 0 && (
          <li className="px-4 py-8 text-center text-zinc-400">No workflows yet. Create one.</li>
        )}
        {workflows.map((w) => (
          <li key={w.id}>
            <Link
              href={`/studio/${w.id}`}
              className="flex items-center justify-between px-4 py-4 transition-colors duration-300 ease-out hover:bg-white/5"
            >
              <span className="font-medium text-zinc-100">{w.title ?? "Untitled"}</span>
              <span className="text-xs text-zinc-500">
                {w.visibility === "published" ? "Published" : "Private"} ·{" "}
                {w.updatedAt.toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
