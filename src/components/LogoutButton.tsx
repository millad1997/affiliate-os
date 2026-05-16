"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface LogoutButtonProps {
  className?: string;
}

export default function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    // After sign-out, redirect to login. The session cookies are cleared by
    // Supabase Auth as part of signOut, so any subsequent page that checks
    // the session will correctly see no user.
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={
        className ??
        "text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
      }
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
