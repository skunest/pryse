"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/browser";
import { AuthCard } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

export default function SetPasswordPage() {
  const router = useRouter();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login?error=invalid-link");
      else setEmail(data.session.user.email || "");
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (p1.length < 8) return setError("Use at least 8 characters.");
    if (p1 !== p2) return setError("The passwords do not match.");
    setLoading(true);
    const { error: err } = await supabase().auth.updateUser({ password: p1 });
    setLoading(false);
    if (err) return setError(err.message);
    router.replace("/dashboard");
  };

  return (
    <AuthCard title="Choose a password" sub={email ? `For ${email}` : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
        <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" loading={loading} className="w-full">Save and continue</Button>
      </form>
    </AuthCard>
  );
}
