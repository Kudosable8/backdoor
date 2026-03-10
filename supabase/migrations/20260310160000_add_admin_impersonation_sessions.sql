create table if not exists public.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_impersonation_sessions_target_check
    check (super_admin_user_id <> target_user_id)
);

create index if not exists admin_impersonation_sessions_super_admin_idx
  on public.admin_impersonation_sessions (super_admin_user_id, created_at desc);

create index if not exists admin_impersonation_sessions_target_idx
  on public.admin_impersonation_sessions (target_user_id, created_at desc);
