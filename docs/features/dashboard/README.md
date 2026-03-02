# Dashboard Feature

## Scope
- Protected route at `/dashboard`
- Server-side auth check with Supabase
- `public.profiles` lookup for current user

## Files
- `app/dashboard/page.tsx`
- `components/features/dashboard/DashboardView.tsx`
- `lib/features/dashboard/types.ts`
- `supabase/migrations/20260302130500_create_profiles_table_and_rls.sql`

## Notes
- If a profile row does not exist yet, the dashboard falls back to auth user values.
- Add server actions later for profile updates.
