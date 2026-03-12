export const CASE_EVIDENCE_TYPES = [
  "manual_note",
  "uploaded_file",
  "public_web",
  "company_site",
  "recruiter_assertion",
  "email_signal",
] as const;

export const MANUAL_CASE_EVIDENCE_TYPES = [
  "manual_note",
  "uploaded_file",
  "public_web",
  "company_site",
  "recruiter_assertion",
] as const;

export const CASE_EVIDENCE_STRENGTHS = [
  "weak",
  "medium",
  "strong",
  "conflicting",
] as const;

export const CASE_SCORE_BANDS = ["low", "medium", "high"] as const;

export type CaseEvidenceType = (typeof CASE_EVIDENCE_TYPES)[number];
export type CaseEvidenceStrength = (typeof CASE_EVIDENCE_STRENGTHS)[number];
export type CaseScoreBand = (typeof CASE_SCORE_BANDS)[number];

type ScoreRule = {
  delta: number;
  explanation: string;
  ruleKey: string;
};

const SCORE_RULES: Record<
  CaseEvidenceType,
  Record<CaseEvidenceStrength, ScoreRule>
> = {
  manual_note: {
    weak: {
      delta: 5,
      explanation: "Manual investigator note added as low-strength supporting context.",
      ruleKey: "manual_note_weak",
    },
    medium: {
      delta: 10,
      explanation: "Manual investigator note added with corroborating detail.",
      ruleKey: "manual_note_medium",
    },
    strong: {
      delta: 15,
      explanation: "Manual investigator note added as a strong documented lead.",
      ruleKey: "manual_note_strong",
    },
    conflicting: {
      delta: -15,
      explanation: "Manual investigator note recorded conflicting evidence against the case.",
      ruleKey: "manual_note_conflicting",
    },
  },
  uploaded_file: {
    weak: {
      delta: 10,
      explanation: "Uploaded attachment supports the case with weak documentary evidence.",
      ruleKey: "uploaded_file_weak",
    },
    medium: {
      delta: 20,
      explanation: "Uploaded attachment supports the case with medium documentary evidence.",
      ruleKey: "uploaded_file_medium",
    },
    strong: {
      delta: 35,
      explanation: "Uploaded attachment provides strong documentary evidence.",
      ruleKey: "uploaded_file_strong",
    },
    conflicting: {
      delta: -20,
      explanation: "Uploaded attachment conflicts with the current hire theory.",
      ruleKey: "uploaded_file_conflicting",
    },
  },
  public_web: {
    weak: {
      delta: 10,
      explanation: "Public web source adds a weak supporting signal.",
      ruleKey: "public_web_weak",
    },
    medium: {
      delta: 20,
      explanation: "Public web source adds a medium-confidence supporting signal.",
      ruleKey: "public_web_medium",
    },
    strong: {
      delta: 30,
      explanation: "Public web source strongly links the candidate to the client.",
      ruleKey: "public_web_strong",
    },
    conflicting: {
      delta: -20,
      explanation: "Public web source suggests the candidate is elsewhere or not matched.",
      ruleKey: "public_web_conflicting",
    },
  },
  company_site: {
    weak: {
      delta: 15,
      explanation: "Company site source adds a weak direct signal.",
      ruleKey: "company_site_weak",
    },
    medium: {
      delta: 30,
      explanation: "Company site source adds a medium direct signal.",
      ruleKey: "company_site_medium",
    },
    strong: {
      delta: 40,
      explanation: "Company site source strongly confirms the candidate at the client.",
      ruleKey: "company_site_strong",
    },
    conflicting: {
      delta: -20,
      explanation: "Company site source conflicts with the current hire hypothesis.",
      ruleKey: "company_site_conflicting",
    },
  },
  recruiter_assertion: {
    weak: {
      delta: 8,
      explanation: "Recruiter assertion recorded as a weak internal signal.",
      ruleKey: "recruiter_assertion_weak",
    },
    medium: {
      delta: 15,
      explanation: "Recruiter assertion recorded with supporting context.",
      ruleKey: "recruiter_assertion_medium",
    },
    strong: {
      delta: 20,
      explanation: "Recruiter assertion recorded as a strong internal signal.",
      ruleKey: "recruiter_assertion_strong",
    },
    conflicting: {
      delta: -15,
      explanation: "Recruiter assertion was used to document conflicting case information.",
      ruleKey: "recruiter_assertion_conflicting",
    },
  },
  email_signal: {
    weak: {
      delta: 6,
      explanation:
        "Validated company-email signal adds a weak supporting indication the candidate may be active at the client.",
      ruleKey: "email_signal_weak",
    },
    medium: {
      delta: 12,
      explanation:
        "Validated company-email signal adds a medium supporting indication tied to the client domain.",
      ruleKey: "email_signal_medium",
    },
    strong: {
      delta: 15,
      explanation:
        "Validated company-email signal adds a capped stronger indication tied to the client domain.",
      ruleKey: "email_signal_strong",
    },
    conflicting: {
      delta: -10,
      explanation:
        "Email verification signal conflicts with the current hire hypothesis.",
      ruleKey: "email_signal_conflicting",
    },
  },
};

export function getScoreRule(
  evidenceType: CaseEvidenceType,
  strength: CaseEvidenceStrength,
) {
  return SCORE_RULES[evidenceType][strength];
}

export function getScoreBand(score: number): CaseScoreBand {
  if (score >= 60) {
    return "high";
  }

  if (score >= 25) {
    return "medium";
  }

  return "low";
}

export function clampScore(score: number) {
  return Math.max(0, score);
}

export const caseEvidenceTypeLabels: Record<CaseEvidenceType, string> = {
  manual_note: "Manual Note",
  uploaded_file: "Uploaded File",
  public_web: "Public Web",
  company_site: "Company Site",
  recruiter_assertion: "Recruiter Assertion",
  email_signal: "Email Signal",
};

export const caseEvidenceStrengthLabels: Record<CaseEvidenceStrength, string> = {
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
  conflicting: "Conflicting",
};
