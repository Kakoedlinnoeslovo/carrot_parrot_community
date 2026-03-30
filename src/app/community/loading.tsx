export default function CommunityLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-4 max-w-xl animate-pulse rounded bg-zinc-800/80" />
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-20 animate-pulse rounded-full bg-zinc-800" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-zinc-800" />
        </div>
      </div>

      <div className="mt-10 columns-2 gap-4 sm:columns-3 lg:columns-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40"
          >
            <div className="aspect-[4/5] animate-pulse bg-zinc-800" />
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-800" />
                <div className="h-3 flex-1 animate-pulse rounded bg-zinc-800/80" />
              </div>
              <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
              <div className="flex gap-2 pt-2">
                <div className="h-8 flex-1 animate-pulse rounded-lg bg-zinc-800/80" />
                <div className="h-8 w-16 animate-pulse rounded-lg bg-zinc-800/80" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
