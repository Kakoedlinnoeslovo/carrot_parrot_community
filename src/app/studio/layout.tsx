import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasEffectiveFalApiKey } from "@/lib/fal-effective-key";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!(await hasEffectiveFalApiKey(session.user.id))) {
    redirect("/onboarding/fal-key");
  }
  return <>{children}</>;
}
