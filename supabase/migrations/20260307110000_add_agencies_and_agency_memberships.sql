create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_name_check check (char_length(trim(name)) > 0),
  constraint agencies_slug_check check (char_length(trim(slug)) > 0)
);

drop trigger if exists set_agencies_updated_at on public.agencies;
create trigger set_agencies_updated_at
before update on public.agencies
for each row
execute function public.set_updated_at();

create table if not exists public.agency_memberships (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agency_id, user_id),
  unique (user_id),
  constraint agency_memberships_role_check
    check (role in ('owner', 'manager', 'recruiter', 'finance', 'read_only'))
);

drop trigger if exists set_agency_memberships_updated_at on public.agency_memberships;
create trigger set_agency_memberships_updated_at
before update on public.agency_memberships
for each row
execute function public.set_updated_at();

alter table public.agencies enable row level security;
alter table public.agency_memberships enable row level security;

create or replace function public.current_user_agency_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select agency_id
  from public.agency_memberships
  where user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_user_agency_id() to authenticated;

create or replace function public.current_user_agency_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.agency_memberships
  where user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_user_agency_role() to authenticated;

create or replace function public.current_user_has_agency_role(required_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.agency_memberships
    where user_id = auth.uid()
      and role = any(required_roles)
  )
$$;

grant execute on function public.current_user_has_agency_role(text[]) to authenticated;

create or replace function public.can_access_agency(target_agency_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_super_admin(auth.uid())
    or exists (
      select 1
      from public.agency_memberships
      where agency_id = target_agency_id
        and user_id = auth.uid()
    )
$$;

grant execute on function public.can_access_agency(uuid) to authenticated;

create or replace function public.can_manage_agency(target_agency_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_super_admin(auth.uid())
    or exists (
      select 1
      from public.agency_memberships
      where agency_id = target_agency_id
        and user_id = auth.uid()
        and role in ('owner', 'manager')
    )
$$;

grant execute on function public.can_manage_agency(uuid) to authenticated;

drop policy if exists "agencies_select_accessible" on public.agencies;
create policy "agencies_select_accessible"
  on public.agencies
  for select
  to authenticated
  using (public.can_access_agency(id));

drop policy if exists "agencies_insert_super_admin" on public.agencies;
create policy "agencies_insert_super_admin"
  on public.agencies
  for insert
  to authenticated
  with check (public.is_super_admin(auth.uid()));

drop policy if exists "agencies_update_manageable" on public.agencies;
create policy "agencies_update_manageable"
  on public.agencies
  for update
  to authenticated
  using (public.can_manage_agency(id))
  with check (public.can_manage_agency(id));

drop policy if exists "agencies_delete_super_admin" on public.agencies;
create policy "agencies_delete_super_admin"
  on public.agencies
  for delete
  to authenticated
  using (public.is_super_admin(auth.uid()));

drop policy if exists "agency_memberships_select_accessible" on public.agency_memberships;
create policy "agency_memberships_select_accessible"
  on public.agency_memberships
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "agency_memberships_insert_manageable" on public.agency_memberships;
create policy "agency_memberships_insert_manageable"
  on public.agency_memberships
  for insert
  to authenticated
  with check (public.can_manage_agency(agency_id));

drop policy if exists "agency_memberships_update_manageable" on public.agency_memberships;
create policy "agency_memberships_update_manageable"
  on public.agency_memberships
  for update
  to authenticated
  using (public.can_manage_agency(agency_id))
  with check (public.can_manage_agency(agency_id));

drop policy if exists "agency_memberships_delete_manageable" on public.agency_memberships;
create policy "agency_memberships_delete_manageable"
  on public.agency_memberships
  for delete
  to authenticated
  using (public.can_manage_agency(agency_id));
