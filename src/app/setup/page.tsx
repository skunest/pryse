"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase } from "@/lib/browser";
import { AuthCard } from "@/components/AuthCard";
import { Button, Field, Input, Notice } from "@/components/ui";

/** First sign-in only: name the firm. The person becomes its owner. */
export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("Maanda Attorneys Inc.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) return router.replace("/login");
      const me = await api<{ firms: unknown[]; setup_done: boolean }>("/me");
      if (me.firms.length) router.replace("/dashboard");
      else if (me.setup_done) setLocked(true);
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api("/firms", { method: "POST", json: { name } });
      router.replace("/settings?welcome=1");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (locked) {
    return (
      <AuthCard title="Ask for an invite" sub="The firm is already set up in Pryse.">
        <p className="text-sm text-ink-2">Your account is not part of the firm yet. Ask the firm&apos;s administrator to invite you from Settings, Team. You will get an email with a link to sign in.</p>
        <button onClick={async () => { await supabase().auth.signOut(); router.replace("/login"); }} className="mt-5 text-[13px] text-muted hover:text-ink">Sign out</button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up your firm" sub="This is done once. You can change the details later in Settings.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Firm name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" loading={loading} className="w-full">Continue</Button>
      </form>
    </AuthCard>
  );
}
