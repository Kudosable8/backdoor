# RLS Policies

## Tables
- `public.profiles`

## RLS Enabled
- Yes (`alter table public.profiles enable row level security;`)

## Policies
- `profiles_select_own`: authenticated users can `select` where `auth.uid() = id`
- `profiles_insert_own`: authenticated users can `insert` only when `auth.uid() = id`
- `profiles_update_own`: authenticated users can `update` only their own row

## Testing Notes
- Verify an authenticated user can read/update their row.
- Verify a second user cannot access another user's profile row.
