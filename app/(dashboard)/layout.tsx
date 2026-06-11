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
    <div style={{ fontFamily: "system-ui" }}>
      <nav
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid #eee",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ marginRight: 8 }}>Media Agent</strong>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              textDecoration: "none",
              color: pathname?.startsWith(l.href) ? "#0070f3" : "#444",
              fontWeight: pathname?.startsWith(l.href) ? 600 : 400,
            }}
          >
            {l.label}
          </Link>
        ))}
        <span style={{ marginLeft: "auto", color: "#888", fontSize: 13 }}>{email}</span>
        <button onClick={signOut} style={{ fontSize: 13 }}>
          Sign out
        </button>
      </nav>
      <div>{children}</div>
    </div>
  );
}
