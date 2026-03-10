update public.candidate_introductions
set dedupe_key =
  case
    when submission_date is not null then
      candidate_name_normalized
      || '::'
      || client_company_normalized
      || '::'
      || introduced_role_normalized
      || '::'
      || submission_date::text
    else
      candidate_name_normalized
      || '::'
      || client_company_normalized
      || '::'
      || introduced_role_normalized
  end;
