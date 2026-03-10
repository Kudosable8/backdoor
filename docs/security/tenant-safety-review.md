# Tenant Safety Review

## Date
- 10 March 2026

## Scope reviewed
- Supabase business tables and RLS policies added through current migrations
- App routes under [app/api](/Users/terry/Projects/backdoor/app/api)
- Agency-facing pages for imports, cases, team, dashboard, and audit

## Current conclusion
- The current MVP is broadly agency-scoped and server-authorized.
- All current business tables that hold agency data include `agency_id`.
- The main agency write paths enforce roles server-side before writing.
- Audit coverage exists for the high-signal workflow actions now exposed in-product.

## Table review

### Agency-scoped tables with RLS enabled
- `agencies`
- `agency_memberships`
- `agency_invites`
- `import_mappings`
- `imports`
- `candidate_introductions`
- `import_rows`
- `cases`
- `case_notes`
- `case_evidence`
- `case_score_events`
- `outreach_messages`
- `audit_events`

### Platform-scoped tables with non-agency access model
- `profiles`
  Uses self-only policies.
- `user_roles`
  Uses platform-role access model rather than agency tenancy.

## Route authorization review

### Agency-scoped routes with server-side role enforcement
- [app/api/team/invites/route.ts](/Users/terry/Projects/backdoor/app/api/team/invites/route.ts)
  `owner` or `manager`, with additional runtime role limits.
- [app/api/imports/preview/route.ts](/Users/terry/Projects/backdoor/app/api/imports/preview/route.ts)
  `owner`, `manager`, or `recruiter`.
- [app/api/imports/confirm/route.ts](/Users/terry/Projects/backdoor/app/api/imports/confirm/route.ts)
  `owner`, `manager`, or `recruiter`.
- [app/api/imports/mappings/route.ts](/Users/terry/Projects/backdoor/app/api/imports/mappings/route.ts)
  `owner`, `manager`, or `recruiter`.
- [app/api/cases/[caseId]/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/route.ts)
  `owner`, `manager`, `recruiter`, or `finance`.
- [app/api/cases/[caseId]/notes/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/notes/route.ts)
  `owner`, `manager`, `recruiter`, or `finance`.
- [app/api/cases/[caseId]/evidence/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/evidence/route.ts)
  `owner`, `manager`, `recruiter`, or `finance`.
- [app/api/cases/[caseId]/outreach/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/outreach/route.ts)
  Draft creation allowed for `owner`, `manager`, `recruiter`, or `finance`.
- [app/api/cases/[caseId]/outreach/[messageId]/send/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/outreach/[messageId]/send/route.ts)
  Send limited to `owner`, `manager`, or `finance`.
- [app/api/cases/[caseId]/export/route.ts](/Users/terry/Projects/backdoor/app/api/cases/[caseId]/export/route.ts)
  Export limited to `owner`, `manager`, or `finance`.

### Platform-admin routes
- [app/api/admin/users/route.ts](/Users/terry/Projects/backdoor/app/api/admin/users/route.ts)
  Requires `super_admin`.
- [app/api/admin/agencies/route.ts](/Users/terry/Projects/backdoor/app/api/admin/agencies/route.ts)
  Requires `super_admin`.
- [app/api/admin/users/[userId]/route.ts](/Users/terry/Projects/backdoor/app/api/admin/users/[userId]/route.ts)
  Intended for `super_admin`.
- [app/api/admin/users/[userId]/role/route.ts](/Users/terry/Projects/backdoor/app/api/admin/users/[userId]/role/route.ts)
  Intended for `super_admin`.

### Public or pre-agency route
- [app/api/auth/sign-up/route.ts](/Users/terry/Projects/backdoor/app/api/auth/sign-up/route.ts)
  Invite-token gated rather than agency-session gated.

## Audit coverage currently present
- Invite creation
- Invite acceptance
- Import mapping save
- Import completion
- Case update
- Case note creation
- Evidence creation
- Case export
- Outreach draft creation
- Outreach send

## Remaining gaps
- No webhook audit coverage yet because Resend webhook handling is not built.
- No in-app evidence access logging yet; current audit focuses on writes/exports/sends.
- No automated RLS test runner yet; verification is currently documented and manual.
- Storage bucket access relies on server-generated signed URLs and admin uploads, not storage RLS policies.

## Recommended next hardening steps
1. Add a repeatable RLS verification script or SQL test harness.
2. Add Resend webhook ingestion and audit delivery/bounce events.
3. Decide whether evidence access reads need explicit audit logging for compliance posture.
4. Document retention and deletion flows for candidate/evidence data before production rollout.
