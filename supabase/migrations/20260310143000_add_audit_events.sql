create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_type_check check (char_length(trim(entity_type)) > 0),
  constraint audit_events_action_check check (char_length(trim(action)) > 0)
);

create index if not exists audit_events_agency_created_idx
  on public.audit_events (agency_id, created_at desc);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select_accessible" on public.audit_events;
create policy "audit_events_select_accessible"
  on public.audit_events
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "audit_events_insert_manageable" on public.audit_events;
create policy "audit_events_insert_manageable"
  on public.audit_events
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );
