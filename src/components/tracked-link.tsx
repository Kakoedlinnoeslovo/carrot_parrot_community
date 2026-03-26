"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

type Props = Omit<ComponentProps<typeof Link>, "onClick"> & {
  /** Short label for the dashboard (e.g. "nav_community", "hero_get_started"). */
  eventLabel: string;
};

export function TrackedLink({ eventLabel, href, children, ...rest }: Props) {
  const hrefStr = typeof href === "string" ? href : "";

  return (
    <Link
      href={href}
      {...rest}
      onClick={() => {
        track(AnalyticsEvent.navCtaClick, { label: eventLabel, href: hrefStr || "_" });
      }}
    >
      {children}
    </Link>
  );
}
