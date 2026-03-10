# RLS Verification Queries

## Purpose
- Provide a repeatable manual checklist for verifying tenant isolation in local or preview environments.
- These queries assume the schema from the current MVP migrations has been applied.

## High-level checks
- Every agency-scoped table should include `agency_id`.
- Every agency-scoped table should have RLS enabled.
- Every agency-scoped table should have at least a `select` policy tied to `can_access_agency`.

## Schema inspection queries

```sql
select
  table_name,
  row_security as rls_enabled
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.table_schema
where t.table_schema = 'public'
  and t.table_name in (
    'agencies',
    'agency_memberships',
    'agency_invites',
    'import_mappings',
    'imports',
    'candidate_introductions',
    'import_rows',
    'cases',
    'case_notes',
    'case_evidence',
    'case_score_events',
    'outreach_messages',
    'audit_events'
  )
order by table_name;
```

```sql
select
  table_name,
  column_name
from information_schema.columns
where table_schema = 'public'
  and column_name = 'agency_id'
order by table_name;
```

## Policy inspection query

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'agencies',
    'agency_memberships',
    'agency_invites',
    'import_mappings',
    'imports',
    'candidate_introductions',
    'import_rows',
    'cases',
    'case_notes',
    'case_evidence',
    'case_score_events',
    'outreach_messages',
    'audit_events'
  )
order by tablename, policyname;
```

## Functional checks

### Same-agency access should work
- Sign in as a user in agency A.
- Confirm the user can:
  - view `/cases`
  - view `/imports`
  - view `/team` if role allows
  - view `/audit` if role allows
  - create notes/evidence on an agency A case if role allows

### Cross-agency access should fail
- Sign in as a user in agency A.
- Attempt to access or mutate records belonging to agency B by direct route or request payload manipulation.
- Expected result:
  - zero rows returned on reads, or
  - `403`/`400`/`404` from the route, depending on route behavior

### Role restriction checks
- `recruiter` can draft outreach but cannot send it.
- `finance` can export and send outreach but cannot invite users.
- `read_only` can view dashboard/cases but cannot mutate case state, imports, invites, evidence, or outreach.
- `manager` can invite only `recruiter`, `finance`, and `read_only`.

## Storage checks
- Evidence uploads should succeed only through the server route.
- Evidence downloads should be delivered through signed URLs generated server-side.
- No client-side direct bucket listing should be required for MVP.

## Current note
- This repo documents the verification process, but does not yet include an automated RLS test harness.
