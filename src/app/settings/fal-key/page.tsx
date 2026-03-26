import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FalApiKeyForm } from "@/components/fal-api-key-form";

export default async function SettingsFalKeyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-100">fal.ai API key</h1>
      <p className="mt-2 text-sm text-zinc-400">Update or remove the key used for runs and model search.</p>
      <div className="mt-10">
        <FalApiKeyForm variant="settings" />
      </div>
    </div>
  );
}
