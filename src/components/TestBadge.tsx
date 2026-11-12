import { IS_TESTING, TEST_LABEL } from "@/lib/env";
import { cx } from "./ui";

/** Small orange TESTING pill, shown only on a testing (QA) system. */
export function TestBadge({ className, dark }: { className?: string; dark?: boolean }) {
  if (!IS_TESTING) return null;
  return (
    <span className={cx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[.12em]",
      dark ? "bg-brand text-ink" : "bg-brand-soft text-brand-dark ring-1 ring-brand/40",
      className,
    )}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dark ? "bg-ink" : "bg-brand-dark")} />
      {TEST_LABEL}
    </span>
  );
}

/** Full-width strip across the top of a page, shown only on a testing system. */
export function TestStrip({ text }: { text?: string }) {
  if (!IS_TESTING) return null;
  return (
    <div className="relative z-[45] flex items-center justify-center gap-2 bg-brand px-4 py-1.5 text-center text-[12px] font-semibold text-ink">
      <span className="tracking-[.14em]">{TEST_LABEL}</span>
      <span className="hidden font-normal opacity-80 sm:inline">· {text ?? "This is the Pryse test system. Nothing here is real."}</span>
    </div>
  );
}
