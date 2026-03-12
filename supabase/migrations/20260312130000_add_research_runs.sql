create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  triggered_by_user_id uuid references auth.users(id) on delete set null,
  trigger_source text not null,
  status text not null default 'running',
  processed_checks_count integer not null default 0,
  completed_checks_count integer not null default 0,
  failed_checks_count integer not null default 0,
  skipped_checks_count integer not null default 0,
  evidence_created_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_text text,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint research_runs_trigger_source_check
    check (trigger_source in ('manual', 'cron', 'case_manual')),
  constraint research_runs_status_check
    check (status in ('running', 'completed', 'failed'))
);

create index if not exists research_runs_agency_started_idx
  on public.research_runs (agency_id, started_at desc);

alter table public.research_runs enable row level security;

drop policy if exists "research_runs_select_accessible" on public.research_runs;
create policy "research_runs_select_accessible"
  on public.research_runs
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "research_runs_insert_manageable" on public.research_runs;
create policy "research_runs_insert_manageable"
  on public.research_runs
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "research_runs_update_manageable" on public.research_runs;
create policy "research_runs_update_manageable"
  on public.research_runs
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
