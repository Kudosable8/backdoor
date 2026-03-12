alter table public.candidate_introductions
  add column if not exists ownership_window_days integer;
