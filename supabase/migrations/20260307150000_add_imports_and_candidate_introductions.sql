create table if not exists public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  field_mapping_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_mappings_name_check check (char_length(trim(name)) > 0)
);

drop trigger if exists set_import_mappings_updated_at on public.import_mappings;
create trigger set_import_mappings_updated_at
before update on public.import_mappings
for each row
execute function public.set_updated_at();

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  status text not null,
  row_count integer not null default 0,
  valid_row_count integer not null default 0,
  invalid_row_count integer not null default 0,
  duplicate_row_count integer not null default 0,
  mapping_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imports_status_check
    check (status in ('completed', 'completed_with_errors', 'failed'))
);

drop trigger if exists set_imports_updated_at on public.imports;
create trigger set_imports_updated_at
before update on public.imports
for each row
execute function public.set_updated_at();

create table if not exists public.candidate_introductions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  import_id uuid references public.imports(id) on delete set null,
  candidate_full_name text not null,
  candidate_first_name text,
  candidate_last_name text,
  candidate_name_normalized text not null,
  candidate_linkedin_url text,
  candidate_location text,
  introduced_role_raw text not null,
  introduced_role_normalized text not null,
  client_company_raw text not null,
  client_company_normalized text not null,
  client_website text,
  client_domain text,
  submission_date date,
  recruiter_name text,
  fee_term_reference text,
  notes text,
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists candidate_introductions_agency_dedupe_idx
  on public.candidate_introductions (agency_id, dedupe_key);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  row_number integer not null,
  status text not null,
  raw_row_json jsonb not null,
  normalized_row_json jsonb,
  error_text text,
  candidate_introduction_id uuid references public.candidate_introductions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint import_rows_status_check
    check (status in ('imported', 'invalid', 'duplicate'))
);

create index if not exists import_rows_import_id_idx
  on public.import_rows (import_id, row_number);

alter table public.import_mappings enable row level security;
alter table public.imports enable row level security;
alter table public.candidate_introductions enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "import_mappings_select_accessible" on public.import_mappings;
create policy "import_mappings_select_accessible"
  on public.import_mappings
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "import_mappings_insert_manageable" on public.import_mappings;
create policy "import_mappings_insert_manageable"
  on public.import_mappings
  for insert
  to authenticated
  with check (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id));

drop policy if exists "import_mappings_update_manageable" on public.import_mappings;
create policy "import_mappings_update_manageable"
  on public.import_mappings
  for update
  to authenticated
  using (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id))
  with check (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id));

drop policy if exists "imports_select_accessible" on public.imports;
create policy "imports_select_accessible"
  on public.imports
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "imports_insert_manageable" on public.imports;
create policy "imports_insert_manageable"
  on public.imports
  for insert
  to authenticated
  with check (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id));

drop policy if exists "candidate_introductions_select_accessible" on public.candidate_introductions;
create policy "candidate_introductions_select_accessible"
  on public.candidate_introductions
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "candidate_introductions_insert_manageable" on public.candidate_introductions;
create policy "candidate_introductions_insert_manageable"
  on public.candidate_introductions
  for insert
  to authenticated
  with check (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id));

drop policy if exists "import_rows_select_accessible" on public.import_rows;
create policy "import_rows_select_accessible"
  on public.import_rows
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "import_rows_insert_manageable" on public.import_rows;
create policy "import_rows_insert_manageable"
  on public.import_rows
  for insert
  to authenticated
  with check (public.current_user_has_agency_role(array['owner', 'manager', 'recruiter']) and public.can_access_agency(agency_id));
