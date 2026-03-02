# Database

## Supabase DEV vs PROD usage
## Migration workflow
## RLS / policies notes
## Seed/backfill notes

## Profiles table baseline
- Table: `public.profiles`
- Primary key: `id uuid` referencing `auth.users(id)`
- Purpose: dashboard-facing profile fields (`email`, `full_name`, `avatar_url`)
- Trigger: `public.handle_new_user()` creates a profile row on signup

> Actual SQL migrations live in `supabase/migrations/` (not `docs/database/`).
