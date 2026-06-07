"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Account = Record<string, unknown>;
type Page = { id: string; name: string };

function SocialAccountsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const stash = sp.get("stash");
  const errorParam = sp.get("error");

  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(errorParam || null);

  const loadAccounts = useCallback(async () => {
    setAccounts((await api("/api/social/accounts")) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (brands && brands.length > 0) setBrandId(brands[0].id);
      await loadAccounts();
      // if we just came back from OAuth with a stash, load the Pages to pick
      if (stash) {
        try {
          const res = await api(`/api/social/facebook/pages?stash=${stash}`);
          setPages(res.pages ?? []);
        } catch (e) { setMsg(e instanceof Error ? e.message : "Could not load Pages"); }
      }
      setReady(true);
    })();
  }, [router, loadAccounts, stash]);

  const connectFacebook = async () => {
    // we pass the supabase token via query so the FB redirect (which can't carry our
    // auth header) can identify us in the callback via `state`.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const token = session.access_token;
    const url = `/api/social/facebook/connect?token=${encodeURIComponent(token)}${brandId ? `&brandId=${brandId}` : ""}`;
    window.location.href = url; // full-page redirect into Meta's OAuth
  };

  const choosePage = async (pageId: string) => {
    if (!stash) return;
    setBusy(pageId);
    try {
      await api("/api/social/facebook/pages", { method: "POST", body: JSON.stringify({ stash, pageId }) });
      setPages([]);
      setMsg("Page connected.");
      await loadAccounts();
      router.replace("/settings/social-accounts");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Connect failed"); }
    finally { setBusy(null); }
  };

  const test = async (accountId: string) => {
    setBusy(accountId); setMsg(null);
    try {
      await api("/api/social/facebook/test", { method: "POST", body: JSON.stringify({ accountId }) });
      setMsg("✓ Connection works.");
      await loadAccounts();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Test failed"); }
    finally { setBusy(null); }
  };

  const disconnect = async (accountId: string) => {
    if (!confirm("Disconnect this account?")) return;
    setBusy(accountId);
    try {
      await api("/api/social/facebook/disconnect", { method: "POST", body: JSON.stringify({ accountId }) });
      await loadAccounts();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Disconnect failed"); }
    finally { setBusy(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 14 } as const;

  return (
    <main style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Social accounts</h1>

      {msg && <p style={{ background: msg.startsWith("✓") || msg.includes("connected") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* Page picker after OAuth */}
      {pages.length > 0 && (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Choose a Facebook Page to connect</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {pages.map((p) => (
              <button key={p.id} onClick={() => choosePage(p.id)} disabled={busy !== null}
                style={{ textAlign: "left", padding: 10, border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}>
                {p.name} <span style={{ color: "#888", fontSize: 12 }}>({p.id})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Connect</h2>
        <button onClick={connectFacebook} style={{ padding: "10px 18px", background: "#1877f2", color: "#fff", border: "none", borderRadius: 6 }}>
          Connect Facebook Page
        </button>
        <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Instagram and TikTok come after Facebook publishing is working.</p>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Connected accounts</h2>
        {accounts.length === 0 ? <p style={{ color: "#666" }}>None connected yet.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {accounts.map((a) => (
              <div key={a.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{a.platform as string} · {(a.account_name as string) || "(no name)"}</strong>
                  <span style={{ fontSize: 13, color: a.status === "connected" ? "#0a7d36" : a.status === "error" ? "#c0271a" : "#888" }}>
                    {a.status as string}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>ID: {a.account_id as string}</div>
                <div style={{ fontSize: 12, color: "#888" }}>Connected: {new Date(a.created_at as string).toLocaleString()}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => test(a.id as string)} disabled={busy !== null}>Test connection</button>
                  <button onClick={() => disconnect(a.id as string)} disabled={busy !== null} style={{ color: "#c0271a" }}>Disconnect</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SocialAccountsPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <SocialAccountsInner />
    </Suspense>
  );
}
