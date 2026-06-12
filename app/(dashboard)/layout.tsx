"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/brand", label: "Brand" },
  { href: "/brain", label: "Content Brain" },
  { href: "/content-generator", label: "Generator" },
  { href: "/calendar", label: "Calendar" },
  { href: "/drafts", label: "Drafts" },
  { href: "/media-library", label: "Media" },
  { href: "/video-studio", label: "Video" },
  { href: "/approval", label: "Approval" },
  { href: "/compliance-review", label: "Compliance" },
  { href: "/ready-to-post", label: "Ready" },
  { href: "/posted", label: "Posted" },
  { href: "/interactions", label: "Inbox" },
  { href: "/social-inbox-sync", label: "Inbox Sync" },
  { href: "/leads", label: "Leads" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/keyword-campaigns", label: "Keywords" },
  { href: "/analytics", label: "Analytics" },
  { href: "/content-insights", label: "Insights" },
  { href: "/weekly-report", label: "AI Report" },
  { href: "/publish-logs", label: "Publish Logs" },
  { href: "/settings/social-accounts", label: "Accounts" },
  { href: "/settings/team", label: "Team" },
  { href: "/automation-rules", label: "Automation" },
  { href: "/automation-logs", label: "Auto Logs" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
      else setEmail(session.user.email ?? null);
    });
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div>
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: "10px 20px",
          background: "#ffffff",
          borderBottom: "1px solid #e3e7ec",
          boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 750, fontSize: 16, color: "#0070f3", marginRight: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#0070f3", boxShadow: "0 0 0 3px rgba(0,112,243,0.15)" }} />
          Media Agent
        </span>
        {LINKS.map((l) => {
          const active = pathname?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 650 : 500,
                color: active ? "#0070f3" : "#5b6573",
                background: active ? "rgba(0,112,243,0.10)" : "transparent",
                padding: "5px 10px",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {l.label}
            </Link>
          );
        })}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, color: "#6b7280", fontSize: 13 }}>
          {email}
          <button
            onClick={signOut}
            style={{ padding: "5px 12px", fontSize: 13, borderRadius: 6, border: "1px solid #cfd6de", background: "#fff", color: "#1f2533", cursor: "pointer" }}
          >
            Sign out
          </button>
        </span>
      </nav>
      <div>{children}</div>
    </div>
  );
}
