"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function RemixButton({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remix() {
    setPending(true);
    const res = await fetch(`/api/workflows/${workflowId}/remix`, { method: "POST" });
    setPending(false);
    if (!res.ok) return;
    const j = (await res.json()) as { workflow?: { id: string } };
    if (j.workflow?.id) {
      track(AnalyticsEvent.communityRemixSuccess, {
        sourceWorkflowId: workflowId,
        newWorkflowId: j.workflow.id,
      });
      router.push(`/studio/${j.workflow.id}`);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void remix()}
      className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-[background-color,border-color] duration-300 ease-out hover:border-white/25 hover:bg-white/10 disabled:opacity-50"
    >
      {pending ? "…" : "Remix"}
    </button>
  );
}
