create table if not exists public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_invites_email_check check (char_length(trim(email)) > 0),
  constraint agency_invites_role_check
    check (role in ('owner', 'manager', 'recruiter', 'finance', 'read_only'))
);

create unique index if not exists agency_invites_agency_email_active_idx
  on public.agency_invites (agency_id, lower(email))
  where accepted_at is null;

drop trigger if exists set_agency_invites_updated_at on public.agency_invites;
create trigger set_agency_invites_updated_at
before update on public.agency_invites
for each row
execute function public.set_updated_at();

alter table public.agency_invites enable row level security;

drop policy if exists "agency_invites_select_manageable" on public.agency_invites;
create policy "agency_invites_select_manageable"
  on public.agency_invites
  for select
  to authenticated
  using (public.can_manage_agency(agency_id));

drop policy if exists "agency_invites_insert_manageable" on public.agency_invites;
create policy "agency_invites_insert_manageable"
  on public.agency_invites
  for insert
  to authenticated
  with check (public.can_manage_agency(agency_id));

drop policy if exists "agency_invites_update_manageable" on public.agency_invites;
create policy "agency_invites_update_manageable"
  on public.agency_invites
  for update
  to authenticated
  using (public.can_manage_agency(agency_id))
  with check (public.can_manage_agency(agency_id));

drop policy if exists "agency_invites_delete_manageable" on public.agency_invites;
create policy "agency_invites_delete_manageable"
  on public.agency_invites
  for delete
  to authenticated
  using (public.can_manage_agency(agency_id));
