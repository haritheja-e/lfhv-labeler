"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-green-400">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 outline-none focus:border-neutral-600"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="px-3 py-2 rounded bg-white text-black font-medium disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send link"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
