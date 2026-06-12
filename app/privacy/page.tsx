import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — A-Z Housing Solutions",
  description: "How A-Z Housing Solutions collects, uses, and protects personal information.",
};

// Public, static page (outside the authenticated dashboard) so Meta can crawl it
// and anyone can read it without logging in.
//
// NOTE FOR THE OWNER: replace the [BRACKETED] placeholders with your real
// business contact details before relying on this. This is a good-faith template
// reflecting how the app actually handles data; have it reviewed by a
// professional if you need formal legal assurance.
export default function PrivacyPolicyPage() {
  const wrap = { maxWidth: 760, margin: "40px auto", padding: "0 20px", lineHeight: 1.6, color: "#1f2533" } as const;
  const h2 = { fontSize: "1.15rem", fontWeight: 650, marginTop: 28, marginBottom: 6 } as const;
  const p = { margin: "8px 0" } as const;
  const li = { margin: "4px 0" } as const;

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: "1.7rem", fontWeight: 750 }}>Privacy Policy</h1>
      <p style={{ color: "#6b7280" }}>Last updated: June 12, 2026</p>

      <p style={p}>
        This Privacy Policy explains how <strong>A-Z Housing Solutions</strong> (“we”, “us”) collects,
        uses, discloses, and protects personal information through our internal social media management
        tool (“the App”), which we use to create content for and manage our own Facebook Page and to
        organize inquiries we receive. We are based in Ontario, Canada, and we handle personal
        information in accordance with Canada’s Personal Information Protection and Electronic Documents
        Act (PIPEDA).
      </p>

      <h2 style={h2}>Information we collect</h2>
      <p style={p}><strong>From our team members who use the App:</strong></p>
      <ul>
        <li style={li}>Account details such as name and email used to sign in.</li>
        <li style={li}>An encrypted access token for the Facebook Page we manage, used solely to read and publish content on that Page through Facebook’s official APIs.</li>
      </ul>
      <p style={p}><strong>From people who interact with our Facebook Page:</strong></p>
      <ul>
        <li style={li}>Public comments left on our Page’s posts, including the commenter’s name and the content of the comment, as provided by Facebook’s official Graph API.</li>
        <li style={li}>Contact details (such as an email, phone number, city, or message) only if a person voluntarily provides them to us in a comment or message, which we may record as a sales/inquiry “lead”.</li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> scrape Facebook, collect data through unofficial means, or gather
        information about people who have not interacted with our Page.
      </p>

      <h2 style={h2}>How we use information</h2>
      <ul>
        <li style={li}>To draft, review, and publish content to our own Facebook Page.</li>
        <li style={li}>To check our content for fair-housing and advertising compliance before publishing.</li>
        <li style={li}>To organize inquiries and respond to people who contact us, including drafting (for our staff to review) replies to comments.</li>
        <li style={li}>To keep simple records and analytics about our own posts and inquiries.</li>
      </ul>
      <p style={p}>
        We do not sell personal information, and we do not use it for advertising targeting or automated
        decisions that produce legal effects. Replies to the public are always reviewed by a person
        before being sent.
      </p>

      <h2 style={h2}>Service providers we use</h2>
      <p style={p}>We share limited information with trusted service providers only as needed to operate the App:</p>
      <ul>
        <li style={li}><strong>Meta Platforms (Facebook):</strong> to read and publish Page content through official APIs.</li>
        <li style={li}><strong>OpenAI:</strong> content and comment text may be processed by OpenAI’s API to generate drafts, classify inquiries, and run compliance checks. This data is used to provide those features, not to train models on our behalf.</li>
        <li style={li}><strong>Supabase</strong> (database and file storage) and <strong>Vercel</strong> (hosting): to store and serve the App’s data securely.</li>
      </ul>

      <h2 style={h2}>Facebook data</h2>
      <p style={p}>
        Our use of information received from Facebook’s APIs follows Facebook’s Platform Terms and
        Developer Policies. The Page access token is stored encrypted and used only to operate the Page
        we manage. We retain imported public comments and any leads only as long as needed to respond to
        and serve the inquiry, and you may request deletion at any time (see below).
      </p>

      <h2 style={h2}>Data retention</h2>
      <p style={p}>
        We keep personal information only as long as necessary for the purposes described above or as
        required by law, after which it is deleted or anonymized.
      </p>

      <h2 style={h2}>Your rights &amp; how to request deletion</h2>
      <p style={p}>
        Under PIPEDA you may request access to, correction of, or deletion of your personal information
        we hold. To make a request — including asking us to delete a comment or inquiry record we’ve
        stored — see our <a href="/data-deletion">Data Deletion Instructions</a> or contact us at the
        address below. We will respond within a reasonable time.
      </p>

      <h2 style={h2}>Security</h2>
      <p style={p}>
        We use reasonable technical and organizational safeguards, including encryption of access tokens
        and access controls, to protect personal information. No system is perfectly secure, but we work
        to protect the information we hold.
      </p>

      <h2 style={h2}>Children</h2>
      <p style={p}>
        The App is for our business operations and is not directed to children. We do not knowingly
        collect personal information from children.
      </p>

      <h2 style={h2}>Changes to this policy</h2>
      <p style={p}>
        We may update this policy from time to time. The “last updated” date above reflects the latest
        version.
      </p>

      <h2 style={h2}>Contact us</h2>
      <p style={p}>
        A-Z Housing Solutions<br />
        Email: <strong>phamthuyphuongkhanh@gmail.com</strong><br />
        Greater Toronto Area, Ontario, Canada
      </p>
    </main>
  );
}
