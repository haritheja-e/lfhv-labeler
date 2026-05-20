"use client";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button
      onClick={signOut}
      className="px-3 py-1 text-sm rounded border border-neutral-800 hover:bg-neutral-900"
    >
      Sign out
    </button>
  );
}
