"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. You can sign in now (check email if confirmation is on).");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/brand");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 12 }}
      />
      <button onClick={submit} disabled={loading} style={{ width: "100%", padding: 10 }}>
        {loading ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
      </button>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        {mode === "signin" ? "No account? " : "Have an account? "}
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer" }}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
      {msg && <p style={{ marginTop: 12, fontSize: 14, color: "#b00" }}>{msg}</p>}
    </main>
  );
}
