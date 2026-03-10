import type { AgencyRole } from "@/lib/features/auth/types";

export type TeamMemberRow = {
  created_at: string;
  email: string | null;
  first_name: string | null;
  full_name: string | null;
  last_name: string | null;
  role: AgencyRole;
  user_id: string;
};

export type PendingInviteRow = {
  created_at: string;
  email: string;
  expires_at: string;
  id: string;
  role: AgencyRole;
};
