import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encryptFalKey } from "@/lib/fal-key-crypto";
import { validateFalApiKey } from "@/lib/fal-platform";
import { z } from "zod";

const postSchema = z.object({
  key: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const check = await validateFalApiKey(parsed.data.key);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: "That key could not be verified with fal.ai",
        detail: check.detail,
        status: check.status,
      },
      { status: 400 },
    );
  }

  let enc: string;
  try {
    enc = encryptFalKey(parsed.data.key.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { falKeyEnc: enc },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { falKeyEnc: null },
  });

  return NextResponse.json({ ok: true });
}
