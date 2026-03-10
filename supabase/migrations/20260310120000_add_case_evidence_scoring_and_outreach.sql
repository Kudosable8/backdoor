alter table public.cases
  add column if not exists current_score integer not null default 0,
  add column if not exists score_band text not null default 'low',
  add column if not exists confirmed_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.cases
  drop constraint if exists cases_score_band_check;

alter table public.cases
  add constraint cases_score_band_check
    check (score_band in ('low', 'medium', 'high'));

update public.cases
set
  current_score = case confidence
    when 'high' then 70
    when 'medium' then 40
    else 0
  end,
  score_band = confidence
where score_band is null
   or current_score = 0;

create table if not exists public.case_evidence (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null,
  strength text not null,
  summary_text text not null,
  source_url text,
  source_domain text,
  snippet_text text,
  attachment_bucket text,
  attachment_path text,
  attachment_filename text,
  attachment_mime_type text,
  attachment_size_bytes bigint,
  score_delta integer not null default 0,
  created_at timestamptz not null default now(),
  constraint case_evidence_type_check
    check (
      evidence_type in (
        'manual_note',
        'uploaded_file',
        'public_web',
        'company_site',
        'recruiter_assertion'
      )
    ),
  constraint case_evidence_strength_check
    check (strength in ('weak', 'medium', 'strong', 'conflicting')),
  constraint case_evidence_summary_check
    check (char_length(trim(summary_text)) > 0)
);

create index if not exists case_evidence_case_id_idx
  on public.case_evidence (case_id, created_at desc);

create table if not exists public.case_score_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  evidence_item_id uuid references public.case_evidence(id) on delete set null,
  rule_key text not null,
  delta integer not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  constraint case_score_events_rule_key_check check (char_length(trim(rule_key)) > 0),
  constraint case_score_events_explanation_check check (char_length(trim(explanation)) > 0)
);

create index if not exists case_score_events_case_id_idx
  on public.case_score_events (case_id, created_at desc);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text,
  subject text not null,
  body_markdown text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_messages_status_check
    check (status in ('draft', 'ready', 'sent', 'failed')),
  constraint outreach_messages_subject_check check (char_length(trim(subject)) > 0),
  constraint outreach_messages_body_check check (char_length(trim(body_markdown)) > 0)
);

create index if not exists outreach_messages_case_id_idx
  on public.outreach_messages (case_id, created_at desc);

drop trigger if exists set_outreach_messages_updated_at on public.outreach_messages;
create trigger set_outreach_messages_updated_at
before update on public.outreach_messages
for each row
execute function public.set_updated_at();

alter table public.case_evidence enable row level security;
alter table public.case_score_events enable row level security;
alter table public.outreach_messages enable row level security;

drop policy if exists "case_evidence_select_accessible" on public.case_evidence;
create policy "case_evidence_select_accessible"
  on public.case_evidence
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "case_evidence_insert_manageable" on public.case_evidence;
create policy "case_evidence_insert_manageable"
  on public.case_evidence
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "case_score_events_select_accessible" on public.case_score_events;
create policy "case_score_events_select_accessible"
  on public.case_score_events
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "case_score_events_insert_manageable" on public.case_score_events;
create policy "case_score_events_insert_manageable"
  on public.case_score_events
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "outreach_messages_select_accessible" on public.outreach_messages;
create policy "outreach_messages_select_accessible"
  on public.outreach_messages
  for select
  to authenticated
  using (public.can_access_agency(agency_id));

drop policy if exists "outreach_messages_insert_manageable" on public.outreach_messages;
create policy "outreach_messages_insert_manageable"
  on public.outreach_messages
  for insert
  to authenticated
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter', 'finance'])
    and public.can_access_agency(agency_id)
  );

drop policy if exists "outreach_messages_update_manageable" on public.outreach_messages;
create policy "outreach_messages_update_manageable"
  on public.outreach_messages
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
