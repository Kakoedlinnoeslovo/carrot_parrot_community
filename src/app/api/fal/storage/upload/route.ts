import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fal } from "@/lib/fal-client";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: "FAL_KEY is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const blob = file as Blob;
  if (blob.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)}MB)` }, { status: 400 });
  }

  try {
    const url = await fal.storage.upload(blob);
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
