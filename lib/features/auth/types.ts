export const PLATFORM_ROLES = ["super_admin"] as const;

export const AGENCY_ROLES = [
  "owner",
  "manager",
  "recruiter",
  "finance",
  "read_only",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type AgencyRole = (typeof AGENCY_ROLES)[number];

export type AgencyMembership = {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  role: AgencyRole;
};

export const agencyRoleLabels: Record<AgencyRole, string> = {
  owner: "Owner",
  manager: "Manager",
  recruiter: "Recruiter",
  finance: "Finance",
  read_only: "Read Only",
};
