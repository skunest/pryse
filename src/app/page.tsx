"use client";
import { useEffect } from "react";

/**
 * Sends invite and reset links that land on the site root (for example when an
 * invite is sent from the Supabase dashboard) to /auth/confirm. Everyone else
 * goes to the dashboard.
 */
export default function Home() {
  useEffect(() => {
    const { search, hash } = window.location;
    const hasToken = /token_hash=|[?&]code=/.test(search) || /access_token=|error=/.test(hash);
    window.location.replace(hasToken ? `/auth/confirm${search}${hash}` : "/dashboard");
  }, []);
  return null;
}
