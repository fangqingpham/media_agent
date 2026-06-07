// Stage 4 sensitive-topic detection for INBOUND messages. If any phrase matches,
// the interaction is forced to human_approval_required = true and risk is raised.
// Deterministic backstop so risky inbound topics aren't missed by the model.

const SENSITIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "mortgage approval", re: /\bmortgage\s+approv/i },
  { label: "loan approval", re: /\bloan\s+approv/i },
  { label: "interest rate", re: /\binterest\s+rate/i },
  { label: "lowest/best rate", re: /\b(lowest|best|lower|cheapest)\s+rate/i },
  { label: "guaranteed results", re: /\bguarantee/i },
  { label: "legal advice", re: /\blegal\s+advice/i },
  { label: "eviction", re: /\bevict/i },
  { label: "tenant rights", re: /\btenant\s+rights?\b/i },
  { label: "human rights / fair housing", re: /\b(human\s+rights|fair\s+housing)\b/i },
  { label: "credit score", re: /\bcredit\s+score/i },
  { label: "debt consolidation", re: /\bdebt\s+consolidation/i },
  { label: "private lending", re: /\bprivate\s+lend/i },
  { label: "investment return", re: /\b(investment\s+return|return\s+on\s+investment|\broi\b|guaranteed\s+profit)/i },
  { label: "complaint / dispute", re: /\b(complaint|dispute|refund|sue|lawyer|scam)\b/i },
  { label: "personal financial details", re: /\b(my\s+(income|salary|debt|credit)|sin\s+number|bank\s+account)\b/i },
];

export type SensitiveResult = { matched: string[]; forceApproval: boolean };

export function scanSensitive(text: string): SensitiveResult {
  const matched = SENSITIVE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
  return { matched, forceApproval: matched.length > 0 };
}
