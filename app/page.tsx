import { createClient } from "@/lib/supabase/server";
import { getNextPair } from "./actions";
import { LabelingInterface } from "@/components/LabelingInterface";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const pair = await getNextPair();

  const { count } = await supabase
    .from("labels")
    .select("*", { count: "exact", head: true })
    .eq("labeler_id", user!.id);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800">
        <div className="text-sm">
          <span className="font-semibold">A/B Labeling</span>
          <span className="text-neutral-400 ml-3">
            {user!.email} · {count ?? 0} submitted
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-neutral-400 hover:text-white">
            Progress
          </a>
          <SignOutButton />
        </div>
      </header>
      <LabelingInterface initialPair={pair} />
    </main>
  );
}
