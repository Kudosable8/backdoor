alter table public.candidate_introductions
  add column if not exists case_id uuid;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  candidate_introduction_id uuid not null unique references public.candidate_introductions(id) on delete cascade,
  status text not null default 'new',
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  confidence text not null default 'low',
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_status_check
    check (status in ('new', 'reviewing', 'needs_more_evidence', 'ready_to_contact', 'dismissed')),
  constraint cases_confidence_check
    check (confidence in ('low', 'medium', 'high'))
);

alter table public.candidate_introductions
  add constraint candidate_introductions_case_id_fkey
  foreign key (case_id) references public.cases(id) on delete set null;

drop trigger if exists set_cases_updated_at on public.cases;
create trigger set_cases_updated_at
before update on public.cases
for each row
execute function public.set_updated_at();

create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint case_notes_body_check check (char_length(trim(body)) > 0)
);

alter table public.cases enable row level security;
alter table public.case_notes enable row level security;

drop policy if exists "cases_select_accessible" on public.cases;
create policy "cases_select_accessible"
  on public.cases
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "cases_insert_manageable" on public.cases;
create policy "cases_insert_manageable"
  on public.cases
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "cases_update_manageable" on public.cases;
create policy "cases_update_manageable"
  on public.cases
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

drop policy if exists "case_notes_select_accessible" on public.case_notes;
create policy "case_notes_select_accessible"
  on public.case_notes
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "case_notes_insert_manageable" on public.case_notes;
create policy "case_notes_insert_manageable"
  on public.case_notes
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );
