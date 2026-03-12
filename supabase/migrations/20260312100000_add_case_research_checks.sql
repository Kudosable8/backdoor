alter table public.cases
  add column if not exists research_status text not null default 'not_started',
  add column if not exists research_started_at timestamptz,
  add column if not exists researched_at timestamptz;

alter table public.cases
  drop constraint if exists cases_research_status_check;

alter table public.cases
  add constraint cases_research_status_check
    check (research_status in ('not_started', 'queued', 'in_progress', 'completed', 'failed'));

create table if not exists public.case_checks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  check_type text not null,
  status text not null default 'pending',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  source_url text,
  result_json jsonb not null default '{}'::jsonb,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_checks_type_check
    check (
      check_type in (
        'company_site_homepage',
        'company_site_about',
        'company_site_team'
      )
    ),
  constraint case_checks_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  constraint case_checks_attempt_count_check
    check (attempt_count >= 0),
  constraint case_checks_priority_check
    check (priority >= 0),
  constraint case_checks_case_type_unique
    unique (case_id, check_type)
);

drop trigger if exists set_case_checks_updated_at on public.case_checks;
create trigger set_case_checks_updated_at
before update on public.case_checks
for each row
execute function public.set_updated_at();

create index if not exists case_checks_agency_status_idx
  on public.case_checks (agency_id, status, scheduled_at asc, priority asc);

create index if not exists case_checks_case_idx
  on public.case_checks (case_id, created_at desc);

alter table public.case_checks enable row level security;

drop policy if exists "case_checks_select_accessible" on public.case_checks;
create policy "case_checks_select_accessible"
  on public.case_checks
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "case_checks_insert_manageable" on public.case_checks;
create policy "case_checks_insert_manageable"
  on public.case_checks
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "case_checks_update_manageable" on public.case_checks;
create policy "case_checks_update_manageable"
  on public.case_checks
  for update
  to authenticated
  using (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  )
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );
