import { NextResponse } from "next/server";
import { ALLOWED_FAL_MODELS } from "@/lib/workflow-graph";

/** Curated node catalog for the editor (server-driven). */
export async function GET() {
  return NextResponse.json({
    models: ALLOWED_FAL_MODELS.map((id) => ({
      id,
      label: id.replace("fal-ai/", ""),
      kind: "image",
    })),
  });
}
