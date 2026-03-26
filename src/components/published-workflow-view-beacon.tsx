"use client";

import { useEffect } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function PublishedWorkflowViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    track(AnalyticsEvent.publishedWorkflowView, { slug });
  }, [slug]);

  return null;
}
