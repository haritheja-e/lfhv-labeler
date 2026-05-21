"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type Choice = "a" | "b" | "tie" | "bad";

export type NextPair = {
  pair_id: string;
  video_a_url: string;
  video_b_url: string;
  original_url: string | null;
  current_count: number;
} | null;

export async function getNextPair(excludeIds: string[] = []): Promise<NextPair> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_next_pair", {
    p_labeler_id: user.id,
    p_exclude_ids: excludeIds,
  });
  if (error) {
    console.error("get_next_pair error", error);
    return null;
  }
  return data?.[0] ?? null;
}

export async function submitLabel(
  pairId: string,
  choice: Choice,
  viewDurationMs?: number,
  excludeIds: string[] = []
): Promise<NextPair> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Upsert so the labeler can change their mind by navigating back.
  const { error } = await supabase
    .from("labels")
    .upsert(
      {
        pair_id: pairId,
        labeler_id: user.id,
        choice,
        view_duration_ms: viewDurationMs ?? null,
      },
      { onConflict: "pair_id,labeler_id" }
    );
  if (error) throw error;

  revalidatePath("/");
  return getNextPair(excludeIds);
}
