"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api, supabase } from "@/lib/browser";
import { Loading, ToastProvider, cx } from "./ui";
import { TestBadge, TestStrip } from "./TestBadge";

export type Role = "owner" | "admin" | "fee_earner" | "bookkeeper" | "staff";
type Session = { user: { id: string; email: string }; firm: { id: string; name: string; role: Role } };

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx)!;
export const canAdmin = (r: Role) => r === "owner" || r === "admin";
export const canBill = (r: Role) => r !== "staff";
export const canRecordPayments = (r: Role) => ["owner", "admin", "bookkeeper"].includes(r);

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/invoices", label: "Invoices", icon: "M7 3h10l2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5l2-2zM9 8h6M9 12h6M9 16h4" },
  { href: "/signing", label: "E-signing", icon: "M4 20h16M6 16l9.5-9.5a2.1 2.1 0 013 3L9 19H6v-3z" },
  { href: "/clients", label: "Clients", icon: "M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Administrator", fee_earner: "Fee earner", bookkeeper: "Bookkeeper", staff: "Staff" };
export { ROLE_LABEL };

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      try {
        const me = await api<{ user: Session["user"]; firms: { id: string; name: string; role: Role }[] }>("/me");
        if (!alive) return;
        if (!me.firms.length) { router.replace("/setup"); return; }
        setSession({ user: me.user, firm: me.firms[0] });
      } catch {
        router.replace("/login");
      }
    })();
    return () => { alive = false; };
  }, [router]);

  useEffect(() => setOpen(false), [pathname]);

  if (!session) return <div className="min-h-screen"><Loading /></div>;

  const signOut = async () => { await supabase().auth.signOut(); router.replace("/login"); };

  return (
    <SessionCtx.Provider value={session}>
      <ToastProvider>
        <div className="min-h-screen lg:pl-[248px]">
          <TestStrip />
          {/* Sidebar */}
          <aside className={cx(
            "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-ink text-white transition-transform lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}>
            <div className="px-6 pb-6 pt-7">
              <Link href="/dashboard"><Image src="/pryse-logo-white.png" alt="Pryse" width={112} height={40} priority className="h-auto w-[112px]" /></Link>
              <div className="mt-4 truncate text-[12px] text-white/50">{session.firm.name}</div>
              <TestBadge dark className="mt-3" />
            </div>
            <nav className="flex-1 space-y-0.5 px-3">
              {NAV.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return (
                  <Link key={n.href} href={n.href} className={cx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition",
                    active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                  )}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                    {n.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 px-5 py-4">
              <div className="truncate text-[13px] text-white/80">{session.user.email}</div>
              <div className="mb-3 text-[12px] text-white/40">{ROLE_LABEL[session.firm.role]}</div>
              <button onClick={signOut} className="text-[13px] text-white/60 hover:text-white">Sign out</button>
            </div>
          </aside>
          {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

          {/* Mobile top bar */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
            <div className="flex items-center gap-2"><Image src="/pryse-logo.png" alt="Pryse" width={84} height={30} className="h-auto w-[84px]" /><TestBadge /></div>
            <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-soft" aria-label="Open menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>

          <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-8 lg:py-10">{children}</main>
        </div>
      </ToastProvider>
    </SessionCtx.Provider>
  );
}
