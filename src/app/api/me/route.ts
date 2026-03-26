import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasEffectiveFalApiKey, userHasStoredFalKey } from "@/lib/fal-effective-key";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const [hasStoredFalKey, effective] = await Promise.all([
    userHasStoredFalKey(userId),
    hasEffectiveFalApiKey(userId),
  ]);
  return NextResponse.json({
    hasStoredFalKey,
    hasEffectiveFalKey: effective,
  });
}
