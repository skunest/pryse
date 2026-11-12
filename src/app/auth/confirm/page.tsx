"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/browser";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/components/ui";

/**
 * Landing page for invite and password-reset emails.
 * Handles ?token_hash=...&type=invite|recovery (recommended email templates),
 * ?code=... (PKCE) and #access_token=... (default Supabase templates).
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [msg] = useState("Checking your link");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.slice(1));
      try {
        if (h.get("error")) throw new Error(h.get("error_description") || "invalid");
        const tokenHash = q.get("token_hash");
        const type = (q.get("type") || "invite") as "invite" | "recovery" | "magiclink" | "signup" | "email";
        if (tokenHash) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        } else if (q.get("code")) {
          const { error } = await sb.auth.exchangeCodeForSession(q.get("code")!);
          if (error) throw error;
        } else if (h.get("access_token") && h.get("refresh_token")) {
          const { error } = await sb.auth.setSession({ access_token: h.get("access_token")!, refresh_token: h.get("refresh_token")! });
          if (error) throw error;
        } else {
          throw new Error("invalid");
        }
        router.replace("/set-password");
      } catch {
        router.replace("/login?error=invalid-link");
      }
    })();
  }, [router]);

  return (
    <AuthCard title="One moment">
      <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> {msg}...</div>
    </AuthCard>
  );
}
