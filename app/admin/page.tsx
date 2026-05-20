import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Choice = "a" | "b" | "tie" | "bad";

type Row = {
  pair_id: string;
  option_a_label: string | null;
  option_b_label: string | null;
  choice: Choice | null;
  labeler_id: string | null;
  labeler_email: string | null;
  view_duration_ms: number | null;
  created_at: string | null;
};

type Pair = {
  a: string;
  b: string;
  votes: Row[];
};

export default async function AdminPage() {
  const supabase = await createClient();

  const [
    { count: totalVideos },
    { count: totalPairs },
    { count: totalLabels },
    { data: rows },
  ] = await Promise.all([
    supabase.from("videos").select("*", { count: "exact", head: true }),
    supabase.from("pairs").select("*", { count: "exact", head: true }),
    supabase.from("labels").select("*", { count: "exact", head: true }),
    supabase.rpc("get_pair_results"),
  ]);

  const results = (rows ?? []) as Row[];

  const byPair = new Map<string, Pair>();
  for (const r of results) {
    if (!byPair.has(r.pair_id)) {
      byPair.set(r.pair_id, {
        a: r.option_a_label ?? "?",
        b: r.option_b_label ?? "?",
        votes: [],
      });
    }
    if (r.choice) byPair.get(r.pair_id)!.votes.push(r);
  }

  let completed = 0;
  let partial = 0;
  let untouched = 0;
  for (const [, p] of byPair) {
    const n = p.votes.length;
    if (n === 0) untouched++;
    else if (n >= 3) completed++;
    else partial++;
  }
  const coverage = totalPairs
    ? `${Math.round((completed / totalPairs) * 100)}%`
    : "0%";

  const orderedPairs = [...byPair.entries()].sort((x, y) =>
    x[1].a.localeCompare(y[1].a)
  );

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <a href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Back to labeling
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Videos" value={totalVideos ?? 0} />
        <Stat label="Pairs" value={totalPairs ?? 0} />
        <Stat label="Total labels" value={totalLabels ?? 0} />
        <Stat label="Coverage" value={coverage} />
        <Stat label="Completed (3/3)" value={completed} />
        <Stat label="In progress" value={partial} />
        <Stat label="Untouched" value={untouched} />
      </div>

      <h2 className="text-lg font-semibold mb-3">Per-pair results</h2>
      <div className="space-y-3">
        {orderedPairs.length === 0 && (
          <p className="text-sm text-neutral-500">
            No pairs yet. Add videos and pairs in the Supabase SQL editor.
          </p>
        )}
        {orderedPairs.map(([pairId, info]) => (
          <PairCard key={pairId} a={info.a} b={info.b} votes={info.votes} />
        ))}
      </div>
    </main>
  );
}

function PairCard({ a, b, votes }: { a: string; b: string; votes: Row[] }) {
  const c = {
    a: votes.filter((v) => v.choice === "a").length,
    b: votes.filter((v) => v.choice === "b").length,
    tie: votes.filter((v) => v.choice === "tie").length,
    bad: votes.filter((v) => v.choice === "bad").length,
  };
  const total = votes.length;

  let statusText = "Untouched";
  let statusColor = "text-neutral-600";
  if (total >= 3) {
    if (c.a > c.b) {
      statusText = `${a} wins (${c.a}-${c.b})`;
      statusColor = "text-green-400";
    } else if (c.b > c.a) {
      statusText = `${b} wins (${c.b}-${c.a})`;
      statusColor = "text-green-400";
    } else {
      statusText = `Tied (${c.a}-${c.b})`;
      statusColor = "text-yellow-400";
    }
  } else if (total > 0) {
    statusText = `${total}/3 labels`;
    statusColor = "text-neutral-400";
  }

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="text-sm">
          <span className="font-medium">{a}</span>
          <span className="text-neutral-500 mx-2">vs</span>
          <span className="font-medium">{b}</span>
        </div>
        <div className={`text-xs ${statusColor} whitespace-nowrap`}>
          {statusText}
        </div>
      </div>
      {votes.length > 0 && (
        <div className="space-y-1 text-xs mt-3">
          {votes.map((v) => (
            <div
              key={v.labeler_id ?? v.created_at ?? Math.random()}
              className="flex items-center gap-3 font-mono"
            >
              <span className="text-neutral-500 truncate flex-1">
                {v.labeler_email ?? "unknown"}
              </span>
              <ChoiceBadge
                choice={v.choice as Choice}
                aLabel={a}
                bLabel={b}
              />
              <span className="text-neutral-600 w-12 text-right">
                {v.view_duration_ms
                  ? `${(v.view_duration_ms / 1000).toFixed(1)}s`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChoiceBadge({
  choice,
  aLabel,
  bLabel,
}: {
  choice: Choice;
  aLabel: string;
  bLabel: string;
}) {
  const text = choice === "a" ? aLabel : choice === "b" ? bLabel : choice;
  const cls =
    choice === "a"
      ? "bg-blue-900/60 text-blue-200"
      : choice === "b"
      ? "bg-purple-900/60 text-purple-200"
      : choice === "tie"
      ? "bg-neutral-800 text-neutral-300"
      : "bg-red-900/60 text-red-300";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${cls} truncate max-w-xs`}>
      {text}
    </span>
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
