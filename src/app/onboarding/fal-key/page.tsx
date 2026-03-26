import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FalApiKeyForm } from "@/components/fal-api-key-form";
import { hasEffectiveFalApiKey } from "@/lib/fal-effective-key";

export default async function OnboardingFalKeyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (await hasEffectiveFalApiKey(session.user.id)) {
    redirect("/studio");
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-100">Connect fal.ai</h1>
      <p className="mt-2 text-sm text-zinc-400">One step to run workflows on your own fal.ai quota.</p>
      <div className="mt-10">
        <FalApiKeyForm variant="onboarding" />
      </div>
      <p className="mt-8 text-center text-xs text-zinc-500">Use Sign out in the header to switch accounts.</p>
    </div>
  );
}
