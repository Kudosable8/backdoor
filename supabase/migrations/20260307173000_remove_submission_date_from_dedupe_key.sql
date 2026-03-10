update public.candidate_introductions
set dedupe_key =
  candidate_name_normalized
  || '::'
  || client_company_normalized
  || '::'
  || introduced_role_normalized;
