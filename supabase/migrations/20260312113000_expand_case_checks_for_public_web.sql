alter table public.case_checks
  drop constraint if exists case_checks_type_check;

alter table public.case_checks
  add constraint case_checks_type_check
    check (
      check_type in (
        'company_site_homepage',
        'company_site_about',
        'company_site_team',
        'public_web_candidate_company',
        'public_web_candidate_role_company'
      )
    );
