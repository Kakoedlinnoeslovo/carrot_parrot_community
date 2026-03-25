import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { LikeButton } from "@/components/like-button";
import { RemixButton } from "@/components/remix-button";
import { prisma } from "@/lib/db";

type PageProps = { params: Promise<{ slug: string }> };

export default async function PublicWorkflowPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();

  const wf = await prisma.workflow.findFirst({
    where: { slug, visibility: "published" },
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { likes: true } },
    },
  });

  if (!wf) notFound();

  let likedByMe = false;
  if (session?.user?.id) {
    const like = await prisma.like.findUnique({
      where: {
        userId_workflowId: { userId: session.user.id, workflowId: wf.id },
      },
    });
    likedByMe = !!like;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-wide text-orange-400/90">Published workflow</p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-50">{wf.title ?? "Untitled"}</h1>
      <p className="mt-2 text-sm text-zinc-500">
        by {wf.user.name ?? wf.user.email?.split("@")[0] ?? "Creator"}
      </p>
      {wf.description && <p className="mt-6 text-zinc-300">{wf.description}</p>}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {session?.user ? (
          <>
            <LikeButton
              workflowId={wf.id}
              initialLiked={likedByMe}
              initialCount={wf._count.likes}
            />
            <RemixButton workflowId={wf.id} />
          </>
        ) : (
          <>
            <span className="text-sm text-zinc-500">♡ {wf._count.likes}</span>
            <Link href="/login" className="text-sm text-orange-400 hover:underline">
              Log in to like or remix
            </Link>
          </>
        )}
      </div>

      <div className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-xs font-medium uppercase text-zinc-500">Graph snapshot</p>
        <pre className="mt-2 max-h-64 overflow-auto text-xs text-zinc-400">
          {wf.graphJson.slice(0, 2000)}
          {wf.graphJson.length > 2000 ? "…" : ""}
        </pre>
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Copy the share link:{" "}
        <code className="rounded bg-zinc-800 px-1 py-0.5 text-orange-300">
          /w/{wf.slug}
        </code>
      </p>
    </div>
  );
}
