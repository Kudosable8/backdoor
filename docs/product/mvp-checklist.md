# Backdoor Hire MVP Checklist

## Planning

- [x] Confirm single-agency-per-user model for MVP
- [x] Confirm platform `super_admin` stays separate from agency roles
- [x] Confirm invite-based user onboarding
- [x] Confirm agency role set:
  - owner
  - manager
  - recruiter
  - finance
  - read_only
- [x] Choose delivery strategy:
  tenancy foundation first, then import, then case workflow

## Phase 1: Tenancy and roles

- [x] Create `agencies` table
- [x] Create `agency_memberships` table
- [x] Add agency role constraint/enum
- [x] Add one-membership-per-user rule for MVP
- [ ] Add `agency_id` to business tables where needed
- [x] Add membership-based RLS policies
- [x] Keep platform `super_admin` checks separate from agency role checks
- [x] Refactor auth helpers to return agency context
- [x] Add server-side permission helpers
- [x] Update sidebar/navigation by agency role

## Phase 2: Invitations and team management

- [x] Create `agency_invites` table
- [x] Build invite creation route
- [x] Build accept-invite route
- [x] Attach accepted users to agency membership
- [x] Replace password-based teammate creation flow
- [x] Create agency team management screen
- [x] Limit invite permissions by role
- [x] Prevent non-owner/manager team administration
- [x] Keep platform admin user management separate from agency team management

## Phase 3: CSV import

- [x] Create `imports` table
- [x] Create `import_rows` table
- [x] Create `candidate_introductions` table
- [x] Build CSV upload UI
- [x] Add CSV preview step
- [x] Add column mapping step
- [x] Validate required fields
- [x] Quarantine invalid rows
- [x] Add agency-scoped dedupe rules
- [x] Persist import audit events

## Phase 4: Cases and workflow

- [x] Create `cases` table
- [x] Define case statuses
- [x] Create case queue/list page
- [x] Add filters by status, recruiter, client, date
- [x] Create case detail page
- [x] Add notes on case detail
- [x] Add assignment workflow
- [x] Add manual evidence entry
- [x] Add confidence band to each case
- [x] Add activity timeline

## Phase 5: Evidence and scoring

- [x] Create `case_evidence` table
- [x] Define evidence types
- [x] Define evidence strength levels
- [x] Create initial rules-based scoring model
- [x] Show score explanation in UI
- [x] Prevent single weak signal from producing a high-confidence case
- [x] Add initial automated research check queue
- [x] Enqueue company-site checks for new cases
- [x] Add public-web search checks backed by Brave Search API
- [x] Surface research status and run controls in case review UI
- [x] Add background cron route for queued research execution
- [x] Add research ops page with failed-check retry controls

## Phase 6: Audit trail and exports

- [x] Create `audit_events` table
- [x] Log imports, role changes, case updates, and outreach events
- [x] Build case export payload
- [x] Build downloadable evidence summary
- [x] Restrict exports to approved roles
- [x] Add in-app audit review screen for agency leads

## Phase 7: Outreach

- [ ] Create email template model
- [x] Add Resend integration
- [x] Build draft outreach flow
- [x] Log sent messages against cases
- [x] Restrict send permission to `owner`, `manager`, and `finance`
- [ ] Decide whether `manager` needs explicit approval flow or direct send

## Security and compliance

- [x] Review every table for tenant isolation
- [x] Review every route for server-side auth enforcement
- [ ] Ensure no API route relies only on client-side role checks
- [x] Add audit coverage for privileged actions
- [ ] Define retention approach for candidate data
- [x] Define evidence upload restrictions
- [ ] Document lawful-basis/compliance assumptions

## Validation

- [ ] Add schema tests or verification queries for RLS behavior
- [ ] Add role permission test matrix
- [ ] Test invite flow end to end
- [ ] Test CSV import with valid and invalid files
- [ ] Test cross-agency isolation manually
- [ ] Test export restrictions by role
- [ ] Test outreach draft/send permissions by role

## MVP release gate

- [ ] Agency owner can invite teammates
- [ ] Invited user joins exactly one agency
- [ ] Recruiter can import a CSV
- [x] Imported rows create usable introductions/cases
- [x] Team can review cases in a queue
- [x] Team can open case detail and add evidence
- [x] Finance/manager/owner can export a case pack
- [x] Approved roles can draft or send outreach
- [x] All major actions are tenant-safe and audited
