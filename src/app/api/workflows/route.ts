import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WORKFLOW_GRAPH } from "@/lib/default-graph";
import { assertAcyclic, workflowGraphSchema } from "@/lib/workflow-graph";
import {
  analyzeMarketingVideoFromUrl,
  type MarketingVideoAnalysis,
  parseMarketingVideoAnalysis,
} from "@/lib/marketing-video-analyzer";
import {
  buildReplicateManualKeyframeWorkflowFromVideoUrl,
  buildReplicateWorkflowFromVideoUrl,
} from "@/lib/replicate-marketing-template";

/** Long-running: download + OpenCV segmentation + optional Whisper/Tesseract. */
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      visibility: true,
      slug: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ workflows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  let graphJson: string;
  let title = "Untitled workflow";

  const rawBody = await req.json().catch(() => null);
  if (
    rawBody &&
    typeof rawBody === "object" &&
    !Array.isArray(rawBody) &&
    (rawBody as { template?: string }).template === "replicate-marketing-ad"
  ) {
    const videoUrl = String((rawBody as { videoUrl?: string }).videoUrl ?? "").trim();
    if (!/^https?:\/\//i.test(videoUrl)) {
      return NextResponse.json({ error: "videoUrl must be a valid http(s) URL" }, { status: 400 });
    }
    const runAnalyze = Boolean((rawBody as { analyze?: boolean }).analyze);
    const rawAnalysis = (rawBody as { analysis?: unknown }).analysis;
    try {
      let analysis: MarketingVideoAnalysis | undefined;
      if (runAnalyze) {
        analysis = await analyzeMarketingVideoFromUrl(videoUrl);
      } else if (rawAnalysis != null && typeof rawAnalysis === "object") {
        const parsed = parseMarketingVideoAnalysis(rawAnalysis);
        if (!parsed.ok) {
          return NextResponse.json(
            { error: "Invalid analysis JSON", details: parsed.error.flatten() },
            { status: 400 },
          );
        }
        analysis = parsed.data;
      }
      const includeSpeechOcr = (rawBody as { includeSpeechOcrInPrompts?: boolean }).includeSpeechOcrInPrompts;
      const mergeOpts =
        includeSpeechOcr === false ? { includeSpeech: false, includeOcr: false } : undefined;
      /** Default `manual`: `video_keyframe_picker` + `extract_keyframes_manual`. Pass `optical_flow` for `input_video` + `extract_keyframes`. */
      const keyframeMode = String((rawBody as { keyframeMode?: string }).keyframeMode ?? "manual").toLowerCase();
      const useOpticalFlow = keyframeMode === "optical_flow";
      const graph = useOpticalFlow
        ? buildReplicateWorkflowFromVideoUrl(videoUrl, analysis, mergeOpts)
        : buildReplicateManualKeyframeWorkflowFromVideoUrl(videoUrl, analysis, mergeOpts);
      graphJson = JSON.stringify(graph);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const t = (rawBody as { title?: string }).title;
    if (typeof t === "string" && t.trim()) {
      title = t.trim().slice(0, 200);
    } else {
      title = "Marketing ad replica";
    }
  } else {
    graphJson = JSON.stringify(DEFAULT_WORKFLOW_GRAPH);
  }

  const parsed = workflowGraphSchema.safeParse(JSON.parse(graphJson));
  if (!parsed.success) {
    return NextResponse.json({ error: "Graph invalid" }, { status: 500 });
  }
  assertAcyclic(parsed.data);

  const wf = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      title,
      graphJson,
      visibility: "private",
    },
  });

  return NextResponse.json({ workflow: wf });
}
