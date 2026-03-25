import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createWorkflowAction } from "@/app/studio/actions";

export default async function StudioIndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-50">Your workflows</h1>
        <form action={createWorkflowAction}>
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
          >
            New workflow
          </button>
        </form>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        Open the canvas, connect nodes, and run with your fal.ai key on the server.
      </p>

      <ul className="mt-10 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {workflows.length === 0 && (
          <li className="px-4 py-8 text-center text-zinc-500">No workflows yet. Create one.</li>
        )}
        {workflows.map((w) => (
          <li key={w.id}>
            <Link
              href={`/studio/${w.id}`}
              className="flex items-center justify-between px-4 py-4 hover:bg-zinc-900/80"
            >
              <span className="font-medium text-zinc-200">{w.title ?? "Untitled"}</span>
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
