import type { AgencyRole } from "@/lib/features/auth/types";

export type AdminUserRow = {
  agency_id: string | null;
  agency_name: string | null;
  agency_role: AgencyRole | null;
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  last_signed_in_at: string | null;
};

export type AdminAgencyRow = {
  created_at: string;
  id: string;
  name: string;
  owner_email: string | null;
  owner_user_id: string | null;
  pending_owner_email: string | null;
  slug: string;
};

export type AdminAgencyOption = {
  id: string;
  name: string;
  slug: string;
};
