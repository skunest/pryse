"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase } from "@/lib/browser";
import { AuthCard } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error") === "invalid-link") setError("That link has expired or has already been used. Ask an administrator for a new invite, or reset your password below.");
    if (p.get("expired")) setInfo("Your session has expired. Please sign in again.");
    supabase().auth.getSession().then(({ data }) => { if (data.session) router.replace("/dashboard"); });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    const { error: err } = await supabase().auth.signInWithPassword({ email, password });
    if (err) { setLoading(false); setError(err.message === "Invalid login credentials" ? "The email or password is not correct." : err.message); return; }
    // Confirm the server accepts the session before leaving this page, so problems show here.
    try {
      await api("/me", { noRedirect: true });
      router.replace("/dashboard");
    } catch (e: any) {
      await supabase().auth.signOut();
      setLoading(false);
      setError(`You signed in, but Pryse could not load your account: ${e.message}. Check the setup at /api/health?check=1`);
    }
  };

  const forgot = async () => {
    setError(""); setInfo("");
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true);
    await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm` });
    setLoading(false);
    setInfo("If that email has an account, a link to reset the password is on its way.");
  };

  return (
    <AuthCard title="Sign in" sub="Invoicing and e-signing for your firm.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        {info && <Notice tone="ok">{info}</Notice>}
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </form>
      <button onClick={forgot} disabled={loading} className="mt-4 w-full text-center text-[13px] text-muted hover:text-ink">Forgot your password?</button>
    </AuthCard>
  );
}
