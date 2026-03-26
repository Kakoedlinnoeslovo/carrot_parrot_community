"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function LikeButton({
  workflowId,
  initialLiked,
  initialCount,
}: {
  workflowId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggle() {
    const method = liked ? "DELETE" : "POST";
    const res = await fetch(`/api/workflows/${workflowId}/like`, { method });
    if (!res.ok) return;
    const j = (await res.json()) as { liked: boolean; likeCount: number };
    setLiked(j.liked);
    setCount(j.likeCount);
    track(AnalyticsEvent.communityLikeToggle, {
      workflowId,
      liked: j.liked,
      likeCount: j.likeCount,
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-zinc-200 transition-[background-color,border-color] duration-300 ease-out hover:border-white/25 hover:bg-white/10"
    >
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
