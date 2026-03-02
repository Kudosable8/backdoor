alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint user_roles_role_check check (role in ('super_admin'))
);

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_super_admin(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = target_user_id
      and role = 'super_admin'
  );
$$;

grant execute on function public.is_super_admin(uuid) to authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  last_signed_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super admins can access this resource';
  end if;

  return query
  select
    auth_user.id,
    auth_user.email::text,
    profile.first_name,
    profile.last_name,
    coalesce(roles.role, 'member') as role,
    auth_user.last_sign_in_at
  from auth.users as auth_user
  left join public.profiles as profile
    on profile.id = auth_user.id
  left join lateral (
    select string_agg(user_role.role, ', ' order by user_role.role) as role
    from public.user_roles as user_role
    where user_role.user_id = auth_user.id
  ) as roles
    on true
  order by auth_user.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- assign the first super admin manually after this migration runs:
-- insert into public.user_roles (user_id, role)
-- values ('replace-with-auth-user-id', 'super_admin');
