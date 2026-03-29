import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzeMarketingVideoFromUrl } from "@/lib/marketing-video-analyzer";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const videoUrl = typeof raw === "object" && raw && "videoUrl" in raw ? String((raw as { videoUrl?: string }).videoUrl ?? "").trim() : "";
  if (!/^https?:\/\//i.test(videoUrl)) {
    return NextResponse.json({ error: "videoUrl must be a valid http(s) URL" }, { status: 400 });
  }

  try {
    const analysis = await analyzeMarketingVideoFromUrl(videoUrl);
    return NextResponse.json({ analysis });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
