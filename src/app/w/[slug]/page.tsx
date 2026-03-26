import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { LikeButton } from "@/components/like-button";
import { PublishedWorkflowViewBeacon } from "@/components/published-workflow-view-beacon";
import { PublishedWorkflowShowcase } from "@/components/published-workflow-showcase";
import { RemixButton } from "@/components/remix-button";
import { extractGraphMediaHints } from "@/lib/graph-media-hints";
import { prisma } from "@/lib/db";
import {
  buildExemplarPreviewByNodeId,
  flattenExemplarGallery,
} from "@/lib/published-exemplar";
import { safeParseWorkflowGraph } from "@/lib/workflow-graph";

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

  const exemplarRun = await prisma.run.findFirst({
    where: {
      workflowId: wf.id,
      userId: wf.userId,
      status: "succeeded",
    },
    orderBy: { finishedAt: "desc" },
    include: { steps: true },
  });

  const exemplarSteps = exemplarRun?.steps ?? [];
  const exemplarPreviewByNodeId = buildExemplarPreviewByNodeId(exemplarSteps);
  const exemplarGallery = flattenExemplarGallery(exemplarSteps);
  const flowKey = `${wf.id}-${exemplarRun?.id ?? "no-run"}`;

  const parsedGraph = safeParseWorkflowGraph(wf.graphJson);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <PublishedWorkflowViewBeacon slug={slug} />
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Published workflow</p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-100">{wf.title ?? "Untitled"}</h1>
      <p className="mt-2 text-sm text-zinc-400">
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
            <span className="text-sm text-zinc-400">♡ {wf._count.likes}</span>
            <Link href="/login" className="text-sm font-medium text-orange-400 underline-offset-4 hover:underline">
              Log in to like or remix
            </Link>
          </>
        )}
      </div>

      {wf.coverImageUrl && /^https?:\/\//i.test(wf.coverImageUrl) ? (
        <div className="motion-reduce:transition-none relative mt-10 overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher CDN URLs */}
          <img
            src={wf.coverImageUrl}
            alt=""
            className="h-auto max-h-[420px] w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
          />
        </div>
      ) : null}

      <div className="mt-10">
        {parsedGraph.success ? (
          <PublishedWorkflowShowcase
            flowKey={flowKey}
            graph={parsedGraph.data}
            graphMediaHints={extractGraphMediaHints(parsedGraph.data)}
            exemplarGallery={exemplarGallery}
            exemplarPreviewByNodeId={exemplarPreviewByNodeId}
          />
        ) : (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3">
            <p className="text-sm text-red-300">This published workflow has an invalid graph and cannot be previewed.</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-zinc-400">Raw graph JSON</summary>
              <pre className="mt-2 max-h-64 overflow-auto text-xs text-zinc-400">
                {wf.graphJson.slice(0, 4000)}
                {wf.graphJson.length > 4000 ? "…" : ""}
              </pre>
            </details>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-zinc-400">
        Copy the share link:{" "}
        <code className="rounded border border-white/10 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-sm text-zinc-200">
          /w/{wf.slug}
        </code>
      </p>
    </div>
  );
}
