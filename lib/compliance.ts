import type { RiskLevel } from "./contentTypes";

// High-risk trigger phrases from the Stage 2 spec. If any appears in the
// generated content, the post is forced to HIGH risk and human approval is
// required — regardless of what the model itself reported. This is a
// deterministic backstop so risky financial/legal/housing claims can't slip
// through on the model's own (fallible) judgment.
const HIGH_RISK_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "mortgage approval", re: /\bmortgage\s+approv/i },
  { label: "loan approval", re: /\bloan\s+approv/i },
  { label: "interest rate", re: /\binterest\s+rate/i },
  { label: "lowest/best rate", re: /\b(lowest|best)\s+rate/i },
  { label: "guaranteed results", re: /\bguarantee/i },
  { label: "legal advice", re: /\blegal\s+advice/i },
  { label: "tenant approval", re: /\btenant\s+approv/i },
  { label: "eviction", re: /\bevict/i },
  { label: "human rights / fair housing", re: /\b(human\s+rights|fair\s+housing)\b/i },
  { label: "credit score", re: /\bcredit\s+score/i },
  { label: "debt consolidation", re: /\bdebt\s+consolidation/i },
  { label: "private lending", re: /\bprivate\s+lend/i },
  { label: "investment return", re: /\b(investment\s+return|return\s+on\s+investment|roi)\b/i },
  { label: "specific financial outcome", re: /\b(save|earn|make)\s+\$?\d/i },
];

export type ComplianceResult = {
  risk: RiskLevel;
  humanApprovalRequired: boolean;
  matched: string[];
};

/** Scans combined text and returns deterministic risk based on trigger phrases. */
export function scanCompliance(text: string): ComplianceResult {
  const matched = HIGH_RISK_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
  if (matched.length > 0) {
    return { risk: "high", humanApprovalRequired: true, matched };
  }
  return { risk: "low", humanApprovalRequired: false, matched: [] };
}

const ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** Combines the model's self-assessed risk with the deterministic scan (takes the worse). */
export function mergeRisk(aiRisk: RiskLevel, scan: ComplianceResult) {
  const finalRisk: RiskLevel = ORDER[scan.risk] >= ORDER[aiRisk] ? scan.risk : aiRisk;
  return {
    risk: finalRisk,
    humanApprovalRequired: scan.humanApprovalRequired || finalRisk === "high",
    matched: scan.matched,
  };
}
