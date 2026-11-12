import Image from "next/image";
import { TestBadge, TestStrip } from "./TestBadge";

export function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
    <TestStrip />
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <Image src="/pryse-logo.png" alt="Pryse" width={150} height={54} priority className="h-auto w-[150px]" />
      <TestBadge className="mt-3" />
      <div className="mb-10" />
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-8 text-xs text-faint">Pryse by SKUN (PTY) LTD</p>
    </div>
    </>
  );
}
