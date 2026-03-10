# Backdoor Hire MVP Plan

## Purpose

This document converts the PRD into an implementable MVP plan based on the current codebase.

The current app already has:
- Supabase auth
- `profiles` table
- a platform-level `super_admin` role
- a basic protected dashboard
- a basic user admin screen

The current app does not yet have:
- agency/workspace tenancy
- agency roles from the PRD
- invitation-based team onboarding
- candidate import
- case model
- evidence model
- review workflow
- audit trail
- outreach workflow

Because of that gap, the MVP should be built in a strict sequence. The wrong move here would be starting with proof scoring or email workflows before the tenancy, role, and case foundations exist.

## Confirmed decisions

- Platform `super_admin` remains separate from agency roles.
- Each user belongs to exactly one agency for MVP.
- Agency users should be invited, not created with manually assigned passwords.
- Agency role model for MVP:
  - `owner`
  - `manager`
  - `recruiter`
  - `finance`
  - `read_only`
- Platform role for internal administration:
  - `super_admin`

## Recommended MVP slice

The best first shippable MVP is:

1. tenancy and role foundation
2. invitation flow
3. CSV import and normalization
4. case review queue
5. case detail page with manual evidence and status workflow

This is a better first cut than jumping straight to proof scoring and outreach because:
- all later features depend on tenant isolation and agency permissions
- import creates the operating data set
- review queue and case page create an internal workflow teams can actually use
- evidence and scoring can start simple and still be useful
- outreach should come after case ownership, audit trail, and review states exist

## MVP scope for this repo

### Phase 1: Foundation

#### Goal
Create the minimum secure multi-tenant structure needed for all later features.

#### Deliverables
- `agencies` table
- `agency_memberships` table
- agency role enum/check constraints
- updated RLS policies tied to agency membership
- helper functions for:
  - current agency lookup
  - role checks
  - platform super admin checks
- auth server utilities updated to return:
  - user
  - profile
  - platform role
  - agency membership
  - agency role
- sidebar/navigation updated by role

#### Notes
- Keep `super_admin` as a platform capability, not an agency role.
- For MVP, a user has one agency membership only.
- Do not overload `user_roles` with agency roles. Keep platform roles and agency membership separate.

### Phase 2: Invitations and user management

#### Goal
Replace password-based teammate creation with agency-safe invite flows.

#### Deliverables
- invite table
- invite token flow
- owner/manager invite UI
- accept-invite flow
- agency membership creation on acceptance
- role assignment on invite
- user management page split into:
  - platform admin management
  - agency team management

#### Notes
- `super_admin` should still be able to inspect agencies and members.
- Agency `owner` can invite all agency roles.
- Agency `manager` can invite `recruiter`, `finance`, and `read_only`.
- `recruiter`, `finance`, and `read_only` cannot invite.

### Phase 3: CSV import

#### Goal
Get agencies operational quickly by importing candidate introductions.

#### Deliverables
- upload UI
- CSV preview
- column mapping
- field validation
- reusable mappings later if time allows
- import job record
- imported rows table
- `candidate_introductions` table
- row-level quarantine for invalid rows
- dedupe strategy scoped to agency

#### MVP-required fields
- candidate full name
- introduced role
- client company name

#### Strongly recommended fields
- submission date
- recruiter name
- candidate LinkedIn URL
- client website
- notes
- fee term / ownership period reference

### Phase 4: Cases and review queue

#### Goal
Turn imported introductions into actionable work for recruiters and managers.

#### Deliverables
- `cases` table
- case status model
- queue/list view with filters
- case detail page
- ownership assignment
- notes and activity timeline
- manual evidence entry
- confidence level

#### Suggested MVP case statuses
- `new`
- `reviewing`
- `needs_more_evidence`
- `ready_to_contact`
- `contacted`
- `won`
- `lost`
- `dismissed`

### Phase 5: Evidence and scoring

#### Goal
Introduce structured proof instead of ad hoc notes.

