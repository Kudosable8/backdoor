alter table public.outreach_messages
  add column if not exists resend_email_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists error_text text;
