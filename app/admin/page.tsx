import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PairProgress = {
  pair_id: string;
  label_count: number;
  votes_a: number;
  votes_b: number;
  votes_tie: number;
  votes_bad: number;
};

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ count: totalPairs }, { count: totalLabels }, { count: totalVideos }] =
    await Promise.all([
      supabase.from("pairs").select("*", { count: "exact", head: true }),
      supabase.from("labels").select("*", { count: "exact", head: true }),
      supabase.from("videos").select("*", { count: "exact", head: true }),
    ]);

  const { data: progress } = await supabase.from("pair_progress").select("*");
  const rows = (progress ?? []) as PairProgress[];

  const completed = rows.filter((p) => p.label_count >= 3).length;
  const partial = rows.filter((p) => p.label_count > 0 && p.label_count < 3).length;
  const untouched = (totalPairs ?? 0) - completed - partial;

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <a href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Back to labeling
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Videos" value={totalVideos ?? 0} />
        <Stat label="Pairs" value={totalPairs ?? 0} />
        <Stat label="Total labels" value={totalLabels ?? 0} />
        <Stat
          label="Coverage"
          value={
            totalPairs ? `${Math.round((completed / totalPairs) * 100)}%` : "0%"
          }
        />
        <Stat label="Completed (3/3)" value={completed} />
        <Stat label="In progress" value={partial} />
        <Stat label="Untouched" value={untouched} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="text-neutral-400 text-sm">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
