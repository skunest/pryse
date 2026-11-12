"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client, used for sign-in only. All data goes through /api. */
export function supabase() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
    });
  }
  return client;
}

export class ApiFail extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Calls this app's API with the signed-in user's token. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; noRedirect?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = await token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const { json: _j, noRedirect: _n, ...rest } = init;
  const res = await fetch(`/api${path}`, { ...rest, headers, body, cache: "no-store" });
  if (res.status === 401 && !init.noRedirect && typeof window !== "undefined" && !path.startsWith("/public")) {
    await supabase().auth.signOut();
    window.location.href = "/login?expired=1";
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    if (!res.ok) throw new ApiFail(res.status, "Something went wrong");
    return (await res.blob()) as unknown as T;
  }
  const data = await res.json();
  if (!res.ok) throw new ApiFail(res.status, data?.error?.message || "Something went wrong", data?.error?.code);
  return data as T;
}

/** Opens a PDF from an authenticated endpoint in a new tab (or downloads it). */
export async function openPdf(path: string, download = false, name = "document.pdf") {
  const w = download ? null : window.open("", "_blank");
  try {
    const blob = await api<Blob>(path + (download ? (path.includes("?") ? "&" : "?") + "download=1" : ""));
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
    } else if (w) {
      w.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
}

export const toCents = (v: string | number) => Math.round(Number(String(v).replace(/[\s,R]/g, "")) * 100) || 0;
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
