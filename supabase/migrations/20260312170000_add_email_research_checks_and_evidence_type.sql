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
        'public_web_candidate_role_company',
        'company_email_lookup'
      )
    );

alter table public.case_evidence
  drop constraint if exists case_evidence_type_check;

alter table public.case_evidence
  add constraint case_evidence_type_check
    check (
      evidence_type in (
        'manual_note',
        'uploaded_file',
        'public_web',
        'company_site',
        'recruiter_assertion',
        'email_signal'
      )
    );
