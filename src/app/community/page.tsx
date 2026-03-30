import Link from "next/link";
import { auth } from "@/auth";
import { CommunityWorkflowCard } from "@/components/community-workflow-card";
import { communityFeedCardFromWorkflowRow } from "@/lib/published-feed-meta";
import { prisma } from "@/lib/db";
import {
  listPublishedWorkflowsForFeed,
  type PublishedFeedSort,
} from "@/lib/published-community-query";

type PageProps = { searchParams: Promise<{ sort?: string }> };

export default async function CommunityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sort: PublishedFeedSort = sp.sort === "trending" ? "trending" : "recent";

  const [session, workflows] = await Promise.all([
    auth(),
    listPublishedWorkflowsForFeed({
      sort,
      take: 36,
      requireSlug: true,
    }),
  ]);

  const likedIds = new Set<string>();
  if (session?.user?.id) {
    const likes = await prisma.like.findMany({
      where: {
        userId: session.user.id,
        workflowId: { in: workflows.map((w) => w.id) },
      },
      select: { workflowId: true },
    });
    for (const l of likes) likedIds.add(l.workflowId);
  }

  const tabBase =
    "rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,border-color] duration-300 ease-out";
  const tabActive = "border border-orange-500/40 bg-orange-500/15 text-orange-200";
  const tabIdle =
    "border border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/15 hover:bg-white/[0.07] hover:text-zinc-200";

  const withSlug = workflows.filter(
    (w): w is (typeof w) & { slug: string } => typeof w.slug === "string" && w.slug.length > 0,
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Community</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Published workflows — open a style, like it, or remix into your studio.
          </p>
          <p className="mt-1 text-xs text-zinc-500">{withSlug.length} workflow{withSlug.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sort workflows">
          <Link
            href="/community"
            className={`${tabBase} ${sort === "recent" ? tabActive : tabIdle}`}
            aria-current={sort === "recent" ? "page" : undefined}
          >
            Recent
          </Link>
          <Link
            href="/community?sort=trending"
            className={`${tabBase} ${sort === "trending" ? tabActive : tabIdle}`}
            aria-current={sort === "trending" ? "page" : undefined}
          >
            Trending
          </Link>
        </div>
      </div>

      <div className="mt-10 columns-2 gap-4 sm:columns-3 lg:columns-4">
        {withSlug.map((w, i) => {
          const { preview, modelsUsed } = communityFeedCardFromWorkflowRow({
            coverImageUrl: w.coverImageUrl,
            coverPreviewKind: w.coverPreviewKind,
            graphJson: w.graphJson,
            publishedFeedMetaJson: w.publishedFeedMetaJson,
          });
          return (
            <CommunityWorkflowCard
              key={w.id}
              workflowId={w.id}
              slug={w.slug}
              title={w.title}
              preview={preview}
              modelsUsed={modelsUsed}
              authorName={w.user.name}
              authorEmail={w.user.email}
              authorImage={w.user.image}
              likeCount={w._count.likes}
              initialLiked={likedIds.has(w.id)}
              isLoggedIn={!!session?.user}
              index={i}
            />
          );
        })}
      </div>

      {withSlug.length === 0 && (
        <p className="mt-16 text-center text-zinc-400">
          Nothing published yet. Publish from the studio.
        </p>
      )}
    </div>
  );
}
