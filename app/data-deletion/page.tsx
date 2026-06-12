import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions — A-Z Housing Solutions",
  description: "How to request deletion of your personal information.",
};

// Public, static page. Meta requires a Data Deletion Instructions URL (or a
// deletion callback) to take the app Live; this satisfies the URL option.
//
// NOTE FOR THE OWNER: replace the [BRACKETED] placeholders with your real
// contact details before submitting this URL to Meta.
export default function DataDeletionPage() {
  const wrap = { maxWidth: 760, margin: "40px auto", padding: "0 20px", lineHeight: 1.6, color: "#1f2533" } as const;
  const h2 = { fontSize: "1.15rem", fontWeight: 650, marginTop: 28, marginBottom: 6 } as const;
  const p = { margin: "8px 0" } as const;
  const li = { margin: "4px 0" } as const;

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: "1.7rem", fontWeight: 750 }}>Data Deletion Instructions</h1>
      <p style={{ color: "#6b7280" }}>Last updated: June 12, 2026</p>

      <p style={p}>
        <strong>A-Z Housing Solutions</strong> uses an internal tool to manage our own Facebook Page and
        to organize inquiries we receive. If we have stored personal information about you — for example,
        a comment you left on our Page or contact details you shared with us — you can ask us to delete it.
      </p>

      <h2 style={h2}>What we may have stored</h2>
      <ul>
        <li style={li}>A public comment you left on one of our Page posts (your name and the comment text, as provided by Facebook).</li>
        <li style={li}>Any contact details (email, phone, city, message) you voluntarily provided, which we may have recorded as an inquiry/lead.</li>
      </ul>

      <h2 style={h2}>How to request deletion</h2>
      <p style={p}>Send us a request and we will delete the personal information we hold about you:</p>
      <ul>
        <li style={li}>Email <strong>phamthuyphuongkhanh@gmail.com</strong> with the subject line “Data Deletion Request”.</li>
        <li style={li}>Tell us the name you used on Facebook (and, if you can, a link to the comment) so we can locate your information.</li>
      </ul>
      <p style={p}>
        We will confirm and complete the deletion of your information from our systems within 30 days,
        except where we are required to retain certain information by law.
      </p>

      <h2 style={h2}>Deleting your data from Facebook itself</h2>
      <p style={p}>
        We can only delete information stored in our own tool. A comment you posted also lives on
        Facebook; to remove it there, delete the comment directly on the Facebook post, or manage your
        information through your Facebook account settings and Facebook’s own data controls.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>
        A-Z Housing Solutions<br />
        Email: <strong>phamthuyphuongkhanh@gmail.com</strong>
      </p>

      <p style={{ ...p, marginTop: 20 }}>
        See also our <a href="/privacy">Privacy Policy</a>.
      </p>
    </main>
  );
}
