alter table public.cases
  drop constraint if exists cases_status_check;

alter table public.cases
  add constraint cases_status_check
    check (
      status in (
        'new',
        'reviewing',
        'needs_more_evidence',
        'ready_to_contact',
        'contacted',
        'won',
        'lost',
        'dismissed'
      )
    );
