"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type NextPair = {
  pair_id: string;
  video_a_url: string;
  video_b_url: string;
  current_count: number;
} | null;

export async function getNextPair(): Promise<NextPair> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_next_pair", {
    p_labeler_id: user.id,
  });
  if (error) {
    console.error("get_next_pair error", error);
    return null;
  }
  return data?.[0] ?? null;
}

export async function submitLabel(
  pairId: string,
  choice: "a" | "b" | "tie" | "bad",
  viewDurationMs?: number
): Promise<NextPair> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("labels").insert({
    pair_id: pairId,
    labeler_id: user.id,
    choice,
    view_duration_ms: viewDurationMs ?? null,
  });
  if (error) throw error;

  revalidatePath("/");
  return getNextPair();
}

export async function undoLastLabel(): Promise<NextPair> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: last } = await supabase
    .from("labels")
    .select("id")
    .eq("labeler_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    await supabase.from("labels").delete().eq("id", last.id);
  }
  revalidatePath("/");
  return getNextPair();
}