#### Deliverables
- `case_evidence` table
- evidence type model
- evidence strength model
- initial scoring rules
- score explanation on case detail

#### MVP evidence types
- manual note
- uploaded file
- public web source
- company site source
- recruiter assertion

#### MVP scoring approach
- start rules-based, not AI-first
- each evidence item contributes weighted points
- score band output:
  - low
  - medium
  - high

### Phase 6: Audit trail and exports

#### Goal
Make each case defensible and reviewable.

#### Deliverables
- `audit_events` table
- event capture for key actions
- case export view
- downloadable evidence summary

### Phase 7: Outreach

#### Goal
Allow approved cases to move into structured recovery action.

#### Deliverables
- email template records
- draft generation
- Resend integration
- send logging
- case outreach history

#### Guardrails
- only `owner`, `manager`, and `finance` can send
- `recruiter` can draft but not send unless explicitly allowed later

## Role model for MVP

### Platform role

#### `super_admin`
- manage agencies
- inspect all data
- manage platform-level administration
- should not be used as a substitute for agency ownership

### Agency roles

#### `owner`
- full access inside one agency
- manage agency settings
- invite and remove users
- assign all agency roles
- export data
- approve outreach

#### `manager`
- manage operational workflows
- invite limited roles
- review cases
- assign cases
- update statuses
- approve outreach if you want parity with owner in MVP

#### `recruiter`
- import CSVs
- create and edit case notes
- review assigned cases
- add evidence
- cannot manage agency settings

#### `finance`
- review strong cases
- export evidence packs
- track outcomes
- send outreach if enabled
- cannot manage recruiter workflow settings

#### `read_only`
- view dashboards, queue, and case detail
- no edit, import, invite, or send permissions

## Proposed data model additions

### Core tenancy
- `agencies`
- `agency_memberships`
- `agency_invites`

### Import
- `imports`
- `import_rows`
- `candidate_introductions`

### Workflow
- `cases`
- `case_notes`
- `case_evidence`
- `audit_events`

### Later but likely soon
- `email_templates`
- `outreach_messages`
- `company_entities`

## Permission model summary

### Can invite users
- `owner`
- `manager` with role limits

### Can import CSVs
- `owner`
- `manager`
- `recruiter`

### Can review and edit cases
- `owner`
- `manager`
- `recruiter`

### Can export case packs
- `owner`
- `manager`
- `finance`

### Can send outreach
- `owner`
- `manager`
- `finance`

### Read only access
- `read_only`

## Technical implementation notes

### Auth and authorization
- keep Supabase Auth for identity
- use agency membership tables for tenant scoping
- keep platform role checks separate from agency checks
- centralize permission helpers in server utilities before building UI logic

### RLS strategy
- every business table must include `agency_id`
- use membership-based RLS for agency users
- grant platform `super_admin` explicit bypass access through secure database functions or carefully designed policies
- avoid relying only on UI checks

### UI strategy
- repurpose the current dashboard into an agency dashboard shell
- replace the current admin users page with two concepts:
  - platform admin area for `super_admin`
  - agency team area for `owner`/`manager`

### Background jobs
- defer full external evidence automation for the first operational MVP
- first MVP can support manual evidence entry and a placeholder queue model
- add Apify-driven evidence collection after the internal workflow works

## Suggested implementation order in code

1. Supabase schema for agencies and memberships
2. auth server helpers and route authorization refactor
3. invite flow
4. agency team management UI
5. import schema and upload flow
6. case queue
7. case detail and evidence
8. audit trail
9. exports
10. outreach

## Definition of MVP done

The MVP is ready when an agency can:
- receive an invite
- sign in to exactly one agency workspace
- import candidate introduction CSV data
- review candidate records in a case queue
- open a case detail page
- add evidence and notes
- move cases through status states
- export a basic case pack
- send or prepare outreach with role controls

It is not necessary for MVP to have:
- ATS integrations
- automated legal drafting
- sophisticated AI scoring
- cross-agency benchmarking
- client portals
