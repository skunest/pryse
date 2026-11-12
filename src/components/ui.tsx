"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Buttons ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "brand";
  size?: "sm" | "md";
  loading?: boolean;
  href?: string;
};
const btnBase = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
const btnVariant = {
  primary: "bg-ink text-white hover:bg-black",
  brand: "bg-brand text-ink hover:bg-brand-dark",
  secondary: "bg-white text-ink border border-line hover:border-ink-2",
  ghost: "text-ink-2 hover:bg-soft",
  danger: "bg-white text-bad border border-bad/30 hover:bg-bad-soft",
};
const btnSize = { sm: "text-[13px] px-3 py-1.5", md: "text-sm px-4 py-2.5" };

export function Button({ variant = "primary", size = "md", loading, className, children, href, ...rest }: BtnProps) {
  const cls = cx(btnBase, btnVariant[variant], btnSize[size], className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

/* ---------- Form ---------- */
export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx("input", p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx("input", p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx("input pr-8", p.className)} />;

/* ---------- Layout ---------- */
export function PageHeader({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7">
      {back && <Link href={back.href} className="mb-3 inline-block text-[13px] text-muted hover:text-ink">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className, title, actions, pad = true }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode; pad?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-line bg-white", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" | "ok" }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="text-[12px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("num mt-2 text-2xl font-semibold tracking-tight", tone === "bad" && "text-bad", tone === "ok" && "text-ok")}>{value}</div>
      {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <div className="text-[15px] font-semibold">{title}</div>
      {sub && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="flex items-center gap-2 py-16 text-sm text-muted justify-center"><Spinner /> {label}...</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">{message}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: React.ReactNode }) {
  const t = { info: "bg-soft text-ink-2 border-line", warn: "bg-warn-soft text-warn border-warn/20", bad: "bg-bad-soft text-bad border-bad/20", ok: "bg-ok-soft text-ok border-ok/20" }[tone];
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", t)}>{children}</div>;
}

/* ---------- Status badges ---------- */
const BADGE: Record<string, [string, string]> = {
  draft: ["Draft", "bg-soft text-muted"],
  issued: ["Issued", "bg-[#eef3fb] text-[#2f5a9a]"],
  partially_paid: ["Part paid", "bg-warn-soft text-warn"],
  paid: ["Paid", "bg-ok-soft text-ok"],
  void: ["Void", "bg-soft text-faint line-through"],
  overdue: ["Overdue", "bg-bad-soft text-bad"],
  sent: ["Awaiting signature", "bg-brand-soft text-brand-dark"],
  completed: ["Signed", "bg-ok-soft text-ok"],
  declined: ["Declined", "bg-bad-soft text-bad"],
  cancelled: ["Cancelled", "bg-soft text-faint"],
  expired: ["Expired", "bg-soft text-faint"],
  pending: ["Not opened", "bg-soft text-muted"],
  viewed: ["Viewed", "bg-[#eef3fb] text-[#2f5a9a]"],
  signed: ["Signed", "bg-ok-soft text-ok"],
  open: ["Open", "bg-ok-soft text-ok"],
  closed: ["Closed", "bg-soft text-muted"],
};
export function Badge({ status, overdue }: { status: string; overdue?: boolean }) {
  const key = overdue ? "overdue" : status;
  const [label, cls] = BADGE[key] ?? [status, "bg-soft text-muted"];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium", cls)}>{label}</span>;
}

/* ---------- Table ---------- */
export function Table({ head, children, className }: { head: (string | { label: string; right?: boolean })[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border border-line bg-white", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-soft/60 text-left">
            {head.map((h, i) => {
              const o = typeof h === "string" ? { label: h } : h;
              return <th key={i} className={cx("px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint", o.right && "text-right")}>{o.label}</th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div className={cx("max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-[16px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-soft hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="space-y-4 px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; msg: string; tone: "ok" | "bad" };
const ToastCtx = createContext<(msg: string, tone?: "ok" | "bad") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "bad" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg", t.tone === "ok" ? "bg-ink text-white" : "bg-bad text-white")}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export { cx };
